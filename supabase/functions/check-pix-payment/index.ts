import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CheckPixRequest {
  paymentId: string;
  pendingId: string;
  companyId: string;
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

    const body: CheckPixRequest = await req.json();
    console.log("[check-pix-payment] Checking payment:", body.paymentId);

    if (!body.paymentId || !body.companyId) {
      return new Response(
        JSON.stringify({ error: "Dados obrigatórios não fornecidos" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Get company payment settings
    const { data: paymentSettings, error: settingsError } = await supabaseClient
      .from("company_payment_settings")
      .select("mercadopago_access_token")
      .eq("company_id", body.companyId)
      .single();

    if (settingsError || !paymentSettings?.mercadopago_access_token) {
      return new Response(
        JSON.stringify({ error: "Configuração de pagamento não encontrada" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Check payment status via Mercado Pago API
    const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${body.paymentId}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${paymentSettings.mercadopago_access_token}`,
      },
    });

    if (!mpResponse.ok) {
      const errorText = await mpResponse.text();
      console.error("[check-pix-payment] Mercado Pago error:", errorText);
      return new Response(
        JSON.stringify({ error: "Erro ao verificar pagamento" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    const payment = await mpResponse.json();
    console.log("[check-pix-payment] Payment status:", payment.status);

    // Check if pending order was already processed
    // Re-fetch to get latest status (might have been updated by webhook)
    const { data: pendingOrder, error: pendingError } = await supabaseClient
      .from("pending_order_payments")
      .select("status, order_id")
      .eq("id", body.pendingId)
      .single();

    if (pendingError) {
      console.error("[check-pix-payment] Error fetching pending order:", pendingError);
      return new Response(
        JSON.stringify({ error: "Pedido não encontrado" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      );
    }

    let orderId = pendingOrder?.order_id;

    // If already completed by webhook, just return success
    if (pendingOrder?.status === "completed" && pendingOrder?.order_id) {
      console.log("[check-pix-payment] Already completed by webhook, order:", pendingOrder.order_id);
      return new Response(
        JSON.stringify({
          status: payment.status,
          statusDetail: payment.status_detail,
          orderId: pendingOrder.order_id,
          approved: payment.status === "approved",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // If payment is approved and order not yet created, try to claim with atomic update
    if (payment.status === "approved" && pendingOrder?.status === "pending") {
      console.log("[check-pix-payment] Payment approved, attempting to claim pending order...");
      
      // Use atomic update to prevent race condition - only update if still pending
      const { data: claimResult, error: claimError } = await supabaseClient
        .from("pending_order_payments")
        .update({ 
          status: "processing",
        })
        .eq("id", body.pendingId)
        .eq("status", "pending") // Only claim if still pending
        .select("id, order_data, status")
        .maybeSingle();

      // If we didn't get the claim, someone else is processing or already completed
      if (!claimResult || claimError) {
        console.log("[check-pix-payment] Could not claim, checking if already processed...");
        
        // Wait a moment and re-check
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const { data: recheck } = await supabaseClient
          .from("pending_order_payments")
          .select("status, order_id")
          .eq("id", body.pendingId)
          .single();

        if (recheck?.status === "completed" && recheck?.order_id) {
          console.log("[check-pix-payment] Was completed by webhook, order:", recheck.order_id);
          return new Response(
            JSON.stringify({
              status: payment.status,
              statusDetail: payment.status_detail,
              orderId: recheck.order_id,
              approved: true,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
          );
        }

        // Still processing by another request, just return status
        return new Response(
          JSON.stringify({
            status: payment.status,
            statusDetail: payment.status_detail,
            orderId: null,
            approved: false,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
        );
      }

      // We claimed it! Create the order
      console.log("[check-pix-payment] Claimed pending order, creating order...");
      const orderData = claimResult.order_data as any;
        
      // Create/lookup customer record
      let customerUserId: string | null = null;
      const customerEmail = orderData.customer_email ? String(orderData.customer_email) : null;
      const customerPhone = orderData.customer_phone ? String(orderData.customer_phone) : '';

      if (customerEmail || customerPhone) {
        let q = supabaseClient.from("customers").select("id, user_id");

        if (customerEmail && customerPhone) {
          q = q.or(`email.eq.${customerEmail},phone.eq.${customerPhone}`);
        } else if (customerEmail) {
          q = q.eq("email", customerEmail);
        } else {
          q = q.eq("phone", customerPhone);
        }

        const { data: existingCustomer } = await q.maybeSingle();

        if (existingCustomer) {
          customerUserId = existingCustomer.user_id ?? null;
        } else {
          const { data: newCustomer } = await supabaseClient
            .from("customers")
            .insert({
              name: orderData.customer_name,
              email: customerEmail,
              phone: customerPhone,
            })
            .select("id, user_id")
            .single();

          customerUserId = newCustomer?.user_id ?? null;
        }
      }

      // Create order
      const newOrderId = crypto.randomUUID();
      const { error: orderError } = await supabaseClient
        .from("orders")
        .insert({
          id: newOrderId,
          company_id: orderData.company_id,
          customer_id: customerUserId,
          customer_name: orderData.customer_name,
          customer_phone: orderData.customer_phone || '',
          customer_email: orderData.customer_email || null,
          delivery_address_id: orderData.delivery_address_id || null,
          payment_method: 'pix',
          payment_status: 'paid',
          subtotal: orderData.subtotal,
          delivery_fee: orderData.delivery_fee,
          total: orderData.total,
          notes: orderData.notes || null,
          coupon_id: orderData.coupon_id || null,
          discount_amount: orderData.discount_amount || 0,
          status: 'pending',
          stripe_payment_intent_id: String(body.paymentId),
        });

      if (orderError) {
        console.error("[check-pix-payment] Error creating order:", orderError);
        // Revert to pending so webhook can try
        await supabaseClient
          .from("pending_order_payments")
          .update({ status: "pending" })
          .eq("id", body.pendingId);
      } else {
        orderId = newOrderId;

        // Create order items
        const orderItems = (orderData.items || []).map((item: any) => ({
          order_id: newOrderId,
          product_id: item.product_id,
          product_name: item.product_name,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total_price: item.total_price,
          options: item.options || null,
          notes: item.notes || null,
        }));

        if (orderItems.length > 0) {
          await supabaseClient.from("order_items").insert(orderItems);
        }

        // Update coupon usage if applicable
        if (orderData.coupon_id) {
          const { data: coupon } = await supabaseClient
            .from("coupons")
            .select("current_uses")
            .eq("id", orderData.coupon_id)
            .single();
          
          if (coupon) {
            await supabaseClient
              .from("coupons")
              .update({ current_uses: (coupon.current_uses || 0) + 1 })
              .eq("id", orderData.coupon_id);
          }
        }

        // Mark pending order as completed
        await supabaseClient
          .from("pending_order_payments")
          .update({ 
            status: "completed",
            order_id: newOrderId,
            completed_at: new Date().toISOString(),
          })
          .eq("id", body.pendingId);

        console.log("[check-pix-payment] Order created:", newOrderId);
      }
    }

    const approved = payment.status === "approved" && !!orderId;

    return new Response(
      JSON.stringify({
        status: payment.status,
        statusDetail: payment.status_detail,
        orderId: orderId,
        approved,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    console.error("[check-pix-payment] Error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
