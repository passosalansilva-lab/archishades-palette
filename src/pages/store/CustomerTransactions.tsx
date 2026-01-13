import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Wallet, 
  Search, 
  Filter, 
  Download, 
  RefreshCw,
  Check,
  X,
  Clock,
  AlertCircle,
  Calendar,
  DollarSign,
  User,
  Eye,
  Copy,
  CreditCard,
  QrCode,
  TrendingUp,
  RotateCcw,
  ExternalLink,
} from 'lucide-react';
import { format, subDays, startOfDay } from 'date-fns';
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

interface CustomerTransaction {
  id: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  total: number;
  payment_status: 'paid' | 'pending' | 'failed' | 'refunded';
  payment_method: string | null;
  stripe_payment_intent_id: string | null;
  created_at: string;
  order_code?: string;
}

interface TransactionStats {
  totalAmount: number;
  totalCount: number;
  approvedAmount: number;
  approvedCount: number;
  pendingCount: number;
  failedCount: number;
  refundedCount: number;
  pixAmount: number;
  pixCount: number;
  cardAmount: number;
  cardCount: number;
}

export default function CustomerTransactions() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<CustomerTransaction[]>([]);
  const [stats, setStats] = useState<TransactionStats>({
    totalAmount: 0,
    totalCount: 0,
    approvedAmount: 0,
    approvedCount: 0,
    pendingCount: 0,
    failedCount: 0,
    refundedCount: 0,
    pixAmount: 0,
    pixCount: 0,
    cardAmount: 0,
    cardCount: 0,
  });
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string>('');
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [paymentTypeFilter, setPaymentTypeFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState<string>('30');
  
  // Details modal
  const [selectedTransaction, setSelectedTransaction] = useState<CustomerTransaction | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  
  // Refund dialog
  const [showRefundDialog, setShowRefundDialog] = useState(false);
  const [refundReason, setRefundReason] = useState('');
  const [submittingRefund, setSubmittingRefund] = useState(false);
  const [pendingRefunds, setPendingRefunds] = useState<string[]>([]);

  useEffect(() => {
    if (user?.id) {
      loadCompany();
    }
  }, [user?.id]);

  useEffect(() => {
    if (companyId) {
      loadTransactions();
      loadPendingRefunds();
    }
  }, [companyId, dateRange, statusFilter, paymentTypeFilter]);

  const loadCompany = async () => {
    const { data, error } = await supabase
      .from('companies')
      .select('id, name')
      .eq('owner_id', user?.id)
      .single();

    if (data) {
      setCompanyId(data.id);
      setCompanyName(data.name);
    } else if (error) {
      console.error('Error loading company:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar os dados da empresa.',
        variant: 'destructive',
      });
    }
  };

  const loadPendingRefunds = async () => {
    if (!companyId) return;
    
    // Using 'any' cast as refund_requests table may not be in generated types
    const { data } = await (supabase as any)
      .from('refund_requests')
      .select('order_id')
      .eq('company_id', companyId)
      .eq('status', 'pending');
    
    if (data) {
      setPendingRefunds((data as any[]).map(r => r.order_id).filter(Boolean) as string[]);
    }
  };

  const loadTransactions = async () => {
    if (!companyId) return;
    
    setLoading(true);
    try {
      const days = parseInt(dateRange);
      const startDate = startOfDay(subDays(new Date(), days)).toISOString();
      
      let queryBuilder = supabase
        .from('orders')
        .select('id, customer_name, customer_email, customer_phone, total, payment_status, payment_method, stripe_payment_intent_id, created_at')
        .eq('company_id', companyId)
        .gte('created_at', startDate)
        .order('created_at', { ascending: false });

      // Filter by payment type
      if (paymentTypeFilter === 'pix') {
        queryBuilder = queryBuilder.eq('payment_method', 'pix');
      } else if (paymentTypeFilter === 'card') {
        // Cartão online é identificado por payment_method='online' ou prefixo mp_
        queryBuilder = queryBuilder.or('payment_method.eq.online,stripe_payment_intent_id.like.mp_%');
      } else {
        // For "all", we want both PIX and card (online payments)
        queryBuilder = queryBuilder.or('payment_method.eq.pix,payment_method.eq.online,stripe_payment_intent_id.like.mp_%');
      }

      if (statusFilter !== 'all') {
        queryBuilder = queryBuilder.eq('payment_status', statusFilter as 'paid' | 'pending' | 'failed' | 'refunded');
      }

      const { data, error } = await queryBuilder;

      if (error) throw error;

      const txns = (data || []) as CustomerTransaction[];
      setTransactions(txns);
      
      // Calculate stats - PIX é payment_method='pix', Cartão é 'online' ou mp_
      const pixTxns = txns.filter(t => t.payment_method === 'pix');
      const cardTxns = txns.filter(t => t.payment_method === 'online' || (t.stripe_payment_intent_id?.startsWith('mp_') && t.payment_method !== 'pix'));
      
      setStats({
        totalAmount: txns.reduce((sum, t) => sum + t.total, 0),
        totalCount: txns.length,
        approvedAmount: txns.filter(t => t.payment_status === 'paid').reduce((sum, t) => sum + t.total, 0),
        approvedCount: txns.filter(t => t.payment_status === 'paid').length,
        pendingCount: txns.filter(t => t.payment_status === 'pending').length,
        failedCount: txns.filter(t => t.payment_status === 'failed').length,
        refundedCount: txns.filter(t => t.payment_status === 'refunded').length,
        pixAmount: pixTxns.filter(t => t.payment_status === 'paid').reduce((sum, t) => sum + t.total, 0),
        pixCount: pixTxns.length,
        cardAmount: cardTxns.filter(t => t.payment_status === 'paid').reduce((sum, t) => sum + t.total, 0),
        cardCount: cardTxns.length,
      });
    } catch (error: any) {
      console.error('Error loading transactions:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar as transações.',
        variant: 'destructive',
      });
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
        return (
          <Badge variant="secondary">
            <AlertCircle className="w-3 h-3 mr-1" />
            {status}
          </Badge>
        );
    }
  };

  const getPaymentMethodBadge = (tx: CustomerTransaction) => {
    // PIX: payment_method é 'pix'
    if (tx.payment_method === 'pix') {
      const provider = getPixProvider(tx.stripe_payment_intent_id);
      return (
        <Badge variant="outline" className="gap-1">
          <QrCode className="w-3 h-3" />
          PIX ({provider})
        </Badge>
      );
    }
    // Cartão online: payment_method é 'online' ou tem prefixo mp_
    if (tx.payment_method === 'online' || tx.stripe_payment_intent_id?.startsWith('mp_')) {
      return (
        <Badge variant="outline" className="gap-1">
          <CreditCard className="w-3 h-3" />
          Cartão
        </Badge>
      );
    }
    return (
      <Badge variant="outline">
        {tx.payment_method || 'Outro'}
      </Badge>
    );
  };

  const getPixProvider = (paymentId: string | null): string => {
    if (!paymentId) return 'PIX';
    if (paymentId.startsWith('picpay_')) return 'PicPay';
    if (/^\d+$/.test(paymentId)) return 'MP';
    return 'PIX';
  };

  const filteredTransactions = transactions.filter(tx => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      tx.customer_name?.toLowerCase().includes(search) ||
      tx.customer_email?.toLowerCase().includes(search) ||
      tx.customer_phone?.includes(search) ||
      tx.id.toLowerCase().includes(search) ||
      tx.order_code?.toLowerCase().includes(search)
    );
  });

  const exportTransactions = () => {
    if (filteredTransactions.length === 0) {
      toast({
        title: 'Sem dados',
        description: 'Não há transações para exportar.',
        variant: 'destructive',
      });
      return;
    }

    const csv = [
      ['ID', 'Código', 'Cliente', 'Email', 'Telefone', 'Valor', 'Método', 'Status', 'Data'].join(','),
      ...filteredTransactions.map(tx => [
        tx.id,
        tx.order_code || '',
        `"${tx.customer_name}"`,
        tx.customer_email || '',
        tx.customer_phone || '',
        tx.total.toFixed(2),
        tx.payment_method === 'pix' ? 'PIX' : 'Cartão',
        tx.payment_status,
        format(new Date(tx.created_at), 'dd/MM/yyyy HH:mm'),
      ].join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `transacoes-clientes-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    toast({
      title: 'Exportado!',
      description: 'O arquivo CSV foi baixado com sucesso.',
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: 'Copiado!',
      description: 'ID copiado para a área de transferência.',
    });
  };

  const handleOpenRefundDialog = (tx: CustomerTransaction) => {
    setSelectedTransaction(tx);
    setRefundReason('');
    setShowRefundDialog(true);
  };

  const handleSubmitRefund = async () => {
    if (!selectedTransaction || !companyId || !refundReason.trim()) {
      toast({
        title: 'Erro',
        description: 'Preencha o motivo do estorno.',
        variant: 'destructive',
      });
      return;
    }

    if (!user?.id) {
      toast({
        title: 'Sessão expirada',
        description: 'Faça login novamente para solicitar estorno.',
        variant: 'destructive',
      });
      return;
    }

    setSubmittingRefund(true);
    try {
      // Determinar o provider baseado no payment_intent
      const paymentId = selectedTransaction.stripe_payment_intent_id;
      let paymentProvider = 'mercadopago';
      if (paymentId?.startsWith('picpay_')) {
        paymentProvider = 'picpay';
      }

      const { error } = await (supabase as any)
        .from('refund_requests')
        .insert({
          company_id: companyId,
          order_id: selectedTransaction.id,
          original_amount: selectedTransaction.total,
          requested_amount: selectedTransaction.total,
          requested_by: user?.id,
          reason: refundReason.trim(),
          customer_name: selectedTransaction.customer_name,
          payment_method: selectedTransaction.payment_method === 'pix' ? 'pix' : 'card',
          payment_id: paymentId,
          payment_provider: paymentProvider,
          status: 'pending',
        });

      if (error) throw error;

      toast({
        title: 'Solicitação enviada!',
        description: 'Sua solicitação de estorno foi enviada para análise.',
      });

      setShowRefundDialog(false);
      setPendingRefunds([...pendingRefunds, selectedTransaction.id]);
    } catch (error: any) {
      console.error('Error submitting refund:', error);
      toast({
        title: 'Erro',
        description: error.message || 'Não foi possível enviar a solicitação.',
        variant: 'destructive',
      });
    } finally {
      setSubmittingRefund(false);
    }
  };

  const canRequestRefund = (tx: CustomerTransaction): boolean => {
    // Só pode solicitar estorno se:
    // - Status é 'paid' (pago)
    // - Não há solicitação pendente para este pedido
    return tx.payment_status === 'paid' && !pendingRefunds.includes(tx.id);
  };

  const hasPendingRefund = (txId: string): boolean => {
    return pendingRefunds.includes(txId);
  };

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold font-display flex items-center gap-2">
              <Wallet className="h-6 w-6 text-primary" />
              Transações de Clientes
            </h1>
            <p className="text-muted-foreground">
              Pagamentos online (PIX e Cartão) recebidos dos seus clientes
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => { loadTransactions(); loadPendingRefunds(); }}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Atualizar
            </Button>
            <Button variant="outline" size="sm" onClick={exportTransactions}>
              <Download className="h-4 w-4 mr-2" />
              Exportar
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-primary/10">
                  <DollarSign className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Recebido</p>
                  <p className="text-2xl font-bold">{formatCurrency(stats.approvedAmount)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-green-500/10">
                  <TrendingUp className="h-6 w-6 text-green-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Transações</p>
                  <p className="text-2xl font-bold">{stats.approvedCount}</p>
                  <p className="text-xs text-muted-foreground">
                    {stats.pendingCount} pendentes • {stats.refundedCount} estornadas
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-blue-500/10">
                  <QrCode className="h-6 w-6 text-blue-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">PIX</p>
                  <p className="text-2xl font-bold">{formatCurrency(stats.pixAmount)}</p>
                  <p className="text-xs text-muted-foreground">{stats.pixCount} transações</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-purple-500/10">
                  <CreditCard className="h-6 w-6 text-purple-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Cartão</p>
                  <p className="text-2xl font-bold">{formatCurrency(stats.cardAmount)}</p>
                  <p className="text-xs text-muted-foreground">{stats.cardCount} transações</p>
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
                  placeholder="Buscar por nome, email, telefone, código ou ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={paymentTypeFilter} onValueChange={setPaymentTypeFilter}>
                <SelectTrigger className="w-full sm:w-[160px]">
                  <Wallet className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Método" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="pix">
                    <span className="flex items-center gap-2">
                      <QrCode className="h-3 w-3" /> PIX
                    </span>
                  </SelectItem>
                  <SelectItem value="card">
                    <span className="flex items-center gap-2">
                      <CreditCard className="h-3 w-3" /> Cartão
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[160px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="paid">Pagos</SelectItem>
                  <SelectItem value="pending">Pendentes</SelectItem>
                  <SelectItem value="failed">Falhos</SelectItem>
                  <SelectItem value="refunded">Estornados</SelectItem>
                </SelectContent>
              </Select>
              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger className="w-full sm:w-[160px]">
                  <Calendar className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Período" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Últimos 7 dias</SelectItem>
                  <SelectItem value="30">Últimos 30 dias</SelectItem>
                  <SelectItem value="60">Últimos 60 dias</SelectItem>
                  <SelectItem value="90">Últimos 90 dias</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Transactions Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Histórico de Transações</CardTitle>
            <CardDescription>
              {filteredTransactions.length} transação(ões) encontrada(s)
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
                    <Skeleton className="h-6 w-24" />
                  </div>
                ))}
              </div>
            ) : filteredTransactions.length === 0 ? (
              <div className="text-center py-12">
                <Wallet className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground">Nenhuma transação encontrada</p>
                <p className="text-sm text-muted-foreground/70 mt-1">
                  Os pagamentos online dos seus clientes aparecerão aqui
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Método</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTransactions.map((tx) => (
                      <TableRow key={tx.id} className="group">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                              <User className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                              <p className="font-medium">{tx.customer_name}</p>
                              <p className="text-sm text-muted-foreground">
                                {tx.customer_email || tx.customer_phone || tx.order_code || '-'}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{getPaymentMethodBadge(tx)}</TableCell>
                        <TableCell className="font-medium">
                          {formatCurrency(tx.total)}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            {getStatusBadge(tx.payment_status)}
                            {hasPendingRefund(tx.id) && (
                              <Badge variant="outline" className="text-xs w-fit">
                                <Clock className="w-2 h-2 mr-1" />
                                Estorno solicitado
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="text-sm">
                              {format(new Date(tx.created_at), 'dd/MM/yyyy', { locale: ptBR })}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(tx.created_at), 'HH:mm', { locale: ptBR })}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedTransaction(tx);
                                setShowDetails(true);
                              }}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            {canRequestRefund(tx) && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                onClick={() => handleOpenRefundDialog(tx)}
                              >
                                <RotateCcw className="h-4 w-4" />
                              </Button>
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
      </div>

      {/* Details Modal */}
      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-primary" />
              Detalhes da Transação
            </DialogTitle>
          </DialogHeader>
          {selectedTransaction && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Cliente</p>
                  <p className="font-medium">{selectedTransaction.customer_name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Valor</p>
                  <p className="text-xl font-bold text-primary">
                    {formatCurrency(selectedTransaction.total)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <div className="mt-1">{getStatusBadge(selectedTransaction.payment_status)}</div>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Método</p>
                  <div className="mt-1">{getPaymentMethodBadge(selectedTransaction)}</div>
                </div>
              </div>

              {selectedTransaction.customer_email && (
                <div>
                  <p className="text-sm text-muted-foreground">Email</p>
                  <p className="font-medium">{selectedTransaction.customer_email}</p>
                </div>
              )}

              {selectedTransaction.customer_phone && (
                <div>
                  <p className="text-sm text-muted-foreground">Telefone</p>
                  <p className="font-medium">{selectedTransaction.customer_phone}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Data</p>
                  <p className="font-medium">
                    {format(new Date(selectedTransaction.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </p>
                </div>
                {selectedTransaction.order_code && (
                  <div>
                    <p className="text-sm text-muted-foreground">Código do Pedido</p>
                    <p className="font-medium">{selectedTransaction.order_code}</p>
                  </div>
                )}
              </div>

              {selectedTransaction.stripe_payment_intent_id && (
                <div>
                  <p className="text-sm text-muted-foreground">ID do Pagamento</p>
                  <div className="flex items-center gap-2">
                    <p className="font-mono text-sm truncate">{selectedTransaction.stripe_payment_intent_id}</p>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => copyToClipboard(selectedTransaction.stripe_payment_intent_id || '')}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              )}

              <div className="pt-4 border-t flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => navigate(`/dashboard/orders`)}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Ver Pedido
                </Button>
                {canRequestRefund(selectedTransaction) && (
                  <Button
                    variant="destructive"
                    className="flex-1"
                    onClick={() => {
                      setShowDetails(false);
                      handleOpenRefundDialog(selectedTransaction);
                    }}
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Solicitar Estorno
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Refund Dialog */}
      <Dialog open={showRefundDialog} onOpenChange={setShowRefundDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-destructive" />
              Solicitar Estorno
            </DialogTitle>
            <DialogDescription>
              Sua solicitação será analisada pela equipe Cardpon.
            </DialogDescription>
          </DialogHeader>
          {selectedTransaction && (
            <div className="space-y-4">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Você está solicitando o estorno de <strong>{formatCurrency(selectedTransaction.total)}</strong> referente 
                  ao pagamento de <strong>{selectedTransaction.customer_name}</strong>.
                </AlertDescription>
              </Alert>

              <div className="space-y-2">
                <Label htmlFor="refund-reason">Motivo do estorno *</Label>
                <Textarea
                  id="refund-reason"
                  placeholder="Descreva o motivo do estorno (ex: pedido cancelado, erro no valor, cliente solicitou...)"
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  rows={3}
                />
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setShowRefundDialog(false)}
                  disabled={submittingRefund}
                >
                  Cancelar
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleSubmitRefund}
                  disabled={submittingRefund || !refundReason.trim()}
                >
                  {submittingRefund ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
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
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
