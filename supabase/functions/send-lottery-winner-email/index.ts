import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getEmailTemplate, replaceTemplateVariables, replaceSubjectVariables } from "../_shared/email-templates.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface LotteryWinnerEmailRequest {
  winner_name: string;
  winner_email: string;
  winner_phone: string;
  prize_description: string;
  company_name: string;
  company_id: string;
  draw_id: string;
}

async function logIntegrationEvent(
  supabase: any,
  provider: string,
  level: 'info' | 'warn' | 'error',
  message: string,
  metadata: Record<string, any> = {}
) {
  try {
    await supabase.from('integration_events').insert({
      provider,
      level,
      message,
      metadata,
    });
  } catch (e) {
    console.error('Failed to log integration event:', e);
  }
}

async function notifySuperAdmins(supabase: any, title: string, message: string) {
  try {
    const { data: superAdmins } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'super_admin');

    if (superAdmins && superAdmins.length > 0) {
      const notifications = superAdmins.map((admin: { id: string }) => ({
        user_id: admin.id,
        title,
        message,
        type: 'system',
      }));
      await supabase.from('notifications').insert(notifications);
    }
  } catch (e) {
    console.error('Failed to notify super admins:', e);
  }
}

// Template padrão
const DEFAULT_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); border-radius: 16px 16px 0 0; padding: 40px 30px; text-align: center;">
      <div style="font-size: 60px; margin-bottom: 16px;">🏆</div>
      <h1 style="color: white; margin: 0; font-size: 28px; font-weight: bold;">
        Parabéns, {{winnerName}}!
      </h1>
      <p style="color: rgba(255,255,255,0.9); margin: 12px 0 0 0; font-size: 18px;">
        Você foi o grande vencedor do sorteio!
      </p>
    </div>
    
    <div style="background: white; padding: 40px 30px; border-radius: 0 0 16px 16px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
      <div style="text-align: center; margin-bottom: 30px;">
        <p style="color: #64748b; margin: 0 0 8px 0; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">
          Seu prêmio
        </p>
        <div style="background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border: 2px solid #f59e0b; border-radius: 12px; padding: 24px; margin-top: 12px;">
          <p style="color: #92400e; margin: 0; font-size: 24px; font-weight: bold;">
            🎁 {{prizeDescription}}
          </p>
        </div>
      </div>

      <div style="background: #f1f5f9; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
        <p style="color: #475569; margin: 0; font-size: 15px; line-height: 1.6;">
          Para resgatar seu prêmio, entre em contato com <strong>{{companyName}}</strong> informando seu telefone cadastrado: <strong>{{winnerPhone}}</strong>
        </p>
      </div>

      <div style="text-align: center; padding-top: 20px; border-top: 1px solid #e2e8f0;">
        <p style="color: #94a3b8; margin: 0; font-size: 13px;">
          Este é um e-mail automático enviado por {{companyName}}
        </p>
      </div>
    </div>
  </div>
</body>
</html>`;

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const {
      winner_name,
      winner_email,
      winner_phone,
      prize_description,
      company_name,
      company_id,
      draw_id,
    }: LotteryWinnerEmailRequest = await req.json();

    if (!winner_email || !winner_name || !prize_description) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    if (!resendApiKey) {
      await logIntegrationEvent(supabase, 'resend', 'error', 
        'RESEND_API_KEY não configurada - e-mail de ganhador do sorteio não enviado',
        { winner_name, winner_email, company_id, draw_id }
      );
      await notifySuperAdmins(supabase,
        '⚠️ Resend não configurado',
        `Não foi possível enviar e-mail para ganhador do sorteio: ${winner_name}. Configure a RESEND_API_KEY.`
      );
      return new Response(
        JSON.stringify({ error: "Email service not configured", sent: false }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Buscar template do banco
    const template = await getEmailTemplate("lottery-winner");
    
    const variables = {
      winnerName: winner_name,
      winnerEmail: winner_email,
      winnerPhone: winner_phone,
      prizeDescription: prize_description,
      companyName: company_name,
      year: new Date().getFullYear().toString(),
    };

    let emailHtml: string;
    let subject: string;

    if (template) {
      emailHtml = replaceTemplateVariables(template.html_content, variables);
      subject = replaceSubjectVariables(template.subject, variables);
      console.log("Using database template for lottery-winner");
    } else {
      emailHtml = replaceTemplateVariables(DEFAULT_HTML, variables);
      subject = `🏆 Parabéns! Você ganhou o sorteio de ${company_name}!`;
      console.log("Using default template for lottery-winner");
    }

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${company_name} <noreply@cardpondelivery.com>`,
        to: [winner_email],
        subject,
        html: emailHtml,
      }),
    });

    const resendResult = await resendResponse.json();

    if (!resendResponse.ok) {
      throw new Error(resendResult.message || "Failed to send email");
    }

    console.log("Lottery winner email sent:", resendResult);

    await logIntegrationEvent(supabase, 'resend', 'info',
      `E-mail de ganhador do sorteio enviado para ${winner_email}`,
      { winner_name, winner_email, company_id, draw_id, resend_id: resendResult.id }
    );

    return new Response(
      JSON.stringify({ success: true, sent: true, id: resendResult.id }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error: any) {
    console.error("Error sending lottery winner email:", error);

    await logIntegrationEvent(supabase, 'resend', 'error',
      `Falha ao enviar e-mail de ganhador do sorteio: ${error.message}`,
      { error: error.message }
    );

    await notifySuperAdmins(supabase,
      '❌ Erro ao enviar e-mail do sorteio',
      `Falha ao enviar e-mail para ganhador: ${error.message}`
    );

    return new Response(
      JSON.stringify({ error: error.message, sent: false }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);