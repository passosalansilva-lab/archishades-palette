import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { getEmailTemplate, replaceTemplateVariables, replaceSubjectVariables } from "../_shared/email-templates.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const resendApiKey = Deno.env.get("RESEND_API_KEY");

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface BonusEmailRequest {
  companyId: string;
  ownerId: string;
  bonusAmount: number;
  previousBonus: number;
  newTotalLimit: number;
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
};

type IntegrationLevel = "info" | "warn" | "error";

async function safeLogIntegrationEvent(params: {
  provider: string;
  source: string;
  level: IntegrationLevel;
  message: string;
  details?: Record<string, unknown> | null;
  companyId?: string | null;
  userId?: string | null;
}) {
  try {
    await supabase.from("integration_events" as any).insert({
      provider: params.provider,
      source: params.source,
      level: params.level,
      message: params.message,
      details: params.details ?? null,
      company_id: params.companyId ?? null,
      user_id: params.userId ?? null,
    });
  } catch (err) {
    console.error("Failed to write integration_events:", err);
  }
}

async function notifySuperAdmins(params: {
  title: string;
  message: string;
  type: "info" | "success" | "warning" | "error";
  data?: Record<string, unknown>;
}) {
  try {
    const { data: superAdmins } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "super_admin");

    const userIds = (superAdmins ?? [])
      .map((r: any) => r.user_id)
      .filter((id: any) => typeof id === "string" && id.length > 0);

    if (!userIds.length) return;

    await supabase.from("notifications").insert(
      userIds.map((userId: string) => ({
        user_id: userId,
        title: params.title,
        message: params.message,
        type: params.type,
        data: params.data ?? null,
      }))
    );
  } catch (err) {
    console.error("Failed to notify super admins:", err);
  }
}

// Template padrão
const getDefaultHtml = (params: {
  headerColor: string;
  headerEmoji: string;
  headerTitle: string;
  ownerName: string;
  bodyMessage: string;
  previousBonus: number;
  bonusAmount: number;
  isRemoval: boolean;
  isNewBonus: boolean;
  totalLimitFormatted: string;
  companySlug: string;
}) => `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <tr>
            <td style="background: ${params.headerColor}; padding: 40px 30px; text-align: center;">
              <div style="font-size: 48px; margin-bottom: 10px;">${params.headerEmoji}</div>
              <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700;">
                ${params.headerTitle}
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px;">
              <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                Olá, <strong>${params.ownerName}</strong>!
              </p>
              <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 30px;">
                ${params.bodyMessage}
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" style="background: ${params.isRemoval ? 'linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)' : 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)'}; border-radius: 12px; margin-bottom: 30px;">
                <tr>
                  <td style="padding: 30px; text-align: center;">
                    ${params.previousBonus > 0 ? `
                      <p style="color: #6b7280; font-size: 14px; margin: 0 0 5px;">Bônus anterior</p>
                      <p style="color: #9ca3af; font-size: 20px; font-weight: 600; margin: 0 0 15px; text-decoration: line-through;">${formatCurrency(params.previousBonus)}</p>
                    ` : ''}
                    <p style="color: ${params.isRemoval ? '#6b7280' : '#059669'}; font-size: 14px; margin: 0 0 5px; text-transform: uppercase; letter-spacing: 1px;">
                      ${params.isRemoval ? 'Bônus atual' : (params.isNewBonus ? 'Bônus recebido' : 'Novo bônus')}
                    </p>
                    <p style="color: ${params.isRemoval ? '#374151' : '#047857'}; font-size: 36px; font-weight: 700; margin: 0;">
                      ${params.isRemoval ? 'R$ 0,00' : formatCurrency(params.bonusAmount)}
                    </p>
                  </td>
                </tr>
              </table>
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9fafb; border-radius: 8px; margin-bottom: 30px;">
                <tr>
                  <td style="padding: 20px; text-align: center;">
                    <p style="color: #6b7280; font-size: 14px; margin: 0 0 5px;">Seu limite total de faturamento</p>
                    <p style="color: #111827; font-size: 24px; font-weight: 700; margin: 0;">${params.totalLimitFormatted}</p>
                  </td>
                </tr>
              </table>
              <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin: 0 0 30px;">
                ${params.isRemoval 
                  ? 'Seu limite de faturamento voltou ao padrão do seu plano atual.' 
                  : 'Este bônus já está ativo e você pode visualizar seu novo limite na página de Planos do seu painel.'}
              </p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="https://cardapioon.com.br/${params.companySlug}/dashboard/planos" 
                       style="display: inline-block; background: linear-gradient(135deg, #FF6B00 0%, #FF8C00 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">
                      Ver meu plano
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f9fafb; padding: 30px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                Este email foi enviado automaticamente pelo CardpOn Delivery.
              </p>
              <p style="color: #9ca3af; font-size: 12px; margin: 10px 0 0;">
                © ${new Date().getFullYear()} CardpOn Delivery. Todos os direitos reservados.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { companyId, ownerId, bonusAmount, previousBonus, newTotalLimit }: BonusEmailRequest = await req.json();

    console.log("Sending bonus email:", { companyId, bonusAmount, previousBonus });

    if (!companyId || !ownerId) {
      throw new Error("companyId and ownerId are required");
    }

    // Fetch company details
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("name, slug")
      .eq("id", companyId)
      .single();

    if (companyError || !company) {
      console.error("Company error:", companyError);
      throw new Error("Company not found");
    }

    // Fetch user email
    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(ownerId);

    if (userError || !userData?.user?.email) {
      console.error("User error:", userError);
      throw new Error("User not found or email not available");
    }

    const ownerEmail = userData.user.email;
    const ownerName = userData.user.user_metadata?.full_name || userData.user.user_metadata?.name || company.name;

    const bonusFormatted = formatCurrency(bonusAmount);
    const previousBonusFormatted = formatCurrency(previousBonus);
    const totalLimitFormatted = formatCurrency(newTotalLimit);
    
    const isNewBonus = previousBonus === 0 && bonusAmount > 0;
    const isIncrease = bonusAmount > previousBonus;
    const isRemoval = bonusAmount === 0 && previousBonus > 0;

    // Determine email subject and content based on scenario
    let subject: string;
    let headerTitle: string;
    let headerEmoji: string;
    let headerColor: string;
    let bodyMessage: string;
    let templateSlug: string;

    if (isRemoval) {
      templateSlug = "bonus-removed";
      subject = `Atualização do seu limite de faturamento`;
      headerTitle = "Bônus removido";
      headerEmoji = "📋";
      headerColor = "linear-gradient(135deg, #6b7280 0%, #4b5563 100%)";
      bodyMessage = `Informamos que o bônus de limite de faturamento da sua empresa <strong>${company.name}</strong> foi removido.`;
    } else if (isNewBonus) {
      templateSlug = "bonus-received";
      subject = `🎁 Você recebeu um bônus de ${bonusFormatted}!`;
      headerTitle = "Você recebeu um bônus!";
      headerEmoji = "🎁";
      headerColor = "linear-gradient(135deg, #10b981 0%, #059669 100%)";
      bodyMessage = `Temos uma ótima notícia! Sua empresa <strong>${company.name}</strong> recebeu um bônus especial de limite de faturamento.`;
    } else if (isIncrease) {
      templateSlug = "bonus-increased";
      subject = `🎁 Seu bônus foi aumentado para ${bonusFormatted}!`;
      headerTitle = "Seu bônus foi aumentado!";
      headerEmoji = "🎁";
      headerColor = "linear-gradient(135deg, #10b981 0%, #059669 100%)";
      bodyMessage = `O bônus de limite de faturamento da sua empresa <strong>${company.name}</strong> foi aumentado.`;
    } else {
      templateSlug = "bonus-updated";
      subject = `Atualização do seu bônus de limite`;
      headerTitle = "Seu bônus foi ajustado";
      headerEmoji = "📋";
      headerColor = "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)";
      bodyMessage = `O bônus de limite de faturamento da sua empresa <strong>${company.name}</strong> foi ajustado.`;
    }

    // Tentar buscar template do banco
    const template = await getEmailTemplate(templateSlug);
    
    let emailHtml: string;
    let emailSubject: string;

    if (template) {
      const variables = {
        ownerName,
        companyName: company.name,
        companySlug: company.slug,
        bonusAmount: bonusFormatted,
        previousBonus: previousBonusFormatted,
        totalLimit: totalLimitFormatted,
        year: new Date().getFullYear().toString(),
      };
      emailHtml = replaceTemplateVariables(template.html_content, variables);
      emailSubject = replaceSubjectVariables(template.subject, variables);
      console.log(`Using database template: ${templateSlug}`);
    } else {
      emailHtml = getDefaultHtml({
        headerColor,
        headerEmoji,
        headerTitle,
        ownerName,
        bodyMessage,
        previousBonus,
        bonusAmount,
        isRemoval,
        isNewBonus,
        totalLimitFormatted,
        companySlug: company.slug,
      });
      emailSubject = subject;
      console.log("Using default template for bonus email");
    }

    // Envio de email
    const observabilityBase = {
      provider: "resend",
      source: "send-bonus-email",
      companyId,
      userId: ownerId,
    } as const;

    if (!resendApiKey) {
      await safeLogIntegrationEvent({
        ...observabilityBase,
        level: "warn",
        message: "RESEND_API_KEY não configurada — envio de email ignorado",
        details: { companyName: company.name, ownerEmail },
      });
    } else {
      try {
        const resend = new Resend(resendApiKey);

        const emailResponse = await resend.emails.send({
          from: "CardpOn <noreply@cardpondelivery.com>",
          to: [ownerEmail],
          subject: emailSubject,
          html: emailHtml,
        });

        console.log("Email sent successfully:", emailResponse);

        await safeLogIntegrationEvent({
          ...observabilityBase,
          level: "info",
          message: "Email enviado com sucesso",
          details: {
            companyName: company.name,
            ownerEmail,
            emailId: (emailResponse as any)?.id ?? null,
          },
        });
      } catch (err: any) {
        const errorPayload = {
          name: err?.name ?? "Error",
          message: err?.message ?? String(err),
        };

        console.error("Resend error:", errorPayload);

        await safeLogIntegrationEvent({
          ...observabilityBase,
          level: "error",
          message: "Falha ao enviar email via Resend",
          details: {
            companyName: company.name,
            ownerEmail,
            error: errorPayload,
          },
        });

        await notifySuperAdmins({
          title: "Falha no envio de email (Resend)",
          message: `Falha ao enviar email de bônus para ${ownerEmail} (${company.name}).`,
          type: "error",
          data: {
            provider: "resend",
            source: "send-bonus-email",
            companyId,
            ownerId,
            error: errorPayload,
          },
        });
      }
    }

    // Create in-app notification
    const notificationTitle = isRemoval 
      ? "Bônus de limite removido"
      : isNewBonus 
        ? "Bônus de limite recebido!"
        : "Bônus de limite atualizado";

    const notificationMessage = isRemoval
      ? `O bônus de limite da sua empresa foi removido. Seu limite voltou ao padrão do plano (${totalLimitFormatted}).`
      : `Você ${isNewBonus ? 'recebeu' : 'teve seu bônus atualizado para'} ${bonusFormatted}. Seu limite total é ${totalLimitFormatted}.`;

    await supabase.from("notifications").insert({
      user_id: ownerId,
      title: notificationTitle,
      message: notificationMessage,
      type: isRemoval ? "warning" : "success",
      data: {
        type: "revenue_limit_bonus",
        companyId,
        bonusAmount,
        previousBonus,
        newTotalLimit,
      },
    });

    console.log("Notification created successfully");

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in send-bonus-email:", error);

    await safeLogIntegrationEvent({
      provider: "send-bonus-email",
      source: "send-bonus-email",
      level: "error",
      message: "Erro inesperado na edge function send-bonus-email",
      details: {
        name: error?.name ?? "Error",
        message: error?.message ?? String(error),
      },
    });

    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});