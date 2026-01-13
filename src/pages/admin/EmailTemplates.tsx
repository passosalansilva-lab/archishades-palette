import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { 
  Loader2, Mail, Save, Eye, Code, X, Plus, Trash2, 
  ChevronDown, ChevronUp, Copy, RotateCcw, Search
} from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface EmailVariable {
  key: string;
  description: string;
  example: string;
}

interface EmailTemplate {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  subject: string;
  html_content: string;
  variables: EmailVariable[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Default templates that can be restored
const DEFAULT_TEMPLATES: Partial<EmailTemplate>[] = [
  {
    slug: "password-reset",
    name: "Redefinição de Senha",
    description: "Email enviado quando o usuário solicita redefinição de senha",
    subject: "Código de redefinição de senha",
    variables: [
      { key: "{{code}}", description: "Código de 6 dígitos", example: "123456" },
      { key: "{{year}}", description: "Ano atual", example: "2025" },
    ],
    html_content: `<!DOCTYPE html>
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
</html>`,
  },
  {
    slug: "driver-welcome",
    name: "Boas-vindas ao Motorista",
    description: "Email enviado quando um novo motorista é cadastrado",
    subject: "Bem-vindo à equipe de entregadores!",
    variables: [
      { key: "{{driver_name}}", description: "Nome do motorista", example: "João Silva" },
      { key: "{{company_name}}", description: "Nome da empresa", example: "Pizzaria do Zé" },
      { key: "{{login_url}}", description: "URL de login do motorista", example: "https://app.com/driver/login" },
    ],
    html_content: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f4f4f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 500px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <tr>
            <td style="padding: 40px;">
              <h1 style="margin: 0 0 20px; font-size: 24px; font-weight: 700; color: #18181b; text-align: center;">
                🎉 Bem-vindo à Equipe!
              </h1>
              <p style="margin: 0 0 20px; font-size: 16px; color: #52525b; text-align: center; line-height: 1.6;">
                Olá <strong>{{driver_name}}</strong>, você foi cadastrado como entregador da <strong>{{company_name}}</strong>.
              </p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="{{login_url}}" style="display: inline-block; background: linear-gradient(135deg, #f97316, #ea580c); color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600;">
                  Acessar Painel
                </a>
              </div>
              <p style="margin: 0; font-size: 14px; color: #71717a; text-align: center;">
                Use seu email para fazer login.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
  },
  {
    slug: "company-approval",
    name: "Empresa Aprovada",
    description: "Email enviado quando uma empresa é aprovada no sistema",
    subject: "🎉 Sua empresa foi aprovada!",
    variables: [
      { key: "{{company_name}}", description: "Nome da empresa", example: "Pizzaria do Zé" },
      { key: "{{owner_name}}", description: "Nome do proprietário", example: "José da Silva" },
      { key: "{{dashboard_url}}", description: "URL do dashboard", example: "https://app.com/dashboard" },
    ],
    html_content: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f4f4f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 500px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <tr>
            <td style="padding: 40px;">
              <h1 style="margin: 0 0 20px; font-size: 28px; font-weight: 700; color: #16a34a; text-align: center;">
                ✅ Aprovado!
              </h1>
              <p style="margin: 0 0 20px; font-size: 16px; color: #52525b; text-align: center; line-height: 1.6;">
                Olá <strong>{{owner_name}}</strong>, sua empresa <strong>{{company_name}}</strong> foi aprovada e está pronta para receber pedidos!
              </p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="{{dashboard_url}}" style="display: inline-block; background: linear-gradient(135deg, #16a34a, #15803d); color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600;">
                  Acessar Dashboard
                </a>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
  },
  {
    slug: "company-suspension",
    name: "Empresa Suspensa",
    description: "Email enviado quando uma empresa é suspensa",
    subject: "⚠️ Sua empresa foi suspensa",
    variables: [
      { key: "{{company_name}}", description: "Nome da empresa", example: "Pizzaria do Zé" },
      { key: "{{reason}}", description: "Motivo da suspensão", example: "Inatividade por mais de 30 dias" },
      { key: "{{support_email}}", description: "Email de suporte", example: "suporte@cardapioon.com" },
    ],
    html_content: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f4f4f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 500px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <tr>
            <td style="padding: 40px;">
              <h1 style="margin: 0 0 20px; font-size: 24px; font-weight: 700; color: #dc2626; text-align: center;">
                ⚠️ Conta Suspensa
              </h1>
              <p style="margin: 0 0 20px; font-size: 16px; color: #52525b; text-align: center; line-height: 1.6;">
                Sua empresa <strong>{{company_name}}</strong> foi suspensa.
              </p>
              <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
                <p style="margin: 0; font-size: 14px; color: #991b1b;"><strong>Motivo:</strong> {{reason}}</p>
              </div>
              <p style="margin: 0; font-size: 14px; color: #71717a; text-align: center;">
                Para reativar sua conta, entre em contato: <a href="mailto:{{support_email}}" style="color: #f97316;">{{support_email}}</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
  },
  {
    slug: "inactivity-cancellation",
    name: "Cancelamento por Inatividade",
    description: "Email enviado quando uma empresa é cancelada por inatividade",
    subject: "Sua conta foi cancelada por inatividade",
    variables: [
      { key: "{{company_name}}", description: "Nome da empresa", example: "Pizzaria do Zé" },
      { key: "{{owner_name}}", description: "Nome do proprietário", example: "José" },
      { key: "{{inactivity_days}}", description: "Dias de inatividade", example: "30" },
    ],
    html_content: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f4f4f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 500px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <tr>
            <td style="padding: 40px;">
              <h1 style="margin: 0 0 20px; font-size: 24px; font-weight: 700; color: #71717a; text-align: center;">
                Conta Cancelada
              </h1>
              <p style="margin: 0 0 20px; font-size: 16px; color: #52525b; text-align: center; line-height: 1.6;">
                Olá {{owner_name}}, sua empresa <strong>{{company_name}}</strong> foi cancelada após <strong>{{inactivity_days}} dias</strong> de inatividade.
              </p>
              <p style="margin: 0; font-size: 14px; color: #71717a; text-align: center;">
                Se você deseja reativar sua conta, entre em contato com nosso suporte.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
  },
  {
    slug: "driver-otp",
    name: "OTP do Motorista",
    description: "Código de acesso para login do motorista",
    subject: "Seu código de acesso",
    variables: [
      { key: "{{otp_code}}", description: "Código OTP", example: "123456" },
    ],
    html_content: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f4f4f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 500px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <tr>
            <td style="padding: 40px;">
              <h1 style="margin: 0 0 20px; font-size: 24px; font-weight: 700; color: #18181b; text-align: center;">
                Código de Acesso
              </h1>
              <p style="margin: 0 0 30px; font-size: 16px; color: #52525b; text-align: center; line-height: 1.6;">
                Use o código abaixo para acessar sua conta:
              </p>
              <div style="background: linear-gradient(135deg, #3b82f6, #2563eb); border-radius: 12px; padding: 30px; text-align: center; margin-bottom: 30px;">
                <span style="font-size: 40px; font-weight: 700; color: #ffffff; letter-spacing: 8px; font-family: 'Courier New', monospace;">
                  {{otp_code}}
                </span>
              </div>
              <p style="margin: 0; font-size: 14px; color: #71717a; text-align: center;">
                Este código expira em 10 minutos.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
  },
  {
    slug: "subscription-payment-alert",
    name: "Alerta de Pagamento de Assinatura",
    description: "Alertas relacionados a pagamentos de assinatura",
    subject: "Alerta sobre sua assinatura",
    variables: [
      { key: "{{company_name}}", description: "Nome da empresa", example: "Pizzaria do Zé" },
      { key: "{{plan_name}}", description: "Nome do plano", example: "Profissional" },
      { key: "{{alert_type}}", description: "Tipo de alerta", example: "payment_failed" },
      { key: "{{amount}}", description: "Valor", example: "R$ 99,90" },
      { key: "{{grace_period_days}}", description: "Dias de carência", example: "7" },
    ],
    html_content: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f4f4f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 500px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <tr>
            <td style="padding: 40px;">
              <h1 style="margin: 0 0 20px; font-size: 24px; font-weight: 700; color: #f59e0b; text-align: center;">
                ⚠️ Atenção com sua Assinatura
              </h1>
              <p style="margin: 0 0 20px; font-size: 16px; color: #52525b; text-align: center; line-height: 1.6;">
                Houve um problema com o pagamento do plano <strong>{{plan_name}}</strong> da empresa <strong>{{company_name}}</strong>.
              </p>
              <div style="background-color: #fef3c7; border: 1px solid #fcd34d; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
                <p style="margin: 0; font-size: 14px; color: #92400e;">
                  Valor: <strong>{{amount}}</strong><br>
                  Período de carência: <strong>{{grace_period_days}} dias</strong>
                </p>
              </div>
              <p style="margin: 0; font-size: 14px; color: #71717a; text-align: center;">
                Por favor, atualize suas informações de pagamento para evitar a suspensão do serviço.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
  },
  {
    slug: "lottery-winner",
    name: "Ganhador do Sorteio",
    description: "Email enviado ao ganhador de um sorteio",
    subject: "🎉 Parabéns! Você ganhou o sorteio!",
    variables: [
      { key: "{{winner_name}}", description: "Nome do ganhador", example: "Maria Santos" },
      { key: "{{prize_name}}", description: "Nome do prêmio", example: "Pizza Família Grátis" },
      { key: "{{company_name}}", description: "Nome da empresa", example: "Pizzaria do Zé" },
      { key: "{{claim_instructions}}", description: "Instruções para retirar", example: "Apresente este email na loja" },
    ],
    html_content: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f4f4f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 500px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <tr>
            <td style="padding: 40px;">
              <h1 style="margin: 0 0 20px; font-size: 32px; font-weight: 700; color: #16a34a; text-align: center;">
                🎉 Você Ganhou!
              </h1>
              <p style="margin: 0 0 20px; font-size: 16px; color: #52525b; text-align: center; line-height: 1.6;">
                Parabéns <strong>{{winner_name}}</strong>!<br>
                Você foi sorteado e ganhou:
              </p>
              <div style="background: linear-gradient(135deg, #fbbf24, #f59e0b); border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 20px;">
                <span style="font-size: 24px; font-weight: 700; color: #ffffff;">
                  {{prize_name}}
                </span>
              </div>
              <p style="margin: 0 0 10px; font-size: 14px; color: #52525b; text-align: center;">
                Sorteio realizado por <strong>{{company_name}}</strong>
              </p>
              <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin-top: 20px;">
                <p style="margin: 0; font-size: 14px; color: #166534;"><strong>Como retirar:</strong><br>{{claim_instructions}}</p>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
  },
  {
    slug: "bonus-email",
    name: "Email de Bônus/Crédito",
    description: "Email enviado quando o cliente recebe créditos/bônus",
    subject: "🎁 Você recebeu um bônus!",
    variables: [
      { key: "{{customer_name}}", description: "Nome do cliente", example: "João" },
      { key: "{{bonus_amount}}", description: "Valor do bônus", example: "R$ 10,00" },
      { key: "{{company_name}}", description: "Nome da empresa", example: "Pizzaria do Zé" },
      { key: "{{expiration_date}}", description: "Data de expiração", example: "31/12/2025" },
    ],
    html_content: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f4f4f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 500px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <tr>
            <td style="padding: 40px;">
              <h1 style="margin: 0 0 20px; font-size: 28px; font-weight: 700; color: #7c3aed; text-align: center;">
                🎁 Bônus Especial!
              </h1>
              <p style="margin: 0 0 20px; font-size: 16px; color: #52525b; text-align: center; line-height: 1.6;">
                Olá <strong>{{customer_name}}</strong>!<br>
                Você recebeu um bônus de <strong>{{company_name}}</strong>:
              </p>
              <div style="background: linear-gradient(135deg, #8b5cf6, #7c3aed); border-radius: 12px; padding: 25px; text-align: center; margin-bottom: 20px;">
                <span style="font-size: 32px; font-weight: 700; color: #ffffff;">
                  {{bonus_amount}}
                </span>
              </div>
              <p style="margin: 0; font-size: 14px; color: #71717a; text-align: center;">
                Válido até: <strong>{{expiration_date}}</strong>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
  },
  {
    slug: "email-verification",
    name: "Verificação de Email (Cadastro)",
    description: "Código de verificação enviado durante o cadastro de nova conta",
    subject: "Código de verificação - CardpOn",
    variables: [
      { key: "{{code}}", description: "Código de verificação", example: "123456" },
      { key: "{{year}}", description: "Ano atual", example: "2025" },
      { key: "{{email}}", description: "Email do usuário", example: "usuario@email.com" },
    ],
    html_content: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background-color: #0a0a0a;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: linear-gradient(135deg, #10B981 0%, #059669 100%); border-radius: 20px 20px 0 0; padding: 40px 32px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700;">CardpOn</h1>
      <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 14px;">Seu cardápio digital inteligente</p>
    </div>
    <div style="background: #18181b; padding: 48px 32px; border-radius: 0 0 20px 20px;">
      <h2 style="color: #ffffff; margin: 0 0 12px 0; font-size: 24px; font-weight: 700; text-align: center;">Confirme seu email</h2>
      <p style="color: #a1a1aa; margin: 0 0 32px 0; font-size: 15px; line-height: 1.7; text-align: center;">
        Use o código abaixo para verificar seu email e completar seu cadastro.
      </p>
      <div style="background: linear-gradient(135deg, #10B981 0%, #059669 100%); border-radius: 16px; padding: 32px; text-align: center; margin-bottom: 32px;">
        <p style="color: rgba(255,255,255,0.8); margin: 0 0 8px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 2px;">Seu código</p>
        <span style="font-size: 42px; font-weight: 800; letter-spacing: 12px; color: #ffffff; font-family: 'Courier New', monospace;">{{code}}</span>
      </div>
      <div style="background: #27272a; border-radius: 12px; padding: 16px 20px; text-align: center; margin-bottom: 24px;">
        <p style="color: #fbbf24; margin: 0; font-size: 14px; font-weight: 600;">⏱️ Este código expira em 10 minutos</p>
      </div>
      <p style="color: #71717a; margin: 0; font-size: 13px; text-align: center;">Se você não solicitou este código, ignore este email.</p>
    </div>
    <div style="padding: 24px 20px; text-align: center;">
      <p style="color: #52525b; font-size: 12px; margin: 0;">© {{year}} CardpOn. Todos os direitos reservados.</p>
    </div>
  </div>
</body>
</html>`,
  },
  {
    slug: "verification-code",
    name: "Código de Verificação (Genérico)",
    description: "Código de verificação para email/telefone",
    subject: "Seu código de verificação",
    variables: [
      { key: "{{code}}", description: "Código de verificação", example: "123456" },
      { key: "{{expiration_minutes}}", description: "Minutos até expirar", example: "10" },
    ],
    html_content: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f4f4f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 500px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <tr>
            <td style="padding: 40px;">
              <h1 style="margin: 0 0 20px; font-size: 24px; font-weight: 700; color: #18181b; text-align: center;">
                Verificação de Email
              </h1>
              <p style="margin: 0 0 30px; font-size: 16px; color: #52525b; text-align: center; line-height: 1.6;">
                Use o código abaixo para verificar seu email:
              </p>
              <div style="background: linear-gradient(135deg, #06b6d4, #0891b2); border-radius: 12px; padding: 30px; text-align: center; margin-bottom: 30px;">
                <span style="font-size: 40px; font-weight: 700; color: #ffffff; letter-spacing: 8px; font-family: 'Courier New', monospace;">
                  {{code}}
                </span>
              </div>
              <p style="margin: 0; font-size: 14px; color: #71717a; text-align: center;">
                Este código expira em <strong>{{expiration_minutes}} minutos</strong>.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
  },
  {
    slug: "refund-approved",
    name: "Estorno Aprovado",
    description: "Email enviado ao lojista quando seu estorno é aprovado",
    subject: "✅ Estorno aprovado e processado",
    variables: [
      { key: "{{company_name}}", description: "Nome da empresa", example: "Pizzaria do Zé" },
      { key: "{{amount}}", description: "Valor do estorno", example: "R$ 50,00" },
      { key: "{{customer_name}}", description: "Nome do cliente", example: "Maria Santos" },
      { key: "{{dashboard_url}}", description: "URL do dashboard", example: "https://cardpondelivery.com/dashboard" },
    ],
    html_content: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f4f4f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 500px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <tr>
            <td style="padding: 40px;">
              <h1 style="margin: 0 0 20px; font-size: 24px; font-weight: 700; color: #16a34a; text-align: center;">
                ✅ Estorno Processado
              </h1>
              <p style="margin: 0 0 20px; font-size: 16px; color: #52525b; text-align: center; line-height: 1.6;">
                Sua solicitação de estorno foi aprovada e processada com sucesso.
              </p>
              <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
                <p style="margin: 0 0 8px 0; font-size: 14px; color: #166534;"><strong>Valor:</strong> {{amount}}</p>
                <p style="margin: 0; font-size: 14px; color: #166534;"><strong>Cliente:</strong> {{customer_name}}</p>
              </div>
              <div style="text-align: center; margin: 30px 0;">
                <a href="{{dashboard_url}}/transactions" style="display: inline-block; background: linear-gradient(135deg, #16a34a, #15803d); color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600;">
                  Ver Transações
                </a>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
  },
  {
    slug: "refund-rejected",
    name: "Estorno Rejeitado",
    description: "Email enviado ao lojista quando seu estorno é rejeitado",
    subject: "❌ Solicitação de estorno rejeitada",
    variables: [
      { key: "{{company_name}}", description: "Nome da empresa", example: "Pizzaria do Zé" },
      { key: "{{amount}}", description: "Valor solicitado", example: "R$ 50,00" },
      { key: "{{customer_name}}", description: "Nome do cliente", example: "Maria Santos" },
      { key: "{{rejection_reason}}", description: "Motivo da rejeição", example: "Pagamento já foi estornado anteriormente" },
    ],
    html_content: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f4f4f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 500px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <tr>
            <td style="padding: 40px;">
              <h1 style="margin: 0 0 20px; font-size: 24px; font-weight: 700; color: #dc2626; text-align: center;">
                ❌ Estorno Rejeitado
              </h1>
              <p style="margin: 0 0 20px; font-size: 16px; color: #52525b; text-align: center; line-height: 1.6;">
                Sua solicitação de estorno foi analisada e não pôde ser aprovada.
              </p>
              <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
                <p style="margin: 0 0 8px 0; font-size: 14px; color: #991b1b;"><strong>Valor:</strong> {{amount}}</p>
                <p style="margin: 0 0 8px 0; font-size: 14px; color: #991b1b;"><strong>Cliente:</strong> {{customer_name}}</p>
                <p style="margin: 0; font-size: 14px; color: #991b1b;"><strong>Motivo:</strong> {{rejection_reason}}</p>
              </div>
              <p style="margin: 0; font-size: 14px; color: #71717a; text-align: center;">
                Se você tiver dúvidas, entre em contato com o suporte.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
  },
  {
    slug: "subscription-payment-failed",
    name: "Falha no Pagamento da Assinatura",
    description: "Email enviado quando o pagamento da assinatura falha",
    subject: "Falha no pagamento da assinatura - {{company_name}}",
    variables: [
      { key: "{{owner_name}}", description: "Nome do proprietário", example: "José" },
      { key: "{{company_name}}", description: "Nome da empresa", example: "Pizzaria do Zé" },
      { key: "{{plan_name}}", description: "Nome do plano", example: "Profissional" },
      { key: "{{renew_url}}", description: "URL para renovar", example: "https://cardpondelivery.com/dashboard/planos" },
    ],
    html_content: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f4f4f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 500px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #f59e0b, #d97706); padding: 30px; text-align: center;">
              <h1 style="margin: 0; font-size: 24px; font-weight: 700; color: #ffffff;">⚠️ Falha no Pagamento</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px; font-size: 16px; color: #52525b;">Olá <strong>{{owner_name}}</strong>,</p>
              <p style="margin: 0 0 20px; font-size: 16px; color: #52525b; line-height: 1.6;">
                Não conseguimos processar o pagamento da sua assinatura <strong>{{plan_name}}</strong> para a empresa <strong>{{company_name}}</strong>.
              </p>
              <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin-bottom: 20px; border-radius: 0 8px 8px 0;">
                <p style="margin: 0; font-size: 14px; color: #92400e;"><strong>Você tem 7 dias para regularizar</strong> sem que seus pedidos sejam bloqueados.</p>
              </div>
              <div style="text-align: center; margin-top: 30px;">
                <a href="{{renew_url}}" style="display: inline-block; background: #3b82f6; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600;">Renovar Assinatura</a>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
  },
  {
    slug: "subscription-payment-pending",
    name: "Pagamento PIX Pendente",
    description: "Email enviado quando o pagamento PIX está pendente",
    subject: "Pagamento PIX pendente - {{company_name}}",
    variables: [
      { key: "{{owner_name}}", description: "Nome do proprietário", example: "José" },
      { key: "{{company_name}}", description: "Nome da empresa", example: "Pizzaria do Zé" },
      { key: "{{plan_name}}", description: "Nome do plano", example: "Profissional" },
      { key: "{{amount}}", description: "Valor do pagamento", example: "R$ 99,90" },
      { key: "{{renew_url}}", description: "URL para renovar", example: "https://cardpondelivery.com/dashboard/planos" },
    ],
    html_content: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f4f4f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 500px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #3b82f6, #2563eb); padding: 30px; text-align: center;">
              <h1 style="margin: 0; font-size: 24px; font-weight: 700; color: #ffffff;">⏳ Pagamento Pendente</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px; font-size: 16px; color: #52525b;">Olá <strong>{{owner_name}}</strong>,</p>
              <p style="margin: 0 0 20px; font-size: 16px; color: #52525b; line-height: 1.6;">
                O pagamento PIX de <strong>{{amount}}</strong> para o plano <strong>{{plan_name}}</strong> ainda não foi confirmado.
              </p>
              <div style="background: #dbeafe; border-left: 4px solid #3b82f6; padding: 16px; margin-bottom: 20px; border-radius: 0 8px 8px 0;">
                <p style="margin: 0; font-size: 14px; color: #1e40af;">Se você já realizou o pagamento, aguarde alguns minutos para a confirmação automática.</p>
              </div>
              <div style="text-align: center; margin-top: 30px;">
                <a href="{{renew_url}}" style="display: inline-block; background: #3b82f6; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600;">Acessar Painel</a>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
  },
  {
    slug: "subscription-expiring-soon",
    name: "Assinatura Expirando",
    description: "Email enviado quando a assinatura vai expirar em breve",
    subject: "Sua assinatura vai expirar em breve - {{company_name}}",
    variables: [
      { key: "{{owner_name}}", description: "Nome do proprietário", example: "José" },
      { key: "{{company_name}}", description: "Nome da empresa", example: "Pizzaria do Zé" },
      { key: "{{plan_name}}", description: "Nome do plano", example: "Profissional" },
      { key: "{{renew_url}}", description: "URL para renovar", example: "https://cardpondelivery.com/dashboard/planos" },
    ],
    html_content: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f4f4f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 500px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #3b82f6, #2563eb); padding: 30px; text-align: center;">
              <h1 style="margin: 0; font-size: 24px; font-weight: 700; color: #ffffff;">📅 Assinatura Expirando</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px; font-size: 16px; color: #52525b;">Olá <strong>{{owner_name}}</strong>,</p>
              <p style="margin: 0 0 20px; font-size: 16px; color: #52525b; line-height: 1.6;">
                Sua assinatura do plano <strong>{{plan_name}}</strong> para a empresa <strong>{{company_name}}</strong> vai expirar em breve.
              </p>
              <p style="margin: 0 0 20px; font-size: 16px; color: #52525b; line-height: 1.6;">
                Renove agora para continuar aproveitando todos os benefícios.
              </p>
              <div style="text-align: center; margin-top: 30px;">
                <a href="{{renew_url}}" style="display: inline-block; background: #3b82f6; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600;">Renovar Assinatura</a>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
  },
  {
    slug: "subscription-grace-period",
    name: "Período de Carência Ativado",
    description: "Email enviado quando a empresa entra no período de carência",
    subject: "Período de carência ativado - {{company_name}}",
    variables: [
      { key: "{{owner_name}}", description: "Nome do proprietário", example: "José" },
      { key: "{{company_name}}", description: "Nome da empresa", example: "Pizzaria do Zé" },
      { key: "{{plan_name}}", description: "Nome do plano", example: "Profissional" },
      { key: "{{grace_end}}", description: "Data final da carência", example: "15/01/2025" },
      { key: "{{renew_url}}", description: "URL para renovar", example: "https://cardpondelivery.com/dashboard/planos" },
    ],
    html_content: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f4f4f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 500px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #f59e0b, #d97706); padding: 30px; text-align: center;">
              <h1 style="margin: 0; font-size: 24px; font-weight: 700; color: #ffffff;">⏰ Período de Carência</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px; font-size: 16px; color: #52525b;">Olá <strong>{{owner_name}}</strong>,</p>
              <p style="margin: 0 0 20px; font-size: 16px; color: #52525b; line-height: 1.6;">
                Sua assinatura do plano <strong>{{plan_name}}</strong> venceu, mas ativamos um <strong>período de carência de 7 dias</strong>.
              </p>
              <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin-bottom: 20px; border-radius: 0 8px 8px 0;">
                <p style="margin: 0; font-size: 14px; color: #92400e;"><strong>Prazo final:</strong> {{grace_end}}</p>
              </div>
              <div style="text-align: center; margin-top: 30px;">
                <a href="{{renew_url}}" style="display: inline-block; background: #3b82f6; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600;">Renovar Assinatura</a>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
  },
  {
    slug: "subscription-grace-period-ending",
    name: "Carência Acabando",
    description: "Email urgente quando faltam 2 dias para fim da carência",
    subject: "URGENTE: Período de carência acabando - {{company_name}}",
    variables: [
      { key: "{{owner_name}}", description: "Nome do proprietário", example: "José" },
      { key: "{{company_name}}", description: "Nome da empresa", example: "Pizzaria do Zé" },
      { key: "{{plan_name}}", description: "Nome do plano", example: "Profissional" },
      { key: "{{grace_end}}", description: "Data final da carência", example: "15/01/2025" },
      { key: "{{renew_url}}", description: "URL para renovar", example: "https://cardpondelivery.com/dashboard/planos" },
    ],
    html_content: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f4f4f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 500px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #ef4444, #dc2626); padding: 30px; text-align: center;">
              <h1 style="margin: 0; font-size: 24px; font-weight: 700; color: #ffffff;">🚨 Carência Acabando!</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px; font-size: 16px; color: #52525b;">Olá <strong>{{owner_name}}</strong>,</p>
              <p style="margin: 0 0 20px; font-size: 16px; color: #52525b; line-height: 1.6;">
                <strong>Faltam apenas 2 dias</strong> para o fim do período de carência da sua assinatura do plano <strong>{{plan_name}}</strong>.
              </p>
              <div style="background: #fef2f2; border-left: 4px solid #ef4444; padding: 16px; margin-bottom: 20px; border-radius: 0 8px 8px 0;">
                <p style="margin: 0; font-size: 14px; color: #991b1b;"><strong>Data limite:</strong> {{grace_end}}<br>Após essa data, sua conta será rebaixada para o plano gratuito.</p>
              </div>
              <div style="text-align: center; margin-top: 30px;">
                <a href="{{renew_url}}" style="display: inline-block; background: #ef4444; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600;">Renovar AGORA</a>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
  },
  {
    slug: "subscription-expired",
    name: "Assinatura Expirada",
    description: "Email enviado quando a assinatura expira definitivamente",
    subject: "Assinatura expirada - {{company_name}}",
    variables: [
      { key: "{{owner_name}}", description: "Nome do proprietário", example: "José" },
      { key: "{{company_name}}", description: "Nome da empresa", example: "Pizzaria do Zé" },
      { key: "{{plan_name}}", description: "Nome do plano", example: "Profissional" },
      { key: "{{renew_url}}", description: "URL para renovar", example: "https://cardpondelivery.com/dashboard/planos" },
    ],
    html_content: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f4f4f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 500px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #ef4444, #dc2626); padding: 30px; text-align: center;">
              <h1 style="margin: 0; font-size: 24px; font-weight: 700; color: #ffffff;">❌ Assinatura Expirada</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px; font-size: 16px; color: #52525b;">Olá <strong>{{owner_name}}</strong>,</p>
              <p style="margin: 0 0 20px; font-size: 16px; color: #52525b; line-height: 1.6;">
                Sua assinatura do plano <strong>{{plan_name}}</strong> expirou e sua conta foi rebaixada para o <strong>plano gratuito</strong>.
              </p>
              <div style="background: #fef2f2; border-left: 4px solid #ef4444; padding: 16px; margin-bottom: 20px; border-radius: 0 8px 8px 0;">
                <p style="margin: 0; font-size: 14px; color: #991b1b;"><strong>Importante:</strong> Se você ultrapassar o limite de faturamento do plano gratuito, seus pedidos podem ser bloqueados.</p>
              </div>
              <div style="text-align: center; margin-top: 30px;">
                <a href="{{renew_url}}" style="display: inline-block; background: #3b82f6; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600;">Renovar Assinatura</a>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
  },
];

export default function EmailTemplates() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Editor state
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [editedSubject, setEditedSubject] = useState("");
  const [editedHtml, setEditedHtml] = useState("");
  const [editedVariables, setEditedVariables] = useState<EmailVariable[]>([]);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  
  // New template state
  const [creatingNew, setCreatingNew] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateSlug, setNewTemplateSlug] = useState("");
  const [newTemplateDescription, setNewTemplateDescription] = useState("");
  
  // Delete confirmation
  const [deletingTemplate, setDeletingTemplate] = useState<EmailTemplate | null>(null);
  
  // Restore default confirmation
  const [restoringTemplate, setRestoringTemplate] = useState<Partial<EmailTemplate> | null>(null);

  useEffect(() => {
    checkAccess();
  }, [navigate]);

  const checkAccess = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Não autenticado");
      navigate("/auth");
      return;
    }

    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    const isSuperAdmin = roles?.some(r => r.role === "super_admin");
    if (!isSuperAdmin) {
      toast.error("Acesso negado");
      navigate("/dashboard");
      return;
    }

    setHasAccess(true);
    loadTemplates();
  };

  const loadTemplates = async () => {
    setLoading(true);
    
    const { data, error } = await (supabase as any)
      .from("email_templates")
      .select("*")
      .order("name");

    if (error) {
      console.error("Error loading templates:", error);
      toast.error("Erro ao carregar templates");
    } else {
      setTemplates(data as EmailTemplate[] || []);
    }
    
    setLoading(false);
  };

  const handleEditTemplate = (template: EmailTemplate) => {
    setEditingTemplate(template);
    setEditedSubject(template.subject);
    setEditedHtml(template.html_content);
    setEditedVariables(template.variables || []);
    setShowPreview(false);
  };

  const handleSaveTemplate = async () => {
    if (!editingTemplate) return;
    
    setSaving(true);
    try {
      const { error } = await (supabase as any)
        .from("email_templates")
        .update({
          subject: editedSubject,
          html_content: editedHtml,
          variables: editedVariables,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editingTemplate.id);

      if (error) throw error;

      toast.success("Template salvo com sucesso!");
      setEditingTemplate(null);
      loadTemplates();
    } catch (error) {
      console.error("Error saving template:", error);
      toast.error("Erro ao salvar template");
    } finally {
      setSaving(false);
    }
  };

  const handleCreateTemplate = async () => {
    if (!newTemplateName || !newTemplateSlug) {
      toast.error("Nome e slug são obrigatórios");
      return;
    }

    setSaving(true);
    try {
      const { error } = await (supabase as any)
        .from("email_templates")
        .insert({
          name: newTemplateName,
          slug: newTemplateSlug.toLowerCase().replace(/\s+/g, "-"),
          description: newTemplateDescription || null,
          subject: "Assunto do email",
          html_content: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f4f4f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 500px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <tr>
            <td style="padding: 40px;">
              <h1 style="margin: 0 0 20px; font-size: 24px; font-weight: 700; color: #18181b; text-align: center;">
                Título do Email
              </h1>
              <p style="margin: 0; font-size: 16px; color: #52525b; text-align: center; line-height: 1.6;">
                Conteúdo do email aqui.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
          variables: [],
          is_active: true,
        });

      if (error) throw error;

      toast.success("Template criado com sucesso!");
      setCreatingNew(false);
      setNewTemplateName("");
      setNewTemplateSlug("");
      setNewTemplateDescription("");
      loadTemplates();
    } catch (error: any) {
      console.error("Error creating template:", error);
      if (error.code === "23505") {
        toast.error("Já existe um template com este slug");
      } else {
        toast.error("Erro ao criar template");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTemplate = async () => {
    if (!deletingTemplate) return;

    try {
      const { error } = await (supabase as any)
        .from("email_templates")
        .delete()
        .eq("id", deletingTemplate.id);

      if (error) throw error;

      toast.success("Template excluído com sucesso!");
      setDeletingTemplate(null);
      loadTemplates();
    } catch (error) {
      console.error("Error deleting template:", error);
      toast.error("Erro ao excluir template");
    }
  };

  const handleRestoreDefault = async () => {
    if (!restoringTemplate) return;

    setSaving(true);
    try {
      const { error } = await (supabase as any)
        .from("email_templates")
        .upsert({
          slug: restoringTemplate.slug,
          name: restoringTemplate.name,
          description: restoringTemplate.description,
          subject: restoringTemplate.subject,
          html_content: restoringTemplate.html_content,
          variables: restoringTemplate.variables,
          is_active: true,
        }, {
          onConflict: "slug"
        });

      if (error) throw error;

      toast.success("Template restaurado com sucesso!");
      setRestoringTemplate(null);
      loadTemplates();
    } catch (error) {
      console.error("Error restoring template:", error);
      toast.error("Erro ao restaurar template");
    } finally {
      setSaving(false);
    }
  };

  const handleAddVariable = () => {
    setEditedVariables([
      ...editedVariables,
      { key: "{{nova_variavel}}", description: "", example: "" }
    ]);
  };

  const handleRemoveVariable = (index: number) => {
    setEditedVariables(editedVariables.filter((_, i) => i !== index));
  };

  const handleUpdateVariable = (index: number, field: keyof EmailVariable, value: string) => {
    const updated = [...editedVariables];
    updated[index] = { ...updated[index], [field]: value };
    setEditedVariables(updated);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copiado para a área de transferência!");
  };

  const getPreviewHtml = useCallback(() => {
    let html = editedHtml;
    editedVariables.forEach(v => {
      html = html.replace(new RegExp(v.key.replace(/[{}]/g, "\\$&"), "g"), v.example || v.key);
    });
    return html;
  }, [editedHtml, editedVariables]);

  const filteredTemplates = templates.filter(t => 
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.slug.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Find default templates not yet in database
  const missingDefaults = DEFAULT_TEMPLATES.filter(
    dt => !templates.some(t => t.slug === dt.slug)
  );

  if (loading || !hasAccess) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="container max-w-6xl py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Templates de Email</h1>
            <p className="text-muted-foreground mt-1">
              Gerencie os templates de email enviados pelo sistema.
            </p>
          </div>
          <Button onClick={() => setCreatingNew(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Template
          </Button>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar templates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Missing Default Templates */}
        {missingDefaults.length > 0 && (
          <Card className="border-dashed">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <RotateCcw className="h-4 w-4" />
                Templates Padrão Disponíveis
              </CardTitle>
              <CardDescription>
                Estes templates padrão ainda não foram adicionados ao sistema.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {missingDefaults.map((dt) => (
                  <Button
                    key={dt.slug}
                    variant="outline"
                    size="sm"
                    onClick={() => setRestoringTemplate(dt)}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    {dt.name}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Templates List */}
        <div className="grid gap-4">
          {filteredTemplates.map((template) => (
            <Card key={template.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg text-primary">
                      <Mail className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        {template.name}
                        <Badge variant={template.is_active ? "default" : "secondary"} className="text-xs">
                          {template.is_active ? "Ativo" : "Inativo"}
                        </Badge>
                      </CardTitle>
                      <CardDescription className="flex items-center gap-2">
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{template.slug}</code>
                        {template.description && <span>• {template.description}</span>}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleEditTemplate(template)}>
                      <Code className="h-4 w-4 mr-1" />
                      Editar
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="text-destructive hover:text-destructive"
                      onClick={() => setDeletingTemplate(template)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span><strong>Assunto:</strong> {template.subject}</span>
                  {template.variables?.length > 0 && (
                    <span><strong>Variáveis:</strong> {template.variables.length}</span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}

          {filteredTemplates.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhum template encontrado.</p>
            </div>
          )}
        </div>
      </div>

      {/* Editor Dialog */}
      <Dialog open={!!editingTemplate} onOpenChange={(open) => !open && setEditingTemplate(null)}>
        <DialogContent className="max-w-6xl h-[90vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Editar Template: {editingTemplate?.name}
            </DialogTitle>
            <DialogDescription>
              Edite o HTML e as variáveis do template. Use a sintaxe {"{{variavel}}"} para inserir variáveis dinâmicas.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-hidden">
            <div className="grid grid-cols-2 gap-4 h-full">
              {/* Left: Editor */}
              <ScrollArea className="h-full pr-4">
                <div className="space-y-4 pb-4">
                  <div>
                    <Label htmlFor="subject">Assunto do Email</Label>
                    <Input
                      id="subject"
                      value={editedSubject}
                      onChange={(e) => setEditedSubject(e.target.value)}
                      placeholder="Assunto do email"
                      className="mt-1.5"
                    />
                  </div>

                  <div>
                    <Label>Variáveis Disponíveis</Label>
                    <div className="mt-1.5 space-y-2">
                      {editedVariables.map((v, index) => (
                        <div key={index} className="flex gap-2 items-start p-2 bg-muted rounded-lg">
                          <div className="flex-1 space-y-2">
                            <div className="flex gap-2">
                              <Input
                                value={v.key}
                                onChange={(e) => handleUpdateVariable(index, "key", e.target.value)}
                                placeholder="{{variavel}}"
                                className="font-mono text-sm h-8"
                              />
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => copyToClipboard(v.key)}
                                className="h-8 px-2"
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <Input
                                value={v.description}
                                onChange={(e) => handleUpdateVariable(index, "description", e.target.value)}
                                placeholder="Descrição"
                                className="h-8 text-sm"
                              />
                              <Input
                                value={v.example}
                                onChange={(e) => handleUpdateVariable(index, "example", e.target.value)}
                                placeholder="Exemplo"
                                className="h-8 text-sm"
                              />
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveVariable(index)}
                            className="h-8 px-2 text-destructive hover:text-destructive"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                      <Button variant="outline" size="sm" onClick={handleAddVariable}>
                        <Plus className="h-3 w-3 mr-1" />
                        Adicionar Variável
                      </Button>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <Label>Código HTML</Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowPreview(!showPreview)}
                      >
                        {showPreview ? <Code className="h-4 w-4 mr-1" /> : <Eye className="h-4 w-4 mr-1" />}
                        {showPreview ? "Editor" : "Preview"}
                      </Button>
                    </div>
                    <Textarea
                      value={editedHtml}
                      onChange={(e) => setEditedHtml(e.target.value)}
                      className="font-mono text-sm h-[400px] resize-y"
                      placeholder="<!DOCTYPE html>..."
                    />
                  </div>
                </div>
              </ScrollArea>

              {/* Right: Preview */}
              <div className="border rounded-lg overflow-hidden bg-muted/30 flex flex-col h-full">
                <div className="bg-muted px-4 py-2 border-b flex items-center gap-2 flex-shrink-0">
                  <Eye className="h-4 w-4" />
                  <span className="text-sm font-medium">Preview</span>
                </div>
                <div className="flex-1 min-h-0">
                  <iframe
                    srcDoc={getPreviewHtml()}
                    className="w-full h-full bg-white"
                    title="Email Preview"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t flex-shrink-0">
            <Button variant="outline" onClick={() => setEditingTemplate(null)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveTemplate} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Salvar Template
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create New Template Dialog */}
      <Dialog open={creatingNew} onOpenChange={setCreatingNew}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Template de Email</DialogTitle>
            <DialogDescription>
              Crie um novo template de email personalizado.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="new-name">Nome do Template</Label>
              <Input
                id="new-name"
                value={newTemplateName}
                onChange={(e) => setNewTemplateName(e.target.value)}
                placeholder="Ex: Email de Boas-vindas"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="new-slug">Slug (identificador único)</Label>
              <Input
                id="new-slug"
                value={newTemplateSlug}
                onChange={(e) => setNewTemplateSlug(e.target.value.toLowerCase().replace(/\s+/g, "-"))}
                placeholder="Ex: welcome-email"
                className="mt-1.5 font-mono"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Usado para identificar o template no código.
              </p>
            </div>
            <div>
              <Label htmlFor="new-description">Descrição (opcional)</Label>
              <Input
                id="new-description"
                value={newTemplateDescription}
                onChange={(e) => setNewTemplateDescription(e.target.value)}
                placeholder="Descreva quando este email é enviado"
                className="mt-1.5"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setCreatingNew(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateTemplate} disabled={saving || !newTemplateName || !newTemplateSlug}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
              Criar Template
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingTemplate} onOpenChange={(open) => !open && setDeletingTemplate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Template</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o template "{deletingTemplate?.name}"? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteTemplate} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Restore Default Confirmation */}
      <AlertDialog open={!!restoringTemplate} onOpenChange={(open) => !open && setRestoringTemplate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restaurar Template Padrão</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja adicionar o template "{restoringTemplate?.name}" com as configurações padrão? Se já existir um template com este slug, ele será substituído.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleRestoreDefault} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RotateCcw className="h-4 w-4 mr-2" />}
              Restaurar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
