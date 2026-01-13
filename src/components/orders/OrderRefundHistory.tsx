import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { RotateCcw, Clock, CheckCircle, XCircle, AlertCircle, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';

interface RefundRequest {
  id: string;
  status: 'pending' | 'completed' | 'rejected';
  requested_amount: number;
  reason: string;
  created_at: string;
  reviewed_at: string | null;
  processed_at: string | null;
  rejection_reason: string | null;
  refund_id: string | null;
  payment_provider: string | null;
}

interface OrderRefundHistoryProps {
  orderId: string;
}

export function OrderRefundHistory({ orderId }: OrderRefundHistoryProps) {
  const [refunds, setRefunds] = useState<RefundRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRefunds();
  }, [orderId]);

  const loadRefunds = async () => {
    try {
      const { data, error } = await (supabase as any)
        .from('refund_requests')
        .select('id, status, requested_amount, reason, created_at, reviewed_at, processed_at, rejection_reason, refund_id, payment_provider')
        .eq('order_id', orderId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRefunds(data || []);
    } catch (err) {
      console.error('Error loading refund history:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'completed':
        return {
          icon: CheckCircle,
          label: 'Aprovado',
          className: 'bg-emerald-500/10 text-emerald-600 border-emerald-200',
        };
      case 'rejected':
        return {
          icon: XCircle,
          label: 'Rejeitado',
          className: 'bg-destructive/10 text-destructive border-destructive/20',
        };
      default:
        return {
          icon: Clock,
          label: 'Aguardando',
          className: 'bg-amber-500/10 text-amber-600 border-amber-200',
        };
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (refunds.length === 0) {
    return null;
  }

  return (
    <div className="pt-4 border-t space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <RotateCcw className="h-4 w-4 text-muted-foreground" />
        <span>Histórico de Estornos</span>
        <Badge variant="secondary" className="ml-auto">
          {refunds.length}
        </Badge>
      </div>

      <div className="space-y-3">
        {refunds.map((refund) => {
          const config = getStatusConfig(refund.status);
          const StatusIcon = config.icon;

          return (
            <div
              key={refund.id}
              className="p-3 rounded-lg bg-muted/50 border space-y-2"
            >
              {/* Header com status e valor */}
              <div className="flex items-center justify-between">
                <Badge variant="outline" className={config.className}>
                  <StatusIcon className="h-3 w-3 mr-1" />
                  {config.label}
                </Badge>
                <span className="font-semibold text-sm">
                  {formatCurrency(refund.requested_amount)}
                </span>
              </div>

              {/* Motivo */}
              <p className="text-sm text-muted-foreground line-clamp-2">
                {refund.reason}
              </p>

              {/* Rejeição */}
              {refund.status === 'rejected' && refund.rejection_reason && (
                <div className="flex items-start gap-2 p-2 rounded bg-destructive/5 text-sm">
                  <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                  <span className="text-destructive">{refund.rejection_reason}</span>
                </div>
              )}

              {/* Datas */}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>
                  Solicitado: {format(new Date(refund.created_at), "dd/MM/yy 'às' HH:mm", { locale: ptBR })}
                </span>
                {refund.reviewed_at && (
                  <span>
                    Analisado: {format(new Date(refund.reviewed_at), "dd/MM/yy 'às' HH:mm", { locale: ptBR })}
                  </span>
                )}
                {refund.processed_at && (
                  <span>
                    Processado: {format(new Date(refund.processed_at), "dd/MM/yy 'às' HH:mm", { locale: ptBR })}
                  </span>
                )}
              </div>

              {/* Provider e ID do estorno */}
              {refund.status === 'completed' && refund.refund_id && (
                <div className="text-xs text-muted-foreground pt-1 border-t">
                  <span className="font-mono">
                    {refund.payment_provider === 'picpay' ? 'PicPay' : 'Mercado Pago'}: {refund.refund_id}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
