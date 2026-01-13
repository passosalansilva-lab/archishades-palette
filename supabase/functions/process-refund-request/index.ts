import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { getEmailTemplate, replaceTemplateVariables, replaceSubjectVariables, getPlatformUrl } from "../_shared/email-templates.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// PicPay API endpoints
const PICPAY_OAUTH_BASE = "https://checkout-api.picpay.com";
const PICPAY_PAYMENTLINK_BASE = "https://api.picpay.com/v1/paymentlink";

interface ProcessRequest {
  request_id: string;
  action: 'approve' | 'reject';
  rejection_reason?: string;
}

interface RefundResult {
  success: boolean;
  refund_id?: string;
  error?: string;
  provider: 'mercadopago' | 'picpay';
}

// Get PicPay OAuth access token
async function getPicPayAccessToken(clientId: string, clientSecret: string): Promise<string> {
  const tokenUrl = `${PICPAY_OAUTH_BASE}/oauth2/token`;

  console.log(`[process-refund-request] Requesting PicPay OAuth token...`);

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
    console.error("[process-refund-request] PicPay token error:", responseText);
    throw new Error("Erro ao obter token de acesso do PicPay");
  }

  const data = JSON.parse(responseText);
  console.log("[process-refund-request] PicPay OAuth token obtained successfully");
  return data.access_token;
}

// Process Mercado Pago refund
async function processMercadoPagoRefund(
  paymentId: string,
  requestedAmount: number,
  accessToken: string,
  requestId: string
): Promise<RefundResult> {
  console.log("[process-refund-request] Processing Mercado Pago refund...");

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
    console.error("[process-refund-request] Error fetching MP payment:", errorData);
    return { success: false, error: "Pagamento não encontrado no Mercado Pago", provider: 'mercadopago' };
  }

  const paymentData = await paymentResponse.json();
  console.log("[process-refund-request] MP Payment data:", {
    status: paymentData.status,
    transaction_amount: paymentData.transaction_amount,
  });

  if (paymentData.status !== "approved") {
    return { 
      success: false, 
      error: `Pagamento não pode ser estornado. Status atual: ${paymentData.status}`,
      provider: 'mercadopago'
    };
  }

  // Process the refund
  const refundBody: any = {};
  if (requestedAmount < paymentData.transaction_amount) {
    refundBody.amount = requestedAmount;
  }

  const refundResponse = await fetch(
    `https://api.mercadopago.com/v1/payments/${paymentId}/refunds`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": `refund-${requestId}-${Date.now()}`,
      },
      body: JSON.stringify(refundBody),
    }
  );

  const refundData = await refundResponse.json();
  console.log("[process-refund-request] MP Refund response:", refundData);

  if (!refundResponse.ok) {
    const errorMsg = refundData.message?.includes("already refunded") 
      ? "Este pagamento já foi estornado"
      : refundData.message || "Erro ao processar estorno no Mercado Pago";
    return { success: false, error: errorMsg, provider: 'mercadopago' };
  }

  return { success: true, refund_id: refundData.id?.toString(), provider: 'mercadopago' };
}

// Process PicPay refund (cancellation)
async function processPicPayRefund(
  linkId: string,
  clientId: string,
  clientSecret: string
): Promise<RefundResult> {
  console.log("[process-refund-request] Processing PicPay refund for linkId:", linkId);

  try {
    // Get OAuth token
    const accessToken = await getPicPayAccessToken(clientId, clientSecret);

    // First, check the payment status
    const statusUrl = `${PICPAY_PAYMENTLINK_BASE}/${linkId}`;
    console.log(`[process-refund-request] Checking PicPay payment status at: ${statusUrl}`);

    const statusResponse = await fetch(statusUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!statusResponse.ok) {
      const errorText = await statusResponse.text();
      console.error("[process-refund-request] PicPay status check error:", errorText);
      return { success: false, error: "Pagamento não encontrado no PicPay", provider: 'picpay' };
    }

    const paymentData = await statusResponse.json();
    const paymentStatus = String(paymentData.status || "").toLowerCase();
    console.log("[process-refund-request] PicPay payment status:", paymentStatus);

    // Check if already refunded
    if (paymentStatus === "refunded" || paymentStatus === "cancelled" || paymentStatus === "canceled") {
      return { success: false, error: "Este pagamento já foi estornado/cancelado", provider: 'picpay' };
    }

    // Check if payment is in a refundable state
    const refundableStatuses = ["paid", "approved", "completed", "settled"];
    if (!refundableStatuses.includes(paymentStatus)) {
      return { 
        success: false, 
        error: `Pagamento não pode ser estornado. Status atual: ${paymentStatus}`,
        provider: 'picpay'
      };
    }

    // Process refund - PicPay uses the cancel endpoint for refunds
    const cancelUrl = `${PICPAY_PAYMENTLINK_BASE}/${linkId}/cancel`;
    console.log(`[process-refund-request] Cancelling PicPay payment at: ${cancelUrl}`);

    const cancelResponse = await fetch(cancelUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    const cancelText = await cancelResponse.text();
    console.log(`[process-refund-request] PicPay cancel response status: ${cancelResponse.status}`);
    console.log(`[process-refund-request] PicPay cancel response: ${cancelText}`);

    if (!cancelResponse.ok) {
      // Some PicPay errors are returned as JSON
      try {
        const errorData = JSON.parse(cancelText);
        const errorMsg = errorData.message || errorData.error || "Erro ao processar estorno no PicPay";
        return { success: false, error: errorMsg, provider: 'picpay' };
      } catch {
        return { success: false, error: `Erro ao processar estorno no PicPay: ${cancelText}`, provider: 'picpay' };
      }
    }

    // Parse response if successful
    let cancelData: any = {};
    try {
      cancelData = JSON.parse(cancelText);
    } catch {
      // Response might be empty for successful cancellation
      cancelData = { id: linkId };
    }

    console.log("[process-refund-request] PicPay refund successful:", cancelData);
    return { success: true, refund_id: cancelData.id || linkId, provider: 'picpay' };

  } catch (error: any) {
    console.error("[process-refund-request] PicPay refund exception:", error);
    return { success: false, error: error.message || "Erro ao processar estorno no PicPay", provider: 'picpay' };
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

    // Check if user is super_admin
    const { data: userRole } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "super_admin")
      .maybeSingle();

    if (!userRole) {
      return new Response(
        JSON.stringify({ error: "Acesso negado. Apenas super admins podem processar estornos." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { request_id, action, rejection_reason }: ProcessRequest = await req.json();

    console.log("[process-refund-request] Processing:", { request_id, action });

    if (!request_id || !action) {
      return new Response(
        JSON.stringify({ error: "request_id e action são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get refund request
    const { data: refundRequest, error: requestError } = await supabase
      .from("refund_requests")
      .select("*")
      .eq("id", request_id)
      .single();

    if (requestError || !refundRequest) {
      console.error("[process-refund-request] Request not found:", requestError);
      return new Response(
        JSON.stringify({ error: "Solicitação não encontrada" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (refundRequest.status !== 'pending') {
      return new Response(
        JSON.stringify({ error: "Esta solicitação já foi processada" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle rejection
    if (action === 'reject') {
      if (!rejection_reason?.trim()) {
        return new Response(
          JSON.stringify({ error: "Motivo da rejeição é obrigatório" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { error: updateError } = await supabase
        .from("refund_requests")
        .update({
          status: 'rejected',
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          rejection_reason: rejection_reason.trim(),
        })
        .eq("id", request_id);

      if (updateError) {
        console.error("[process-refund-request] Error updating status:", updateError);
        throw updateError;
      }

      // Create notification for store owner
      const { data: company } = await supabase
        .from("companies")
        .select("owner_id, name")
        .eq("id", refundRequest.company_id)
        .single();

      if (company) {
        await supabase.from("notifications").insert({
          company_id: refundRequest.company_id,
          user_id: company.owner_id,
          title: "Solicitação de Estorno Rejeitada",
          message: `Sua solicitação de estorno de R$ ${refundRequest.requested_amount.toFixed(2)} foi rejeitada. Motivo: ${rejection_reason}`,
          type: "alert",
        });
      }

      console.log("[process-refund-request] Request rejected:", request_id);

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "Solicitação rejeitada com sucesso" 
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle approval - process refund
    // Update status to processing
    await supabase
      .from("refund_requests")
      .update({
        status: 'processing',
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", request_id);

    // Check if this is a subscription refund (customer_name starts with "Assinatura -")
    const isSubscriptionRefund = refundRequest.customer_name?.startsWith('Assinatura -');
    
    // Check if this is a PicPay payment (payment_id starts with "picpay_")
    const isPicPayPayment = refundRequest.payment_id?.startsWith('picpay_');
    
    console.log("[process-refund-request] Refund type:", { 
      isSubscriptionRefund, 
      isPicPayPayment,
      customer_name: refundRequest.customer_name,
      payment_id: refundRequest.payment_id
    });

    let refundResult: RefundResult;

    if (isPicPayPayment && !isSubscriptionRefund) {
      // PicPay order refund
      const picpayLinkId = refundRequest.payment_id.replace('picpay_', '');
      
      // Get PicPay credentials from company
      const { data: paymentSettings, error: settingsError } = await supabase
        .from("company_payment_settings")
        .select("picpay_client_id, picpay_client_secret")
        .eq("company_id", refundRequest.company_id)
        .single();

      if (settingsError || !paymentSettings?.picpay_client_id || !paymentSettings?.picpay_client_secret) {
        console.error("[process-refund-request] No PicPay credentials:", settingsError);
        
        await supabase
          .from("refund_requests")
          .update({
            status: 'failed',
            error_message: "Credenciais do PicPay não configuradas para esta loja",
          })
          .eq("id", request_id);

        return new Response(
          JSON.stringify({ error: "Credenciais do PicPay não configuradas para esta loja" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      refundResult = await processPicPayRefund(
        picpayLinkId,
        paymentSettings.picpay_client_id,
        paymentSettings.picpay_client_secret
      );

    } else {
      // Mercado Pago refund (subscription or order)
      let accessToken: string;

      if (isSubscriptionRefund) {
        // For subscription refunds, use the platform's Mercado Pago token
        const platformToken = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
        if (!platformToken) {
          console.error("[process-refund-request] Platform access token not configured");
          
          await supabase
            .from("refund_requests")
            .update({
              status: 'failed',
              error_message: "Token da plataforma não configurado para estorno de assinatura",
            })
            .eq("id", request_id);

          return new Response(
            JSON.stringify({ error: "Token da plataforma não configurado" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        accessToken = platformToken;
        console.log("[process-refund-request] Using platform token for subscription refund");
      } else {
        // For order refunds, use the store's Mercado Pago token
        const { data: paymentSettings, error: settingsError } = await supabase
          .from("company_payment_settings")
          .select("mercadopago_access_token")
          .eq("company_id", refundRequest.company_id)
          .single();

        if (settingsError || !paymentSettings?.mercadopago_access_token) {
          console.error("[process-refund-request] No store access token:", settingsError);
          
          await supabase
            .from("refund_requests")
            .update({
              status: 'failed',
              error_message: "Configuração de pagamento da loja não encontrada",
            })
            .eq("id", request_id);

          return new Response(
            JSON.stringify({ error: "Configuração de pagamento da loja não encontrada" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        accessToken = paymentSettings.mercadopago_access_token;
        console.log("[process-refund-request] Using store token for order refund");
      }

      refundResult = await processMercadoPagoRefund(
        refundRequest.payment_id,
        refundRequest.requested_amount,
        accessToken,
        refundRequest.id
      );
    }

    // Handle refund failure
    if (!refundResult.success) {
      await supabase
        .from("refund_requests")
        .update({
          status: 'failed',
          error_message: refundResult.error,
        })
        .eq("id", request_id);

      return new Response(
        JSON.stringify({ error: refundResult.error }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update refund request as completed
    await supabase
      .from("refund_requests")
      .update({
        status: 'completed',
        refund_id: refundResult.refund_id,
        processed_at: new Date().toISOString(),
      })
      .eq("id", request_id);

    // Update order status or subscription payment status
    let customerEmail: string | null = null;
    let customerName: string | null = null;
    let orderCode: string | null = null;
    let storeName: string | null = null;

    if (isSubscriptionRefund) {
      // Update subscription_payments status
      await supabase
        .from("subscription_payments")
        .update({
          payment_status: "refunded",
          updated_at: new Date().toISOString(),
        })
        .eq("payment_reference", refundRequest.payment_id);
      
      console.log("[process-refund-request] Updated subscription_payments status to refunded");
    } else if (refundRequest.order_id) {
      // Update order status for regular order refunds
      await supabase
        .from("orders")
        .update({
          payment_status: "refunded",
          status: "cancelled",
          updated_at: new Date().toISOString(),
        })
        .eq("id", refundRequest.order_id);

      // Get customer info from order
      const { data: orderData } = await supabase
        .from("orders")
        .select("customer_email, customer_name, order_code")
        .eq("id", refundRequest.order_id)
        .maybeSingle();

      if (orderData) {
        customerEmail = orderData.customer_email;
        customerName = orderData.customer_name;
        orderCode = orderData.order_code;
      }
    }

    // Log the refund
    await supabase.from("activity_logs").insert({
      company_id: refundRequest.company_id,
      action: isSubscriptionRefund ? "subscription_refund_approved" : "refund_approved",
      details: {
        request_id: refundRequest.id,
        payment_id: refundRequest.payment_id,
        order_id: refundRequest.order_id,
        refund_id: refundResult.refund_id,
        refund_amount: refundRequest.requested_amount,
        approved_by: user.id,
        is_subscription_refund: isSubscriptionRefund,
        payment_provider: refundResult.provider,
      },
    });

    // Create notification for store owner
    const { data: company } = await supabase
      .from("companies")
      .select("owner_id, name")
      .eq("id", refundRequest.company_id)
      .single();

    if (company) {
      storeName = company.name;
      
      const providerName = refundResult.provider === 'picpay' ? 'PicPay' : 'Mercado Pago';
      const notificationTitle = isSubscriptionRefund 
        ? "Estorno de Assinatura Aprovado" 
        : `Estorno Aprovado (${providerName})`;
      const notificationMessage = isSubscriptionRefund
        ? `Seu estorno de assinatura no valor de R$ ${refundRequest.requested_amount.toFixed(2)} foi aprovado e processado com sucesso.`
        : `Seu estorno de R$ ${refundRequest.requested_amount.toFixed(2)} via ${providerName} foi aprovado e processado com sucesso.`;
      
      await supabase.from("notifications").insert({
        company_id: refundRequest.company_id,
        user_id: company.owner_id,
        title: notificationTitle,
        message: notificationMessage,
        type: "success",
      });
    }

    // Send email notification to customer (for order refunds only)
    if (!isSubscriptionRefund && customerEmail) {
      const resendApiKey = Deno.env.get("RESEND_API_KEY");
      
      if (resendApiKey) {
        try {
          const resend = new Resend(resendApiKey);
          const platformUrl = await getPlatformUrl();
          
          // Try to get email template from database
          const template = await getEmailTemplate("customer-refund-notification");
          
          const formattedAmount = `R$ ${refundRequest.requested_amount.toFixed(2).replace('.', ',')}`;
          const refundDate = new Date().toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          });

          let emailSubject: string;
          let emailHtml: string;

          if (template) {
            // Use database template
            const templateVars = {
              customerName: customerName || 'Cliente',
              storeName: storeName || 'Loja',
              orderCode: orderCode || refundRequest.payment_id,
              refundAmount: formattedAmount,
              refundDate: refundDate,
              platformUrl: platformUrl,
              paymentProvider: refundResult.provider === 'picpay' ? 'PicPay' : 'Mercado Pago',
            };

            emailSubject = replaceSubjectVariables(template.subject, templateVars);
            emailHtml = replaceTemplateVariables(template.html_content, templateVars);
          } else {
            // Use fallback template
            const providerName = refundResult.provider === 'picpay' ? 'PicPay' : 'Mercado Pago';
            emailSubject = `Estorno processado - Pedido ${orderCode || refundRequest.payment_id}`;
            emailHtml = `
              <!DOCTYPE html>
              <html>
              <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Estorno Processado</title>
              </head>
              <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5;">
                <table role="presentation" style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td align="center" style="padding: 40px 0;">
                      <table role="presentation" style="width: 600px; max-width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                        <tr>
                          <td style="padding: 40px 40px 20px; text-align: center; background: linear-gradient(135deg, #10b981 0%, #059669 100%); border-radius: 8px 8px 0 0;">
                            <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">✓ Estorno Processado</h1>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding: 30px 40px;">
                            <p style="margin: 0 0 20px; color: #333333; font-size: 16px; line-height: 1.6;">
                              Olá <strong>${customerName || 'Cliente'}</strong>,
                            </p>
                            <p style="margin: 0 0 20px; color: #333333; font-size: 16px; line-height: 1.6;">
                              O estorno do seu pedido foi processado com sucesso via <strong>${providerName}</strong>. Confira os detalhes abaixo:
                            </p>
                            <table style="width: 100%; border-collapse: collapse; margin: 20px 0; background-color: #f9fafb; border-radius: 6px;">
                              <tr>
                                <td style="padding: 15px 20px; border-bottom: 1px solid #e5e7eb;">
                                  <span style="color: #6b7280; font-size: 14px;">Loja</span><br>
                                  <strong style="color: #333333; font-size: 16px;">${storeName || 'Loja'}</strong>
                                </td>
                              </tr>
                              <tr>
                                <td style="padding: 15px 20px; border-bottom: 1px solid #e5e7eb;">
                                  <span style="color: #6b7280; font-size: 14px;">Código do Pedido</span><br>
                                  <strong style="color: #333333; font-size: 16px;">${orderCode || refundRequest.payment_id}</strong>
                                </td>
                              </tr>
                              <tr>
                                <td style="padding: 15px 20px; border-bottom: 1px solid #e5e7eb;">
                                  <span style="color: #6b7280; font-size: 14px;">Valor Estornado</span><br>
                                  <strong style="color: #10b981; font-size: 20px;">${formattedAmount}</strong>
                                </td>
                              </tr>
                              <tr>
                                <td style="padding: 15px 20px; border-bottom: 1px solid #e5e7eb;">
                                  <span style="color: #6b7280; font-size: 14px;">Meio de Pagamento</span><br>
                                  <strong style="color: #333333; font-size: 16px;">${providerName}</strong>
                                </td>
                              </tr>
                              <tr>
                                <td style="padding: 15px 20px;">
                                  <span style="color: #6b7280; font-size: 14px;">Data do Estorno</span><br>
                                  <strong style="color: #333333; font-size: 16px;">${refundDate}</strong>
                                </td>
                              </tr>
                            </table>
                            <p style="margin: 20px 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                              O valor será creditado na sua conta de acordo com o prazo do seu método de pagamento (geralmente em até 7 dias úteis para cartão de crédito ou imediatamente para PIX).
                            </p>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding: 20px 40px 40px; text-align: center; border-top: 1px solid #e5e7eb;">
                            <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                              Este é um e-mail automático enviado por ${storeName || 'nossa loja'}.
                            </p>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </body>
              </html>
            `;
          }

          const { error: emailError } = await resend.emails.send({
            from: "Cardapon <noreply@cardpondelivery.com>",
            to: [customerEmail],
            subject: emailSubject,
            html: emailHtml,
          });

          if (emailError) {
            console.error("[process-refund-request] Error sending customer email:", emailError);
          } else {
            console.log("[process-refund-request] Customer email sent successfully to:", customerEmail);
          }
        } catch (emailErr) {
          console.error("[process-refund-request] Exception sending customer email:", emailErr);
        }
      } else {
        console.log("[process-refund-request] RESEND_API_KEY not configured, skipping customer email");
      }
    }

    console.log("[process-refund-request] Refund completed:", {
      refund_id: refundResult.refund_id,
      amount: refundRequest.requested_amount,
      provider: refundResult.provider,
    });

    return new Response(
      JSON.stringify({
        success: true,
        refund_id: refundResult.refund_id,
        amount: refundRequest.requested_amount,
        provider: refundResult.provider,
        message: `Estorno de R$ ${refundRequest.requested_amount.toFixed(2)} via ${refundResult.provider === 'picpay' ? 'PicPay' : 'Mercado Pago'} processado com sucesso`,
        customer_notified: !isSubscriptionRefund && !!customerEmail,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("[process-refund-request] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erro interno ao processar estorno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});