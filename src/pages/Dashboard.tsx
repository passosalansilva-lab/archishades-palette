import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/hooks/useAuth';
import { useStaffPermissions } from '@/hooks/useStaffPermissions';
import { useReportExport } from '@/hooks/useReportExport';
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus';
import { useDashboardData, PeriodFilter } from '@/hooks/useDashboardData';
import logoCardapioOn from '@/assets/logo-cardapio-on-new.png';
import {
  ShoppingBag,
  TrendingUp,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
  Truck,
  Clock,
  CheckCircle,
  Package,
  Calendar,
  FileDown,
  FileSpreadsheet,
  Lightbulb,
  UtensilsCrossed,
  RefreshCw,
  Trophy,
  Medal,
  Crown,
  Flame,
  Monitor,
  Download,
  Check,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PushNotificationButton } from '@/components/PushNotificationButton';
import { SubscriptionAlert } from '@/components/SubscriptionAlert';
import { StoreOnboarding } from '@/components/onboarding/StoreOnboarding';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import { Link } from 'react-router-dom';

const statusColors: Record<string, string> = {
  pending: '#eab308',
  confirmed: '#3b82f6',
  preparing: '#f97316',
  ready: '#a855f7',
  out_for_delivery: '#06b6d4',
  delivered: '#22c55e',
  cancelled: '#ef4444',
};

const statusLabels: Record<string, string> = {
  pending: 'Pendente',
  confirmed: 'Confirmado',
  preparing: 'Preparando',
  ready: 'Pronto',
  out_for_delivery: 'Em entrega',
  delivered: 'Entregue',
  cancelled: 'Cancelado',
};

const periodLabels: Record<PeriodFilter, string> = {
  today: 'Hoje',
  '7days': '7 dias',
  '30days': '30 dias',
};

const periodCompareLabels: Record<PeriodFilter, string> = {
  today: 'vs ontem',
  '7days': 'vs 7 dias anteriores',
  '30days': 'vs 30 dias anteriores',
};

export default function Dashboard() {
  const { user, hasRole, staffCompany } = useAuth();
  const { isStoreStaff } = useStaffPermissions();
  const { exportToPDF, exportToExcel } = useReportExport();
  const { status: subscriptionStatus } = useSubscriptionStatus();
  const [period, setPeriod] = useState<PeriodFilter>('today');
  const [exporting, setExporting] = useState(false);

  const DESKTOP_APP_DOWNLOAD_URL =
    'https://github.com/passosalansilva-lab/archive/releases/download/cardpon/CardpOnDelivery.exe';

  const [desktopAppDownloaded, setDesktopAppDownloaded] = useState(() => {
    try {
      return localStorage.getItem('desktop-app-downloaded') === 'true';
    } catch {
      return false;
    }
  });

  const handleDesktopAppDownload = () => {
    // Trigger download via a programmatic <a> click (iframes are often blocked by GitHub via X-Frame-Options).
    const a = document.createElement('a');
    a.href = DESKTOP_APP_DOWNLOAD_URL;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    a.remove();

    setDesktopAppDownloaded(true);
    try {
      localStorage.setItem('desktop-app-downloaded', 'true');
    } catch {
      // ignore
    }
  };
  const {
    companyId,
    companyName,
    companyStatus,
    stats,
    chartData,
    statusData,
    recentOrders,
    topProducts,
    inventoryOverview,
    ingredientFinancials,
    allOrdersData,
    isLoading,
    isFetching,
    refetch,
  } = useDashboardData(user?.id, period, staffCompany?.companyId);

  const handleExport = async (type: 'pdf' | 'excel') => {
    setExporting(true);
    try {
      const today = new Date();
      let periodDays = 1;
      if (period === '7days') periodDays = 7;
      if (period === '30days') periodDays = 30;

      const periodStart = startOfDay(subDays(today, periodDays - 1)).toISOString();
      const periodEnd = endOfDay(today).toISOString();

      const ordersForExport = allOrdersData.filter(
        (o) => o.created_at >= periodStart && o.created_at <= periodEnd
      );

      const validOrders = ordersForExport.filter((o) => o.status !== 'cancelled');
      const totalRevenue = validOrders.reduce((sum, o) => sum + o.total, 0);

      const reportData = {
        orders: ordersForExport,
        period: periodLabels[period],
        companyName,
        stats: {
          totalOrders: ordersForExport.length,
          totalRevenue,
          averageTicket: validOrders.length > 0 ? totalRevenue / validOrders.length : 0,
          deliveredOrders: ordersForExport.filter((o) => o.status === 'delivered').length,
          cancelledOrders: ordersForExport.filter((o) => o.status === 'cancelled').length,
        },
      };

      if (type === 'pdf') {
        exportToPDF(reportData);
      } else {
        exportToExcel(reportData);
      }
    } catch (error) {
      console.error('Error exporting report:', error);
    } finally {
      setExporting(false);
    }
  };

  const calculateChange = (current: number, previous: number): { value: string; trend: 'up' | 'down' } => {
    if (previous === 0) {
      return { value: current > 0 ? '+100%' : '0%', trend: current >= 0 ? 'up' : 'down' };
    }
    const change = ((current - previous) / previous) * 100;
    return {
      value: `${change >= 0 ? '+' : ''}${change.toFixed(0)}%`,
      trend: change >= 0 ? 'up' : 'down',
    };
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  const ordersChange = calculateChange(stats.ordersPeriod, stats.ordersPrevious);
  const revenueChange = calculateChange(stats.revenuePeriod, stats.revenuePrevious);
  const ticketChange = calculateChange(stats.averageTicket, stats.averageTicketPrevious);

  const statsCards = [
    {
      title: `Pedidos ${periodLabels[period]}`,
      value: stats.ordersPeriod.toString(),
      change: ordersChange.value,
      trend: ordersChange.trend,
      icon: ShoppingBag,
    },
    {
      title: `Faturamento ${periodLabels[period]}`,
      value: formatCurrency(stats.revenuePeriod),
      change: revenueChange.value,
      trend: revenueChange.trend,
      icon: DollarSign,
    },
    {
      title: 'Ticket Médio',
      value: formatCurrency(stats.averageTicket),
      change: ticketChange.value,
      trend: ticketChange.trend,
      icon: TrendingUp,
    },
    {
      title: 'Custo de ingredientes',
      value: formatCurrency(ingredientFinancials.consumptionCost),
      subValue: `Compras no período: ${formatCurrency(ingredientFinancials.purchasesCost)}`,
      icon: Package,
    },
    {
      title: 'Margem bruta x ingredientes',
      value: formatCurrency(ingredientFinancials.grossMargin),
      subValue:
        stats.revenuePeriod > 0
          ? `${ingredientFinancials.grossMarginPercent.toFixed(1)}% sobre o faturamento`
          : 'Margem calculada apenas sobre pedidos com faturamento',
      icon: TrendingUp,
    },
    {
      title: 'Em Preparo/Entrega',
      value: (stats.pendingOrders + stats.inDeliveryOrders).toString(),
      subValue: `${stats.pendingOrders} preparo · ${stats.inDeliveryOrders} entrega`,
      icon: Clock,
    },
    {
      title: `Pedidos em Mesa`,
      value: stats.tableOrdersPeriod.toString(),
      subValue: `Faturamento: ${formatCurrency(stats.tableRevenuePeriod)}`,
      icon: UtensilsCrossed,
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header with logo and filter */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <img
              src={logoCardapioOn}
              alt="Cardápio On"
              className="h-14 w-auto object-contain drop-shadow-md hidden sm:block"
            />
            <div>
              <h1 className="text-2xl font-bold font-display text-foreground">
                Olá, {user?.user_metadata?.full_name?.split(' ')[0] || 'Usuário'}! 👋
              </h1>
              <p className="text-muted-foreground mt-1">
                Aqui está um resumo do seu período
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {isFetching && (
              <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              className="h-8 w-8 p-0"
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            </Button>
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <div className="flex rounded-lg border border-border p-1">
              {(['today', '7days', '30days'] as PeriodFilter[]).map((p) => (
                <Button
                  key={p}
                  variant={period === p ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setPeriod(p)}
                  className={period === p ? 'gradient-primary text-primary-foreground' : ''}
                >
                  {periodLabels[p]}
                </Button>
              ))}
            </div>
            {companyId && companyStatus === 'approved' && (
              <div className="flex gap-2 ml-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleExport('pdf')}
                  disabled={exporting || allOrdersData.length === 0}
                >
                  <FileDown className="h-4 w-4 mr-1" />
                  PDF
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleExport('excel')}
                  disabled={exporting || allOrdersData.length === 0}
                >
                  <FileSpreadsheet className="h-4 w-4 mr-1" />
                  Excel
                </Button>
                <PushNotificationButton
                  companyId={companyId}
                  userId={user?.id}
                  userType="store_owner"
                />
              </div>
            )}
          </div>
        </div>

        {/* Avisos de empresa não cadastrada ou pendente - apenas para owners */}
        {!companyId && !isStoreStaff && (
          <Card className="border-warning/40 bg-warning/5">
            <CardContent className="py-4 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Lightbulb className="h-5 w-5 text-warning" />
                <p className="font-medium">Você ainda não cadastrou sua empresa.</p>
              </div>
              <p className="text-sm text-muted-foreground">
                Vá em "Configurações da Loja" para cadastrar as informações básicas da sua empresa.
              </p>
            </CardContent>
          </Card>
        )}

        {companyId && companyStatus !== 'approved' && (
          <Card className="border-warning/40 bg-warning/10 shadow-lg">
            <CardContent className="py-6 flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-warning/20 flex items-center justify-center">
                  <Lightbulb className="h-6 w-6 text-warning" />
                </div>
                <div>
                  <p className="font-semibold text-lg">Sua empresa está aguardando aprovação</p>
                  <p className="text-sm text-muted-foreground">
                    Um administrador irá analisar e aprovar sua conta em breve.
                  </p>
                </div>
              </div>
              
              <div className="bg-background/50 rounded-lg p-4 space-y-3">
                <p className="font-medium text-sm">Enquanto isso, você pode:</p>
                <ul className="text-sm text-muted-foreground space-y-2">
                  <li className="flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                    Configurar as informações da sua loja
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                    Cadastrar seus produtos e categorias
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                    Definir horários de funcionamento
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                    Configurar formas de pagamento
                  </li>
                </ul>
              </div>
              
              <p className="text-xs text-muted-foreground">
                Você receberá uma notificação assim que sua empresa for aprovada e poderá começar a receber pedidos.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Onboarding Checklist */}
        {user && companyId && companyStatus === 'approved' && (
          <StoreOnboarding companyId={companyId} userId={user.id} />
        )}

        {/* Subscription Alert */}
        {companyId && companyStatus === 'approved' && subscriptionStatus && (subscriptionStatus.isNearLimit || subscriptionStatus.isAtLimit) && (
          <SubscriptionAlert
            plan={subscriptionStatus.plan}
            revenueLimit={subscriptionStatus.revenueLimit}
            revenueLimitBonus={subscriptionStatus.revenueLimitBonus}
            monthlyRevenue={subscriptionStatus.monthlyRevenue}
            displayName={subscriptionStatus.displayName}
            isNearLimit={subscriptionStatus.isNearLimit}
            isAtLimit={subscriptionStatus.isAtLimit}
            usagePercentage={subscriptionStatus.usagePercentage}
            recommendedPlan={subscriptionStatus.recommendedPlan}
          />
        )}

        {/* Desktop App Download Card */}
        {companyId && companyStatus === 'approved' && !desktopAppDownloaded && (
          <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-primary/10">
            <CardContent className="py-5 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-xl bg-primary/20 flex items-center justify-center">
                  <Monitor className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-lg">Aplicativo para Desktop</p>
                  <p className="text-sm text-muted-foreground">
                    Baixe o Cardápio On para Windows e tenha acesso rápido ao sistema
                  </p>
                </div>
              </div>
              <Button className="gradient-primary gap-2" onClick={handleDesktopAppDownload}>
                <Download className="h-4 w-4" />
                Baixar para Windows
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Stats grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {statsCards.map((stat) => (
            <Card key={stat.title} className="hover-lift">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <stat.icon className="h-5 w-5 text-primary" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold font-display">{stat.value}</div>
                {stat.change ? (
                  <div className="flex items-center text-xs mt-1">
                    {stat.trend === 'up' ? (
                      <ArrowUpRight className="h-3 w-3 text-green-500 mr-1" />
                    ) : (
                      <ArrowDownRight className="h-3 w-3 text-red-500 mr-1" />
                    )}
                    <span className={stat.trend === 'up' ? 'text-green-500' : 'text-red-500'}>
                      {stat.change}
                    </span>
                    <span className="text-muted-foreground ml-1">{periodCompareLabels[period]}</span>
                  </div>
                ) : stat.subValue ? (
                  <p className="text-xs text-muted-foreground mt-1">{stat.subValue}</p>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Charts */}
        {companyId && (
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Revenue Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="font-display">Faturamento - {periodLabels[period]}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="date" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                      <YAxis
                        className="text-xs"
                        tick={{ fill: 'hsl(var(--muted-foreground))' }}
                        tickFormatter={(value) => `R$${value}`}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                        }}
                        formatter={(value: number) => [formatCurrency(value), 'Faturamento']}
                      />
                      <Area
                        type="monotone"
                        dataKey="revenue"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#colorRevenue)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Orders Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="font-display">Pedidos - {periodLabels[period]}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="date" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                      <YAxis className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                        }}
                        formatter={(value: number) => [value, 'Pedidos']}
                      />
                      <Bar dataKey="orders" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Status Distribution */}
            {statusData.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="font-display">Distribuição por Status</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px] flex items-center">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={statusData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={100}
                          paddingAngle={2}
                          dataKey="value"
                        >
                          {statusData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'hsl(var(--card))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px',
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-2 min-w-[140px]">
                      {statusData.map((item) => (
                        <div key={item.name} className="flex items-center gap-2 text-sm">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: item.color }}
                          />
                          <span className="text-muted-foreground">{item.name}</span>
                          <span className="font-medium ml-auto">{item.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Top Products - Ranking Bonito */}
            {topProducts.length > 0 && (
              <Card className="overflow-hidden">
                <CardHeader className="bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-red-500/10 border-b">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 shadow-lg">
                      <Trophy className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <CardTitle className="font-display">Ranking de Vendas</CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">Produtos mais pedidos</p>
                    </div>
                    <Flame className="h-5 w-5 text-orange-500 ml-auto animate-pulse" />
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y divide-border">
                    {topProducts.map((product, index) => {
                      // Cores e estilos baseados na posição
                      const rankStyles = {
                        0: {
                          bg: 'bg-gradient-to-r from-amber-500/20 via-yellow-500/10 to-transparent',
                          badge: 'bg-gradient-to-br from-amber-400 to-yellow-500 shadow-amber-500/30',
                          icon: Crown,
                          textColor: 'text-amber-600 dark:text-amber-400',
                          label: '1º',
                        },
                        1: {
                          bg: 'bg-gradient-to-r from-slate-400/20 via-gray-300/10 to-transparent',
                          badge: 'bg-gradient-to-br from-slate-300 to-gray-400 shadow-slate-400/30',
                          icon: Medal,
                          textColor: 'text-slate-600 dark:text-slate-400',
                          label: '2º',
                        },
                        2: {
                          bg: 'bg-gradient-to-r from-orange-600/20 via-amber-700/10 to-transparent',
                          badge: 'bg-gradient-to-br from-orange-500 to-amber-700 shadow-orange-600/30',
                          icon: Medal,
                          textColor: 'text-orange-600 dark:text-orange-400',
                          label: '3º',
                        },
                      };
                      
                      const style = rankStyles[index as keyof typeof rankStyles];
                      const RankIcon = style?.icon;
                      
                      return (
                        <div 
                          key={product.name} 
                          className={`flex items-center gap-4 p-4 transition-all hover:bg-muted/30 ${style?.bg || ''}`}
                        >
                          {/* Medalha/Posição */}
                          {index < 3 && RankIcon ? (
                            <div className={`relative w-10 h-10 rounded-xl ${style.badge} shadow-lg flex items-center justify-center`}>
                              <RankIcon className="h-5 w-5 text-white" />
                              <span className="absolute -bottom-1 -right-1 text-[10px] font-black text-white bg-black/40 rounded-full w-4 h-4 flex items-center justify-center">
                                {index + 1}
                              </span>
                            </div>
                          ) : (
                            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                              <span className="text-sm font-bold text-muted-foreground">{index + 1}º</span>
                            </div>
                          )}
                          
                          {/* Informações do Produto */}
                          <div className="flex-1 min-w-0">
                            <p className={`font-semibold truncate ${index < 3 ? style?.textColor : ''}`}>
                              {product.name}
                            </p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs text-muted-foreground">
                                {product.quantity} vendidos
                              </span>
                              {index === 0 && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-amber-500/50 text-amber-600 dark:text-amber-400">
                                  🔥 Campeão
                                </Badge>
                              )}
                            </div>
                          </div>
                          
                          {/* Receita */}
                          <div className="text-right">
                            <p className={`font-bold ${index < 3 ? style?.textColor : 'text-foreground'}`}>
                              {formatCurrency(product.revenue)}
                            </p>
                            {index < 3 && (
                              <div className="flex items-center justify-end gap-1 mt-0.5">
                                <TrendingUp className="h-3 w-3 text-green-500" />
                                <span className="text-[10px] text-green-600">top {index + 1}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Quick Stats */}
            <Card>
              <CardHeader>
                <CardTitle className="font-display">Resumo de Hoje</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                    <div className="flex items-center gap-2 text-green-600">
                      <CheckCircle className="h-5 w-5" />
                      <span className="font-medium">Entregues</span>
                    </div>
                    <p className="text-3xl font-bold mt-2">{stats.deliveredPeriod}</p>
                  </div>
                  <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20">
                    <div className="flex items-center gap-2 text-red-600">
                      <Package className="h-5 w-5" />
                      <span className="font-medium">Cancelados</span>
                    </div>
                    <p className="text-3xl font-bold mt-2">{stats.cancelledPeriod}</p>
                  </div>
                  <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                    <div className="flex items-center gap-2 text-yellow-600">
                      <Clock className="h-5 w-5" />
                      <span className="font-medium">Em Preparo</span>
                    </div>
                    <p className="text-3xl font-bold mt-2">{stats.pendingOrders}</p>
                  </div>
                  <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
                    <div className="flex items-center gap-2 text-blue-600">
                      <Truck className="h-5 w-5" />
                      <span className="font-medium">Em Entrega</span>
                    </div>
                    <p className="text-3xl font-bold mt-2">{stats.inDeliveryOrders}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Inventory Overview */}
            {inventoryOverview && (
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="font-display">Estoque e Disponibilidade</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-4 mb-4">
                    <div className="px-3 py-2 rounded-lg bg-warning/10 border border-warning/30 text-sm">
                      <span className="font-medium">Ingredientes abaixo do mínimo:</span>{' '}
                      <span className="font-bold">{inventoryOverview.lowStockCount}</span>
                    </div>
                    <div className="px-3 py-2 rounded-lg bg-destructive/5 border border-destructive/20 text-sm">
                      <span className="font-medium">Produtos indisponíveis no cardápio:</span>{' '}
                      <span className="font-bold">{inventoryOverview.unavailableProductsCount}</span>
                    </div>
                  </div>

                  {inventoryOverview.criticalIngredients.length > 0 ? (
                    <div className="space-y-3">
                      {inventoryOverview.criticalIngredients.map((ingredient) => {
                        const percentage = ingredient.min_stock > 0
                          ? Math.max(0, Math.min(100, (ingredient.current_stock / ingredient.min_stock) * 100))
                          : 100;

                        return (
                          <div key={ingredient.name} className="space-y-1">
                            <div className="flex items-center justify-between text-sm">
                              <span className="font-medium">{ingredient.name}</span>
                              <span className="text-xs text-muted-foreground">
                                {ingredient.current_stock.toFixed(2)} / {ingredient.min_stock.toFixed(2)} {ingredient.unit}
                              </span>
                            </div>
                            <div className="h-2 rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full bg-primary transition-all"
                                style={{ width: `${percentage}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Nenhum ingrediente abaixo do estoque mínimo configurado.
                    </p>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Quick actions for new stores */}
        {hasRole('store_owner') && !companyId && (
          <Card>
            <CardHeader>
              <CardTitle className="font-display">Próximos Passos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <QuickActionCard
                  title="Configure sua loja"
                  description="Adicione logo, cores e informações de contato"
                  href="/dashboard/store"
                />
                <QuickActionCard
                  title="Crie seu cardápio"
                  description="Adicione categorias e produtos"
                  href="/dashboard/menu"
                />
                <QuickActionCard
                  title="Cadastre entregadores"
                  description="Adicione motoboys para suas entregas"
                  href="/dashboard/drivers"
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Recent orders */}
        {recentOrders.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="font-display">Pedidos Recentes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {recentOrders.map((order) => (
                  <div
                    key={order.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <ShoppingBag className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">{order.customer_name}</p>
                        <p className="text-sm text-muted-foreground">
                          #{order.id.slice(0, 8)} · {format(new Date(order.created_at), "dd/MM 'às' HH:mm")}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge
                        style={{
                          backgroundColor: `${statusColors[order.status]}20`,
                          color: statusColors[order.status],
                          borderColor: statusColors[order.status],
                        }}
                        variant="outline"
                      >
                        {statusLabels[order.status]}
                      </Badge>
                      <span className="font-medium">{formatCurrency(order.total)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Empty state for orders */}
        {companyId && recentOrders.length === 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="font-display">Pedidos Recentes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12 text-muted-foreground">
                <ShoppingBag className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Nenhum pedido recente</p>
                <p className="text-sm">Os pedidos aparecerão aqui</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}

function QuickActionCard({
  title,
  description,
  href,
}: {
  title: string;
  description: string;
  href: string;
}) {
  return (
    <Link
      to={href}
      className="p-4 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors group"
    >
      <h3 className="font-medium group-hover:text-primary transition-colors">{title}</h3>
      <p className="text-sm text-muted-foreground mt-1">{description}</p>
    </Link>
  );
}
