import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getEmailTemplate, replaceTemplateVariables, replaceSubjectVariables } from "../_shared/email-templates.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ResetRequest {
  email: string;
}

// Template padrão caso não exista no banco
const DEFAULT_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif; margin: 0; padding: 0; background-color: #f4f4f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 500px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <tr>
            <td style="padding: 40px 40px 30px;">
              <h1 style="margin: 0 0 20px; font-size: 24px; font-weight: 700; color: #18181b; text-align: center;">
                Redefinição de Senha
              </h1>
              <p style="margin: 0 0 30px; font-size: 16px; color: #52525b; text-align: center; line-height: 1.6;">
                Você solicitou a redefinição da sua senha. Use o código abaixo para continuar:
              </p>
              <div style="background: linear-gradient(135deg, #f97316, #ea580c); border-radius: 12px; padding: 30px; text-align: center; margin-bottom: 30px;">
                <span style="font-size: 40px; font-weight: 700; color: #ffffff; letter-spacing: 8px; font-family: 'Courier New', monospace;">
                  {{code}}
                </span>
              </div>
              <p style="margin: 0 0 10px; font-size: 14px; color: #71717a; text-align: center;">
                Este código expira em <strong>15 minutos</strong>.
              </p>
              <p style="margin: 0; font-size: 14px; color: #71717a; text-align: center;">
                Se você não solicitou esta redefinição, ignore este email.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 40px; background-color: #fafafa; border-radius: 0 0 12px 12px; border-top: 1px solid #e4e4e7;">
              <p style="margin: 0; font-size: 12px; color: #a1a1aa; text-align: center;">
                © {{year}} CardápioOn. Todos os direitos reservados.
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
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email }: ResetRequest = await req.json();

    if (!email) {
      return new Response(
        JSON.stringify({ error: "Email é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Check if user exists
    const { data: users, error: userError } = await supabase.auth.admin.listUsers();
    
    if (userError) {
      console.error("Error listing users:", userError);
      return new Response(
        JSON.stringify({ success: true, message: "Se o email existir, enviaremos um código" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const user = users.users.find(u => u.email?.toLowerCase() === email.toLowerCase());
    
    if (!user) {
      return new Response(
        JSON.stringify({ error: "Não encontramos uma conta com este email" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Store the code in password_reset_codes table
    const { error: insertError } = await supabase
      .from("password_reset_codes")
      .upsert({
        email: email.toLowerCase(),
        code,
        expires_at: expiresAt.toISOString(),
        used: false,
      }, {
        onConflict: "email"
      });

    if (insertError) {
      console.error("Error storing reset code:", insertError);
      return new Response(
        JSON.stringify({ error: "Erro ao gerar código" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Send email with code using fetch to Resend API
    if (resendApiKey) {
      // Buscar template do banco de dados
      const template = await getEmailTemplate("password-reset");
      
      const variables = {
        code,
        year: new Date().getFullYear().toString(),
        email: email,
      };

      let htmlContent: string;
      let subject: string;

      if (template) {
        // Usar template do banco
        htmlContent = replaceTemplateVariables(template.html_content, variables);
        subject = replaceSubjectVariables(template.subject, variables);
        console.log("Using database template for password-reset");
      } else {
        // Usar template padrão
        htmlContent = replaceTemplateVariables(DEFAULT_HTML, variables);
        subject = "Código de redefinição de senha";
        console.log("Using default template for password-reset");
      }

      const emailResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "CardPon <contato@cardpondelivery.com>",
          to: [email],
          subject,
          html: htmlContent,
        }),
      });

      if (!emailResponse.ok) {
        console.error("Error sending email:", await emailResponse.text());
      }
    } else {
      console.log("RESEND_API_KEY not configured, code:", code);
    }

    console.log(`Password reset code sent to ${email}`);

    return new Response(
      JSON.stringify({ success: true, message: "Código enviado com sucesso" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in send-password-reset-code:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});