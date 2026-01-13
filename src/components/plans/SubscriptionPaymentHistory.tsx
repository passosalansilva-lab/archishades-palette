import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Calendar,
  CreditCard,
  QrCode,
  Check,
  Clock,
  X,
  RotateCcw,
  Loader2,
  AlertCircle,
  Receipt,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

interface SubscriptionPayment {
  id: string;
  plan_key: string;
  plan_name: string;
  amount: number;
  payment_method: 'pix' | 'card';
  payment_status: 'pending' | 'paid' | 'failed' | 'refunded';
  payment_reference: string | null;
  paid_at: string | null;
  period_start: string | null;
  period_end: string | null;
  created_at: string;
}

interface SubscriptionPaymentHistoryProps {
  companyId: string;
}

export function SubscriptionPaymentHistory({ companyId }: SubscriptionPaymentHistoryProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState<SubscriptionPayment[]>([]);
  const [selectedPayment, setSelectedPayment] = useState<SubscriptionPayment | null>(null);
  const [showRefundDialog, setShowRefundDialog] = useState(false);
  const [refundReason, setRefundReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadPayments();
  }, [companyId]);

  const loadPayments = async () => {
    setLoading(true);
    try {
      // Usar cast pois a tabela pode não existir ainda no types.ts
      const { data, error } = await (supabase as any)
        .from('subscription_payments')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) {
        // Se a tabela não existir, apenas retorna vazio
        if (error.code === '42P01') {
          setPayments([]);
          return;
        }
        throw error;
      }
      setPayments((data as SubscriptionPayment[]) || []);
    } catch (error) {
      console.error('Error loading subscription payments:', error);
      setPayments([]);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return (
          <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
            <Check className="w-3 h-3 mr-1" />
            Pago
          </Badge>
        );
      case 'pending':
        return (
          <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
            <Clock className="w-3 h-3 mr-1" />
            Pendente
          </Badge>
        );
      case 'failed':
        return (
          <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
            <X className="w-3 h-3 mr-1" />
            Falhou
          </Badge>
        );
      case 'refunded':
        return (
          <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
            <RotateCcw className="w-3 h-3 mr-1" />
            Estornado
          </Badge>
        );
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getPaymentMethodIcon = (method: string) => {
    return method === 'pix' ? (
      <QrCode className="h-4 w-4 text-green-600" />
    ) : (
      <CreditCard className="h-4 w-4 text-blue-600" />
    );
  };

  const canRequestRefund = (payment: SubscriptionPayment): boolean => {
    // Só pode solicitar estorno de pagamentos confirmados com referência
    return payment.payment_status === 'paid' && !!payment.payment_reference;
  };

  const handleOpenRefundDialog = (payment: SubscriptionPayment) => {
    setSelectedPayment(payment);
    setRefundReason('');
    setShowRefundDialog(true);
  };

  const handleSubmitRefundRequest = async () => {
    if (!selectedPayment || !refundReason.trim()) return;

    if (!user?.id) {
      toast({
        title: 'Sessão expirada',
        description: 'Faça login novamente para solicitar estorno.',
        variant: 'destructive',
      });
      return;
    }

    setSubmitting(true);
    try {
      // Criar solicitação de estorno na tabela refund_requests
      const { error } = await (supabase as any)
        .from('refund_requests')
        .insert({
          company_id: companyId,
          payment_id: selectedPayment.payment_reference,
          original_amount: selectedPayment.amount,
          requested_amount: selectedPayment.amount,
          requested_by: user.id,
          reason: refundReason.trim(),
          payment_method: selectedPayment.payment_method,
          // Campos específicos para identificar como estorno de assinatura
          customer_name: `Assinatura - ${selectedPayment.plan_name}`,
          customer_email: null,
          customer_phone: null,
        });

      if (error) throw error;

      toast({
        title: 'Solicitação enviada!',
        description: 'Sua solicitação de estorno foi enviada para análise do administrador.',
      });

      setShowRefundDialog(false);
      setSelectedPayment(null);
      setRefundReason('');
    } catch (error: any) {
      console.error('Error submitting refund request:', error);
      toast({
        title: 'Erro ao solicitar estorno',
        description: error.message || 'Não foi possível enviar a solicitação.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Histórico de Pagamentos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-4 p-3 border rounded-lg">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-1/4" />
                </div>
                <Skeleton className="h-6 w-16" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (payments.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Histórico de Pagamentos
          </CardTitle>
          <CardDescription>
            Pagamentos da sua assinatura
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Receipt className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>Nenhum pagamento encontrado</p>
            <p className="text-sm">Os pagamentos da sua assinatura aparecerão aqui</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Histórico de Pagamentos
          </CardTitle>
          <CardDescription>
            Pagamentos da sua assinatura Cardapeon
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {payments.map((payment) => (
              <div
                key={payment.id}
                className="flex items-center gap-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="p-2 bg-muted rounded-full">
                  {getPaymentMethodIcon(payment.payment_method)}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{payment.plan_name}</p>
                    {getStatusBadge(payment.payment_status)}
                  </div>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {format(new Date(payment.created_at), "dd/MM/yyyy", { locale: ptBR })}
                    </span>
                    <span>
                      {payment.payment_method === 'pix' ? 'PIX' : 'Cartão'}
                    </span>
                  </div>
                </div>

                <div className="text-right">
                  <p className="font-semibold">{formatCurrency(payment.amount)}</p>
                  {canRequestRefund(payment) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs text-destructive hover:text-destructive mt-1"
                      onClick={() => handleOpenRefundDialog(payment)}
                    >
                      <RotateCcw className="h-3 w-3 mr-1" />
                      Solicitar Estorno
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Refund Request Dialog */}
      <Dialog open={showRefundDialog} onOpenChange={setShowRefundDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-destructive" />
              Solicitar Estorno de Assinatura
            </DialogTitle>
            <DialogDescription>
              Sua solicitação será analisada pela equipe Cardapeon.
            </DialogDescription>
          </DialogHeader>

          {selectedPayment && (
            <div className="space-y-4">
              <div className="p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-muted-foreground">Plano</span>
                  <span className="font-medium">{selectedPayment.plan_name}</span>
                </div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-muted-foreground">Valor</span>
                  <span className="font-bold">{formatCurrency(selectedPayment.amount)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Data</span>
                  <span>
                    {format(new Date(selectedPayment.created_at), "dd/MM/yyyy", { locale: ptBR })}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="refundReason">Motivo do Estorno *</Label>
                <Textarea
                  id="refundReason"
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  placeholder="Descreva o motivo da sua solicitação de estorno..."
                  rows={3}
                />
              </div>

              <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                <p className="text-sm text-blue-700 dark:text-blue-400 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>
                    Sua solicitação será analisada pela nossa equipe. O prazo para resposta é de até 5 dias úteis.
                  </span>
                </p>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setShowRefundDialog(false);
                setRefundReason('');
              }}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleSubmitRefundRequest}
              disabled={submitting || !refundReason.trim()}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Enviar Solicitação
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
