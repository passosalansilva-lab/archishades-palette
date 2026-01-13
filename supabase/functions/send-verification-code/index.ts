import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getEmailTemplate, replaceTemplateVariables, replaceSubjectVariables } from "../_shared/email-templates.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SendCodeRequest {
  email: string;
}

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Template padrão caso não exista no banco
const DEFAULT_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background-color: #0a0a0a;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <!-- Header with Logo -->
    <div style="background: linear-gradient(135deg, #10B981 0%, #059669 100%); border-radius: 20px 20px 0 0; padding: 40px 32px; text-align: center;">
      <img src="https://uyaymtikndembadyljib.supabase.co/storage/v1/object/public/assets/logo-cardapio-on-new.png" alt="CardpOn" style="height: 60px; margin-bottom: 16px;" />
      <p style="color: rgba(255,255,255,0.9); margin: 0; font-size: 14px; font-weight: 500;">Seu cardápio digital inteligente</p>
    </div>
    
    <!-- Main Content -->
    <div style="background: #18181b; padding: 48px 32px; border-radius: 0 0 20px 20px;">
      <h2 style="color: #ffffff; margin: 0 0 12px 0; font-size: 24px; font-weight: 700; text-align: center;">Confirme seu email</h2>
      <p style="color: #a1a1aa; margin: 0 0 32px 0; font-size: 15px; line-height: 1.7; text-align: center;">
        Use o código abaixo para verificar seu email e completar seu cadastro na plataforma CardpOn.
      </p>
      
      <!-- Code Box -->
      <div style="background: linear-gradient(135deg, #10B981 0%, #059669 100%); border-radius: 16px; padding: 32px; text-align: center; margin-bottom: 32px; box-shadow: 0 8px 32px rgba(16, 185, 129, 0.3);">
        <p style="color: rgba(255,255,255,0.8); margin: 0 0 8px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 2px;">Seu código de verificação</p>
        <span style="font-size: 42px; font-weight: 800; letter-spacing: 12px; color: #ffffff; font-family: 'Courier New', monospace; text-shadow: 0 2px 4px rgba(0,0,0,0.2);">{{code}}</span>
      </div>
      
      <!-- Timer Warning -->
      <div style="background: #27272a; border-radius: 12px; padding: 16px 20px; text-align: center; margin-bottom: 24px;">
        <p style="color: #fbbf24; margin: 0; font-size: 14px; font-weight: 600;">
          ⏱️ Este código expira em 10 minutos
        </p>
      </div>
      
      <p style="color: #71717a; margin: 0; font-size: 13px; text-align: center; line-height: 1.6;">
        Se você não solicitou este código, pode ignorar este email com segurança.
      </p>
    </div>
    
    <!-- Footer -->
    <div style="padding: 24px 20px; text-align: center;">
      <p style="color: #52525b; font-size: 12px; margin: 0 0 8px 0;">
        © {{year}} CardpOn. Todos os direitos reservados.
      </p>
      <p style="color: #3f3f46; font-size: 11px; margin: 0;">
        Este é um email automático, por favor não responda.
      </p>
    </div>
  </div>
</body>
</html>`;

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email: rawEmail }: SendCodeRequest = await req.json();

    if (!rawEmail) {
      return new Response(
        JSON.stringify({ error: "Email é obrigatório" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const email = rawEmail.trim().toLowerCase();
    console.log(`Generating verification code for: ${email}`);

    // Create Supabase client with service role
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Check if email is already registered
    const { data: existingUser } = await supabase.auth.admin.listUsers();
    const userExists = existingUser?.users?.some(u => u.email === email);
    
    if (userExists) {
      return new Response(
        JSON.stringify({ error: "Este email já está cadastrado. Faça login." }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Generate 6-digit code
    const code = generateCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Delete any existing codes for this email
    await supabase
      .from("email_verification_codes")
      .delete()
      .eq("email", email);

    // Insert new code
    const { error: insertError } = await supabase
      .from("email_verification_codes")
      .insert({
        email,
        code,
        expires_at: expiresAt.toISOString(),
        verified: false,
      });

    if (insertError) {
      console.error("Error inserting code:", insertError);
      throw new Error("Erro ao gerar código de verificação");
    }

    // Buscar template do banco de dados
    const template = await getEmailTemplate("email-verification");
    
    const variables = {
      code,
      year: new Date().getFullYear().toString(),
      email,
    };

    let htmlContent: string;
    let subject: string;

    if (template) {
      htmlContent = replaceTemplateVariables(template.html_content, variables);
      subject = replaceSubjectVariables(template.subject, variables);
      console.log("Using database template for email-verification");
    } else {
      htmlContent = replaceTemplateVariables(DEFAULT_HTML, variables);
      subject = "Código de verificação - CardpOn";
      console.log("Using default template for email-verification");
    }

    // Send email via Resend
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "CardpOn <contato@cardpondelivery.com>",
        to: [email],
        subject,
        html: htmlContent,
      }),
    });

    if (!res.ok) {
      const errorData = await res.text();
      console.error("Resend API error:", errorData);
      throw new Error("Erro ao enviar email de verificação");
    }

    console.log(`Verification code sent successfully to: ${email}`);

    return new Response(
      JSON.stringify({ success: true, message: "Código enviado com sucesso" }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in send-verification-code:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erro interno do servidor" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);