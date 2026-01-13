import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// PicPay Payment Link API (produção)
// Docs: https://developers-business.picpay.com/payment-link/en/docs/api/create-charge
const PICPAY_OAUTH_BASE = "https://checkout-api.picpay.com";
const PICPAY_PAYMENTLINK_BASE = "https://api.picpay.com/v1/paymentlink";

async function getPicPayAccessToken(clientId: string, clientSecret: string): Promise<string> {
  const tokenUrl = `${PICPAY_OAUTH_BASE}/oauth2/token`;

  console.log(`[check-picpay-payment] Requesting OAuth token from ${tokenUrl}...`);

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

    const { pendingId, companyId, paymentLinkId, referenceId } = await req.json();

    if (!pendingId || !companyId) {
      return new Response(JSON.stringify({ error: "Dados obrigatórios não fornecidos" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    console.log("[check-picpay-payment] Checking payment:", pendingId);

    // 1) Primeiro verifica se o pedido já foi concluído
    const { data: pendingOrder, error: pendingError } = await supabaseClient
      .from("pending_order_payments")
      .select("*")
      .eq("id", pendingId)
      .single();

    if (pendingError) {
      throw new Error("Pedido não encontrado");
    }

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

    // 2) Credenciais
    const { data: paymentSettings, error: settingsError } = await supabaseClient
      .from("company_payment_settings")
      .select("picpay_client_id, picpay_client_secret")
      .eq("company_id", companyId)
      .eq("picpay_enabled", true)
      .single();

    if (settingsError || !paymentSettings?.picpay_client_id || !paymentSettings?.picpay_client_secret) {
      return new Response(JSON.stringify({ approved: false, status: "pending" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3) Determina o ID do Payment Link
    const linkId =
      paymentLinkId ||
      referenceId ||
      pendingOrder.mercadopago_payment_id ||
      null;

    if (!linkId) {
      console.warn("[check-picpay-payment] Missing paymentLinkId for pendingId:", pendingId);
      return new Response(JSON.stringify({ approved: false, status: "pending" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4) Consulta status
    const accessToken = await getPicPayAccessToken(
      paymentSettings.picpay_client_id,
      paymentSettings.picpay_client_secret
    );

    const statusUrl = `${PICPAY_PAYMENTLINK_BASE}/${linkId}`;
    console.log(`[check-picpay-payment] Querying payment status at: ${statusUrl}`);

    const picpayResponse = await fetch(statusUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const responseText = await picpayResponse.text();
    console.log(`[check-picpay-payment] PicPay response status: ${picpayResponse.status}`);
    console.log(`[check-picpay-payment] PicPay response body: ${responseText}`);

    if (!picpayResponse.ok) {
      console.error("[check-picpay-payment] PicPay API error:", responseText);
      return new Response(JSON.stringify({ approved: false, status: "pending" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const paymentData = JSON.parse(responseText);

    // Log completo para debug - PicPay pode ter status em campos diferentes
    console.log("[check-picpay-payment] Full payment data keys:", Object.keys(paymentData));
    console.log("[check-picpay-payment] Raw status field:", paymentData.status);
    console.log("[check-picpay-payment] Charge status:", paymentData.charge?.status);
    console.log("[check-picpay-payment] Payment status:", paymentData.payment?.status);
    console.log("[check-picpay-payment] Transaction status:", paymentData.transaction?.status);

    // Tentar encontrar o status em diferentes campos possíveis
    const rawStatus =
      paymentData.status ||
      paymentData.charge?.status ||
      paymentData.payment?.status ||
      paymentData.transaction?.status ||
      paymentData.payments?.[0]?.status ||
      "";

    let paymentStatus = String(rawStatus).toLowerCase();

    // 5) Aprovado - PicPay pode retornar "paid", "approved", "completed" ou "PAID"
    const approvedStatuses = ["paid", "approved", "completed", "settled"];

    // Alguns retornos do /paymentlink/{id} refletem o status do LINK (ex: active)
    // e o status real do pagamento aparece em /paymentlink/{id}/transactions.
    if (
      !approvedStatuses.includes(paymentStatus) &&
      !["expired", "inactive", "cancelled", "canceled", "refunded"].includes(paymentStatus)
    ) {
      try {
        const txUrl = `${PICPAY_PAYMENTLINK_BASE}/${linkId}/transactions`;
        console.log(`[check-picpay-payment] Querying payment transactions at: ${txUrl}`);

        const txResp = await fetch(txUrl, {
          method: "GET",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
        });

        const txText = await txResp.text();
        console.log(`[check-picpay-payment] Transactions response status: ${txResp.status}`);
        console.log(`[check-picpay-payment] Transactions response body: ${txText}`);

        if (txResp.ok) {
          const txJson = JSON.parse(txText);
          const txList =
            (Array.isArray(txJson) ? txJson : null) ||
            txJson.transactions ||
            txJson.data ||
            txJson.items ||
            [];

          if (Array.isArray(txList) && txList.length) {
            const normalized = txList
              .map((t: any) =>
                String(
                  t.status ||
                    t.transaction_status ||
                    t.payment_status ||
                    t.state ||
                    t.situation ||
                    ""
                ).toLowerCase()
              )
              .filter(Boolean);

            const paidTxStatus = normalized.find((s: string) => approvedStatuses.includes(s));
            if (paidTxStatus) {
              console.log("[check-picpay-payment] Found approved status in transactions:", paidTxStatus);
              paymentStatus = paidTxStatus;
            }
          }
        }
      } catch (e) {
        console.warn("[check-picpay-payment] Could not query transactions endpoint:", e);
      }
    }

    // Log detalhado para debug
    console.log("[check-picpay-payment] Resolved payment status:", paymentStatus);
    console.log("[check-picpay-payment] Full payment data:", JSON.stringify(paymentData));

    if (approvedStatuses.includes(paymentStatus)) {
      const { error: updateError } = await supabaseClient
        .from("pending_order_payments")
        .update({ status: "processing" })
        .eq("id", pendingId)
        .eq("status", "pending");

      if (updateError) {
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

    // 6) Cancelado/Expirado/Inativo
    if (["expired", "inactive", "cancelled", "canceled", "refunded"].includes(paymentStatus)) {
      return new Response(JSON.stringify({ approved: false, status: paymentStatus }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 7) Ainda pendente (ex: active)
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
