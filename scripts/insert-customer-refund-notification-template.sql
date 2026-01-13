-- Insert customer-refund-notification email template
-- Run this in your Supabase SQL Editor

INSERT INTO public.email_templates (
  slug,
  name,
  subject,
  html_content,
  variables,
  is_active
) VALUES (
  'customer-refund-notification',
  'Notificação de Estorno ao Cliente',
  'Estorno processado - Pedido {{orderCode}}',
  '<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Estorno Processado</title>
</head>
<body style="margin: 0; padding: 0; font-family: ''Segoe UI'', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table role="presentation" style="width: 600px; max-width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; background: linear-gradient(135deg, #10b981 0%, #059669 100%); border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">✓ Estorno Processado</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 30px 40px;">
              <p style="margin: 0 0 20px; color: #333333; font-size: 16px; line-height: 1.6;">
                Olá <strong>{{customerName}}</strong>,
              </p>
              <p style="margin: 0 0 20px; color: #333333; font-size: 16px; line-height: 1.6;">
                O estorno do seu pedido foi processado com sucesso via <strong>{{paymentProvider}}</strong>. Confira os detalhes abaixo:
              </p>
              <table style="width: 100%; border-collapse: collapse; margin: 20px 0; background-color: #f9fafb; border-radius: 6px;">
                <tr>
                  <td style="padding: 15px 20px; border-bottom: 1px solid #e5e7eb;">
                    <span style="color: #6b7280; font-size: 14px;">Loja</span><br>
                    <strong style="color: #333333; font-size: 16px;">{{storeName}}</strong>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 15px 20px; border-bottom: 1px solid #e5e7eb;">
                    <span style="color: #6b7280; font-size: 14px;">Código do Pedido</span><br>
                    <strong style="color: #333333; font-size: 16px;">{{orderCode}}</strong>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 15px 20px; border-bottom: 1px solid #e5e7eb;">
                    <span style="color: #6b7280; font-size: 14px;">Valor Estornado</span><br>
                    <strong style="color: #10b981; font-size: 20px;">{{refundAmount}}</strong>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 15px 20px; border-bottom: 1px solid #e5e7eb;">
                    <span style="color: #6b7280; font-size: 14px;">Meio de Pagamento</span><br>
                    <strong style="color: #333333; font-size: 16px;">{{paymentProvider}}</strong>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 15px 20px;">
                    <span style="color: #6b7280; font-size: 14px;">Data do Estorno</span><br>
                    <strong style="color: #333333; font-size: 16px;">{{refundDate}}</strong>
                  </td>
                </tr>
              </table>
              <p style="margin: 20px 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                O valor será creditado na sua conta de acordo com o prazo do seu método de pagamento (geralmente em até 7 dias úteis para cartão de crédito ou imediatamente para PIX).
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 40px 40px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                Este é um e-mail automático enviado por {{storeName}}.
              </p>
              <p style="margin: 10px 0 0; color: #9ca3af; font-size: 12px;">
                <a href="{{platformUrl}}" style="color: #f97316; text-decoration: none;">{{platformUrl}}</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>',
  '[
    {"name": "customerName", "description": "Nome do cliente", "example": "João Silva"},
    {"name": "storeName", "description": "Nome da loja", "example": "Pizzaria do João"},
    {"name": "orderCode", "description": "Código do pedido", "example": "ABC123"},
    {"name": "refundAmount", "description": "Valor do estorno formatado", "example": "R$ 45,90"},
    {"name": "refundDate", "description": "Data e hora do estorno", "example": "13/01/2026, 14:30"},
    {"name": "paymentProvider", "description": "Provedor de pagamento", "example": "Mercado Pago"},
    {"name": "platformUrl", "description": "URL da plataforma", "example": "https://www.cardpondelivery.com"}
  ]'::jsonb,
  true
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  subject = EXCLUDED.subject,
  html_content = EXCLUDED.html_content,
  variables = EXCLUDED.variables,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();