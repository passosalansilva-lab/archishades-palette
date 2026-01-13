import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// PicPay API endpoints
const PICPAY_OAUTH_BASE = "https://checkout-api.picpay.com";
const PICPAY_PAYMENTLINK_BASE = "https://api.picpay.com/v1/paymentlink";

interface DirectRefundRequest {
  /** Pode ser o ID do pedido (orders.id) */
  order_id?: string;
  /** ID do pagamento (Mercado Pago / PicPay). Usado como fallback quando o order_id não for encontrado */
  payment_id?: string;
  reason: string;
}

// Get PicPay OAuth access token
async function getPicPayAccessToken(clientId: string, clientSecret: string): Promise<string> {
  const tokenUrl = `${PICPAY_OAUTH_BASE}/oauth2/token`;

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

  if (!response.ok) {
    console.error("[direct-refund] PicPay token error:", responseText);
    throw new Error("Erro ao obter token de acesso do PicPay");
  }

  const data = JSON.parse(responseText);
  return data.access_token;
}

// Process Mercado Pago refund
async function processMercadoPagoRefund(
  paymentId: string,
  accessToken: string,
  orderId: string
): Promise<{ success: boolean; refund_id?: string; error?: string }> {
  console.log("[direct-refund] Processing Mercado Pago refund for payment:", paymentId);

  // Get payment details
  const paymentResponse = await fetch(
    `https://api.mercadopago.com/v1/payments/${paymentId}`,
    {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
      },
    }
  );

  if (!paymentResponse.ok) {
    const errorData = await paymentResponse.json();
    console.error("[direct-refund] Error fetching MP payment:", errorData);
    return { success: false, error: "Pagamento não encontrado no Mercado Pago" };
  }

  const paymentData = await paymentResponse.json();
  console.log("[direct-refund] MP Payment status:", paymentData.status);

  if (paymentData.status !== "approved") {
    return { 
      success: false, 
      error: `Pagamento não pode ser estornado. Status atual: ${paymentData.status}`
    };
  }

  // Process full refund
  const refundResponse = await fetch(
    `https://api.mercadopago.com/v1/payments/${paymentId}/refunds`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": `direct-refund-${orderId}-${Date.now()}`,
      },
      body: JSON.stringify({}),
    }
  );

  const refundData = await refundResponse.json();
  console.log("[direct-refund] MP Refund response:", refundData);

  if (!refundResponse.ok) {
    const errorMsg = refundData.message?.includes("already refunded") 
      ? "Este pagamento já foi estornado"
      : refundData.message || "Erro ao processar estorno no Mercado Pago";
    return { success: false, error: errorMsg };
  }

  return { success: true, refund_id: refundData.id?.toString() };
}

// Process PicPay refund
async function processPicPayRefund(
  linkId: string,
  clientId: string,
  clientSecret: string
): Promise<{ success: boolean; refund_id?: string; error?: string }> {
  console.log("[direct-refund] Processing PicPay refund for linkId:", linkId);

  try {
    const accessToken = await getPicPayAccessToken(clientId, clientSecret);

    // Check payment status
    const statusUrl = `${PICPAY_PAYMENTLINK_BASE}/${linkId}`;
    const statusResponse = await fetch(statusUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!statusResponse.ok) {
      return { success: false, error: "Pagamento não encontrado no PicPay" };
    }

    const paymentData = await statusResponse.json();
    const paymentStatus = String(paymentData.status || "").toLowerCase();
    console.log("[direct-refund] PicPay payment status:", paymentStatus);

    if (paymentStatus === "refunded" || paymentStatus === "cancelled" || paymentStatus === "canceled") {
      return { success: false, error: "Este pagamento já foi estornado/cancelado" };
    }

    const refundableStatuses = ["paid", "approved", "completed", "settled"];
    if (!refundableStatuses.includes(paymentStatus)) {
      return { 
        success: false, 
        error: `Pagamento não pode ser estornado. Status atual: ${paymentStatus}`
      };
    }

    // Process refund
    const cancelUrl = `${PICPAY_PAYMENTLINK_BASE}/${linkId}/cancel`;
    const cancelResponse = await fetch(cancelUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    const cancelText = await cancelResponse.text();
    console.log("[direct-refund] PicPay cancel response:", cancelText);

    if (!cancelResponse.ok) {
      try {
        const errorData = JSON.parse(cancelText);
        return { success: false, error: errorData.message || "Erro ao processar estorno no PicPay" };
      } catch {
        return { success: false, error: `Erro ao processar estorno no PicPay` };
      }
    }

    return { success: true, refund_id: linkId };
  } catch (error: any) {
    console.error("[direct-refund] PicPay refund exception:", error);
    return { success: false, error: error.message || "Erro ao processar estorno no PicPay" };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Get auth user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Não autorizado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Token inválido" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { order_id, payment_id, reason }: DirectRefundRequest = await req.json();

    console.log("[direct-refund] Request:", {
      order_id,
      payment_id,
      reason,
      user_id: user.id,
    });

    const origin = req.headers.get("origin") ?? "";
    const debug = req.headers.get("x-debug") === "1" || origin.includes("lovableproject.com");

    const normalizedOrderId = order_id?.trim() || "";
    const normalizedPaymentId = payment_id?.trim() || "";

    if ((!normalizedOrderId && !normalizedPaymentId) || !reason?.trim()) {
      return new Response(
        JSON.stringify({ error: "order_id (ou payment_id) e reason são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Carrega o pedido por order_id; se não encontrar, tenta pelo payment_id (evita confusão de IDs)
    const selectOrderFields =
      "id, company_id, total, payment_status, payment_method, stripe_payment_intent_id, customer_name";

    let order:
      | {
          id: string;
          company_id: string;
          total: number;
          payment_status: string;
          payment_method: string | null;
          stripe_payment_intent_id: string | null;
          customer_name: string | null;
        }
      | null = null;

    if (normalizedOrderId) {
      const { data, error } = await supabase
        .from("orders")
        .select(selectOrderFields)
        .eq("id", normalizedOrderId)
        .maybeSingle();

      if (error) {
        console.error("[direct-refund] Error loading order by id:", {
          order_id: normalizedOrderId,
          error,
        });

        return new Response(
          JSON.stringify({
            error: "Erro ao buscar pedido",
            ...(debug
              ? {
                  debug: {
                    code: (error as any).code,
                    message: (error as any).message,
                    details: (error as any).details,
                    hint: (error as any).hint,
                  },
                }
              : {}),
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      order = (data as any) ?? null;
    }

    if (!order && normalizedPaymentId) {
      const { data, error } = await supabase
        .from("orders")
        .select(selectOrderFields)
        .eq("stripe_payment_intent_id", normalizedPaymentId)
        .maybeSingle();

      if (error) {
        console.error("[direct-refund] Error loading order by payment_id:", {
          payment_id: normalizedPaymentId,
          error,
        });

        return new Response(
          JSON.stringify({
            error: "Erro ao buscar pedido",
            ...(debug
              ? {
                  debug: {
                    code: (error as any).code,
                    message: (error as any).message,
                    details: (error as any).details,
                    hint: (error as any).hint,
                  },
                }
              : {}),
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      order = (data as any) ?? null;
    }

    if (!order) {
      console.warn("[direct-refund] Order not found:", {
        order_id: normalizedOrderId || undefined,
        payment_id: normalizedPaymentId || undefined,
      });
      return new Response(
        JSON.stringify({ error: "Pedido não encontrado" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify user owns the company
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id, owner_id, name")
      .eq("id", order.company_id)
      .single();

    if (companyError || !company) {
      return new Response(
        JSON.stringify({ error: "Empresa não encontrada" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user is owner or staff of the company
    let isAuthorized = company.owner_id === user.id;
    
    if (!isAuthorized) {
      // Check if user is staff
      const { data: staff } = await supabase
        .from("store_staff")
        .select("id")
        .eq("company_id", order.company_id)
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle();
      
      isAuthorized = !!staff;
    }

    if (!isAuthorized) {
      return new Response(
        JSON.stringify({ error: "Você não tem permissão para estornar pedidos desta loja" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if order can be refunded
    if (order.payment_status !== 'paid') {
      return new Response(
        JSON.stringify({ error: `Pedido não pode ser estornado. Status: ${order.payment_status}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Determina provedor e ID do pagamento (Mercado Pago / PicPay)
    const paymentId = normalizedPaymentId || order.stripe_payment_intent_id;
    if (!paymentId) {
      return new Response(
        JSON.stringify({ error: "ID do pagamento não encontrado" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const isPicPay = paymentId.startsWith("picpay_");
    const isMercadoPago = paymentId.startsWith("mp_") || /^\d+$/.test(paymentId);

    if (!isPicPay && !isMercadoPago) {
      return new Response(
        JSON.stringify({
          error:
            "Provedor de pagamento não suportado para estorno automático (somente Mercado Pago e PicPay).",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const { data: paymentSettings, error: settingsError } = await supabase
      .from("company_payment_settings")
      .select("mercadopago_access_token, picpay_client_id, picpay_client_secret")
      .eq("company_id", order.company_id)
      .single();

    if (settingsError) {
      console.error("[direct-refund] Payment settings not found:", settingsError);
      return new Response(
        JSON.stringify({ error: "Configuração de pagamento não encontrada" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let refundResult: { success: boolean; refund_id?: string; error?: string };

    if (isPicPay) {
      if (!paymentSettings?.picpay_client_id || !paymentSettings?.picpay_client_secret) {
        return new Response(
          JSON.stringify({ error: "Credenciais do PicPay não configuradas" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const picpayLinkId = paymentId.replace('picpay_', '');
      refundResult = await processPicPayRefund(
        picpayLinkId,
        paymentSettings.picpay_client_id,
        paymentSettings.picpay_client_secret
      );
    } else {
      if (!paymentSettings?.mercadopago_access_token) {
        return new Response(
          JSON.stringify({ error: "Token do Mercado Pago não configurado" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // For MP, we might have numeric payment_id or mp_ prefixed
      const mpPaymentId = paymentId.startsWith('mp_') ? paymentId.replace('mp_', '') : paymentId;
      refundResult = await processMercadoPagoRefund(
        mpPaymentId,
        paymentSettings.mercadopago_access_token,
        order.id
      );
    }

    if (!refundResult.success) {
      return new Response(
        JSON.stringify({ error: refundResult.error }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update order status
    const { error: updateError } = await supabase
      .from("orders")
      .update({
        payment_status: "refunded",
        status: "cancelled",
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id);

    if (updateError) {
      console.error("[direct-refund] Error updating order:", updateError);
    }

    // Log the refund in refund_requests as completed
    await supabase.from("refund_requests").insert({
      company_id: order.company_id,
      order_id: order.id,
      original_amount: order.total,
      requested_amount: order.total,
      requested_by: user.id,
      reason: reason.trim(),
      customer_name: order.customer_name,
      payment_method: order.payment_method === 'pix' ? 'pix' : 'card',
      payment_id: paymentId,
      payment_provider: isPicPay ? 'picpay' : 'mercadopago',
      status: 'completed',
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      refund_id: refundResult.refund_id,
    });

    // Log activity
    await supabase.from("activity_logs").insert({
      company_id: order.company_id,
      action: "direct_refund",
      details: {
        order_id: order.id,
        payment_id: paymentId,
        refund_id: refundResult.refund_id,
        amount: order.total,
        reason: reason.trim(),
        provider: isPicPay ? 'picpay' : 'mercadopago',
      },
    });

    console.log("[direct-refund] Refund successful:", {
      order_id: order.id,
      refund_id: refundResult.refund_id,
      amount: order.total,
    });

    return new Response(
      JSON.stringify({
        success: true,
        refund_id: refundResult.refund_id,
        amount: order.total,
        message: `Estorno de R$ ${order.total.toFixed(2)} realizado com sucesso!`,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("[direct-refund] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erro interno ao processar estorno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
