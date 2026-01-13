import { useState, useEffect } from 'react';
import { 
  RotateCcw, 
  Check, 
  X, 
  Clock, 
  AlertCircle,
  Search,
  Filter,
  Eye,
  User,
  Building2,
  Calendar,
  Loader2,
  RefreshCw,
  CheckCircle,
  XCircle,
  CreditCard,
  QrCode,
  Crown
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface RefundRequest {
  id: string;
  company_id: string;
  order_id: string;
  payment_id: string;
  original_amount: number;
  requested_amount: number;
  requested_by: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'processing' | 'completed' | 'failed';
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  payment_method: string | null;
  refund_id: string | null;
  processed_at: string | null;
  error_message: string | null;
  created_at: string;
  company?: {
    name: string;
  };
}

export default function RefundRequests() {
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<RefundRequest[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('pending');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modals
  const [selectedRequest, setSelectedRequest] = useState<RefundRequest | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  
  // Actions
  const [processing, setProcessing] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');

  // Stats
  const [stats, setStats] = useState({
    pending: 0,
    approved: 0,
    completed: 0,
    rejected: 0,
  });

  useEffect(() => {
    loadRequests();
    loadStats();
  }, [statusFilter]);

  const loadRequests = async () => {
    setLoading(true);
    try {
      let query = (supabase as any)
        .from('refund_requests')
        .select(`
          *,
          company:companies(name)
        `)
        .order('created_at', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;

      if (error) throw error;
      setRequests((data || []) as RefundRequest[]);
    } catch (error: any) {
      console.error('Error loading refund requests:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar as solicitações.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const { data, error } = await (supabase as any)
        .from('refund_requests')
        .select('status');

      if (error) throw error;

      const counts = {
        pending: 0,
        approved: 0,
        completed: 0,
        rejected: 0,
      };

      (data || []).forEach((r: any) => {
        if (r.status === 'pending') counts.pending++;
        if (r.status === 'approved' || r.status === 'processing') counts.approved++;
        if (r.status === 'completed') counts.completed++;
        if (r.status === 'rejected' || r.status === 'failed') counts.rejected++;
      });

      setStats(counts);
    } catch (error) {
      console.error('Error loading stats:', error);
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
            Pendente
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

  const getPaymentMethodBadge = (method: string | null, paymentId: string) => {
    if (method === 'pix' || /^\d+$/.test(paymentId)) {
      return (
        <Badge variant="outline" className="gap-1">
          <QrCode className="w-3 h-3" />
          PIX
        </Badge>
      );
    }
    if (paymentId?.startsWith('mp_')) {
      return (
        <Badge variant="outline" className="gap-1">
          <CreditCard className="w-3 h-3" />
          Cartão
        </Badge>
      );
    }
    return <Badge variant="outline">{method || 'Outro'}</Badge>;
  };

  // Verifica se é um estorno de assinatura pelo customer_name
  const isSubscriptionRefund = (customerName: string) => {
    return customerName?.startsWith('Assinatura -');
  };

  const getRefundTypeBadge = (customerName: string) => {
    if (isSubscriptionRefund(customerName)) {
      return (
        <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
          <Crown className="w-3 h-3 mr-1" />
          Assinatura
        </Badge>
      );
    }
    return (
      <Badge variant="outline">
        <CreditCard className="w-3 h-3 mr-1" />
        Pedido
      </Badge>
    );
  };

  const handleApprove = async () => {
    if (!selectedRequest) return;
    
    setProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke('process-refund-request', {
        body: {
          request_id: selectedRequest.id,
          action: 'approve',
        },
      });

      if (error) throw error;

      toast({
        title: 'Estorno processado!',
        description: data.message || 'O estorno foi aprovado e processado com sucesso.',
      });

      setShowApproveModal(false);
      setSelectedRequest(null);
      loadRequests();
      loadStats();
    } catch (error: any) {
      console.error('Error approving refund:', error);
      toast({
        title: 'Erro ao processar estorno',
        description: error.message || 'Não foi possível processar o estorno.',
        variant: 'destructive',
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!selectedRequest || !rejectionReason.trim()) return;
    
    setProcessing(true);
    try {
      const { error } = await supabase.functions.invoke('process-refund-request', {
        body: {
          request_id: selectedRequest.id,
          action: 'reject',
          rejection_reason: rejectionReason.trim(),
        },
      });

      if (error) throw error;

      toast({
        title: 'Solicitação rejeitada',
        description: 'A solicitação de estorno foi rejeitada.',
      });

      setShowRejectModal(false);
      setSelectedRequest(null);
      setRejectionReason('');
      loadRequests();
      loadStats();
    } catch (error: any) {
      console.error('Error rejecting refund:', error);
      toast({
        title: 'Erro ao rejeitar',
        description: error.message || 'Não foi possível rejeitar a solicitação.',
        variant: 'destructive',
      });
    } finally {
      setProcessing(false);
    }
  };

  const filteredRequests = requests.filter(req => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      req.customer_name?.toLowerCase().includes(search) ||
      req.company?.name?.toLowerCase().includes(search) ||
      req.order_id.toLowerCase().includes(search)
    );
  });

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold font-display flex items-center gap-2">
              <RotateCcw className="h-6 w-6 text-primary" />
              Solicitações de Estorno
            </h1>
            <p className="text-muted-foreground">
              Gerencie e aprove solicitações de estorno das lojas
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => { loadRequests(); loadStats(); }}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Atualizar
          </Button>
        </div>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setStatusFilter('pending')}>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-yellow-500/10">
                  <Clock className="h-6 w-6 text-yellow-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Pendentes</p>
                  <p className="text-2xl font-bold">{stats.pending}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setStatusFilter('approved')}>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-blue-500/10">
                  <Check className="h-6 w-6 text-blue-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Aprovados</p>
                  <p className="text-2xl font-bold">{stats.approved}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setStatusFilter('completed')}>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-green-500/10">
                  <CheckCircle className="h-6 w-6 text-green-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Concluídos</p>
                  <p className="text-2xl font-bold">{stats.completed}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setStatusFilter('rejected')}>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-red-500/10">
                  <XCircle className="h-6 w-6 text-red-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Rejeitados</p>
                  <p className="text-2xl font-bold">{stats.rejected}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por cliente, loja ou ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="pending">Pendentes</SelectItem>
                  <SelectItem value="approved">Aprovados</SelectItem>
                  <SelectItem value="processing">Processando</SelectItem>
                  <SelectItem value="completed">Concluídos</SelectItem>
                  <SelectItem value="rejected">Rejeitados</SelectItem>
                  <SelectItem value="failed">Falharam</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Solicitações</CardTitle>
            <CardDescription>
              {filteredRequests.length} solicitação(ões) encontrada(s)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3, 4, 5].map((i) => (
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
            ) : filteredRequests.length === 0 ? (
              <div className="text-center py-12">
                <RotateCcw className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-medium text-muted-foreground mb-1">
                  Nenhuma solicitação encontrada
                </h3>
                <p className="text-sm text-muted-foreground">
                  {statusFilter === 'pending' 
                    ? 'Não há solicitações pendentes de aprovação.'
                    : 'Ajuste os filtros para ver outras solicitações.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Loja / Cliente</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Método</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRequests.map((req) => (
                      <TableRow key={req.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium flex items-center gap-1">
                              <Building2 className="h-3 w-3 text-muted-foreground" />
                              {req.company?.name || 'N/A'}
                            </p>
                            <p className="text-sm text-muted-foreground flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {isSubscriptionRefund(req.customer_name) 
                                ? req.customer_name.replace('Assinatura - ', '')
                                : req.customer_name}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          {getRefundTypeBadge(req.customer_name)}
                        </TableCell>
                        <TableCell>
                          <div>
                            <span className="font-semibold">{formatCurrency(req.requested_amount)}</span>
                            {req.requested_amount < req.original_amount && (
                              <p className="text-xs text-muted-foreground">
                                de {formatCurrency(req.original_amount)}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {getPaymentMethodBadge(req.payment_method, req.payment_id)}
                        </TableCell>
                        <TableCell>{getStatusBadge(req.status)}</TableCell>
                        <TableCell>
                          <div>
                            <p className="text-sm">{format(new Date(req.created_at), 'dd/MM/yyyy')}</p>
                            <p className="text-xs text-muted-foreground">
                              {format(new Date(req.created_at), 'HH:mm')}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedRequest(req);
                                setShowDetailsModal(true);
                              }}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            {req.status === 'pending' && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-green-600 hover:text-green-700 hover:bg-green-50"
                                  onClick={() => {
                                    setSelectedRequest(req);
                                    setShowApproveModal(true);
                                  }}
                                >
                                  <Check className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                  onClick={() => {
                                    setSelectedRequest(req);
                                    setShowRejectModal(true);
                                  }}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Details Modal */}
        <Dialog open={showDetailsModal} onOpenChange={setShowDetailsModal}>
          <DialogContent className="sm:max-w-lg">
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
                    <span className="text-sm text-muted-foreground">Valor Solicitado</span>
                    <span className="text-xl font-bold">{formatCurrency(selectedRequest.requested_amount)}</span>
                  </div>
                  {selectedRequest.requested_amount < selectedRequest.original_amount && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Valor Original</span>
                      <span className="font-medium">{formatCurrency(selectedRequest.original_amount)}</span>
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between py-2 border-b">
                    <span className="text-sm text-muted-foreground">Loja</span>
                    <span className="font-medium">{selectedRequest.company?.name || 'N/A'}</span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b">
                    <span className="text-sm text-muted-foreground">Cliente</span>
                    <span className="font-medium">{selectedRequest.customer_name}</span>
                  </div>
                  {selectedRequest.customer_email && (
                    <div className="flex items-center justify-between py-2 border-b">
                      <span className="text-sm text-muted-foreground">Email</span>
                      <span className="font-medium">{selectedRequest.customer_email}</span>
                    </div>
                  )}
                  {selectedRequest.customer_phone && (
                    <div className="flex items-center justify-between py-2 border-b">
                      <span className="text-sm text-muted-foreground">Telefone</span>
                      <span className="font-medium">{selectedRequest.customer_phone}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between py-2 border-b">
                    <span className="text-sm text-muted-foreground">Método</span>
                    {getPaymentMethodBadge(selectedRequest.payment_method, selectedRequest.payment_id)}
                  </div>
                  <div className="flex items-center justify-between py-2 border-b">
                    <span className="text-sm text-muted-foreground">Data da Solicitação</span>
                    <span className="font-medium">
                      {format(new Date(selectedRequest.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </span>
                  </div>
                </div>

                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-sm font-medium mb-1">Motivo do Estorno:</p>
                  <p className="text-sm text-muted-foreground">{selectedRequest.reason}</p>
                </div>

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

                {selectedRequest.refund_id && (
                  <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                    <p className="text-sm font-medium mb-1 text-green-700 dark:text-green-400">ID do Estorno:</p>
                    <code className="text-xs">{selectedRequest.refund_id}</code>
                  </div>
                )}

                {selectedRequest.status === 'pending' && (
                  <div className="flex gap-2 pt-4">
                    <Button
                      variant="destructive"
                      className="flex-1"
                      onClick={() => {
                        setShowDetailsModal(false);
                        setShowRejectModal(true);
                      }}
                    >
                      <X className="h-4 w-4 mr-2" />
                      Rejeitar
                    </Button>
                    <Button
                      className="flex-1"
                      onClick={() => {
                        setShowDetailsModal(false);
                        setShowApproveModal(true);
                      }}
                    >
                      <Check className="h-4 w-4 mr-2" />
                      Aprovar e Processar
                    </Button>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Approve Modal */}
        <Dialog open={showApproveModal} onOpenChange={setShowApproveModal}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-green-600">
                <Check className="h-5 w-5" />
                Aprovar Estorno
              </DialogTitle>
              <DialogDescription>
                {selectedRequest && isSubscriptionRefund(selectedRequest.customer_name)
                  ? 'O estorno de assinatura será processado usando as credenciais da plataforma.'
                  : 'O estorno será processado imediatamente via Mercado Pago da loja.'}
              </DialogDescription>
            </DialogHeader>
            {selectedRequest && (
              <div className="space-y-4">
                <div className="p-4 bg-muted/50 rounded-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Tipo</span>
                    {getRefundTypeBadge(selectedRequest.customer_name)}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Loja</span>
                    <span className="font-medium">{selectedRequest.company?.name}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      {isSubscriptionRefund(selectedRequest.customer_name) ? 'Plano' : 'Cliente'}
                    </span>
                    <span className="font-medium">
                      {isSubscriptionRefund(selectedRequest.customer_name)
                        ? selectedRequest.customer_name.replace('Assinatura - ', '')
                        : selectedRequest.customer_name}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Valor do Estorno</span>
                    <span className="text-xl font-bold text-green-600">{formatCurrency(selectedRequest.requested_amount)}</span>
                  </div>
                </div>

                <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                  <p className="text-sm text-yellow-700 dark:text-yellow-400">
                    <AlertCircle className="h-4 w-4 inline mr-1" />
                    {isSubscriptionRefund(selectedRequest.customer_name)
                      ? 'Esta ação não pode ser desfeita. O valor será devolvido ao lojista.'
                      : 'Esta ação não pode ser desfeita. O valor será devolvido ao cliente.'}
                  </p>
                </div>
              </div>
            )}
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="outline"
                onClick={() => setShowApproveModal(false)}
                disabled={processing}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleApprove}
                disabled={processing}
              >
                {processing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Processando...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Aprovar e Processar
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Reject Modal */}
        <Dialog open={showRejectModal} onOpenChange={setShowRejectModal}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600">
                <X className="h-5 w-5" />
                Rejeitar Estorno
              </DialogTitle>
              <DialogDescription>
                Informe o motivo da rejeição. O lojista será notificado.
              </DialogDescription>
            </DialogHeader>
            {selectedRequest && (
              <div className="space-y-4">
                <div className="p-4 bg-muted/50 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-muted-foreground">Loja</span>
                    <span className="font-medium">{selectedRequest.company?.name}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Valor</span>
                    <span className="font-bold">{formatCurrency(selectedRequest.requested_amount)}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="rejectionReason">Motivo da Rejeição *</Label>
                  <Textarea
                    id="rejectionReason"
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="Explique o motivo da rejeição..."
                    rows={3}
                  />
                </div>
              </div>
            )}
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="outline"
                onClick={() => {
                  setShowRejectModal(false);
                  setRejectionReason('');
                }}
                disabled={processing}
              >
                Cancelar
              </Button>
              <Button
                variant="destructive"
                onClick={handleReject}
                disabled={processing || !rejectionReason.trim()}
              >
                {processing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Rejeitando...
                  </>
                ) : (
                  <>
                    <X className="h-4 w-4 mr-2" />
                    Rejeitar Solicitação
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
