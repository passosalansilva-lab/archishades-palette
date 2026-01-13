import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { getEmailTemplate, replaceTemplateVariables, replaceSubjectVariables } from "../_shared/email-templates.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface DriverWelcomeRequest {
  driverName: string;
  driverEmail: string;
  companyName: string;
  loginUrl: string;
}

// Template padrão
const DEFAULT_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 30px;">
    <h1 style="color: #10B981; margin: 0;">🚀 Bem-vindo(a), {{driverName}}!</h1>
  </div>
  
  <div style="background: #f9fafb; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
    <p style="margin: 0 0 16px 0; font-size: 16px;">
      Você foi cadastrado como entregador em <strong>{{companyName}}</strong>.
    </p>
    <p style="margin: 0 0 16px 0; font-size: 16px;">
      Agora você pode acessar a área do entregador para visualizar e gerenciar suas entregas.
    </p>
  </div>
  
  <div style="text-align: center; margin: 32px 0;">
    <a href="{{loginUrl}}" 
       style="display: inline-block; background: linear-gradient(135deg, #10B981, #059669); color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
      Acessar Área do Entregador
    </a>
  </div>
  
  <div style="background: #fef3c7; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
    <p style="margin: 0; font-size: 14px; color: #92400e;">
      <strong>📱 Como acessar:</strong><br>
      1. Clique no botão acima ou acesse o link<br>
      2. Digite seu email: <strong>{{driverEmail}}</strong><br>
      3. Você receberá um código de 6 dígitos<br>
      4. Digite o código para entrar
    </p>
  </div>
  
  <div style="border-top: 1px solid #e5e7eb; padding-top: 20px; margin-top: 20px;">
    <p style="margin: 0; font-size: 12px; color: #6b7280; text-align: center;">
      Este email foi enviado automaticamente por {{companyName}} através do Cardpon.<br>
      Se você não esperava este email, pode ignorá-lo.
    </p>
  </div>
</body>
</html>`;

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { driverName, driverEmail, companyName, loginUrl }: DriverWelcomeRequest = await req.json();

    console.log(`Sending welcome email to driver: ${driverEmail}`);

    // Buscar template do banco
    const template = await getEmailTemplate("driver-welcome");
    
    const variables = {
      driverName,
      driverEmail,
      companyName,
      loginUrl,
      year: new Date().getFullYear().toString(),
    };

    let htmlContent: string;
    let subject: string;

    if (template) {
      htmlContent = replaceTemplateVariables(template.html_content, variables);
      subject = replaceSubjectVariables(template.subject, variables);
      console.log("Using database template for driver-welcome");
    } else {
      htmlContent = replaceTemplateVariables(DEFAULT_HTML, variables);
      subject = `${companyName} - Você foi cadastrado como entregador!`;
      console.log("Using default template for driver-welcome");
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Cardpon <onboarding@resend.dev>",
        to: [driverEmail],
        subject,
        html: htmlContent,
      }),
    });

    if (!res.ok) {
      const errorData = await res.text();
      console.error("Resend API error:", errorData);
      throw new Error(`Failed to send email: ${errorData}`);
    }

    const data = await res.json();
    console.log("Email sent successfully:", data);

    return new Response(JSON.stringify({ success: true, data }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error sending driver welcome email:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);