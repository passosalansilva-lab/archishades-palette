import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageTitle } from '@/components/PageTitle';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { 
  CreditCard, 
  Smartphone, 
  Map, 
  Bell, 
  Mail, 
  FileText, 
  Info,
  CheckCircle2,
  ExternalLink,
  Copy,
  Settings
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

export default function IntegrationsDoc() {
  const { user } = useAuth();
  
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado!`);
  };

  const getWebhookUrl = (functionName: string) => {
    // Get the Supabase project URL from the client
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://seu-projeto.supabase.co';
    return `${supabaseUrl}/functions/v1/${functionName}`;
  };

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <PageTitle>
          <h1 className="text-2xl font-bold tracking-tight">Documentação de Integrações</h1>
        </PageTitle>
        <p className="text-sm text-muted-foreground">
          Guia completo sobre todas as integrações disponíveis no sistema. Configure pagamentos, notificações, mapas e muito mais.
        </p>

        {/* Integrações de Pagamento */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary" />
              Integrações de Pagamento
            </CardTitle>
            <CardDescription>
              Configure gateways de pagamento para receber via PIX e cartão de crédito
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible className="w-full space-y-2">
              {/* Mercado Pago */}
              <AccordionItem value="mercadopago">
                <AccordionTrigger>
                  <div className="flex items-center gap-3">
                    <div className="h-6 w-6 rounded bg-[#009ee3] flex items-center justify-center">
                      <span className="text-white text-xs font-bold">MP</span>
                    </div>
                    <span>Mercado Pago</span>
                    <Badge variant="secondary">PIX + Cartão</Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="space-y-4">
                  <div className="space-y-3">
                    <h4 className="font-medium">O que é?</h4>
                    <p className="text-sm text-muted-foreground">
                      O Mercado Pago é uma solução completa de pagamentos que permite receber via PIX e cartão de crédito 
                      diretamente no checkout do seu cardápio digital.
                    </p>
                    
                    <h4 className="font-medium">Funcionalidades</h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        Pagamento via PIX com QR Code
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        Pagamento via cartão de crédito
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        Confirmação automática de pagamento
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        Estornos automáticos
                      </li>
                    </ul>

                    <h4 className="font-medium">Como configurar</h4>
                    <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                      <li>Acesse <strong>Minha Loja → Pagamentos</strong></li>
                      <li>Clique em <strong>Configurar Mercado Pago</strong></li>
                      <li>
                        Obtenha suas credenciais no{' '}
                        <a 
                          href="https://www.mercadopago.com.br/developers/panel/app" 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-primary hover:underline inline-flex items-center gap-1"
                        >
                          Painel de Desenvolvedores do Mercado Pago
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </li>
                      <li>Insira o <strong>Access Token</strong> de produção</li>
                      <li>O sistema validará automaticamente suas credenciais</li>
                    </ol>

                    <Alert>
                      <Info className="h-4 w-4" />
                      <AlertTitle>Webhook automático</AlertTitle>
                      <AlertDescription>
                        O Mercado Pago envia notificações automaticamente quando um pagamento é confirmado. 
                        Não é necessário configurar nada adicional.
                      </AlertDescription>
                    </Alert>
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* PicPay */}
              <AccordionItem value="picpay">
                <AccordionTrigger>
                  <div className="flex items-center gap-3">
                    <div className="h-6 w-6 rounded bg-[#21c25e] flex items-center justify-center">
                      <span className="text-white text-xs font-bold">PP</span>
                    </div>
                    <span>PicPay</span>
                    <Badge variant="secondary">PIX</Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="space-y-4">
                  <div className="space-y-3">
                    <h4 className="font-medium">O que é?</h4>
                    <p className="text-sm text-muted-foreground">
                      O PicPay Business permite receber pagamentos via PIX diretamente no checkout do seu cardápio, 
                      com confirmação automática e estornos integrados.
                    </p>
                    
                    <h4 className="font-medium">Funcionalidades</h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        Pagamento via PIX com QR Code
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        Expiração automática (30 minutos)
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        Estornos automáticos
                      </li>
                    </ul>

                    <h4 className="font-medium">Como configurar</h4>
                    <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                      <li>Acesse <strong>Minha Loja → Pagamentos</strong></li>
                      <li>Clique em <strong>Configurar PicPay</strong></li>
                      <li>
                        Obtenha suas credenciais no{' '}
                        <a 
                          href="https://studio.picpay.com/" 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-primary hover:underline inline-flex items-center gap-1"
                        >
                          PicPay Studio
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </li>
                      <li>Insira o <strong>Client ID</strong> e <strong>Client Secret</strong></li>
                      <li>O sistema validará automaticamente suas credenciais</li>
                    </ol>

                    <Alert className="border-amber-500/50 bg-amber-50 dark:bg-amber-950/20">
                      <Settings className="h-4 w-4 text-amber-600" />
                      <AlertTitle className="text-amber-600">Configuração do Webhook (Recomendado)</AlertTitle>
                      <AlertDescription className="space-y-3">
                        <p>
                          Para que o pagamento seja confirmado automaticamente, configure a URL de notificação no painel do PicPay:
                        </p>
                        <div className="flex items-center gap-2 p-2 bg-background rounded border">
                          <code className="text-xs flex-1 break-all">
                            {getWebhookUrl('picpay-webhook')}
                          </code>
                          <Button 
                            size="sm" 
                            variant="ghost"
                            onClick={() => copyToClipboard(getWebhookUrl('picpay-webhook'), 'URL do Webhook')}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                        <ol className="text-sm space-y-1 list-decimal list-inside">
                          <li>Acesse o <strong>PicPay Studio</strong></li>
                          <li>Vá em <strong>Ajustes → Meu Checkout → URL de Notificação</strong></li>
                          <li>Cole a URL acima e salve</li>
                        </ol>
                      </AlertDescription>
                    </Alert>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>

        {/* Integrações de Mapa e Localização */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Map className="h-5 w-5 text-primary" />
              Mapas e Localização
            </CardTitle>
            <CardDescription>
              Rastreamento de entregas em tempo real
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="mapbox">
                <AccordionTrigger>
                  <div className="flex items-center gap-3">
                    <div className="h-6 w-6 rounded bg-blue-600 flex items-center justify-center">
                      <Map className="h-4 w-4 text-white" />
                    </div>
                    <span>Mapbox</span>
                    <Badge variant="secondary">Pré-configurado</Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="space-y-4">
                  <div className="space-y-3">
                    <h4 className="font-medium">O que é?</h4>
                    <p className="text-sm text-muted-foreground">
                      O Mapbox fornece mapas interativos para rastreamento de entregas em tempo real, 
                      permitindo que seus clientes acompanhem o entregador no mapa.
                    </p>
                    
                    <h4 className="font-medium">Funcionalidades</h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        Mapa de rastreamento do entregador
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        Atualização em tempo real da localização
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        Cálculo de rotas e distâncias
                      </li>
                    </ul>

                    <Alert>
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <AlertTitle>Integração automática</AlertTitle>
                      <AlertDescription>
                        Esta integração já está configurada e funcionando automaticamente. 
                        Seus clientes podem rastrear entregas sem nenhuma configuração adicional.
                      </AlertDescription>
                    </Alert>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>

        {/* Integrações de Notificação */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-primary" />
              Notificações
            </CardTitle>
            <CardDescription>
              Sistema de alertas para você, sua equipe e seus clientes
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible className="w-full space-y-2">
              <AccordionItem value="push">
                <AccordionTrigger>
                  <div className="flex items-center gap-3">
                    <div className="h-6 w-6 rounded bg-purple-600 flex items-center justify-center">
                      <Bell className="h-4 w-4 text-white" />
                    </div>
                    <span>Notificações Push</span>
                    <Badge variant="secondary">Pré-configurado</Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="space-y-4">
                  <div className="space-y-3">
                    <h4 className="font-medium">O que é?</h4>
                    <p className="text-sm text-muted-foreground">
                      Notificações push são alertas que aparecem no navegador ou celular, mesmo quando o site está fechado.
                      Ideal para avisar sobre novos pedidos, atualizações de status e promoções.
                    </p>
                    
                    <h4 className="font-medium">Funcionalidades</h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        Alerta de novo pedido para a loja
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        Notificação de nova entrega para entregadores
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        Atualização de status para clientes
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        Notificações promocionais para clientes
                      </li>
                    </ul>

                    <h4 className="font-medium">Como ativar</h4>
                    <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                      <li>Acesse <strong>Minha Loja → Som e Notificações</strong></li>
                      <li>Clique em <strong>Ativar notificações</strong></li>
                      <li>Permita as notificações no seu navegador</li>
                      <li>Pronto! Você receberá alertas de novos pedidos</li>
                    </ol>
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="email">
                <AccordionTrigger>
                  <div className="flex items-center gap-3">
                    <div className="h-6 w-6 rounded bg-red-500 flex items-center justify-center">
                      <Mail className="h-4 w-4 text-white" />
                    </div>
                    <span>E-mails Transacionais</span>
                    <Badge variant="secondary">Pré-configurado</Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="space-y-4">
                  <div className="space-y-3">
                    <h4 className="font-medium">O que é?</h4>
                    <p className="text-sm text-muted-foreground">
                      E-mails automáticos enviados para clientes e lojistas em momentos importantes, 
                      como confirmação de pedido, boas-vindas e recuperação de senha.
                    </p>
                    
                    <h4 className="font-medium">E-mails enviados automaticamente</h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        Confirmação de pedido para o cliente
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        Boas-vindas para novos entregadores
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        Recuperação de senha
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        Notificação de estorno/reembolso
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        Alerta de ganhador de sorteio
                      </li>
                    </ul>

                    <Alert>
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <AlertTitle>Integração automática</AlertTitle>
                      <AlertDescription>
                        Todos os e-mails são enviados automaticamente. Não é necessária nenhuma configuração.
                      </AlertDescription>
                    </Alert>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>

        {/* Integração Fiscal */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Integração Fiscal
            </CardTitle>
            <CardDescription>
              Emissão automática de notas fiscais
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="focusnfe">
                <AccordionTrigger>
                  <div className="flex items-center gap-3">
                    <div className="h-6 w-6 rounded bg-orange-500 flex items-center justify-center">
                      <FileText className="h-4 w-4 text-white" />
                    </div>
                    <span>Focus NFe</span>
                    <Badge variant="outline">Opcional</Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="space-y-4">
                  <div className="space-y-3">
                    <h4 className="font-medium">O que é?</h4>
                    <p className="text-sm text-muted-foreground">
                      O Focus NFe é um serviço de emissão de notas fiscais eletrônicas que se integra ao seu sistema,
                      permitindo emitir NF-e e NFC-e automaticamente a cada venda.
                    </p>
                    
                    <h4 className="font-medium">Funcionalidades</h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        Emissão de NF-e (Nota Fiscal Eletrônica)
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        Emissão de NFC-e (Cupom Fiscal)
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        Envio automático por e-mail
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        Cancelamento de notas
                      </li>
                    </ul>

                    <h4 className="font-medium">Como configurar</h4>
                    <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                      <li>Acesse <strong>Minha Loja → NF-e</strong></li>
                      <li>Cadastre os dados fiscais da sua empresa (CNPJ, IE, etc.)</li>
                      <li>Faça upload do certificado digital A1</li>
                      <li>Configure os produtos com NCM e CFOP corretos</li>
                      <li>Teste a emissão em ambiente de homologação</li>
                      <li>Ative a emissão em produção</li>
                    </ol>

                    <Alert className="border-amber-500/50 bg-amber-50 dark:bg-amber-950/20">
                      <Info className="h-4 w-4 text-amber-600" />
                      <AlertTitle className="text-amber-600">Recurso Premium</AlertTitle>
                      <AlertDescription>
                        A emissão de notas fiscais é um recurso disponível para planos específicos. 
                        Consulte a página de planos para mais informações.
                      </AlertDescription>
                    </Alert>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>

        {/* Dúvidas */}
        <Card className="border-dashed">
          <CardContent className="pt-6 space-y-4">
            <h2 className="text-lg font-semibold">Precisa de ajuda com integrações?</h2>
            <p className="text-sm text-muted-foreground">
              Se você está tendo dificuldades para configurar alguma integração ou tem dúvidas técnicas, 
              nossa equipe de suporte pode ajudar.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-lg border p-4 space-y-2">
                <p className="font-medium">💬 WhatsApp</p>
                <p className="text-sm text-muted-foreground">
                  Suporte técnico para configuração de integrações.
                </p>
                <a
                  href="https://wa.me/5518996192561?text=Olá%20CardpOn!%20Preciso%20de%20ajuda%20para%20configurar%20uma%20integração%20no%20meu%20painel."
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block mt-1 text-sm font-medium text-green-600 hover:underline"
                >
                  Falar com suporte →
                </a>
              </div>

              <div className="rounded-lg border p-4 space-y-2">
                <p className="font-medium">📚 Central de Ajuda</p>
                <p className="text-sm text-muted-foreground">
                  Consulte guias e tutoriais sobre o uso do sistema.
                </p>
                <a
                  href="/dashboard/help"
                  className="inline-block mt-1 text-sm font-medium text-primary hover:underline"
                >
                  Acessar Central de Ajuda →
                </a>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
