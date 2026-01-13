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

interface SuspensionEmailRequest {
  companyId: string;
  ownerId: string;
  reason?: string;
}

// Template padrão caso não exista no banco
const DEFAULT_HTML = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Conta Suspensa</title>
</head>
<body style="margin:0; padding:0; background-color:#f4f4f5; font-family:Arial, Helvetica, sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5; padding:24px 0;">
<tr>
<td align="center">

<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px; background:#ffffff; border-radius:14px; overflow:hidden; box-shadow:0 10px 30px rgba(0,0,0,0.05);">

<!-- Header -->
<tr>
<td style="background:linear-gradient(135deg, #ef4444 0%, #dc2626 100%); padding:40px 30px; text-align:center;">
  <h1 style="margin:0; font-size:28px; color:#ffffff; font-weight:700;">
    ⚠️ Conta Suspensa
  </h1>
</td>
</tr>

<!-- Content -->
<tr>
<td style="padding:40px 30px;">
  <p style="font-size:16px; color:#374151; margin:0 0 20px;">
    Olá <strong>{{ownerName}}</strong>,
  </p>
  
  <p style="font-size:16px; color:#374151; margin:0 0 20px;">
    Informamos que sua empresa <strong>{{companyName}}</strong> foi suspensa no CardpOn.
  </p>

  <div style="background:#fef2f2; border-left:4px solid #ef4444; padding:15px 20px; margin:25px 0; border-radius:0 8px 8px 0;">
    <p style="margin:0; color:#991b1b; font-size:14px;">
      <strong>Motivo:</strong> {{reason}}
    </p>
  </div>

  <p style="font-size:16px; color:#374151; margin:0 0 20px;">
    Enquanto sua conta estiver suspensa:
  </p>

  <ul style="color:#374151; font-size:14px; padding-left:20px; margin:0 0 25px;">
    <li style="margin-bottom:10px;">Seu cardápio online não estará disponível para clientes</li>
    <li style="margin-bottom:10px;">Novos pedidos não poderão ser realizados</li>
    <li style="margin-bottom:10px;">O acesso ao painel administrativo pode estar limitado</li>
  </ul>

  <p style="font-size:16px; color:#374151; margin:0 0 30px;">
    Se você acredita que isso foi um erro ou deseja mais informações, entre em contato conosco respondendo este email ou através do suporte.
  </p>

  <div style="text-align:center;">
    <a href="mailto:suporte@cardpondelivery.com" 
       style="display:inline-block; background:#3b82f6; color:white; text-decoration:none; padding:14px 30px; border-radius:8px; font-weight:600; font-size:16px;">
      Entrar em Contato
    </a>
  </div>
</td>
</tr>

<!-- Footer -->
<tr>
<td style="background:#f9fafb; padding:25px 30px; text-align:center; border-top:1px solid #e5e7eb;">
  <p style="margin:0; color:#6b7280; font-size:14px;">
    Atenciosamente,<br>
    <strong>Equipe CardpOn</strong>
  </p>
  <p style="margin:15px 0 0; color:#9ca3af; font-size:12px;">
    © {{year}} CardpOn. Este email foi enviado automaticamente.
  </p>
</td>
</tr>

</table>
</td>
</tr>
</table>
</body>
</html>`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    const { companyId, ownerId, reason }: SuspensionEmailRequest = await req.json();

    console.log("[SEND-SUSPENSION-EMAIL] Processing:", { companyId, ownerId, reason });

    if (!companyId || !ownerId) {
      return new Response(
        JSON.stringify({ error: "companyId e ownerId são obrigatórios" }),
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
      console.error("[SEND-SUSPENSION-EMAIL] Error fetching company:", companyError);
      return new Response(
        JSON.stringify({ error: "Empresa não encontrada" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Buscar email do owner
    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(ownerId);

    if (userError || !userData?.user?.email) {
      console.error("[SEND-SUSPENSION-EMAIL] Error fetching user:", userError);
      return new Response(
        JSON.stringify({ error: "Email do usuário não encontrado" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ownerEmail = userData.user.email;
    const ownerName = userData.user.user_metadata?.full_name || company.name;
    const reasonText = reason || "Não foram fornecidos detalhes específicos sobre o motivo.";

    // Buscar URL da plataforma
    const platformUrl = await getPlatformUrl();

    // Buscar template do banco
    const template = await getEmailTemplate("company-suspension");

    const variables = {
      ownerName,
      owner_name: ownerName,
      companyName: company.name,
      company_name: company.name,
      companySlug: company.slug,
      company_slug: company.slug,
      reason: reasonText,
      platformUrl,
      platform_url: platformUrl,
      supportEmail: "suporte@cardpondelivery.com",
      support_email: "suporte@cardpondelivery.com",
      year: new Date().getFullYear().toString(),
    };

    let htmlContent: string;
    let subject: string;

    if (template) {
      htmlContent = replaceTemplateVariables(template.html_content, variables);
      subject = replaceSubjectVariables(template.subject, variables);
      console.log("[SEND-SUSPENSION-EMAIL] Using database template");
    } else {
      htmlContent = replaceTemplateVariables(DEFAULT_HTML, variables);
      subject = `⚠️ Sua empresa ${company.name} foi suspensa - CardpOn`;
      console.log("[SEND-SUSPENSION-EMAIL] Using default template");
    }

    console.log("[SEND-SUSPENSION-EMAIL] Sending to:", ownerEmail);

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
    console.log("[SEND-SUSPENSION-EMAIL] Email response:", emailResponse);

    if (!res.ok) {
      throw new Error(emailResponse.message || "Falha ao enviar email");
    }

    return new Response(
      JSON.stringify({ success: true, emailId: emailResponse.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[SEND-SUSPENSION-EMAIL] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
