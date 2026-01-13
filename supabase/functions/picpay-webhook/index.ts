import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FUNCTION_VERSION = "2026-01-13T21:00:00Z";

// Status que indicam pagamento aprovado
const APPROVED_STATUSES = ["PAID", "APPROVED", "COMPLETED", "SETTLED", "AUTHORIZED", "CAPTURED"];
// Status que indicam cancelamento/expiração
const CANCELLED_STATUSES = ["CANCELLED", "CANCELED", "REFUNDED", "EXPIRED", "REJECTED", "FAILED"];

// Extrair UUID de um texto
function extractUuidFromText(text?: string | null): string | null {
  if (!text) return null;
  const match = String(text).match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  return match?.[0] ?? null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const body = await req.json();
    console.log("[picpay-webhook] ========================================");
    console.log("[picpay-webhook] Received webhook:", JSON.stringify(body));
    console.log("[picpay-webhook] Headers:", JSON.stringify(Object.fromEntries(req.headers.entries())));

    // Extrair tipo de evento
    const eventType = body.type || req.headers.get("event_type") || req.headers.get("x-event-type") || "";
    console.log("[picpay-webhook] Event type:", eventType);

    // Extrair status de diferentes campos possíveis
    const chargeStatus = String(
      body.data?.status ||
      body.status ||
      body.charge?.status ||
      body.payment?.status ||
      body.transaction?.status ||
      ""
    ).toUpperCase();

    console.log("[picpay-webhook] Charge status:", chargeStatus);

    // Extrair ID do pedido pendente de diferentes campos
    const merchantChargeId =
      body.data?.merchantChargeId ||
      body.merchantChargeId ||
      body.referenceId ||
      body.reference_id ||
      body.externalReference ||
      body.external_reference ||
      body.data?.referenceId ||
      body.charge?.merchantChargeId ||
      extractUuidFromText(body.data?.description) ||
      extractUuidFromText(body.description) ||
      extractUuidFromText(body.charge?.description) ||
      null;

    const picpayChargeId = 
      body.id ||
      body.chargeId ||
      body.charge_id ||
      body.data?.id ||
      body.charge?.id ||
      null;

    console.log(`[picpay-webhook] merchantChargeId: ${merchantChargeId}, picpayChargeId: ${picpayChargeId}`);

    if (!merchantChargeId) {
      console.log("[picpay-webhook] No merchantChargeId found in webhook payload");
      console.log("[picpay-webhook] Available fields:", Object.keys(body));
      return new Response(JSON.stringify({ received: true, warning: "No merchantChargeId found", functionVersion: FUNCTION_VERSION }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Buscar pedido pendente
    const { data: pendingOrder, error: pendingError } = await supabaseClient
      .from("pending_order_payments")
      .select("*")
      .eq("id", merchantChargeId)
      .single();

    if (pendingError || !pendingOrder) {
      console.error("[picpay-webhook] Pending order not found:", merchantChargeId, pendingError);
      return new Response(JSON.stringify({ received: true, error: "Order not found", functionVersion: FUNCTION_VERSION }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verificar se já foi processado
    if (pendingOrder.status === "completed" || pendingOrder.order_id) {
      console.log("[picpay-webhook] Order already processed:", pendingOrder.order_id);
      return new Response(JSON.stringify({ received: true, already_processed: true, functionVersion: FUNCTION_VERSION }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verificar status
    if (!APPROVED_STATUSES.includes(chargeStatus)) {
      console.log("[picpay-webhook] Status is not PAID, received:", chargeStatus);
      
      // Atualizar status se cancelado
      if (CANCELLED_STATUSES.includes(chargeStatus)) {
        await supabaseClient
          .from("pending_order_payments")
          .update({ status: "cancelled" })
          .eq("id", merchantChargeId);
      }
      
      return new Response(JSON.stringify({ received: true, status: chargeStatus, functionVersion: FUNCTION_VERSION }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[picpay-webhook] Payment confirmed! Creating order...");

    // Marcar como processando para evitar duplicatas
    const { error: updateError } = await supabaseClient
      .from("pending_order_payments")
      .update({ status: "processing" })
      .eq("id", merchantChargeId)
      .eq("status", "pending");

    if (updateError) {
      console.log("[picpay-webhook] Could not mark as processing (race condition?):", updateError);
      return new Response(JSON.stringify({ received: true, functionVersion: FUNCTION_VERSION }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const orderData = pendingOrder.order_data as any;

    // Buscar ou criar cliente
    let customerId: string | null = null;
    
    if (orderData.customer_email || orderData.customer_phone) {
      const { data: existingCustomer } = await supabaseClient
        .from("customers")
        .select("id")
        .or(`email.eq.${orderData.customer_email?.toLowerCase()},phone.eq.${orderData.customer_phone}`)
        .limit(1)
        .maybeSingle();

      if (existingCustomer) {
        customerId = existingCustomer.id;
      } else {
        const { data: newCustomer, error: customerError } = await supabaseClient
          .from("customers")
          .insert({
            name: orderData.customer_name,
            email: orderData.customer_email?.toLowerCase() || null,
            phone: orderData.customer_phone || "",
          })
          .select("id")
          .single();

        if (!customerError && newCustomer) {
          customerId = newCustomer.id;
        }
      }
    }

    // Calcular tempo estimado de entrega
    const estimatedDeliveryTime = new Date();
    estimatedDeliveryTime.setMinutes(estimatedDeliveryTime.getMinutes() + 45);

    // Criar pedido
    const newOrderId = crypto.randomUUID();
    const isTableOrder = !!orderData.table_session_id;
    
    const { error: orderError } = await supabaseClient
      .from("orders")
      .insert({
        id: newOrderId,
        company_id: pendingOrder.company_id,
        customer_id: customerId,
        customer_name: orderData.customer_name,
        customer_phone: orderData.customer_phone || "",
        customer_email: orderData.customer_email?.toLowerCase() || null,
        delivery_address_id: orderData.delivery_address_id,
        payment_method: "pix",
        payment_status: "paid",
        subtotal: orderData.subtotal,
        delivery_fee: orderData.delivery_fee,
        total: orderData.total,
        notes: orderData.notes || null,
        coupon_id: orderData.coupon_id || null,
        discount_amount: orderData.discount_amount || 0,
        estimated_delivery_time: estimatedDeliveryTime.toISOString(),
        stripe_payment_intent_id: `picpay_${picpayChargeId}`,
        table_session_id: orderData.table_session_id || null,
        source: orderData.source || (isTableOrder ? "table" : "online"),
      });

    if (orderError) {
      console.error("[picpay-webhook] Error creating order:", orderError);
      throw orderError;
    }

    // Criar itens do pedido
    const orderItems = orderData.items.map((item: any) => ({
      order_id: newOrderId,
      product_id: item.product_id,
      product_name: item.product_name,
      quantity: item.quantity,
      unit_price: item.unit_price,
      total_price: item.total_price,
      options: item.options || [],
      notes: item.notes || null,
    }));

    const { error: itemsError } = await supabaseClient
      .from("order_items")
      .insert(orderItems);

    if (itemsError) {
      console.error("[picpay-webhook] Error creating order items:", itemsError);
    }

    // Atualizar uso do cupom se aplicável
    if (orderData.coupon_id) {
      await supabaseClient.rpc("increment_coupon_usage", { coupon_id: orderData.coupon_id });
    }

    // Marcar pedido pendente como completo
    await supabaseClient
      .from("pending_order_payments")
      .update({
        status: "completed",
        order_id: newOrderId,
        completed_at: new Date().toISOString(),
      })
      .eq("id", merchantChargeId);

    console.log("[picpay-webhook] Order created successfully:", newOrderId);

    return new Response(
      JSON.stringify({ received: true, order_id: newOrderId, functionVersion: FUNCTION_VERSION }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[picpay-webhook] Error:", error);
    // Sempre retorna 200 para evitar retries
    return new Response(
      JSON.stringify({ received: true, error: String(error), functionVersion: FUNCTION_VERSION }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
