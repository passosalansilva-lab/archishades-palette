import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

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

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { companyId, ownerId, bonusAmount, previousBonus, newTotalLimit }: BonusEmailRequest = await req.json();

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
      throw new Error("Company not found");
    }

    // Fetch user email
    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(ownerId);

    if (userError || !userData?.user?.email) {
      throw new Error("User not found or email not available");
    }

    const ownerEmail = userData.user.email;
    const ownerName = userData.user.user_metadata?.name || company.name;

    // Format currency
    const formatCurrency = (value: number) => {
      return new Intl.NumberFormat('pt-BR', { 
        style: 'currency', 
        currency: 'BRL' 
      }).format(value);
    };

    const bonusFormatted = formatCurrency(bonusAmount);
    const previousBonusFormatted = formatCurrency(previousBonus);
    const totalLimitFormatted = formatCurrency(newTotalLimit);
    const isNewBonus = previousBonus === 0;
    const isIncrease = bonusAmount > previousBonus;

    // Send email
    if (!resendApiKey) {
      console.log("RESEND_API_KEY not configured, skipping email");
      return new Response(
        JSON.stringify({ success: true, message: "Email skipped - no API key" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const resend = new Resend(resendApiKey);

    const emailHtml = `
      <!DOCTYPE html>
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
                <!-- Header -->
                <tr>
                  <td style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 40px 30px; text-align: center;">
                    <div style="font-size: 48px; margin-bottom: 10px;">🎁</div>
                    <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700;">
                      ${isNewBonus ? 'Você recebeu um bônus!' : 'Seu bônus foi atualizado!'}
                    </h1>
                  </td>
                </tr>
                
                <!-- Content -->
                <tr>
                  <td style="padding: 40px 30px;">
                    <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                      Olá, <strong>${ownerName}</strong>!
                    </p>
                    
                    <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 30px;">
                      ${isNewBonus 
                        ? `Temos uma ótima notícia! Sua empresa <strong>${company.name}</strong> recebeu um bônus especial de limite de faturamento.`
                        : `O bônus de limite de faturamento da sua empresa <strong>${company.name}</strong> foi ${isIncrease ? 'aumentado' : 'atualizado'}.`
                      }
                    </p>
                    
                    <!-- Bonus Card -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%); border-radius: 12px; margin-bottom: 30px;">
                      <tr>
                        <td style="padding: 30px; text-align: center;">
                          ${!isNewBonus ? `
                            <p style="color: #6b7280; font-size: 14px; margin: 0 0 5px;">Bônus anterior</p>
                            <p style="color: #9ca3af; font-size: 20px; font-weight: 600; margin: 0 0 15px; text-decoration: line-through;">${previousBonusFormatted}</p>
                          ` : ''}
                          <p style="color: #059669; font-size: 14px; margin: 0 0 5px; text-transform: uppercase; letter-spacing: 1px;">
                            ${isNewBonus ? 'Bônus recebido' : 'Novo bônus'}
                          </p>
                          <p style="color: #047857; font-size: 36px; font-weight: 700; margin: 0;">
                            ${bonusFormatted}
                          </p>
                        </td>
                      </tr>
                    </table>
                    
                    <!-- New Limit Info -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9fafb; border-radius: 8px; margin-bottom: 30px;">
                      <tr>
                        <td style="padding: 20px; text-align: center;">
                          <p style="color: #6b7280; font-size: 14px; margin: 0 0 5px;">Seu novo limite total de faturamento</p>
                          <p style="color: #111827; font-size: 24px; font-weight: 700; margin: 0;">${totalLimitFormatted}</p>
                        </td>
                      </tr>
                    </table>
                    
                    <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin: 0 0 30px;">
                      Este bônus já está ativo e você pode visualizar seu novo limite na página de Planos do seu painel administrativo.
                    </p>
                    
                    <!-- CTA Button -->
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="center">
                          <a href="https://cardapioon.com.br/${company.slug}/dashboard/planos" 
                             style="display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">
                            Ver meu plano
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                
                <!-- Footer -->
                <tr>
                  <td style="background-color: #f9fafb; padding: 30px; text-align: center; border-top: 1px solid #e5e7eb;">
                    <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                      Este email foi enviado automaticamente pelo CardapiON.
                    </p>
                    <p style="color: #9ca3af; font-size: 12px; margin: 10px 0 0;">
                      © ${new Date().getFullYear()} CardapiON. Todos os direitos reservados.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;

    const emailResponse = await resend.emails.send({
      from: "CardapiON <noreply@cardpondelivery.com>",
      to: [ownerEmail],
      subject: isNewBonus 
        ? `🎁 Você recebeu um bônus de ${bonusFormatted}!` 
        : `🎁 Seu bônus foi atualizado para ${bonusFormatted}!`,
      html: emailHtml,
    });

    console.log("Bonus email sent successfully:", emailResponse);

    // Create in-app notification
    await supabase.from("notifications").insert({
      company_id: companyId,
      title: isNewBonus ? "Bônus de limite recebido!" : "Bônus de limite atualizado!",
      message: `Você ${isNewBonus ? 'recebeu' : 'teve seu bônus atualizado para'} ${bonusFormatted} de limite extra. Seu novo limite total é ${totalLimitFormatted}.`,
      type: "success",
      read: false,
    });

    return new Response(
      JSON.stringify({ success: true, emailId: (emailResponse as any).id || "sent" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error sending bonus email:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
