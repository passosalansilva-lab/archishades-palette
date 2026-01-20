import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-signature, x-request-id",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[MP-SUBSCRIPTION-WEBHOOK] ${step}${detailsStr}`);
};

const GRACE_PERIOD_DAYS = 7;

// Verify webhook signature from Mercado Pago
const verifySignature = async (
  xSignature: string | null,
  xRequestId: string | null,
  dataId: string,
  secret: string
): Promise<boolean> => {
  if (!xSignature || !xRequestId) {
    logStep("Missing signature headers");
    return false;
  }

  try {
    // Parse x-signature header (format: ts=xxx,v1=xxx)
    const parts: Record<string, string> = {};
    xSignature.split(",").forEach((part) => {
      const [key, value] = part.split("=");
      if (key && value) {
        parts[key.trim()] = value.trim();
      }
    });

    const ts = parts["ts"];
    const v1 = parts["v1"];

    if (!ts || !v1) {
      logStep("Invalid signature format", { xSignature });
      return false;
    }

    // Build the manifest string
    const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
    
    // Create HMAC signature
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    
    const signature = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(manifest)
    );
    
    // Convert to hex
    const hashArray = Array.from(new Uint8Array(signature));
    const calculatedSignature = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    const isValid = calculatedSignature === v1;
    logStep("Signature verification", { isValid, manifest: manifest.substring(0, 50) + "..." });
    
    return isValid;
  } catch (error) {
    logStep("Signature verification error", { error: String(error) });
    return false;
  }
};

// Helper to send payment alert
async function sendPaymentAlert(
  supabaseUrl: string,
  serviceKey: string,
  companyId: string,
  ownerId: string,
  type: string,
  planName: string,
  graceEndDate?: string,
  amount?: number
) {
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/send-subscription-payment-alert`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        companyId,
        ownerId,
        type,
        planName,
        graceEndDate,
        amount,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logStep("Failed to send payment alert", { type, companyId, error: errorText });
    } else {
      logStep("Payment alert sent", { type, companyId });
    }
  } catch (err) {
    logStep("Error sending payment alert", { type, companyId, error: String(err) });
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Webhook received");

    const mpAccessToken = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN");
    if (!mpAccessToken) {
      throw new Error("MERCADO_PAGO_ACCESS_TOKEN is not set");
    }

    const webhookSecret = Deno.env.get("MERCADO_PAGO_WEBHOOK_SECRET");
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const supabaseClient = createClient(supabaseUrl, serviceKey);

    // Get webhook data
    const body = await req.json();
    logStep("Webhook body", body);

    // Verify signature if secret is configured
    if (webhookSecret) {
      const xSignature = req.headers.get("x-signature");
      const xRequestId = req.headers.get("x-request-id");
      const dataId = body.data?.id?.toString() || "";
      
      const isValid = await verifySignature(xSignature, xRequestId, dataId, webhookSecret);
      
      if (!isValid) {
        logStep("Invalid webhook signature - rejecting request");
        return new Response(JSON.stringify({ error: "Invalid signature" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 401,
        });
      }
      logStep("Webhook signature verified successfully");
    } else {
      logStep("No webhook secret configured - skipping signature verification");
    }

    // Handle different notification types
    if (body.type === "payment" || body.action === "payment.created" || body.action === "payment.updated") {
      const paymentId = body.data?.id;
      
      if (!paymentId) {
        logStep("No payment ID in webhook");
        return new Response(JSON.stringify({ received: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }

      // Get payment details from Mercado Pago
      const paymentResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: {
          Authorization: `Bearer ${mpAccessToken}`,
        },
      });

      if (!paymentResponse.ok) {
        const errorText = await paymentResponse.text();
        logStep("Error fetching payment", { status: paymentResponse.status, error: errorText });
        throw new Error(`Failed to fetch payment: ${paymentResponse.status}`);
      }

      const payment = await paymentResponse.json();
      logStep("Payment details", { 
        status: payment.status, 
        statusDetail: payment.status_detail,
        externalReference: payment.external_reference,
        amount: payment.transaction_amount 
      });

      // Parse external reference (can be empty for recurring charges)
      let referenceData: any | null = null;
      const rawExternalRef = payment.external_reference;

      if (rawExternalRef) {
        try {
          referenceData = JSON.parse(rawExternalRef);
        } catch (_e) {
          logStep("Invalid external reference JSON", { ref: rawExternalRef });
        }
      }

      // Fallback for recurring card charges: map by preapproval_id
      // We store the preapproval ID in companies.stripe_customer_id (legacy field name).
      if (!referenceData) {
        const preapprovalId = payment.preapproval_id ? String(payment.preapproval_id) : "";

        if (preapprovalId) {
          logStep("External reference missing/invalid - trying preapproval fallback", { preapprovalId });

          const { data: companyByPreapproval, error: companyByPreapprovalError } = await supabaseClient
            .from("companies")
            .select("id, owner_id, subscription_plan")
            .eq("stripe_customer_id", preapprovalId)
            .maybeSingle();

          if (companyByPreapprovalError) {
            logStep("Error looking up company by preapproval_id", {
              preapprovalId,
              error: companyByPreapprovalError.message,
            });
          }

          if (companyByPreapproval?.id && companyByPreapproval.subscription_plan) {
            referenceData = {
              companyId: companyByPreapproval.id,
              planKey: companyByPreapproval.subscription_plan,
              userId: companyByPreapproval.owner_id,
              type: "preapproval_fallback",
            };

            logStep("Preapproval fallback matched company", {
              companyId: referenceData.companyId,
              planKey: referenceData.planKey,
            });
          }
        }
      }

      if (!referenceData) {
        // We can't safely associate this payment to a company; acknowledge to avoid retries.
        logStep("Unable to associate payment to a company - skipping", {
          paymentId,
          hasExternalReference: !!rawExternalRef,
          preapproval_id: payment.preapproval_id,
        });
        return new Response(JSON.stringify({ received: true, skipped: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }

      // Check if this is a subscription payment (both recurring and PIX one-time)
      if (
        referenceData.type !== "subscription" &&
        referenceData.type !== "pix_subscription" &&
        referenceData.type !== "preapproval" &&
        referenceData.type !== "preapproval_fallback"
      ) {
        logStep("Not a subscription payment, skipping", { type: referenceData.type });
        return new Response(JSON.stringify({ received: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }

      const isPixPayment = referenceData.type === "pix_subscription";
      const { companyId, planKey, userId } = referenceData;

      // Get plan details for notifications
      const { data: plan } = await supabaseClient
        .from("subscription_plans")
        .select("name, price")
        .eq("key", planKey)
        .single();

      const planName = plan?.name || planKey;
      const planPrice = plan?.price || payment.transaction_amount;

      // Handle REJECTED payments - activate grace period
      if (payment.status === "rejected") {
        logStep("Payment rejected - activating grace period", { 
          status: payment.status, 
          statusDetail: payment.status_detail,
          companyId, 
          planKey 
        });

        // Calculate grace period end date
        const graceEnd = new Date();
        graceEnd.setDate(graceEnd.getDate() + GRACE_PERIOD_DAYS);

        // Update company with grace period
        const { error: updateError } = await supabaseClient
          .from("companies")
          .update({
            subscription_status: "grace_period",
            subscription_grace_end_date: graceEnd.toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", companyId);

        if (updateError) {
          logStep("Error updating company for grace period", { error: updateError.message });
        } else {
          logStep("Grace period activated", { companyId, graceEnd: graceEnd.toISOString() });
        }

        // Send payment failed alert
        if (userId) {
          await sendPaymentAlert(
            supabaseUrl,
            serviceKey,
            companyId,
            userId,
            "payment_failed",
            planName,
            graceEnd.toISOString(),
            planPrice
          );
        }

        return new Response(JSON.stringify({ 
          received: true, 
          processed: true,
          action: "grace_period_activated",
          reason: payment.status_detail,
          graceEnd: graceEnd.toISOString(),
          companyId 
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }

      // Handle REFUNDED payments - cancel subscription
      if (payment.status === "refunded" || payment.status === "cancelled" || payment.status === "charged_back") {
        logStep("Payment refunded/cancelled - cancelling subscription", { 
          status: payment.status, 
          companyId, 
          planKey 
        });

        // Reset company subscription to free
        const { error: updateError } = await supabaseClient
          .from("companies")
          .update({
            subscription_plan: null,
            subscription_status: "free",
            subscription_end_date: null,
            subscription_grace_end_date: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", companyId);

        if (updateError) {
          logStep("Error updating company for refund", { error: updateError.message });
          throw updateError;
        }

        logStep("Subscription cancelled due to refund", { companyId });

        // Create notification for the user
        if (userId) {
          await supabaseClient
            .from("notifications")
            .insert({
              user_id: userId,
              title: "Assinatura cancelada",
              message: "Sua assinatura foi cancelada devido a um estorno. Voce voltou para o plano gratuito.",
              type: "warning",
              data: {
                type: "subscription_cancelled",
                reason: payment.status,
                companyId,
              },
            });
          logStep("Refund notification created for user");
        }

        return new Response(JSON.stringify({ 
          received: true, 
          processed: true,
          action: "subscription_cancelled",
          reason: payment.status,
          companyId 
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }

      // Handle APPROVED payments - activate subscription
      if (payment.status === "approved") {
        logStep("Processing approved subscription", { companyId, planKey, userId });

        // Get full plan details
        const { data: fullPlan, error: planError } = await supabaseClient
          .from("subscription_plans")
          .select("*")
          .eq("key", planKey)
          .maybeSingle();

        if (planError || !fullPlan) {
          logStep("Plan not found", { planKey, error: planError?.message });
          throw new Error(`Plan not found: ${planKey}`);
        }

        // Calculate subscription end date (30 days from now)
        const subscriptionEnd = new Date();
        subscriptionEnd.setDate(subscriptionEnd.getDate() + 30);
        
        const periodStart = new Date();

        // Update company subscription - clear grace period if was in grace
        const { error: updateError } = await supabaseClient
          .from("companies")
          .update({
            subscription_plan: planKey,
            subscription_status: "active",
            subscription_end_date: subscriptionEnd.toISOString(),
            subscription_grace_end_date: null, // Clear grace period
            updated_at: new Date().toISOString(),
          })
          .eq("id", companyId);

        if (updateError) {
          logStep("Error updating company", { error: updateError.message });
          throw updateError;
        }

        // Registrar pagamento na tabela subscription_payments
        try {
          const { error: paymentRecordError } = await supabaseClient
            .from("subscription_payments")
            .insert({
              company_id: companyId,
              plan_key: planKey,
              plan_name: fullPlan.name,
              amount: payment.transaction_amount || fullPlan.price,
              payment_method: isPixPayment ? "pix" : "card",
              payment_status: "paid",
              payment_reference: String(paymentId),
              paid_at: new Date().toISOString(),
              period_start: periodStart.toISOString(),
              period_end: subscriptionEnd.toISOString(),
            });

          if (paymentRecordError) {
            // Log mas não falha a função - o pagamento principal já foi processado
            logStep("Error recording subscription payment", { error: paymentRecordError.message });
          } else {
            logStep("Subscription payment recorded successfully", { 
              companyId, 
              planKey, 
              amount: payment.transaction_amount 
            });
          }
        } catch (recordErr) {
          logStep("Exception recording subscription payment", { error: String(recordErr) });
        }

        logStep("Subscription activated successfully", { 
          companyId, 
          planKey, 
          subscriptionEnd: subscriptionEnd.toISOString() 
        });

        // Create notification for the user
        if (userId) {
          const notificationMessage = isPixPayment 
            ? `Seu plano ${fullPlan.name} foi ativado com sucesso via PIX. Lembre-se: o pagamento precisa ser renovado manualmente a cada mes.`
            : `Seu plano ${fullPlan.name} foi ativado com sucesso. Aproveite todos os beneficios!`;
          
          await supabaseClient
            .from("notifications")
            .insert({
              user_id: userId,
              title: "Assinatura ativada!",
              message: notificationMessage,
              type: "success",
              data: {
                type: "subscription_activated",
                planKey,
                companyId,
                paymentMethod: isPixPayment ? "pix" : "recurring",
              },
            });
          logStep("Notification created for user");
        }

        return new Response(JSON.stringify({ 
          received: true, 
          processed: true,
          action: "subscription_activated",
          planKey,
          companyId 
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }

      // Handle PENDING payments (PIX waiting for payment)
      if (payment.status === "pending" || payment.status === "in_process") {
        logStep("Payment pending", { status: payment.status, statusDetail: payment.status_detail });

        // For PIX, send reminder if it's been pending for a while
        if (isPixPayment && userId) {
          await sendPaymentAlert(
            supabaseUrl,
            serviceKey,
            companyId,
            userId,
            "payment_pending",
            planName,
            undefined,
            planPrice
          );
        }

        return new Response(JSON.stringify({ received: true, status: payment.status }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }

      // For other payment statuses, just acknowledge
      logStep("Payment not in final state, skipping", { status: payment.status });
      return new Response(JSON.stringify({ received: true, status: payment.status }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // For other notification types, just acknowledge
    logStep("Non-payment notification, acknowledging");
    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    // Always return 200 for webhooks to prevent retries
    return new Response(JSON.stringify({ received: true, error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  }
});
