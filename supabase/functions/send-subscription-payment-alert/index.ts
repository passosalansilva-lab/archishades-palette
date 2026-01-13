import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getEmailTemplate, replaceTemplateVariables, replaceSubjectVariables, getPlatformUrl } from "../_shared/email-templates.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[SEND-SUBSCRIPTION-ALERT] ${step}${detailsStr}`);
};

type AlertType = 
  | "payment_failed"
  | "payment_pending"
  | "expiring_soon"
  | "grace_period"
  | "grace_period_ending"
  | "expired";

interface AlertRequest {
  companyId: string;
  ownerId: string;
  type: AlertType;
  planName?: string;
  graceEndDate?: string;
  amount?: number;
}

// Mapeamento de tipos para slugs de template
const TEMPLATE_SLUG_MAP: Record<AlertType, string> = {
  payment_failed: "subscription-payment-failed",
  payment_pending: "subscription-payment-pending",
  expiring_soon: "subscription-expiring-soon",
  grace_period: "subscription-grace-period",
  grace_period_ending: "subscription-grace-period-ending",
  expired: "subscription-expired",
};

// Templates padrão para cada tipo
const DEFAULT_TEMPLATES: Record<AlertType, { subject: string; notificationTitle: string; notificationMessage: string; notificationType: string }> = {
  payment_failed: {
    subject: "Falha no pagamento da assinatura - {{companyName}}",
    notificationTitle: "Falha no pagamento",
    notificationMessage: "Não foi possível cobrar sua assinatura. Você tem 7 dias para regularizar.",
    notificationType: "warning",
  },
  payment_pending: {
    subject: "Pagamento PIX pendente - {{companyName}}",
    notificationTitle: "Pagamento PIX pendente",
    notificationMessage: "Seu pagamento PIX de {{amount}} ainda não foi confirmado.",
    notificationType: "info",
  },
  expiring_soon: {
    subject: "Sua assinatura vai expirar em breve - {{companyName}}",
    notificationTitle: "Assinatura expirando",
    notificationMessage: "Sua assinatura do plano {{planName}} expira em breve. Renove para continuar.",
    notificationType: "info",
  },
  grace_period: {
    subject: "Período de carência ativado - {{companyName}}",
    notificationTitle: "Período de carência ativado",
    notificationMessage: "Sua assinatura venceu. Você tem até {{graceEnd}} para regularizar.",
    notificationType: "warning",
  },
  grace_period_ending: {
    subject: "URGENTE: Período de carência acabando - {{companyName}}",
    notificationTitle: "Carência acabando!",
    notificationMessage: "Faltam 2 dias para sua carência acabar. Renove agora!",
    notificationType: "error",
  },
  expired: {
    subject: "Assinatura expirada - {{companyName}}",
    notificationTitle: "Assinatura expirada",
    notificationMessage: "Sua assinatura expirou. Você foi rebaixado para o plano gratuito.",
    notificationType: "error",
  },
};

// HTML padrão para cada tipo de alerta
function getDefaultHtml(type: AlertType, params: {
  ownerName: string;
  companyName: string;
  planName: string;
  graceEnd: string;
  amount: string;
  renewUrl: string;
}): string {
  const { ownerName, companyName, planName, graceEnd, amount, renewUrl } = params;
  
  const baseStyles = `<style>body{margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;}</style>`;

  const header = (color: string, icon: string, title: string) => `
    <tr>
      <td style="background:linear-gradient(135deg, ${color}); padding:40px 30px; text-align:center;">
        <h1 style="margin:0; font-size:28px; color:#ffffff; font-weight:700;">
          ${icon} ${title}
        </h1>
      </td>
    </tr>
  `;

  const footer = `
    <tr>
      <td style="background:#f9fafb; padding:25px 30px; text-align:center; border-top:1px solid #e5e7eb;">
        <p style="margin:0; color:#6b7280; font-size:14px;">
          Atenciosamente,<br><strong>Equipe CardpOn</strong>
        </p>
        <p style="margin:15px 0 0; color:#9ca3af; font-size:12px;">
          Este email foi enviado automaticamente pelo sistema CardpOn.
        </p>
      </td>
    </tr>
  `;

  const renewButton = `
    <div style="text-align:center; margin-top:30px;">
      <a href="${renewUrl}" 
         style="display:inline-block; background:#3b82f6; color:white; text-decoration:none; padding:14px 30px; border-radius:8px; font-weight:600; font-size:16px;">
        Renovar Assinatura
      </a>
    </div>
  `;

  const wrapHtml = (content: string) => `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${baseStyles}
</head>
<body>
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5; padding:24px 0;">
<tr>
<td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px; background:#ffffff; border-radius:14px; overflow:hidden; box-shadow:0 10px 30px rgba(0,0,0,0.05);">
${content}
${footer}
</table>
</td>
</tr>
</table>
</body>
</html>
  `;

  const templates: Record<AlertType, string> = {
    payment_failed: wrapHtml(`
      ${header("#f59e0b 0%, #d97706 100%", "⚠️", "Falha no Pagamento")}
      <tr>
        <td style="padding:40px 30px;">
          <p style="font-size:16px; color:#374151; margin:0 0 20px;">Olá <strong>${ownerName}</strong>,</p>
          <p style="font-size:16px; color:#374151; margin:0 0 20px;">
            Não conseguimos processar o pagamento da sua assinatura <strong>${planName}</strong> 
            para a empresa <strong>${companyName}</strong>.
          </p>
          <div style="background:#fef3c7; border-left:4px solid #f59e0b; padding:15px 20px; margin:25px 0; border-radius:0 8px 8px 0;">
            <p style="margin:0; color:#92400e; font-size:14px;">
              <strong>Motivo provável:</strong> Limite insuficiente no cartão ou cartão expirado.
            </p>
          </div>
          <p style="font-size:16px; color:#374151; margin:0 0 20px;">
            <strong>Você tem 7 dias para regularizar</strong> sem que seus pedidos sejam bloqueados.
          </p>
          ${renewButton}
        </td>
      </tr>
    `),
    payment_pending: wrapHtml(`
      ${header("#3b82f6 0%, #2563eb 100%", "⏳", "Pagamento Pendente")}
      <tr>
        <td style="padding:40px 30px;">
          <p style="font-size:16px; color:#374151; margin:0 0 20px;">Olá <strong>${ownerName}</strong>,</p>
          <p style="font-size:16px; color:#374151; margin:0 0 20px;">
            O pagamento PIX de <strong>${amount}</strong> para o plano <strong>${planName}</strong> 
            ainda não foi confirmado.
          </p>
          <div style="background:#dbeafe; border-left:4px solid #3b82f6; padding:15px 20px; margin:25px 0; border-radius:0 8px 8px 0;">
            <p style="margin:0; color:#1e40af; font-size:14px;">
              Se você já realizou o pagamento, aguarde alguns minutos para a confirmação automática.
            </p>
          </div>
          ${renewButton}
        </td>
      </tr>
    `),
    expiring_soon: wrapHtml(`
      ${header("#3b82f6 0%, #2563eb 100%", "📅", "Assinatura Expirando")}
      <tr>
        <td style="padding:40px 30px;">
          <p style="font-size:16px; color:#374151; margin:0 0 20px;">Olá <strong>${ownerName}</strong>,</p>
          <p style="font-size:16px; color:#374151; margin:0 0 20px;">
            Sua assinatura do plano <strong>${planName}</strong> para a empresa 
            <strong>${companyName}</strong> vai expirar em breve.
          </p>
          <p style="font-size:16px; color:#374151; margin:0 0 20px;">
            Para continuar aproveitando todos os benefícios, renove sua assinatura antes do vencimento.
          </p>
          ${renewButton}
        </td>
      </tr>
    `),
    grace_period: wrapHtml(`
      ${header("#f59e0b 0%, #d97706 100%", "⏰", "Período de Carência")}
      <tr>
        <td style="padding:40px 30px;">
          <p style="font-size:16px; color:#374151; margin:0 0 20px;">Olá <strong>${ownerName}</strong>,</p>
          <p style="font-size:16px; color:#374151; margin:0 0 20px;">
            Sua assinatura do plano <strong>${planName}</strong> venceu, mas ativamos um 
            <strong>período de carência de 7 dias</strong> para que você possa regularizar.
          </p>
          <div style="background:#fef3c7; border-left:4px solid #f59e0b; padding:15px 20px; margin:25px 0; border-radius:0 8px 8px 0;">
            <p style="margin:0; color:#92400e; font-size:14px;">
              <strong>Prazo final:</strong> ${graceEnd}
            </p>
          </div>
          ${renewButton}
        </td>
      </tr>
    `),
    grace_period_ending: wrapHtml(`
      ${header("#ef4444 0%, #dc2626 100%", "🚨", "Carência Acabando!")}
      <tr>
        <td style="padding:40px 30px;">
          <p style="font-size:16px; color:#374151; margin:0 0 20px;">Olá <strong>${ownerName}</strong>,</p>
          <p style="font-size:16px; color:#374151; margin:0 0 20px;">
            <strong>Faltam apenas 2 dias</strong> para o fim do período de carência da sua 
            assinatura do plano <strong>${planName}</strong>.
          </p>
          <div style="background:#fef2f2; border-left:4px solid #ef4444; padding:15px 20px; margin:25px 0; border-radius:0 8px 8px 0;">
            <p style="margin:0; color:#991b1b; font-size:14px;">
              <strong>Data limite:</strong> ${graceEnd}<br>
              Após essa data, sua conta será rebaixada para o plano gratuito automaticamente.
            </p>
          </div>
          ${renewButton}
        </td>
      </tr>
    `),
    expired: wrapHtml(`
      ${header("#ef4444 0%, #dc2626 100%", "❌", "Assinatura Expirada")}
      <tr>
        <td style="padding:40px 30px;">
          <p style="font-size:16px; color:#374151; margin:0 0 20px;">Olá <strong>${ownerName}</strong>,</p>
          <p style="font-size:16px; color:#374151; margin:0 0 20px;">
            Sua assinatura do plano <strong>${planName}</strong> expirou e sua conta foi 
            automaticamente rebaixada para o <strong>plano gratuito</strong>.
          </p>
          <div style="background:#fef2f2; border-left:4px solid #ef4444; padding:15px 20px; margin:25px 0; border-radius:0 8px 8px 0;">
            <p style="margin:0; color:#991b1b; font-size:14px;">
              <strong>Importante:</strong> Se você ultrapassar o limite de faturamento do plano gratuito, 
              seus pedidos podem ser bloqueados.
            </p>
          </div>
          ${renewButton}
        </td>
      </tr>
    `),
  };

  return templates[type] || templates.expired;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    const { companyId, ownerId, type, planName, graceEndDate, amount }: AlertRequest = await req.json();

    logStep("Processing alert", { companyId, ownerId, type });

    if (!companyId || !ownerId || !type) {
      return new Response(
        JSON.stringify({ error: "companyId, ownerId e type são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Buscar dados da empresa
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("name, email, slug")
      .eq("id", companyId)
      .single();

    if (companyError || !company) {
      logStep("Error fetching company", { error: companyError });
      return new Response(
        JSON.stringify({ error: "Empresa não encontrada" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Buscar email do owner
    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(ownerId);

    if (userError || !userData?.user?.email) {
      logStep("Error fetching user", { error: userError });
      return new Response(
        JSON.stringify({ error: "Email do usuário não encontrado" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ownerEmail = userData.user.email;
    const ownerName = userData.user.user_metadata?.full_name || company.name;
    const plan = planName || "seu plano";
    const formattedAmount = amount ? `R$ ${amount.toFixed(2).replace('.', ',')}` : '';
    const graceEnd = graceEndDate ? new Date(graceEndDate).toLocaleDateString('pt-BR') : '';

    // Buscar URL da plataforma
    const platformUrl = await getPlatformUrl();
    const renewUrl = `${platformUrl}/dashboard/planos`;

    // Buscar template do banco
    const templateSlug = TEMPLATE_SLUG_MAP[type];
    const template = await getEmailTemplate(templateSlug);

    const variables = {
      ownerName,
      owner_name: ownerName,
      companyName: company.name,
      company_name: company.name,
      companySlug: company.slug,
      company_slug: company.slug,
      planName: plan,
      plan_name: plan,
      amount: formattedAmount,
      graceEnd,
      grace_end: graceEnd,
      renewUrl,
      renew_url: renewUrl,
      platformUrl,
      platform_url: platformUrl,
      year: new Date().getFullYear().toString(),
    };

    let htmlContent: string;
    let subject: string;
    let notificationTitle: string;
    let notificationMessage: string;
    let notificationType: string;

    const defaultConfig = DEFAULT_TEMPLATES[type] || DEFAULT_TEMPLATES.expired;

    if (template) {
      htmlContent = replaceTemplateVariables(template.html_content, variables);
      subject = replaceSubjectVariables(template.subject, variables);
      notificationTitle = defaultConfig.notificationTitle;
      notificationMessage = replaceTemplateVariables(defaultConfig.notificationMessage, variables);
      notificationType = defaultConfig.notificationType;
      logStep(`Using database template: ${templateSlug}`);
    } else {
      htmlContent = getDefaultHtml(type, {
        ownerName,
        companyName: company.name,
        planName: plan,
        graceEnd,
        amount: formattedAmount,
        renewUrl,
      });
      subject = replaceTemplateVariables(defaultConfig.subject, variables);
      notificationTitle = defaultConfig.notificationTitle;
      notificationMessage = replaceTemplateVariables(defaultConfig.notificationMessage, variables);
      notificationType = defaultConfig.notificationType;
      logStep("Using default template");
    }

    logStep("Sending email to", { email: ownerEmail, type });

    // Enviar email via Resend API
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "CardpOn <contato@cardpondelivery.com>",
        to: [ownerEmail],
        subject,
        html: htmlContent,
      }),
    });

    const emailResponse = await res.json();
    logStep("Email response", { status: res.status, id: emailResponse.id });

    if (!res.ok) {
      throw new Error(emailResponse.message || "Falha ao enviar email");
    }

    // Criar notificação no sistema também
    await supabase.from("notifications").insert({
      user_id: ownerId,
      title: notificationTitle,
      message: notificationMessage,
      type: notificationType,
      data: { 
        type: "subscription_alert",
        alertType: type,
        companyId 
      },
    });

    return new Response(
      JSON.stringify({ success: true, emailId: emailResponse.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    logStep("Error", { message: error.message });
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
