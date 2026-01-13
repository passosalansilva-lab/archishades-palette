import { useState, useEffect } from 'react';
import { 
  RotateCcw, 
  Clock, 
  Check, 
  X, 
  CheckCircle,
  XCircle,
  Loader2,
  AlertCircle,
  Calendar,
  Eye
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';

interface RefundRequest {
  id: string;
  order_id: string;
  payment_id: string;
  original_amount: number;
  requested_amount: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'processing' | 'completed' | 'failed';
  rejection_reason: string | null;
  customer_name: string;
  payment_method: string | null;
  refund_id: string | null;
  processed_at: string | null;
  error_message: string | null;
  created_at: string;
  reviewed_at: string | null;
}

interface RefundRequestHistoryProps {
  companyId: string;
}

export function RefundRequestHistory({ companyId }: RefundRequestHistoryProps) {
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<RefundRequest[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<RefundRequest | null>(null);

  useEffect(() => {
    if (companyId) {
      loadRequests();
    }
  }, [companyId]);

  const loadRequests = async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from('refund_requests')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRequests((data || []) as RefundRequest[]);
    } catch (error) {
      console.error('Error loading refund requests:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return (
          <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
            <Clock className="w-3 h-3 mr-1" />
            Aguardando Aprovação
          </Badge>
        );
      case 'approved':
        return (
          <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
            <Check className="w-3 h-3 mr-1" />
            Aprovado
          </Badge>
        );
      case 'processing':
        return (
          <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            Processando
          </Badge>
        );
      case 'completed':
        return (
          <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
            <CheckCircle className="w-3 h-3 mr-1" />
            Concluído
          </Badge>
        );
      case 'rejected':
        return (
          <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
            <X className="w-3 h-3 mr-1" />
            Rejeitado
          </Badge>
        );
      case 'failed':
        return (
          <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
            <XCircle className="w-3 h-3 mr-1" />
            Falhou
          </Badge>
        );
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <RotateCcw className="h-5 w-5" />
            Histórico de Solicitações de Estorno
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/4" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
                <Skeleton className="h-6 w-20" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (requests.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <RotateCcw className="h-5 w-5" />
            Histórico de Solicitações de Estorno
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <RotateCcw className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">
              Você ainda não fez nenhuma solicitação de estorno.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <RotateCcw className="h-5 w-5" />
            Histórico de Solicitações de Estorno
          </CardTitle>
          <CardDescription>
            Acompanhe o status das suas solicitações de estorno
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((req) => (
                  <TableRow key={req.id}>
                    <TableCell>
                      <span className="font-medium">{req.customer_name}</span>
                    </TableCell>
                    <TableCell>
                      <span className="font-semibold">{formatCurrency(req.requested_amount)}</span>
                    </TableCell>
                    <TableCell>{getStatusBadge(req.status)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(req.created_at), 'dd/MM/yyyy')}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedRequest(req)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Details Modal */}
      <Dialog open={!!selectedRequest} onOpenChange={() => setSelectedRequest(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5" />
              Detalhes da Solicitação
            </DialogTitle>
          </DialogHeader>
          {selectedRequest && (
            <div className="space-y-4">
              <div className="p-4 bg-muted/50 rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Status</span>
                  {getStatusBadge(selectedRequest.status)}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Valor</span>
                  <span className="text-xl font-bold">{formatCurrency(selectedRequest.requested_amount)}</span>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between py-2 border-b">
                  <span className="text-sm text-muted-foreground">Cliente</span>
                  <span className="font-medium">{selectedRequest.customer_name}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b">
                  <span className="text-sm text-muted-foreground">Solicitado em</span>
                  <span className="font-medium">
                    {format(new Date(selectedRequest.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </span>
                </div>
                {selectedRequest.reviewed_at && (
                  <div className="flex items-center justify-between py-2 border-b">
                    <span className="text-sm text-muted-foreground">Analisado em</span>
                    <span className="font-medium">
                      {format(new Date(selectedRequest.reviewed_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </span>
                  </div>
                )}
                {selectedRequest.processed_at && (
                  <div className="flex items-center justify-between py-2 border-b">
                    <span className="text-sm text-muted-foreground">Processado em</span>
                    <span className="font-medium">
                      {format(new Date(selectedRequest.processed_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </span>
                  </div>
                )}
              </div>

              <div className="p-3 bg-muted rounded-lg">
                <p className="text-sm font-medium mb-1">Motivo do Estorno:</p>
                <p className="text-sm text-muted-foreground">{selectedRequest.reason}</p>
              </div>

              {selectedRequest.status === 'pending' && (
                <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                  <p className="text-sm text-yellow-700 dark:text-yellow-400">
                    <Clock className="h-4 w-4 inline mr-1" />
                    Sua solicitação está sendo analisada pelo administrador.
                  </p>
                </div>
              )}

              {selectedRequest.rejection_reason && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <p className="text-sm font-medium mb-1 text-red-700 dark:text-red-400">Motivo da Rejeição:</p>
                  <p className="text-sm text-red-600 dark:text-red-300">{selectedRequest.rejection_reason}</p>
                </div>
              )}

              {selectedRequest.error_message && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <p className="text-sm font-medium mb-1 text-red-700 dark:text-red-400">Erro no Processamento:</p>
                  <p className="text-sm text-red-600 dark:text-red-300">{selectedRequest.error_message}</p>
                </div>
              )}

              {selectedRequest.status === 'completed' && (
                <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                  <p className="text-sm text-green-700 dark:text-green-400">
                    <CheckCircle className="h-4 w-4 inline mr-1" />
                    O estorno foi processado com sucesso e o valor foi devolvido ao cliente.
                  </p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
