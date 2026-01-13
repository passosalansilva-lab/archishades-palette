import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// PicPay Payment Link API
const PICPAY_OAUTH_URL = "https://checkout-api.picpay.com/oauth2/token";
const PICPAY_PAYMENTLINK_BASE = "https://api.picpay.com/v1/paymentlink";

const FUNCTION_VERSION = "2026-01-13T21:00:00Z";

// Status que indicam pagamento aprovado
const APPROVED_STATUSES = ["paid", "approved", "completed", "settled", "authorized", "captured"];
// Status que indicam cancelamento/expiração
const CANCELLED_STATUSES = ["expired", "inactive", "cancelled", "canceled", "refunded", "rejected", "failed"];

async function getPicPayAccessToken(clientId: string, clientSecret: string): Promise<string> {
  console.log("[check-picpay-payment] Requesting OAuth token...");

  const response = await fetch(PICPAY_OAUTH_URL, {
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

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[check-picpay-payment] Token error:", errorText);
    throw new Error("Erro ao obter token de acesso do PicPay");
  }

  const data = await response.json();
  console.log("[check-picpay-payment] OAuth token obtained successfully");
  return data.access_token;
}

// Função para extrair status de diferentes estruturas de resposta
function extractStatus(data: any): string | null {
  const possibleFields = [
    data?.status,
    data?.data?.status,
    data?.charge?.status,
    data?.payment?.status,
    data?.transaction?.status,
    data?.transactions?.[0]?.status,
    data?.payments?.[0]?.status,
    data?.content?.status,
  ];

  for (const field of possibleFields) {
    if (field && typeof field === "string") {
      return field.toLowerCase();
    }
  }
  return null;
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

    // 1) Verificar se o pedido já foi processado
    const { data: pendingOrder, error: pendingError } = await supabaseClient
      .from("pending_order_payments")
      .select("*")
      .eq("id", pendingId)
      .single();

    if (pendingError) {
      throw new Error("Pedido não encontrado");
    }

    console.log("[check-picpay-payment] Pending order status:", pendingOrder.status);

    // Já completado
    if (pendingOrder.status === "completed" && pendingOrder.order_id) {
      console.log("[check-picpay-payment] Already completed:", pendingOrder.order_id);
      return new Response(JSON.stringify({ approved: true, orderId: pendingOrder.order_id, status: "completed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Já cancelado
    if (pendingOrder.status === "cancelled") {
      return new Response(JSON.stringify({ approved: false, status: "cancelled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2) Buscar credenciais
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

    // 3) Determinar o ID do link de pagamento
    const linkId = paymentLinkId || pendingOrder.mercadopago_payment_id;

    if (!linkId) {
      console.warn("[check-picpay-payment] No paymentLinkId available!");
      return new Response(JSON.stringify({ approved: false, status: "pending", error: "ID do link não encontrado" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[check-picpay-payment] Using linkId:", linkId);

    // 4) Obter token OAuth
    const accessToken = await getPicPayAccessToken(
      paymentSettings.picpay_client_id,
      paymentSettings.picpay_client_secret
    );

    let paymentStatus = "pending";
    let foundApproved = false;

    // ============================================================
    // PASSO A: Consultar GET /paymentlink/{id}
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
        const status = extractStatus(paymentData);
        console.log("[check-picpay-payment] Step A extracted status:", status);

        if (status) {
          if (APPROVED_STATUSES.includes(status)) {
            paymentStatus = status;
            foundApproved = true;
            console.log("[check-picpay-payment] Step A: APPROVED!", status);
          } else if (CANCELLED_STATUSES.includes(status)) {
            paymentStatus = status;
            console.log("[check-picpay-payment] Step A: CANCELLED!", status);
          }
        }
      } catch (parseErr) {
        console.error("[check-picpay-payment] Step A parse error:", parseErr);
      }
    }

    // ============================================================
    // PASSO B: Se não aprovado, consultar transações
    // ============================================================
    if (!foundApproved && !CANCELLED_STATUSES.includes(paymentStatus)) {
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
          
          // Buscar array de transações em diferentes formatos
          const txList = 
            Array.isArray(txJson) ? txJson :
            txJson.transactions ||
            txJson.data ||
            txJson.items ||
            txJson.content ||
            [];

          console.log("[check-picpay-payment] Step B transactions count:", Array.isArray(txList) ? txList.length : 0);

          if (Array.isArray(txList)) {
            for (const tx of txList) {
              const txStatus = String(
                tx.status || tx.transaction_status || tx.payment_status || tx.state || ""
              ).toLowerCase();

              console.log("[check-picpay-payment] Step B tx status:", txStatus);

              if (APPROVED_STATUSES.includes(txStatus)) {
                paymentStatus = txStatus;
                foundApproved = true;
                console.log("[check-picpay-payment] Step B: APPROVED!", txStatus);
                break;
              } else if (CANCELLED_STATUSES.includes(txStatus)) {
                paymentStatus = txStatus;
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
    // Criar pedido se aprovado
    // ============================================================
    if (foundApproved) {
      // Marcar como processando para evitar duplicatas
      const { error: updateError } = await supabaseClient
        .from("pending_order_payments")
        .update({ status: "processing" })
        .eq("id", pendingId)
        .eq("status", "pending");

      if (updateError) {
        // Verificar se já foi processado por webhook
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

      // Criar pedido
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

      // Criar itens do pedido
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

      // Atualizar pedido pendente como completo
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

    // Cancelado/Expirado
    if (CANCELLED_STATUSES.includes(paymentStatus)) {
      return new Response(JSON.stringify({ approved: false, status: paymentStatus }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Ainda pendente
    return new Response(JSON.stringify({ approved: false, status: paymentStatus || "pending", functionVersion: FUNCTION_VERSION }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[check-picpay-payment] Error:", error);
    return new Response(JSON.stringify({ error: String(error), approved: false, functionVersion: FUNCTION_VERSION }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
