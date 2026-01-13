import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// PicPay Payment Link API
// Docs: https://developers-business.picpay.com/payment-link/docs/introduction
const PICPAY_OAUTH_BASE = "https://checkout-api.picpay.com";
const PICPAY_PAYMENTLINK_BASE = "https://api.picpay.com/v1/paymentlink";

async function getPicPayAccessToken(clientId: string, clientSecret: string): Promise<string> {
  const tokenUrl = `${PICPAY_OAUTH_BASE}/oauth2/token`;

  console.log(`[check-picpay-payment] Requesting OAuth token...`);

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  const responseText = await response.text();
  console.log(`[check-picpay-payment] Token response status: ${response.status}`);

  if (!response.ok) {
    console.error("[check-picpay-payment] Token error:", responseText);
    throw new Error("Erro ao obter token de acesso do PicPay");
  }

  const data = JSON.parse(responseText);
  console.log("[check-picpay-payment] OAuth token obtained successfully");
  return data.access_token;
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

    const { pendingId, companyId, paymentLinkId } = await req.json();

    if (!pendingId || !companyId) {
      return new Response(JSON.stringify({ error: "Dados obrigatórios não fornecidos" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    console.log("[check-picpay-payment] ========================================");
    console.log("[check-picpay-payment] Checking payment for pendingId:", pendingId);
    console.log("[check-picpay-payment] paymentLinkId received:", paymentLinkId);

    // 1) Check if order already completed
    const { data: pendingOrder, error: pendingError } = await supabaseClient
      .from("pending_order_payments")
      .select("*")
      .eq("id", pendingId)
      .single();

    if (pendingError) {
      throw new Error("Pedido não encontrado");
    }

    console.log("[check-picpay-payment] Pending order status:", pendingOrder.status);
    console.log("[check-picpay-payment] Stored mercadopago_payment_id:", pendingOrder.mercadopago_payment_id);

    if (pendingOrder.status === "completed" && pendingOrder.order_id) {
      console.log("[check-picpay-payment] Already completed:", pendingOrder.order_id);
      return new Response(JSON.stringify({ approved: true, orderId: pendingOrder.order_id, status: "completed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (pendingOrder.status === "cancelled") {
      return new Response(JSON.stringify({ approved: false, status: "cancelled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2) Get credentials
    const { data: paymentSettings, error: settingsError } = await supabaseClient
      .from("company_payment_settings")
      .select("picpay_client_id, picpay_client_secret")
      .eq("company_id", companyId)
      .eq("picpay_enabled", true)
      .single();

    if (settingsError || !paymentSettings?.picpay_client_id || !paymentSettings?.picpay_client_secret) {
      console.error("[check-picpay-payment] PicPay not configured");
      return new Response(JSON.stringify({ approved: false, status: "pending", error: "PicPay não configurado" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3) Determine the Payment Link ID
    const linkId = paymentLinkId || pendingOrder.mercadopago_payment_id || null;

    if (!linkId) {
      console.warn("[check-picpay-payment] No paymentLinkId available!");
      return new Response(JSON.stringify({ approved: false, status: "pending", error: "ID do link não encontrado" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[check-picpay-payment] Using linkId:", linkId);

    // 4) Get OAuth token
    const accessToken = await getPicPayAccessToken(
      paymentSettings.picpay_client_id,
      paymentSettings.picpay_client_secret
    );

    const approvedStatuses = ["paid", "approved", "completed", "settled", "authorized"];
    const cancelledStatuses = ["expired", "inactive", "cancelled", "canceled", "refunded"];
    let paymentStatus = "pending";
    let foundApproved = false;

    // ============================================================
    // STEP A: Query GET /paymentlink/{id}
    // ============================================================
    const statusUrl = `${PICPAY_PAYMENTLINK_BASE}/${linkId}`;
    console.log(`[check-picpay-payment] Step A: Querying ${statusUrl}`);

    const picpayResponse = await fetch(statusUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const responseText = await picpayResponse.text();
    console.log(`[check-picpay-payment] Step A response status: ${picpayResponse.status}`);
    console.log(`[check-picpay-payment] Step A response body: ${responseText}`);

    if (picpayResponse.ok) {
      try {
        const paymentData = JSON.parse(responseText);
        console.log("[check-picpay-payment] Step A parsed keys:", Object.keys(paymentData));

        // Try to find status in various possible fields
        const possibleStatusFields = [
          paymentData.status,
          paymentData.charge?.status,
          paymentData.payment?.status,
          paymentData.transaction?.status,
          paymentData.payments?.[0]?.status,
          paymentData.transactions?.[0]?.status,
        ];

        console.log("[check-picpay-payment] Step A possible status fields:", possibleStatusFields);

        for (const rawStatus of possibleStatusFields) {
          if (rawStatus) {
            const normalizedStatus = String(rawStatus).toLowerCase();
            console.log("[check-picpay-payment] Step A checking status:", normalizedStatus);

            if (approvedStatuses.includes(normalizedStatus)) {
              paymentStatus = normalizedStatus;
              foundApproved = true;
              console.log("[check-picpay-payment] Step A: APPROVED!", normalizedStatus);
              break;
            } else if (cancelledStatuses.includes(normalizedStatus)) {
              paymentStatus = normalizedStatus;
              break;
            }
          }
        }
      } catch (parseErr) {
        console.error("[check-picpay-payment] Step A parse error:", parseErr);
      }
    } else {
      console.warn("[check-picpay-payment] Step A failed with status:", picpayResponse.status);
    }

    // ============================================================
    // STEP B: If not approved, try GET /paymentlink/{id}/transactions
    // ============================================================
    if (!foundApproved && !cancelledStatuses.includes(paymentStatus)) {
      const txUrl = `${PICPAY_PAYMENTLINK_BASE}/${linkId}/transactions`;
      console.log(`[check-picpay-payment] Step B: Querying ${txUrl}`);

      try {
        const txResp = await fetch(txUrl, {
          method: "GET",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
        });

        const txText = await txResp.text();
        console.log(`[check-picpay-payment] Step B response status: ${txResp.status}`);
        console.log(`[check-picpay-payment] Step B response body: ${txText}`);

        if (txResp.ok) {
          const txJson = JSON.parse(txText);
          
          // Transactions could be in different formats
          const txList =
            (Array.isArray(txJson) ? txJson : null) ||
            txJson.transactions ||
            txJson.data ||
            txJson.items ||
            txJson.content ||
            [];

          console.log("[check-picpay-payment] Step B transactions count:", Array.isArray(txList) ? txList.length : 0);

          if (Array.isArray(txList)) {
            for (const tx of txList) {
              console.log("[check-picpay-payment] Step B transaction:", JSON.stringify(tx));
              
              const txStatus = String(
                tx.status ||
                tx.transaction_status ||
                tx.payment_status ||
                tx.state ||
                tx.situation ||
                ""
              ).toLowerCase();

              console.log("[check-picpay-payment] Step B tx status:", txStatus);

              if (approvedStatuses.includes(txStatus)) {
                paymentStatus = txStatus;
                foundApproved = true;
                console.log("[check-picpay-payment] Step B: APPROVED!", txStatus);
                break;
              }
            }
          }
        }
      } catch (txErr) {
        console.warn("[check-picpay-payment] Step B error:", txErr);
      }
    }

    console.log("[check-picpay-payment] ========================================");
    console.log("[check-picpay-payment] FINAL: status =", paymentStatus, ", approved =", foundApproved);

    // ============================================================
    // Create order if approved
    // ============================================================
    if (foundApproved) {
      const { error: updateError } = await supabaseClient
        .from("pending_order_payments")
        .update({ status: "processing" })
        .eq("id", pendingId)
        .eq("status", "pending");

      if (updateError) {
        // Check if already processed by webhook
        const { data: recheckOrder } = await supabaseClient
          .from("pending_order_payments")
          .select("order_id, status")
          .eq("id", pendingId)
          .single();

        if (recheckOrder?.order_id) {
          return new Response(JSON.stringify({ approved: true, orderId: recheckOrder.order_id }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      const orderData = pendingOrder.order_data as any;
      const newOrderId = crypto.randomUUID();
      const estimatedDeliveryTime = new Date();
      estimatedDeliveryTime.setMinutes(estimatedDeliveryTime.getMinutes() + 45);

      const { error: orderError } = await supabaseClient.from("orders").insert({
        id: newOrderId,
        company_id: companyId,
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
        stripe_payment_intent_id: `picpay_${linkId}`,
        table_session_id: orderData.table_session_id || null,
        source: orderData.source || "online",
      });

      if (orderError) {
        console.error("[check-picpay-payment] Error creating order:", orderError);
        throw new Error("Erro ao criar pedido");
      }

      const orderItems = (orderData.items || []).map((item: any) => ({
        order_id: newOrderId,
        product_id: item.product_id,
        product_name: item.product_name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: item.total_price,
        options: item.options || [],
        notes: item.notes || null,
      }));

      if (orderItems.length) {
        await supabaseClient.from("order_items").insert(orderItems);
      }

      await supabaseClient
        .from("pending_order_payments")
        .update({
          status: "completed",
          order_id: newOrderId,
          completed_at: new Date().toISOString(),
        })
        .eq("id", pendingId);

      console.log("[check-picpay-payment] Order created successfully:", newOrderId);

      return new Response(JSON.stringify({ approved: true, orderId: newOrderId, status: "paid" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cancelled/Expired
    if (cancelledStatuses.includes(paymentStatus)) {
      return new Response(JSON.stringify({ approved: false, status: paymentStatus }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Still pending
    return new Response(JSON.stringify({ approved: false, status: paymentStatus || "pending" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[check-picpay-payment] Error:", error);
    return new Response(JSON.stringify({ error: String(error), approved: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});