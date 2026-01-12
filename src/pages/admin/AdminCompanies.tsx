import { useState, useEffect } from 'react';
import { 
  Search, 
  Filter, 
  MoreVertical, 
  Check, 
  X, 
  Pause, 
  Eye,
  Building2,
  Users,
  ShoppingBag,
  TrendingUp,
  ExternalLink,
  Loader2,
  RefreshCw,
  CreditCard,
  Trash2,
  AlertTriangle,
  Gift,
  Save
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { CurrencyInput } from '@/components/ui/currency-input';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Link } from 'react-router-dom';

type CompanyStatus = 'pending' | 'approved' | 'suspended';
type ActionType = 'approve' | 'suspend' | 'delete' | 'cancel_subscription' | null;

interface Company {
  id: string;
  name: string;
  slug: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  status: CompanyStatus;
  is_open: boolean;
  created_at: string;
  owner_id: string;
  logo_url: string | null;
  subscription_plan: string | null;
  subscription_status: string | null;
  subscription_end_date: string | null;
  monthly_revenue: number | null;
  revenue_limit_bonus: number | null;
}

interface SubscriptionPlan {
  key: string;
  name: string;
  revenue_limit: number | null;
}

interface Stats {
  total: number;
  pending: number;
  approved: number;
  suspended: number;
}

export default function AdminCompanies() {
  const { toast } = useToast();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, pending: 0, approved: 0, suspended: 0 });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  
  // Action modal state
  const [actionModal, setActionModal] = useState<{
    open: boolean;
    company: Company | null;
    action: ActionType;
  }>({ open: false, company: null, action: null });
  const [actionLoading, setActionLoading] = useState(false);
  const [deleteToken, setDeleteToken] = useState('');
  const [deleteTokenError, setDeleteTokenError] = useState('');

  // Detail modal state
  const [detailModal, setDetailModal] = useState<{
    open: boolean;
    company: Company | null;
  }>({ open: false, company: null });

  // Bonus edit state
  const [bonusEditing, setBonusEditing] = useState<{ companyId: string; value: number } | null>(null);
  const [savingBonus, setSavingBonus] = useState(false);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);

  useEffect(() => {
    loadCompanies();
    loadPlans();
  }, []);

  const loadCompanies = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Map and provide default for revenue_limit_bonus if column doesn't exist yet
      const typedData = (data || []).map(d => ({
        ...d,
        revenue_limit_bonus: (d as any).revenue_limit_bonus ?? 0
      })) as Company[];
      setCompanies(typedData);

      // Calculate stats
      setStats({
        total: typedData.length,
        pending: typedData.filter((c) => c.status === 'pending').length,
        approved: typedData.filter((c) => c.status === 'approved').length,
        suspended: typedData.filter((c) => c.status === 'suspended').length,
      });
    } catch (error: any) {
      console.error('Error loading companies:', error);
      toast({
        title: 'Erro ao carregar empresas',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const loadPlans = async () => {
    try {
      const { data } = await supabase
        .from('subscription_plans')
        .select('key, name, revenue_limit')
        .eq('is_active', true)
        .order('price', { ascending: true });
      
      setPlans(data || []);
    } catch (error) {
      console.error('Error loading plans:', error);
    }
  };

  const handleSaveBonus = async () => {
    if (!bonusEditing) return;
    
    setSavingBonus(true);
    try {
      // Get current company data to find previous bonus and owner
      const company = companies.find(c => c.id === bonusEditing.companyId);
      const previousBonus = (company as any)?.revenue_limit_bonus || 0;
      
      const { error } = await supabase
        .from('companies')
        .update({ revenue_limit_bonus: bonusEditing.value } as any)
        .eq('id', bonusEditing.companyId);

      if (error) throw error;

      // Send email notification if bonus changed (increase, decrease or removal)
      if (company && bonusEditing.value !== previousBonus) {
        const planLimit = getPlanLimit(company.subscription_plan);
        const newTotalLimit = planLimit + bonusEditing.value;
        
        try {
          const { error: emailError } = await supabase.functions.invoke('send-bonus-email', {
            body: {
              companyId: bonusEditing.companyId,
              ownerId: company.owner_id,
              bonusAmount: bonusEditing.value,
              previousBonus: previousBonus,
              newTotalLimit: newTotalLimit,
            },
          });
          
          if (emailError) {
            console.error('Error sending bonus email:', emailError);

            // Observabilidade (apenas para super_admin) — não trava o fluxo
            try {
              await supabase.from('integration_events' as any).insert({
                provider: 'resend',
                source: 'send-bonus-email',
                level: 'error',
                message: emailError.message || 'Falha ao chamar edge function send-bonus-email',
                company_id: bonusEditing.companyId,
                user_id: company.owner_id,
                details: {
                  name: (emailError as any).name,
                  context: (emailError as any).context,
                },
              });
            } catch (logErr) {
              console.warn('Falha ao registrar observabilidade:', logErr);
            }

            toast({
              title: 'Email não enviado',
              description: 'Não foi possível enviar o email de bônus (ver Admin → Logs).',
              variant: 'destructive',
            });
          }
        } catch (emailError) {
          console.error('Error sending bonus email:', emailError);

          try {
            await supabase.from('integration_events' as any).insert({
              provider: 'resend',
              source: 'send-bonus-email',
              level: 'error',
              message: (emailError as any)?.message || 'Erro ao chamar edge function send-bonus-email',
              company_id: bonusEditing.companyId,
              user_id: company.owner_id,
              details: {
                name: (emailError as any)?.name,
              },
            });
          } catch (logErr) {
            console.warn('Falha ao registrar observabilidade:', logErr);
          }

          // Don't fail the whole operation if email fails
        }
      }

      toast({
        title: 'Bônus atualizado',
        description: 'O bônus de limite foi salvo com sucesso',
      });

      // Update local state
      setCompanies(prev => prev.map(c => 
        c.id === bonusEditing.companyId 
          ? { ...c, revenue_limit_bonus: bonusEditing.value }
          : c
      ));
      
      // Update detail modal if open
      if (detailModal.company?.id === bonusEditing.companyId) {
        setDetailModal(prev => ({
          ...prev,
          company: prev.company ? { ...prev.company, revenue_limit_bonus: bonusEditing.value } : null
        }));
      }
      
      setBonusEditing(null);
    } catch (error: any) {
      toast({
        title: 'Erro ao salvar bônus',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setSavingBonus(false);
    }
  };

  const getPlanLimit = (planKey: string | null): number => {
    if (!planKey) return 2000; // Default free plan limit
    const plan = plans.find(p => p.key === planKey);
    return plan?.revenue_limit ?? 2000;
  };

  const formatCurrencyValue = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const handleAction = async () => {
    if (!actionModal.company || !actionModal.action) return;

    setActionLoading(true);
    try {
      if (actionModal.action === 'cancel_subscription') {
        // Cancel subscription - reset to free plan
        const { error } = await supabase
          .from('companies')
          .update({ 
            subscription_plan: null,
            subscription_status: 'free',
            subscription_end_date: null,
          })
          .eq('id', actionModal.company.id);

        if (error) throw error;

        // Create notification for the company owner
        await supabase
          .from('notifications')
          .insert({
            user_id: actionModal.company.owner_id,
            title: 'Assinatura cancelada',
            message: 'Sua assinatura foi cancelada pelo administrador. Você voltou para o plano gratuito.',
            type: 'warning',
            data: {
              type: 'subscription_cancelled',
              reason: 'admin_cancelled',
              companyId: actionModal.company.id,
            },
          });

        toast({
          title: 'Sucesso',
          description: 'Assinatura cancelada com sucesso',
        });

        loadCompanies();
      } else if (actionModal.action === 'delete') {
        // Verificar token do super admin antes de deletar
        if (!deleteToken.trim()) {
          setDeleteTokenError('Digite o token de super admin para confirmar a exclusão');
          setActionLoading(false);
          return;
        }

        // Chamar edge function para deletar empresa e usuário owner
        const { data, error } = await supabase.functions.invoke('delete-company', {
          body: {
            companyId: actionModal.company.id,
            adminToken: deleteToken,
          },
        });

        if (error) {
          setDeleteTokenError(error.message || 'Erro ao deletar empresa');
          setActionLoading(false);
          return;
        }

        if (data?.error) {
          if (data.error === 'Token incorreto') {
            setDeleteTokenError('Token incorreto. Verifique e tente novamente.');
          } else {
            setDeleteTokenError(data.error);
          }
          setActionLoading(false);
          return;
        }

        toast({
          title: 'Empresa excluída',
          description: data?.warning 
            ? `A empresa "${actionModal.company.name}" foi excluída, mas houve um problema ao remover o usuário.`
            : `A empresa "${actionModal.company.name}", todos os dados relacionados e o usuário owner foram excluídos permanentemente.`,
        });

        setDeleteToken('');
        setDeleteTokenError('');
        setActionModal({ open: false, company: null, action: null });
        loadCompanies();
      } else {
        let newStatus: CompanyStatus | undefined;

        switch (actionModal.action) {
          case 'approve':
            newStatus = 'approved';
            break;
          case 'suspend':
            newStatus = 'suspended';
            break;
        }

        if (newStatus) {
          const { error } = await supabase
            .from('companies')
            .update({ status: newStatus })
            .eq('id', actionModal.company.id);

          if (error) throw error;

          // Se for aprovação, enviar email de parabéns
          if (actionModal.action === 'approve') {
            try {
              // Buscar email do owner
        await supabase.functions.invoke('send-company-approval-email', {
            body: {
              companyId: actionModal.company.id,
              ownerId: actionModal.company.owner_id,
            },
          });

            } catch (emailError) {
              console.error('Error sending approval email:', emailError);
              // Não bloqueia a aprovação se o email falhar
            }
          }

          // Se for suspensão, enviar email de notificação
          if (actionModal.action === 'suspend') {
            try {
              await supabase.functions.invoke('send-company-suspension-email', {
                body: {
                  companyId: actionModal.company.id,
                  ownerId: actionModal.company.owner_id,
                  reason: 'Suspensão realizada pelo administrador do sistema.',
                },
              });
            } catch (emailError) {
              console.error('Error sending suspension email:', emailError);
              // Não bloqueia a suspensão se o email falhar
            }
          }

          toast({
            title: 'Sucesso',
            description: `Empresa ${actionModal.action === 'approve' ? 'aprovada' : 'suspensa'} com sucesso`,
          });

          loadCompanies();
        }
      }
    } catch (error: any) {
      console.error('Error updating company:', error);
      toast({
        title: 'Erro',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setActionLoading(false);
      setActionModal({ open: false, company: null, action: null });
    }
  };

  // Filter companies
  const filteredCompanies = companies.filter((company) => {
    const matchesSearch =
      company.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      company.slug.toLowerCase().includes(searchQuery.toLowerCase()) ||
      company.email?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === 'all' || company.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status: CompanyStatus) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30">Pendente</Badge>;
      case 'approved':
        return <Badge variant="outline" className="bg-success/10 text-success border-success/30">Aprovada</Badge>;
      case 'suspended':
        return <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">Suspensa</Badge>;
    }
  };

  const getSubscriptionBadge = (company: Company) => {
    const planKey = company.subscription_plan || 'free';
    const status = company.subscription_status || 'free';
    const endDate = company.subscription_end_date ? new Date(company.subscription_end_date) : null;
    const now = new Date();
    const isExpired = endDate ? endDate < now : false;

    if (!company.subscription_plan || planKey === 'free') {
      return (
        <Badge variant="outline" className="bg-muted text-muted-foreground border-transparent">
          Plano gratuito
        </Badge>
      );
    }

    if (isExpired) {
      return (
        <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">
          {planKey} - vencido
        </Badge>
      );
    }

    if (status === 'active') {
      return (
        <Badge variant="outline" className="bg-success/10 text-success border-success/30">
          {planKey} - ativo
        </Badge>
      );
    }

    return (
      <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30">
        {planKey} - {status}
      </Badge>
    );
  };

  const formatCurrency = (value: number | null | undefined) => {
    const numeric = Number(value || 0);
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(numeric);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold font-display">Gerenciar Empresas</h1>
            <p className="text-muted-foreground">Aprove e gerencie as empresas cadastradas</p>
          </div>
          <Button onClick={loadCompanies} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Atualizar
          </Button>
        </div>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-display">{stats.total}</div>
            </CardContent>
          </Card>
          <Card className="border-warning/30">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-warning">Pendentes</CardTitle>
              <div className="h-8 w-8 rounded-full bg-warning/10 flex items-center justify-center">
                <Pause className="h-4 w-4 text-warning" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-display">{stats.pending}</div>
            </CardContent>
          </Card>
          <Card className="border-success/30">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-success">Aprovadas</CardTitle>
              <div className="h-8 w-8 rounded-full bg-success/10 flex items-center justify-center">
                <Check className="h-4 w-4 text-success" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-display">{stats.approved}</div>
            </CardContent>
          </Card>
          <Card className="border-destructive/30">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-destructive">Suspensas</CardTitle>
              <div className="h-8 w-8 rounded-full bg-destructive/10 flex items-center justify-center">
                <X className="h-4 w-4 text-destructive" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-display">{stats.suspended}</div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome, slug ou email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-48">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Filtrar por status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os status</SelectItem>
                  <SelectItem value="pending">Pendentes</SelectItem>
                  <SelectItem value="approved">Aprovadas</SelectItem>
                  <SelectItem value="suspended">Suspensas</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Companies Table */}
        <Card>
          <CardContent className="pt-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredCompanies.length === 0 ? (
              <div className="text-center py-12">
                <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">Nenhuma empresa encontrada</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Slug</TableHead>
                    <TableHead>Localização</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Assinatura</TableHead>
                    <TableHead>Faturamento mês</TableHead>
                    <TableHead>Cadastro</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCompanies.map((company) => (
                      <TableRow key={company.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            {company.logo_url ? (
                              <img
                                src={company.logo_url}
                                alt={company.name}
                                className="h-10 w-10 rounded-lg object-cover"
                              />
                            ) : (
                              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                                <Building2 className="h-5 w-5 text-primary" />
                              </div>
                            )}
                            <div>
                              <p className="font-medium">{company.name}</p>
                              <p className="text-sm text-muted-foreground">{company.email || '-'}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <code className="text-sm bg-muted px-2 py-1 rounded">
                            {company.slug}
                          </code>
                        </TableCell>
                        <TableCell>
                          {company.city && company.state
                            ? `${company.city}, ${company.state}`
                            : '-'}
                        </TableCell>
                        <TableCell>{getStatusBadge(company.status)}</TableCell>
                        <TableCell>{getSubscriptionBadge(company)}</TableCell>
                        <TableCell>{formatCurrency(company.monthly_revenue)}</TableCell>
                        <TableCell>
                          {new Date(company.created_at).toLocaleDateString('pt-BR')}
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => setDetailModal({ open: true, company })}
                              >
                                <Eye className="h-4 w-4 mr-2" />
                                Ver detalhes
                              </DropdownMenuItem>
                              {company.status === 'approved' && (
                                <DropdownMenuItem asChild>
                                  <Link to={`/menu/${company.slug}`} target="_blank">
                                    <ExternalLink className="h-4 w-4 mr-2" />
                                    Ver cardápio
                                  </Link>
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              {company.status !== 'approved' && (
                                <DropdownMenuItem
                                  onClick={() =>
                                    setActionModal({ open: true, company, action: 'approve' })
                                  }
                                  className="text-success"
                                >
                                  <Check className="h-4 w-4 mr-2" />
                                  Aprovar
                                </DropdownMenuItem>
                              )}
                              {company.status !== 'suspended' && (
                                <DropdownMenuItem
                                  onClick={() =>
                                    setActionModal({ open: true, company, action: 'suspend' })
                                  }
                                  className="text-destructive"
                                >
                                  <X className="h-4 w-4 mr-2" />
                                  Suspender
                                </DropdownMenuItem>
                              )}
                              {company.subscription_plan && company.subscription_status === 'active' && (
                                <DropdownMenuItem
                                  onClick={() =>
                                    setActionModal({ open: true, company, action: 'cancel_subscription' })
                                  }
                                  className="text-warning"
                                >
                                  <CreditCard className="h-4 w-4 mr-2" />
                                  Cancelar Assinatura
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() =>
                                  setActionModal({ open: true, company, action: 'delete' })
                                }
                                className="text-destructive"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Excluir Empresa
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
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

      {/* Action Confirmation Modal */}
      <Dialog
        open={actionModal.open}
        onOpenChange={(open) => {
          if (!open) {
            setActionModal({ open: false, company: null, action: null });
            setDeleteToken('');
            setDeleteTokenError('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {actionModal.action === 'delete' && <AlertTriangle className="h-5 w-5 text-destructive" />}
              {actionModal.action === 'approve' && 'Aprovar Empresa'}
              {actionModal.action === 'suspend' && 'Suspender Empresa'}
              {actionModal.action === 'cancel_subscription' && 'Cancelar Assinatura'}
              {actionModal.action === 'delete' && 'Excluir Empresa Permanentemente'}
            </DialogTitle>
            <DialogDescription>
              {actionModal.action === 'approve' &&
                `Tem certeza que deseja aprovar a empresa "${actionModal.company?.name}"? Ela poderá receber pedidos.`}
              {actionModal.action === 'suspend' &&
                `Tem certeza que deseja suspender a empresa "${actionModal.company?.name}"? Ela não aparecerá para os clientes.`}
              {actionModal.action === 'cancel_subscription' &&
                `Tem certeza que deseja cancelar a assinatura da empresa "${actionModal.company?.name}"? Ela voltará para o plano gratuito.`}
              {actionModal.action === 'delete' && (
                <span className="text-destructive font-medium">
                  ATENÇÃO: Esta ação é IRREVERSÍVEL! A empresa "{actionModal.company?.name}" e TODOS os dados relacionados 
                  (pedidos, produtos, categorias, cupons, entregadores, avaliações, etc.) serão excluídos permanentemente, 
                  incluindo o usuário owner.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          
          {/* Campo de token para exclusão */}
          {actionModal.action === 'delete' && (
            <div className="py-4">
              <label className="text-sm font-medium text-foreground mb-2 block">
                Digite o token de super admin para confirmar:
              </label>
              <Input
                type="password"
                placeholder="Token de super admin"
                value={deleteToken}
                onChange={(e) => {
                  setDeleteToken(e.target.value);
                  setDeleteTokenError('');
                }}
                className={deleteTokenError ? 'border-destructive' : ''}
              />
              {deleteTokenError && (
                <p className="text-sm text-destructive mt-1">{deleteTokenError}</p>
              )}
            </div>
          )}
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setActionModal({ open: false, company: null, action: null });
                setDeleteToken('');
                setDeleteTokenError('');
              }}
            >
              Voltar
            </Button>
            <Button
              variant={actionModal.action === 'approve' ? 'default' : 'destructive'}
              onClick={handleAction}
              disabled={actionLoading}
            >
              {actionLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {actionModal.action === 'approve' && 'Aprovar'}
              {actionModal.action === 'suspend' && 'Suspender'}
              {actionModal.action === 'cancel_subscription' && 'Cancelar Assinatura'}
              {actionModal.action === 'delete' && 'Excluir Permanentemente'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Modal */}
      <Dialog
        open={detailModal.open}
        onOpenChange={(open) => !open && setDetailModal({ open: false, company: null })}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              {detailModal.company?.logo_url ? (
                <img
                  src={detailModal.company.logo_url}
                  alt={detailModal.company.name}
                  className="h-12 w-12 rounded-lg object-cover"
                />
              ) : (
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Building2 className="h-6 w-6 text-primary" />
                </div>
              )}
              {detailModal.company?.name}
            </DialogTitle>
          </DialogHeader>
            {detailModal.company && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Slug</p>
                    <code className="text-sm bg-muted px-2 py-1 rounded">
                      {detailModal.company.slug}
                    </code>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Status</p>
                    {getStatusBadge(detailModal.company.status)}
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Plano / Assinatura</p>
                    {getSubscriptionBadge(detailModal.company)}
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Vencimento da assinatura</p>
                    <p className="font-medium">
                      {detailModal.company.subscription_end_date
                        ? new Date(detailModal.company.subscription_end_date).toLocaleDateString('pt-BR')
                        : '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Faturamento do mês</p>
                    <p className="font-medium">
                      {formatCurrency(detailModal.company.monthly_revenue)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Email</p>
                    <p className="font-medium">{detailModal.company.email || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Telefone</p>
                    <p className="font-medium">{detailModal.company.phone || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Cidade</p>
                    <p className="font-medium">{detailModal.company.city || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Estado</p>
                    <p className="font-medium">{detailModal.company.state || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Cadastro</p>
                    <p className="font-medium">
                      {new Date(detailModal.company.created_at).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Status da Loja</p>
                    <Badge variant={detailModal.company.is_open ? 'default' : 'secondary'}>
                      {detailModal.company.is_open ? 'Aberta' : 'Fechada'}
                    </Badge>
                  </div>
                </div>

                {/* Revenue Limit Bonus Section */}
                <div className="border-t pt-4 mt-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Gift className="h-4 w-4 text-primary" />
                    <h4 className="font-medium">Bônus de Limite de Faturamento</h4>
                  </div>
                  
                  <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Limite do plano</p>
                        <p className="font-medium">{formatCurrencyValue(getPlanLimit(detailModal.company.subscription_plan))}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Bônus atual</p>
                        <p className="font-medium text-primary">
                          +{formatCurrencyValue(detailModal.company.revenue_limit_bonus || 0)}
                        </p>
                      </div>
                    </div>
                    
                    <div className="text-sm">
                      <p className="text-muted-foreground">Limite total efetivo</p>
                      <p className="font-bold text-lg">
                        {formatCurrencyValue(getPlanLimit(detailModal.company.subscription_plan) + (detailModal.company.revenue_limit_bonus || 0))}
                      </p>
                    </div>

                    <div className="border-t pt-3 mt-3">
                      <Label htmlFor="bonus-value" className="text-sm">Definir novo bônus</Label>
                      <div className="flex gap-2 mt-2">
                        <CurrencyInput
                          id="bonus-value"
                          value={bonusEditing?.companyId === detailModal.company.id ? bonusEditing.value : (detailModal.company.revenue_limit_bonus || 0)}
                          onChange={(val) => setBonusEditing({ 
                            companyId: detailModal.company!.id, 
                            value: parseFloat(val) || 0 
                          })}
                          placeholder="0,00"
                          className="flex-1"
                        />
                        <Button 
                          size="sm"
                          onClick={handleSaveBonus}
                          disabled={savingBonus || !bonusEditing || bonusEditing.companyId !== detailModal.company.id}
                        >
                          {savingBonus ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Save className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Este valor será somado ao limite do plano atual
                      </p>
                    </div>
                  </div>
                </div>
                
                {detailModal.company.status === 'approved' && (
                  <Button asChild className="w-full">
                    <Link to={`/menu/${detailModal.company.slug}`} target="_blank">
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Ver Cardápio
                    </Link>
                  </Button>
                )}
              </div>
            )}

        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}