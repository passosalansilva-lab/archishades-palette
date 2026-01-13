import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
    console.log("[picpay-webhook] Received webhook:", JSON.stringify(body));
    console.log("[picpay-webhook] Headers:", JSON.stringify(Object.fromEntries(req.headers.entries())));

    // PicPay webhook pode ter diferentes estruturas dependendo da versão da API
    // Estrutura Payment Link API v1:
    // - type: "PAYMENT" ou header event_type: "TransactionUpdateMessage"
    // - data.status: "PAID" | "PENDING" | "REFUNDED" | "CANCELLED"
    // - data.merchantChargeId: nosso pending order ID
    // - id: PicPay's charge ID
    // 
    // Estrutura alternativa (E-commerce API):
    // - referenceId: nosso pending order ID
    // - authorizationId: PicPay payment ID
    // - status: "paid" | "pending" | "refunded" | "cancelled"

    const eventType = body.type || req.headers.get("event_type") || req.headers.get("x-event-type");
    
    // Aceitar diferentes tipos de eventos de pagamento
    const paymentEventTypes = ["PAYMENT", "TransactionUpdateMessage", "payment", "charge"];
    if (eventType && !paymentEventTypes.some(t => eventType.toLowerCase().includes(t.toLowerCase()))) {
      console.log("[picpay-webhook] Ignoring non-payment event:", eventType);
      return new Response(JSON.stringify({ received: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Extrair status de diferentes campos possíveis
    const chargeStatus = String(
      body.data?.status ||
      body.status ||
      body.charge?.status ||
      body.payment?.status ||
      body.transaction?.status ||
      ""
    ).toUpperCase();

    // Extrair ID do pedido de diferentes campos possíveis
    // Preferimos um UUID (id do pending_order_payments) quando disponível.
    const merchantChargeId =
      body.data?.merchantChargeId ||
      body.merchantChargeId ||
      body.referenceId ||
      body.reference_id ||
      body.externalReference ||
      body.external_reference ||
      body.data?.referenceId ||
      body.data?.externalReference ||
      body.charge?.merchantChargeId ||
      body.charge?.referenceId ||
      // Payment Link API pode trazer order_number (limitado) ou description
      extractUuidFromText(body.data?.order_number) ||
      extractUuidFromText(body.charge?.order_number) ||
      extractUuidFromText(body.data?.description) ||
      extractUuidFromText(body.description) ||
      extractUuidFromText(body.charge?.description) ||
      extractUuidFromText(body.payment?.description) ||
      extractUuidFromText(body.transaction?.description) ||
      null;

    const picpayChargeId = 
      body.id ||
      body.chargeId ||
      body.charge_id ||
      body.authorizationId ||
      body.authorization_id ||
      body.data?.id ||
      body.charge?.id ||
      null;

    console.log(`[picpay-webhook] Parsed data - chargeId: ${picpayChargeId}, merchantId: ${merchantChargeId}, status: ${chargeStatus}`);

    if (!merchantChargeId) {
      console.log("[picpay-webhook] No merchantChargeId found in webhook payload");
      console.log("[picpay-webhook] Available fields:", Object.keys(body));
      if (body.data) console.log("[picpay-webhook] data fields:", Object.keys(body.data));
      if (body.charge) console.log("[picpay-webhook] charge fields:", Object.keys(body.charge));
      return new Response(JSON.stringify({ received: true, warning: "No merchantChargeId found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[picpay-webhook] Processing charge ${picpayChargeId}, merchantId: ${merchantChargeId}, status: ${chargeStatus}`);

    // Find pending order by merchantChargeId (which is the pending order ID)
    const { data: pendingOrder, error: pendingError } = await supabaseClient
      .from("pending_order_payments")
      .select("*")
      .eq("id", merchantChargeId)
      .single();

    if (pendingError || !pendingOrder) {
      console.error("[picpay-webhook] Pending order not found:", merchantChargeId, pendingError);
      return new Response(JSON.stringify({ received: true, error: "Order not found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if already processed
    if (pendingOrder.status === "completed" || pendingOrder.order_id) {
      console.log("[picpay-webhook] Order already processed:", pendingOrder.order_id);
      return new Response(JSON.stringify({ received: true, already_processed: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Aceitar diferentes variações de status "pago"
    const paidStatuses = ["PAID", "APPROVED", "COMPLETED", "SETTLED", "AUTHORIZED"];
    const cancelledStatuses = ["CANCELLED", "CANCELED", "REFUNDED", "EXPIRED", "REJECTED"];

    if (!paidStatuses.includes(chargeStatus)) {
      console.log("[picpay-webhook] Status is not PAID, status received:", chargeStatus);
      
      // Update status if cancelled/refunded
      if (cancelledStatuses.includes(chargeStatus)) {
        await supabaseClient
          .from("pending_order_payments")
          .update({ status: "cancelled" })
          .eq("id", merchantChargeId);
      }
      
      return new Response(JSON.stringify({ received: true, status: chargeStatus }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[picpay-webhook] Payment confirmed! Creating order...");

    // Mark as processing to prevent duplicates

    // Mark as processing to prevent duplicates
    const { error: updateError } = await supabaseClient
      .from("pending_order_payments")
      .update({ status: "processing" })
      .eq("id", merchantChargeId)
      .eq("status", "pending");

    if (updateError) {
      console.log("[picpay-webhook] Could not mark as processing (race condition?):", updateError);
      return new Response(JSON.stringify({ received: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const orderData = pendingOrder.order_data as any;

    // Find or create customer
    let customerId: string | null = null;
    
    if (orderData.customer_email || orderData.customer_phone) {
      // Try to find existing customer
      const { data: existingCustomer } = await supabaseClient
        .from("customers")
        .select("id")
        .or(`email.eq.${orderData.customer_email?.toLowerCase()},phone.eq.${orderData.customer_phone}`)
        .limit(1)
        .maybeSingle();

      if (existingCustomer) {
        customerId = existingCustomer.id;
      } else {
        // Create new customer
        const { data: newCustomer, error: customerError } = await supabaseClient
          .from("customers")
          .insert({
            name: orderData.customer_name,
            email: orderData.customer_email?.toLowerCase() || null,
            phone: orderData.customer_phone || '',
          })
          .select("id")
          .single();

        if (!customerError && newCustomer) {
          customerId = newCustomer.id;
        }
      }
    }

    // Calculate estimated delivery time
    const estimatedDeliveryTime = new Date();
    estimatedDeliveryTime.setMinutes(estimatedDeliveryTime.getMinutes() + 45);

    // Create the order
    const newOrderId = crypto.randomUUID();
    const isTableOrder = !!orderData.table_session_id;
    
    const { error: orderError } = await supabaseClient
      .from("orders")
      .insert({
        id: newOrderId,
        company_id: pendingOrder.company_id,
        customer_id: customerId,
        customer_name: orderData.customer_name,
        customer_phone: orderData.customer_phone || '',
        customer_email: orderData.customer_email?.toLowerCase() || null,
        delivery_address_id: orderData.delivery_address_id,
        payment_method: 'pix',
        payment_status: 'paid',
        subtotal: orderData.subtotal,
        delivery_fee: orderData.delivery_fee,
        total: orderData.total,
        notes: orderData.notes || null,
        coupon_id: orderData.coupon_id || null,
        discount_amount: orderData.discount_amount || 0,
        estimated_delivery_time: estimatedDeliveryTime.toISOString(),
        stripe_payment_intent_id: `picpay_${picpayChargeId}`, // Store PicPay ID for reference
        // Table order fields
        table_session_id: orderData.table_session_id || null,
        source: orderData.source || (isTableOrder ? 'table' : 'online'),
      });

    if (orderError) {
      console.error("[picpay-webhook] Error creating order:", orderError);
      throw orderError;
    }

    // Create order items
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
      // Don't throw - order was created
    }

    // Update coupon usage if applicable
    if (orderData.coupon_id) {
      await supabaseClient.rpc('increment_coupon_usage', { coupon_id: orderData.coupon_id });
    }

    // Mark pending order as completed
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
      JSON.stringify({ received: true, order_id: newOrderId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[picpay-webhook] Error:", error);
    // Always return 200 to prevent retries
    return new Response(
      JSON.stringify({ received: true, error: String(error) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
