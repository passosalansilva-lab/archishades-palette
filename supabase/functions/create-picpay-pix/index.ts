import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface OrderItem {
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  notes?: string;
  options?: any[];
  product_id: string;
}

interface PaymentRequest {
  companyId: string;
  items: OrderItem[];
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  customerDocument?: string;
  deliveryAddressId?: string;
  deliveryFee: number;
  subtotal: number;
  total: number;
  couponId?: string;
  discountAmount?: number;
  notes?: string;
  needsChange?: boolean;
  changeFor?: number;
  tableSessionId?: string;
  tableNumber?: number;
  source?: string;
}

// PicPay Payment Link API (produção)
// Docs: https://developers-business.picpay.com/payment-link/docs/introduction
const PICPAY_OAUTH_URL = "https://checkout-api.picpay.com/oauth2/token";
const PICPAY_PAYMENTLINK_URL = "https://api.picpay.com/v1/paymentlink/create";

const FUNCTION_VERSION = "2026-01-13T21:00:00Z";

async function getPicPayAccessToken(clientId: string, clientSecret: string): Promise<string> {
  console.log("[create-picpay-pix] Requesting OAuth token...");

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

  const responseText = await response.text();
  console.log(`[create-picpay-pix] Token response status: ${response.status}`);

  if (!response.ok) {
    console.error("[create-picpay-pix] Token error:", responseText);
    throw new Error(`Erro ao obter token de acesso do PicPay: ${response.status}`);
  }

  const data = JSON.parse(responseText);
  console.log("[create-picpay-pix] OAuth token obtained successfully");
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

    const body: PaymentRequest = await req.json();
    console.log("[create-picpay-pix] Creating Payment Link for company:", body.companyId);

    if (!body.companyId || !body.items?.length || !body.customerName) {
      return new Response(JSON.stringify({ error: "Dados obrigatórios não fornecidos" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // Buscar credenciais PicPay
    const { data: paymentSettings, error: settingsError } = await supabaseClient
      .from("company_payment_settings")
      .select("picpay_client_id, picpay_client_secret")
      .eq("company_id", body.companyId)
      .eq("picpay_enabled", true)
      .eq("picpay_verified", true)
      .single();

    if (settingsError || !paymentSettings?.picpay_client_id || !paymentSettings?.picpay_client_secret) {
      console.error("[create-picpay-pix] PicPay settings not found:", settingsError);
      return new Response(JSON.stringify({ error: "PicPay não configurado para esta loja" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // Buscar dados da empresa
    const { data: company, error: companyError } = await supabaseClient
      .from("companies")
      .select("name, slug")
      .eq("id", body.companyId)
      .single();

    if (companyError || !company) {
      throw new Error("Empresa não encontrada");
    }

    // Criar registro de pedido pendente
    const pendingOrderData = {
      company_id: body.companyId,
      items: body.items,
      customer_name: body.customerName,
      customer_phone: body.customerPhone,
      customer_email: body.customerEmail,
      delivery_address_id: body.deliveryAddressId,
      delivery_fee: body.deliveryFee,
      subtotal: body.subtotal,
      total: body.total,
      coupon_id: body.couponId,
      discount_amount: body.discountAmount,
      notes: body.notes,
      needs_change: body.needsChange,
      change_for: body.changeFor,
      payment_method: "picpay",
      table_session_id: body.tableSessionId || null,
      table_number: body.tableNumber || null,
      source: body.source || "online",
    };

    const { data: pendingOrder, error: pendingError } = await supabaseClient
      .from("pending_order_payments")
      .insert({
        company_id: body.companyId,
        order_data: pendingOrderData,
        status: "pending",
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      })
      .select("id")
      .single();

    if (pendingError) {
      console.error("[create-picpay-pix] Error creating pending order:", pendingError);
      throw new Error("Erro ao criar pedido pendente");
    }

    const pendingId = pendingOrder.id;

    // Obter token OAuth2
    const accessToken = await getPicPayAccessToken(
      paymentSettings.picpay_client_id,
      paymentSettings.picpay_client_secret
    );

    // Calcular valor em centavos
    const totalCents = Math.max(1, Math.round((body.total || 0) * 100));

    // Data de expiração: D+1 (PicPay exige data futura)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const expiredAtDate = tomorrow.toISOString().slice(0, 10);

    // URL de redirecionamento após pagamento
    const baseUrl = `https://${company.slug}.lovable.app/${company.slug}`;
    const redirectUrl = `${baseUrl}?payment=success&pending_id=${pendingId}`;

    // Payload conforme documentação oficial do PicPay Payment Link
    // https://developers-business.picpay.com/payment-link/docs/introduction
    const createChargePayload = {
      charge: {
        name: `Pedido ${company.name}`.slice(0, 60),
        description: `Pedido #${pendingId.slice(0, 8)}`.slice(0, 200),
        redirect_url: redirectUrl,
        payment: {
          methods: ["BRCODE", "CREDIT_CARD"],
          brcode_arrangements: ["PIX"],
        },
        amounts: {
          product: totalCents,
        },
      },
      options: {
        allow_create_pix_key: true,
        expired_at: expiredAtDate,
      },
    };

    console.log("[create-picpay-pix] Creating charge with payload:", JSON.stringify(createChargePayload));

    // Criar cobrança no PicPay
    const picpayResponse = await fetch(PICPAY_PAYMENTLINK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(createChargePayload),
    });

    const responseText = await picpayResponse.text();
    console.log(`[create-picpay-pix] PicPay response status:`, picpayResponse.status);
    console.log(`[create-picpay-pix] PicPay response body:`, responseText);

    if (!picpayResponse.ok) {
      await supabaseClient.from("pending_order_payments").delete().eq("id", pendingId);

      return new Response(
        JSON.stringify({
          error: "Erro ao criar link de pagamento PicPay",
          status: picpayResponse.status,
          details: responseText,
          functionVersion: FUNCTION_VERSION,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 502 }
      );
    }

    const chargeResult = JSON.parse(responseText);
    console.log("[create-picpay-pix] Charge result keys:", Object.keys(chargeResult));

    // Extrair dados do resultado
    // A API retorna: { link, id, brcode, deeplink, ... }
    const paymentUrl = chargeResult.link || chargeResult.deeplink;
    const paymentLinkId = chargeResult.id;
    const brcode = chargeResult.brcode;

    if (!paymentLinkId) {
      console.error("[create-picpay-pix] Payment Link ID missing:", JSON.stringify(chargeResult));
      await supabaseClient.from("pending_order_payments").delete().eq("id", pendingId);

      return new Response(
        JSON.stringify({
          error: "ID de pagamento não retornado pelo PicPay",
          response: chargeResult,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 502 }
      );
    }

    // Gerar QR Code se tiver brcode
    let qrCodeBase64: string | null = null;
    if (brcode) {
      try {
        const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=${encodeURIComponent(brcode)}`;
        const qrResponse = await fetch(qrApiUrl);
        if (qrResponse.ok) {
          const qrBuffer = await qrResponse.arrayBuffer();
          const base64 = btoa(String.fromCharCode(...new Uint8Array(qrBuffer)));
          qrCodeBase64 = base64;
          console.log("[create-picpay-pix] QR Code generated successfully");
        }
      } catch (qrErr) {
        console.error("[create-picpay-pix] QR code generation failed:", qrErr);
      }
    }

    // Salvar IDs para consulta posterior
    await supabaseClient
      .from("pending_order_payments")
      .update({
        mercadopago_payment_id: paymentLinkId,
      })
      .eq("id", pendingId);

    // Expiração em 30 minutos
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    return new Response(
      JSON.stringify({
        qrCodeBase64: qrCodeBase64 || null,
        qrCode: brcode || null,
        paymentUrl,
        pendingId,
        paymentLinkId,
        expiresAt,
        total: body.total,
        companyName: company.name,
        companySlug: company.slug,
        gateway: "picpay",
        mode: brcode && qrCodeBase64 ? "embedded" : "redirect",
        functionVersion: FUNCTION_VERSION,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    console.error("[create-picpay-pix] Error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: errorMessage, functionVersion: FUNCTION_VERSION }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
