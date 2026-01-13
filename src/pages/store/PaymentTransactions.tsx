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
  Loader2
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

interface Transaction {
  id: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  total: number;
  payment_status: 'paid' | 'pending' | 'failed' | 'refunded';
  payment_method: string;
  stripe_payment_intent_id: string | null;
  created_at: string;
}

interface TransactionStats {
  totalAmount: number;
  totalCount: number;
  approvedAmount: number;
  approvedCount: number;
  pendingCount: number;
  failedCount: number;
  pixAmount: number;
  pixCount: number;
  cardAmount: number;
  cardCount: number;
}

export default function PaymentTransactions() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [stats, setStats] = useState<TransactionStats>({
    totalAmount: 0,
    totalCount: 0,
    approvedAmount: 0,
    approvedCount: 0,
    pendingCount: 0,
    failedCount: 0,
    pixAmount: 0,
    pixCount: 0,
    cardAmount: 0,
    cardCount: 0,
  });
  const [companyId, setCompanyId] = useState<string | null>(null);
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [paymentTypeFilter, setPaymentTypeFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState<string>('7');
  
  // Details modal
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  
  // Refund modal
  const [showRefundDialog, setShowRefundDialog] = useState(false);
  const [refundAmount, setRefundAmount] = useState('');
  const [refunding, setRefunding] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    if (user?.id) {
      loadCompany();
    }
  }, [user?.id]);

  useEffect(() => {
    if (companyId) {
      loadTransactions();
    }
  }, [companyId, dateRange, statusFilter, paymentTypeFilter]);

  const loadCompany = async () => {
    const { data, error } = await supabase
      .from('companies')
      .select('id')
      .eq('owner_id', user?.id)
      .single();

    if (data) {
      setCompanyId(data.id);
    } else if (error) {
      console.error('Error loading company:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar os dados da empresa.',
        variant: 'destructive',
      });
    }
  };

  const loadTransactions = async () => {
    if (!companyId) return;
    
    setLoading(true);
    try {
      const days = parseInt(dateRange);
      const startDate = startOfDay(subDays(new Date(), days)).toISOString();
      
      let query = supabase
        .from('orders')
        .select('id, customer_name, customer_email, customer_phone, total, payment_status, payment_method, stripe_payment_intent_id, created_at')
        .eq('company_id', companyId)
        .gte('created_at', startDate)
        .order('created_at', { ascending: false });

      // Filter by payment type
      if (paymentTypeFilter === 'pix') {
        query = query.eq('payment_method', 'pix');
      } else if (paymentTypeFilter === 'card') {
        query = query.like('stripe_payment_intent_id', 'mp_%');
      } else {
        // For "all", we want both PIX and card (online payments)
        query = query.or('payment_method.eq.pix,stripe_payment_intent_id.like.mp_%');
      }

      if (statusFilter !== 'all') {
        query = query.eq('payment_status', statusFilter as 'paid' | 'pending' | 'failed' | 'refunded');
      }

      const { data, error } = await query;

      if (error) throw error;

      setTransactions(data || []);
      
      // Calculate stats
      const txns = data || [];
      const pixTxns = txns.filter(t => t.payment_method === 'pix');
      const cardTxns = txns.filter(t => t.stripe_payment_intent_id?.startsWith('mp_'));
      
      setStats({
        totalAmount: txns.reduce((sum, t) => sum + t.total, 0),
        totalCount: txns.length,
        approvedAmount: txns.filter(t => t.payment_status === 'paid').reduce((sum, t) => sum + t.total, 0),
        approvedCount: txns.filter(t => t.payment_status === 'paid').length,
        pendingCount: txns.filter(t => t.payment_status === 'pending').length,
        failedCount: txns.filter(t => t.payment_status === 'failed').length,
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
            Aprovado
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
            Recusado
          </Badge>
        );
      case 'refunded':
        return (
          <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
            <AlertCircle className="w-3 h-3 mr-1" />
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

  const getPaymentMethodBadge = (tx: Transaction) => {
    if (tx.payment_method === 'pix') {
      const provider = getPixProvider(tx.stripe_payment_intent_id);
      return (
        <Badge variant="outline" className="gap-1">
          <QrCode className="w-3 h-3" />
          PIX ({provider})
        </Badge>
      );
    }
    if (tx.stripe_payment_intent_id?.startsWith('mp_')) {
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
      tx.id.toLowerCase().includes(search)
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
      ['ID', 'Cliente', 'Email', 'Telefone', 'Valor', 'Método', 'Status', 'Data'].join(','),
      ...filteredTransactions.map(tx => [
        tx.id,
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
    link.download = `transacoes-${format(new Date(), 'yyyy-MM-dd')}.csv`;
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

  const canRefund = (tx: Transaction): boolean => {
    // Can only refund approved payments with a payment ID
    if (tx.payment_status !== 'paid') return false;
    if (!tx.stripe_payment_intent_id) return false;
    // Only MercadoPago payments can be refunded (numeric IDs for PIX, mp_ prefix for cards)
    const paymentId = tx.stripe_payment_intent_id;
    return /^\d+$/.test(paymentId) || paymentId.startsWith('mp_');
  };

  const handleOpenRefundDialog = (tx: Transaction) => {
    setSelectedTransaction(tx);
    setRefundAmount(tx.total.toFixed(2));
    setShowRefundDialog(true);
  };

  const handleRefund = async () => {
    if (!selectedTransaction || !refundAmount) return;

    const amount = parseFloat(refundAmount.replace(',', '.'));
    if (isNaN(amount) || amount <= 0 || amount > selectedTransaction.total) {
      toast({
        title: 'Valor inválido',
        description: 'O valor do estorno deve ser maior que zero e não pode exceder o valor da transação.',
        variant: 'destructive',
      });
      return;
    }

    setRefunding(true);
    try {
      const { data, error } = await supabase.functions.invoke('refund-mercadopago-payment', {
        body: {
          payment_id: selectedTransaction.stripe_payment_intent_id,
          amount: amount,
          order_id: selectedTransaction.id,
          reason: 'Estorno solicitado pelo lojista',
        },
      });

      if (error) throw error;

      // Reload transactions
      await loadTransactions();
      
      toast({
        title: 'Estorno realizado!',
        description: `Estorno de ${formatCurrency(amount)} processado com sucesso.`,
      });
      
      setShowRefundDialog(false);
      setShowDetails(false);
      setSelectedTransaction(null);
      setRefundAmount('');
    } catch (error: any) {
      console.error('Refund error:', error);
      toast({
        title: 'Erro ao processar estorno',
        description: error.message || 'Não foi possível processar o estorno. Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setRefunding(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold font-display flex items-center gap-2">
              <Wallet className="h-6 w-6 text-primary" />
              Transações Online
            </h1>
            <p className="text-muted-foreground">
              Acompanhe todos os pagamentos online (PIX e Cartão)
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={loadTransactions}>
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
                    {stats.pendingCount} pendentes • {stats.failedCount} recusadas
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
                  placeholder="Buscar por nome, email, telefone ou ID..."
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
                  <SelectItem value="paid">Aprovados</SelectItem>
                  <SelectItem value="pending">Pendentes</SelectItem>
                  <SelectItem value="failed">Recusados</SelectItem>
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
                <h3 className="text-lg font-medium text-muted-foreground mb-1">
                  Nenhuma transação encontrada
                </h3>
                <p className="text-sm text-muted-foreground">
                  Ajuste os filtros ou aguarde novos pagamentos online
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Método</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTransactions.map((tx) => (
                      <TableRow key={tx.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                              <User className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                              <p className="font-medium">{tx.customer_name}</p>
                              <p className="text-sm text-muted-foreground">
                                {tx.customer_email || tx.customer_phone || '-'}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="font-semibold">{formatCurrency(tx.total)}</span>
                        </TableCell>
                        <TableCell>{getPaymentMethodBadge(tx)}</TableCell>
                        <TableCell>{getStatusBadge(tx.payment_status)}</TableCell>
                        <TableCell>
                          <div>
                            <p className="text-sm">{format(new Date(tx.created_at), 'dd/MM/yyyy')}</p>
                            <p className="text-xs text-muted-foreground">
                              {format(new Date(tx.created_at), 'HH:mm')}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedTransaction(tx);
                              setShowDetails(true);
                            }}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            Ver
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Transaction Details Modal */}
        <Dialog open={showDetails} onOpenChange={setShowDetails}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5" />
                Detalhes da Transação
              </DialogTitle>
            </DialogHeader>
            {selectedTransaction && (
              <div className="space-y-4">
                <div className="p-4 bg-muted/50 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-muted-foreground">Valor</span>
                    <span className="text-xl font-bold">{formatCurrency(selectedTransaction.total)}</span>
                  </div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-muted-foreground">Método</span>
                    {getPaymentMethodBadge(selectedTransaction)}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Status</span>
                    {getStatusBadge(selectedTransaction.payment_status)}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between py-2 border-b">
                    <span className="text-sm text-muted-foreground">Cliente</span>
                    <span className="font-medium">{selectedTransaction.customer_name}</span>
                  </div>
                  
                  {selectedTransaction.customer_email && (
                    <div className="flex items-center justify-between py-2 border-b">
                      <span className="text-sm text-muted-foreground">Email</span>
                      <span className="font-medium">{selectedTransaction.customer_email}</span>
                    </div>
                  )}
                  
                  {selectedTransaction.customer_phone && (
                    <div className="flex items-center justify-between py-2 border-b">
                      <span className="text-sm text-muted-foreground">Telefone</span>
                      <span className="font-medium">{selectedTransaction.customer_phone}</span>
                    </div>
                  )}
                  
                  <div className="flex items-center justify-between py-2 border-b">
                    <span className="text-sm text-muted-foreground">Data</span>
                    <span className="font-medium">
                      {format(new Date(selectedTransaction.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </span>
                  </div>
                  
                  <div className="flex items-center justify-between py-2">
                    <span className="text-sm text-muted-foreground">ID do Pedido</span>
                    <div className="flex items-center gap-2">
                      <code className="text-xs bg-muted px-2 py-1 rounded">
                        {selectedTransaction.id.slice(0, 8)}...
                      </code>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(selectedTransaction.id)}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  
                  {selectedTransaction.stripe_payment_intent_id && (
                    <div className="flex items-center justify-between py-2">
                      <span className="text-sm text-muted-foreground">ID Pagamento</span>
                      <div className="flex items-center gap-2">
                        <code className="text-xs bg-muted px-2 py-1 rounded max-w-[150px] truncate">
                          {selectedTransaction.stripe_payment_intent_id}
                        </code>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(selectedTransaction.stripe_payment_intent_id!)}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Ações de Estorno */}
                <div className="flex flex-col gap-2 pt-4 border-t">
                  {canRefund(selectedTransaction) ? (
                    <Button
                      variant="destructive"
                      className="w-full"
                      onClick={() => handleOpenRefundDialog(selectedTransaction)}
                    >
                      <RotateCcw className="h-4 w-4 mr-2" />
                      Solicitar Estorno
                    </Button>
                  ) : selectedTransaction.payment_status === 'paid' ? (
                    <div className="p-3 bg-muted/50 rounded-lg text-sm text-muted-foreground">
                      <AlertCircle className="h-4 w-4 inline mr-1" />
                      Estorno não disponível para este método de pagamento.
                    </div>
                  ) : selectedTransaction.payment_status === 'refunded' ? (
                    <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg text-sm text-purple-700 dark:text-purple-400">
                      <RotateCcw className="h-4 w-4 inline mr-1" />
                      Esta transação já foi estornada.
                    </div>
                  ) : null}
                  
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => navigate(`/dashboard/orders`)}
                    >
                      Ver Pedido
                    </Button>
                    <Button
                      variant="default"
                      className="flex-1"
                      onClick={() => setShowDetails(false)}
                    >
                      Fechar
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Refund Confirmation Dialog */}
        <Dialog open={showRefundDialog} onOpenChange={setShowRefundDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <RotateCcw className="h-5 w-5 text-destructive" />
                Solicitar Estorno
              </DialogTitle>
              <DialogDescription>
                Esta ação irá devolver o valor ao cliente. O estorno será processado pelo Mercado Pago.
              </DialogDescription>
            </DialogHeader>
            {selectedTransaction && (
              <div className="space-y-4">
                <div className="p-4 bg-muted/50 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-muted-foreground">Cliente</span>
                    <span className="font-medium">{selectedTransaction.customer_name}</span>
                  </div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-muted-foreground">Valor Original</span>
                    <span className="font-bold">{formatCurrency(selectedTransaction.total)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Método</span>
                    {getPaymentMethodBadge(selectedTransaction)}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="refundAmount">Valor do Estorno (R$)</Label>
                  <Input
                    id="refundAmount"
                    type="text"
                    value={refundAmount}
                    onChange={(e) => setRefundAmount(e.target.value)}
                    placeholder="0.00"
                  />
                  <p className="text-xs text-muted-foreground">
                    Máximo: {formatCurrency(selectedTransaction.total)}. Para estorno parcial, informe um valor menor.
                  </p>
                </div>

                <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                  <p className="text-sm text-yellow-700 dark:text-yellow-400">
                    <AlertCircle className="h-4 w-4 inline mr-1" />
                    Atenção: Esta ação não pode ser desfeita. O valor será devolvido ao cliente.
                  </p>
                </div>
              </div>
            )}
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="outline"
                onClick={() => {
                  setShowRefundDialog(false);
                  setRefundAmount('');
                }}
                disabled={refunding}
              >
                Cancelar
              </Button>
              <Button
                variant="destructive"
                onClick={handleRefund}
                disabled={refunding || !refundAmount}
              >
                {refunding ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Processando...
                  </>
                ) : (
                  <>
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Confirmar Estorno
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
