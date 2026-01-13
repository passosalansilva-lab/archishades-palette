import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Parse the webhook payload
    const url = new URL(req.url);
    const topic = url.searchParams.get("topic") || url.searchParams.get("type");
    const paymentId = url.searchParams.get("data.id") || url.searchParams.get("id");

    // Also try to get from body
    let body: any = {};
    try {
      const text = await req.text();
      if (text) {
        body = JSON.parse(text);
      }
    } catch (e) {
      console.log("No JSON body or parse error");
    }

    const actualPaymentId = paymentId || body?.data?.id || body?.id;
    const actualTopic = topic || body?.topic || body?.type || body?.action;

    console.log("Order payment webhook received:", { topic: actualTopic, paymentId: actualPaymentId, body });

    // Only process payment notifications
    if (actualTopic !== "payment" && !actualPaymentId) {
      console.log("Not a payment notification, skipping");
      return new Response("OK", { headers: corsHeaders, status: 200 });
    }

    if (!actualPaymentId) {
      console.log("No payment ID, skipping");
      return new Response("OK", { headers: corsHeaders, status: 200 });
    }

    // 1) Try to match the pending order directly by Mercado Pago payment id
    // (our create-pix-payment stores mercadopago_payment_id = payment.id)
    const { data: directPending, error: directPendingError } = await supabaseClient
      .from("pending_order_payments")
      .select("*")
      .or(`mercadopago_payment_id.eq.${actualPaymentId},mercadopago_preference_id.eq.${actualPaymentId}`)
      .maybeSingle();

    let matchedPending: any | null = directPending;

    // 2) Fallback: scan recent pending orders and match by external_reference/preference_id
    // (needed when webhook arrives before we store payment id)
    if (!matchedPending) {
      if (directPendingError) {
        console.log("Direct pending lookup error:", directPendingError);
      }

      const { data: pendingOrders, error: pendingError } = await supabaseClient
        .from("pending_order_payments")
        .select("*")
        .eq("status", "pending")
        .limit(200);

      if (pendingError || !pendingOrders?.length) {
        console.log("No pending orders found", pendingError);
        return new Response("OK", { headers: corsHeaders, status: 200 });
      }

      for (const pending of pendingOrders) {
        const { data: paymentSettings } = await supabaseClient
          .from("company_payment_settings")
          .select("mercadopago_access_token")
          .eq("company_id", pending.company_id)
          .single();

        if (!paymentSettings?.mercadopago_access_token) continue;

        const mpResponse = await fetch(
          `https://api.mercadopago.com/v1/payments/${actualPaymentId}`,
          {
            headers: {
              Authorization: `Bearer ${paymentSettings.mercadopago_access_token}`,
            },
          }
        );

        if (!mpResponse.ok) continue;

        const paymentDetails = await mpResponse.json();

        // Match by external_reference JSON (preferred)
        if (paymentDetails.external_reference) {
          try {
            const ref = JSON.parse(paymentDetails.external_reference);
            if (ref?.pending_id === pending.id) {
              matchedPending = pending;
              break;
            }
          } catch {
            // ignore
          }
        }

        // Or match by preference_id
        if (
          paymentDetails.preference_id &&
          pending.mercadopago_preference_id &&
          String(paymentDetails.preference_id) === String(pending.mercadopago_preference_id)
        ) {
          matchedPending = pending;
          break;
        }
      }
    }

    if (!matchedPending) {
      console.log("No matching pending order found for payment:", actualPaymentId);
      return new Response("OK", { headers: corsHeaders, status: 200 });
    }

    // If already completed or being processed, do nothing (idempotent)
    if ((matchedPending.status === "completed" || matchedPending.status === "processing") && matchedPending.order_id) {
      console.log(
        "Pending already completed/processing:",
        matchedPending.id,
        "status:",
        matchedPending.status,
        "order:",
        matchedPending.order_id
      );
      return new Response("OK", { headers: corsHeaders, status: 200 });
    }

    // If being processed by check-pix-payment, skip
    if (matchedPending.status === "processing") {
      console.log("Pending being processed by check-pix-payment, skipping:", matchedPending.id);
      return new Response("OK", { headers: corsHeaders, status: 200 });
    }

    // Get company token
    const { data: paymentSettings, error: settingsError } = await supabaseClient
      .from("company_payment_settings")
      .select("mercadopago_access_token")
      .eq("company_id", matchedPending.company_id)
      .single();

    if (settingsError || !paymentSettings?.mercadopago_access_token) {
      console.log("No Mercado Pago token for company:", matchedPending.company_id);
      return new Response("OK", { headers: corsHeaders, status: 200 });
    }

    // Load payment status from Mercado Pago
    const mpResponse = await fetch(
      `https://api.mercadopago.com/v1/payments/${actualPaymentId}`,
      {
        headers: {
          Authorization: `Bearer ${paymentSettings.mercadopago_access_token}`,
        },
      }
    );

    if (!mpResponse.ok) {
      const errorText = await mpResponse.text();
      console.error("Mercado Pago payment lookup failed:", errorText);
      return new Response("OK", { headers: corsHeaders, status: 200 });
    }

    const paymentDetails = await mpResponse.json();

    console.log(
      "Found matching pending order:",
      matchedPending.id,
      "Payment status:",
      paymentDetails.status
    );

    // Keep pending record updated with payment id
    await supabaseClient
      .from("pending_order_payments")
      .update({
        mercadopago_payment_id: String(actualPaymentId),
        mercadopago_preference_id:
          matchedPending.mercadopago_preference_id ?? String(actualPaymentId),
      })
      .eq("id", matchedPending.id);

    // Only proceed if payment is approved
    if (paymentDetails.status !== "approved") {
      console.log("Payment not approved yet:", paymentDetails.status);
      return new Response("OK", { headers: corsHeaders, status: 200 });
    }

    // Payment approved! Create the order (or finish if order already exists)
    if (matchedPending.order_id) {
      await supabaseClient
        .from("pending_order_payments")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", matchedPending.id);

      return new Response("OK", { headers: corsHeaders, status: 200 });
    }

    // Try to claim with atomic update - only if still pending
    const { data: claimResult, error: claimError } = await supabaseClient
      .from("pending_order_payments")
      .update({ status: "processing" })
      .eq("id", matchedPending.id)
      .eq("status", "pending")
      .select("id, order_data")
      .maybeSingle();

    if (!claimResult || claimError) {
      console.log("Could not claim pending order (already being processed):", matchedPending.id);
      return new Response("OK", { headers: corsHeaders, status: 200 });
    }

    const orderData = (claimResult.order_data || {}) as any;

    // Find or create customer
    // NOTE: orders.customer_id has a FK to users, so we must only store customers.user_id here.
    let customerUserId: string | null = null;
    const customerEmail = orderData.customer_email ? String(orderData.customer_email) : null;
    const customerPhone = orderData.customer_phone ? String(orderData.customer_phone) : "";

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
            name: String(orderData.customer_name || "Cliente"),
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
    const isTableOrder = !!orderData.table_session_id;
    const { error: orderError } = await supabaseClient.from("orders").insert({
      id: newOrderId,
      company_id: orderData.company_id,
      customer_id: customerUserId,
      customer_name: String(orderData.customer_name || "Cliente"),
      customer_phone: customerPhone,
      customer_email: customerEmail,
      delivery_address_id: orderData.delivery_address_id || null,
      payment_method: "pix",
      payment_status: "paid",
      subtotal: Number(orderData.subtotal || 0),
      delivery_fee: Number(orderData.delivery_fee || 0),
      total: Number(orderData.total || 0),
      notes: orderData.notes || null,
      coupon_id: orderData.coupon_id || null,
      discount_amount: Number(orderData.discount_amount || 0),
      status: "pending",
      stripe_payment_intent_id: String(actualPaymentId),
      // Table order fields
      table_session_id: orderData.table_session_id || null,
      source: orderData.source || (isTableOrder ? 'table' : 'online'),
    });

    if (orderError) {
      console.error("Error creating order:", orderError);
      throw new Error("Failed to create order");
    }

    // Create order items
    const orderItems = (orderData.items || []).map((item: any) => ({
      order_id: newOrderId,
      product_id: item.product_id,
      product_name: item.product_name,
      quantity: item.quantity,
      unit_price: item.unit_price,
      total_price: item.total_price,
      notes: item.notes || null,
      options: item.options || null,
    }));

    if (orderItems.length > 0) {
      const { error: itemsError } = await supabaseClient
        .from("order_items")
        .insert(orderItems);

      if (itemsError) {
        console.error("Error creating order items:", itemsError);
      }
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
        completed_at: new Date().toISOString(),
        order_id: newOrderId,
        mercadopago_payment_id: String(actualPaymentId),
        mercadopago_preference_id:
          matchedPending.mercadopago_preference_id ?? String(actualPaymentId),
      })
      .eq("id", matchedPending.id);

    console.log("Order payment webhook completed successfully", {
      pendingId: matchedPending.id,
      orderId: newOrderId,
      paymentId: String(actualPaymentId),
    });

    return new Response("OK", { headers: corsHeaders, status: 200 });
  } catch (error) {
    console.error("Error in order-payment-webhook:", error);
    return new Response("Error", { headers: corsHeaders, status: 500 });
  }
});
