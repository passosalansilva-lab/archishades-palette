import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ProcessRequest {
  request_id: string;
  action: 'approve' | 'reject';
  rejection_reason?: string;
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

    // Handle approval - process refund via Mercado Pago
    // Update status to processing
    await supabase
      .from("refund_requests")
      .update({
        status: 'processing',
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", request_id);

    // Get company payment settings
    const { data: paymentSettings, error: settingsError } = await supabase
      .from("company_payment_settings")
      .select("mercadopago_access_token")
      .eq("company_id", refundRequest.company_id)
      .single();

    if (settingsError || !paymentSettings?.mercadopago_access_token) {
      console.error("[process-refund-request] No access token:", settingsError);
      
      await supabase
        .from("refund_requests")
        .update({
          status: 'failed',
          error_message: "Configuração de pagamento não encontrada",
        })
        .eq("id", request_id);

      return new Response(
        JSON.stringify({ error: "Configuração de pagamento não encontrada" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const accessToken = paymentSettings.mercadopago_access_token;

    // Get payment details from Mercado Pago
    const paymentResponse = await fetch(
      `https://api.mercadopago.com/v1/payments/${refundRequest.payment_id}`,
      {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
        },
      }
    );

    if (!paymentResponse.ok) {
      const errorData = await paymentResponse.json();
      console.error("[process-refund-request] Error fetching payment:", errorData);
      
      await supabase
        .from("refund_requests")
        .update({
          status: 'failed',
          error_message: "Pagamento não encontrado no Mercado Pago",
        })
        .eq("id", request_id);

      return new Response(
        JSON.stringify({ error: "Pagamento não encontrado no Mercado Pago" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const paymentData = await paymentResponse.json();
    console.log("[process-refund-request] Payment data:", {
      status: paymentData.status,
      transaction_amount: paymentData.transaction_amount,
    });

    if (paymentData.status !== "approved") {
      await supabase
        .from("refund_requests")
        .update({
          status: 'failed',
          error_message: `Pagamento não pode ser estornado. Status: ${paymentData.status}`,
        })
        .eq("id", request_id);

      return new Response(
        JSON.stringify({ 
          error: `Pagamento não pode ser estornado. Status atual: ${paymentData.status}` 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Process the refund
    const refundBody: any = {};
    if (refundRequest.requested_amount < paymentData.transaction_amount) {
      refundBody.amount = refundRequest.requested_amount;
    }

    console.log("[process-refund-request] Processing refund:", { 
      payment_id: refundRequest.payment_id, 
      refundAmount: refundRequest.requested_amount,
      isPartial: refundRequest.requested_amount < paymentData.transaction_amount
    });

    const refundResponse = await fetch(
      `https://api.mercadopago.com/v1/payments/${refundRequest.payment_id}/refunds`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "X-Idempotency-Key": `refund-${refundRequest.id}-${Date.now()}`,
        },
        body: JSON.stringify(refundBody),
      }
    );

    const refundData = await refundResponse.json();
    console.log("[process-refund-request] Refund response:", refundData);

    if (!refundResponse.ok) {
      const errorMsg = refundData.message?.includes("already refunded") 
        ? "Este pagamento já foi estornado"
        : refundData.message || "Erro ao processar estorno no Mercado Pago";

      await supabase
        .from("refund_requests")
        .update({
          status: 'failed',
          error_message: errorMsg,
        })
        .eq("id", request_id);

      return new Response(
        JSON.stringify({ error: errorMsg }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update refund request as completed
    await supabase
      .from("refund_requests")
      .update({
        status: 'completed',
        refund_id: refundData.id?.toString(),
        processed_at: new Date().toISOString(),
      })
      .eq("id", request_id);

    // Update order status
    if (refundRequest.order_id) {
      await supabase
        .from("orders")
        .update({
          payment_status: refundRequest.requested_amount >= paymentData.transaction_amount 
            ? "refunded" 
            : "partially_refunded",
          status: "cancelled",
          updated_at: new Date().toISOString(),
        })
        .eq("id", refundRequest.order_id);
    }

    // Log the refund
    await supabase.from("activity_logs").insert({
      company_id: refundRequest.company_id,
      action: "refund_approved",
      details: {
        request_id: refundRequest.id,
        payment_id: refundRequest.payment_id,
        order_id: refundRequest.order_id,
        refund_id: refundData.id,
        refund_amount: refundRequest.requested_amount,
        approved_by: user.id,
      },
    });

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
        title: "Estorno Aprovado e Processado",
        message: `Seu estorno de R$ ${refundRequest.requested_amount.toFixed(2)} foi aprovado e processado com sucesso.`,
        type: "success",
      });
    }

    console.log("[process-refund-request] Refund completed:", {
      refund_id: refundData.id,
      amount: refundRequest.requested_amount,
    });

    return new Response(
      JSON.stringify({
        success: true,
        refund_id: refundData.id,
        amount: refundRequest.requested_amount,
        message: `Estorno de R$ ${refundRequest.requested_amount.toFixed(2)} processado com sucesso`,
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
