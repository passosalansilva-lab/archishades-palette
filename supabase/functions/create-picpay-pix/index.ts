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
const PICPAY_OAUTH_BASE = "https://checkout-api.picpay.com";
const PICPAY_PAYMENTLINK_BASE = "https://api.picpay.com/v1/paymentlink";

async function getPicPayAccessToken(clientId: string, clientSecret: string): Promise<string> {
  const tokenUrl = `${PICPAY_OAUTH_BASE}/oauth2/token`;

  console.log(`[create-picpay-pix] Requesting OAuth token from ${tokenUrl}...`);

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
  console.log(`[create-picpay-pix] Token response status: ${response.status}`);
  console.log(`[create-picpay-pix] Token response body: ${responseText}`);

  if (!response.ok) {
    throw new Error(`Erro ao obter token de acesso do PicPay: ${response.status} - ${responseText}`);
  }

  const data = JSON.parse(responseText);
  console.log("[create-picpay-pix] OAuth token obtained successfully, scope:", data.scope);
  return data.access_token;
}

function extractPaymentLinkId(link?: string | null): string | null {
  if (!link) return null;
  try {
    const parts = link.split("/").filter(Boolean);
    return parts.length ? parts[parts.length - 1] : null;
  } catch {
    return null;
  }
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

    const { data: paymentSettings, error: settingsError } = await supabaseClient
      .from("company_payment_settings")
      .select("*")
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

    const { data: company, error: companyError } = await supabaseClient
      .from("companies")
      .select("name, slug")
      .eq("id", body.companyId)
      .single();

    if (companyError || !company) {
      throw new Error("Empresa não encontrada");
    }

    // 1) Cria registro de pedido pendente
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
      created_at: new Date().toISOString(),
      // Table order fields
      table_session_id: body.tableSessionId || null,
      table_number: body.tableNumber || null,
      source: body.source || 'online',
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

    // 2) Monta redirect URL (alinha com o PublicMenu: query param 'payment')
    const baseUrl = `https://${company.slug}.lovable.app/${company.slug}`;
    const redirectUrl = `${baseUrl}?payment=success&pending_id=${pendingId}`;

    // 3) Monta payload do Payment Link (PicPay)
    // Docs: https://developers-business.picpay.com/payment-link/docs/introduction
    const totalCents = Math.max(1, Math.round((body.total || 0) * 100));

    // Payload simplificado - apenas campos essenciais
    const createChargePayload = {
      charge: {
        name: `Pedido ${company.name}`.slice(0, 60),
        description: `Pedido #${String(pendingId).slice(0, 8)}`,
        redirect_url: redirectUrl,
        payment: {
          methods: ["BRCODE"],
        },
        amounts: {
          product: totalCents,
        },
      },
    };

    console.log("[create-picpay-pix] Creating charge with payload:", JSON.stringify(createChargePayload));

    // 4) Token OAuth2
    const accessToken = await getPicPayAccessToken(
      paymentSettings.picpay_client_id,
      paymentSettings.picpay_client_secret
    );

    // 5) Cria cobrança no Payment Link API
    const createUrl = `${PICPAY_PAYMENTLINK_BASE}/create`;
    console.log(`[create-picpay-pix] Creating charge at: ${createUrl}`);

    const picpayResponse = await fetch(createUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(createChargePayload),
    });

    const picpayRequestId = picpayResponse.headers.get("x-request-id") || null;

    const responseText = await picpayResponse.text();
    console.log(`[create-picpay-pix] PicPay response status:`, picpayResponse.status);
    if (picpayRequestId) console.log(`[create-picpay-pix] PicPay request id:`, picpayRequestId);
    console.log(`[create-picpay-pix] PicPay response body:`, responseText);

    if (!picpayResponse.ok) {
      await supabaseClient.from("pending_order_payments").delete().eq("id", pendingId);

      return new Response(
        JSON.stringify({
          error: "Erro ao criar link de pagamento PicPay",
          status: picpayResponse.status,
          requestId: picpayRequestId,
          details: responseText,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 502 }
      );
    }

    const chargeResult = JSON.parse(responseText);

    const paymentUrl: string | undefined = chargeResult.link || chargeResult.deeplink;
    const paymentLinkId = extractPaymentLinkId(chargeResult.link || chargeResult.deeplink);
    const txid: string | undefined = chargeResult.txid;
    const brcode: string | undefined = chargeResult.brcode;
    const pixKey: string | undefined = chargeResult.pixKey;

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

    // 6) Generate QR Code using external service if brcode is available
    let qrCodeBase64: string | null = null;
    if (brcode) {
      try {
        // Use QR code API service
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
        // Continue without QR code - user can use copy/paste or redirect
      }
    }

    // 7) Salva IDs para consulta posterior
    await supabaseClient
      .from("pending_order_payments")
      .update({
        mercadopago_payment_id: paymentLinkId,
        mercadopago_preference_id: txid || null,
      })
      .eq("id", pendingId);

    // PIX expira em 30 minutos
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    return new Response(
      JSON.stringify({
        // PIX screen data (like Mercado Pago)
        qrCodeBase64: qrCodeBase64 || null,
        qrCode: brcode || null,
        pixKey: pixKey || null,
        // Fallback to redirect if no brcode
        paymentUrl,
        pendingId,
        paymentLinkId,
        txid,
        expiresAt,
        total: body.total,
        companyName: company.name,
        companySlug: company.slug,
        gateway: "picpay",
        // Use embedded mode if we have brcode, otherwise redirect
        mode: brcode && qrCodeBase64 ? "embedded" : "redirect",
        availableMethods: ["pix", "credit_card", "picpay_balance"],
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    console.error("[create-picpay-pix] Error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
