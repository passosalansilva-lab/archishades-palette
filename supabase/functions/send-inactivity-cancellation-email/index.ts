import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { getEmailTemplate, replaceTemplateVariables, replaceSubjectVariables, getPlatformUrl } from "../_shared/email-templates.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface InactivityEmailRequest {
  companyName: string;
  ownerEmail: string;
  ownerName?: string;
}

// Template padrão caso não exista no banco
const DEFAULT_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background-color: #f4f4f5;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); border-radius: 16px 16px 0 0; padding: 40px 30px; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 28px;">Empresa Cancelada</h1>
      <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0; font-size: 16px;">Por inatividade</p>
    </div>
    
    <div style="background: white; padding: 40px 30px; border-radius: 0 0 16px 16px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
      <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
        Olá{{#ownerName}} <strong>{{ownerName}}</strong>{{/ownerName}},
      </p>
      
      <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
        Infelizmente, precisamos informar que sua empresa <strong style="color: #ef4444;">{{companyName}}</strong> foi cancelada automaticamente por inatividade.
      </p>
      
      <div style="background: #fef2f2; border-left: 4px solid #ef4444; padding: 20px; margin: 25px 0; border-radius: 0 8px 8px 0;">
        <h3 style="color: #991b1b; margin: 0 0 10px; font-size: 16px;">📋 Motivo do cancelamento:</h3>
        <p style="color: #374151; margin: 0; line-height: 1.6;">
          Após 15 dias da aprovação, não identificamos nenhuma configuração da loja ou pedidos realizados. 
          Por isso, o cadastro foi cancelado automaticamente.
        </p>
      </div>
      
      <div style="background: #f0f9ff; border-left: 4px solid #0284c7; padding: 20px; margin: 25px 0; border-radius: 0 8px 8px 0;">
        <h3 style="color: #0369a1; margin: 0 0 10px; font-size: 16px;">💡 Quer tentar novamente?</h3>
        <p style="color: #374151; margin: 0; line-height: 1.6;">
          Você pode se cadastrar novamente a qualquer momento! Dessa vez, configure sua loja e comece a receber pedidos para aproveitar todos os benefícios do CardpOn.
        </p>
      </div>
      
      <div style="text-align: center; margin: 30px 0;">
        <a href="{{registerUrl}}" style="display: inline-block; background: linear-gradient(135deg, #FF6B00 0%, #FF8C00 100%); color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">
          Cadastrar Novamente
        </a>
      </div>
      
      <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin: 20px 0 0; text-align: center;">
        Ficou com dúvidas? Entre em contato com nosso suporte!
      </p>
    </div>
    
    <div style="text-align: center; padding: 30px 20px;">
      <p style="color: #9ca3af; font-size: 12px; margin: 0;">
        © {{year}} CardpOn. Todos os direitos reservados.
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
    const { companyName, ownerEmail, ownerName }: InactivityEmailRequest = await req.json();

    if (!companyName || !ownerEmail) {
      return new Response(
        JSON.stringify({ error: "companyName e ownerEmail são obrigatórios" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log(`Sending inactivity cancellation email to ${ownerEmail} for company ${companyName}`);

    // Buscar URL da plataforma
    const platformUrl = await getPlatformUrl();
    const registerUrl = `${platformUrl}/auth`;

    // Buscar template do banco
    const template = await getEmailTemplate("inactivity-cancellation");

    const variables = {
      companyName,
      company_name: companyName,
      ownerName: ownerName || "",
      owner_name: ownerName || "",
      ownerEmail,
      owner_email: ownerEmail,
      registerUrl,
      register_url: registerUrl,
      platformUrl,
      platform_url: platformUrl,
      year: new Date().getFullYear().toString(),
    };

    let htmlContent: string;
    let subject: string;

    if (template) {
      htmlContent = replaceTemplateVariables(template.html_content, variables);
      subject = replaceSubjectVariables(template.subject, variables);
      console.log("Using database template for inactivity-cancellation");
    } else {
      // Processar template padrão (simplificado sem mustache)
      let defaultHtml = DEFAULT_HTML;
      if (ownerName) {
        defaultHtml = defaultHtml.replace('{{#ownerName}} <strong>{{ownerName}}</strong>{{/ownerName}}', ` <strong>${ownerName}</strong>`);
      } else {
        defaultHtml = defaultHtml.replace('{{#ownerName}} <strong>{{ownerName}}</strong>{{/ownerName}}', '');
      }
      htmlContent = replaceTemplateVariables(defaultHtml, variables);
      subject = `Sua empresa ${companyName} foi cancelada por inatividade`;
      console.log("Using default template for inactivity-cancellation");
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "CardpOn <contato@cardpondelivery.com>",
        to: [ownerEmail],
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
    console.log("Inactivity cancellation email sent successfully:", data);

    return new Response(
      JSON.stringify({ success: true, data }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error sending inactivity email:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
