import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Crown,
  Check,
  Loader2,
  Zap,
  Building2,
  ExternalLink,
  AlertTriangle,
  Lock,
  Clock,
  QrCode,
  XCircle,
  CreditCard,
  Calendar,
  Receipt,
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { SubscriptionPaymentHistory } from '@/components/plans/SubscriptionPaymentHistory';

interface Plan {
  key: string;
  name: string;
  description: string | null;
  price: number;
  revenue_limit: number;
  stripe_price_id: string | null;
  features: string[];
  is_popular?: boolean;
}

interface SubscriptionData {
  subscribed: boolean;
  plan: string;
  revenueLimit: number;
  revenueLimitBonus?: number;
  displayName: string;
  subscriptionEnd?: string;
}

export default function PlansPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [company, setCompany] = useState<any>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [checkingPayment, setCheckingPayment] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<string | null>(null);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [paymentMethodDialogOpen, setPaymentMethodDialogOpen] = useState(false);
  const [selectedPlanForPayment, setSelectedPlanForPayment] = useState<string | null>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const preferenceIdRef = useRef<string | null>(null);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []);

  // Check for pending payment on mount (returning from MP checkout)
  useEffect(() => {
    const preferenceIdFromUrl = searchParams.get('preference_id');
    const subscriptionStatus = searchParams.get('subscription');
    const collectionStatus = searchParams.get('collection_status');
    const paymentStatus = searchParams.get('status');
    const paymentType = searchParams.get('payment_type');
    const storedPreferenceId = sessionStorage.getItem('mp_preference_id');
    
    // If we have Mercado Pago params, clean the URL immediately
    const hasMpParams = searchParams.has('collection_id') || 
                        searchParams.has('collection_status') || 
                        searchParams.has('payment_id') ||
                        searchParams.has('merchant_order_id') ||
                        searchParams.has('processing_mode') ||
                        searchParams.has('subscription') ||
                        searchParams.has('payment_type');
    
    // Determine the preference ID to use
    const prefId = preferenceIdFromUrl || storedPreferenceId;
    
    // Check if payment was actually approved
    const isApproved = collectionStatus === 'approved' || paymentStatus === 'approved';
    
    // Clean the URL and storage
    const cleanUrl = () => {
      window.history.replaceState({}, '', '/dashboard/plans');
      sessionStorage.removeItem('mp_preference_id');
    };
    
    // If user has no URL params and no stored preference, don't do anything
    if (!hasMpParams && !storedPreferenceId) {
      return;
    }
    
    // If approved, show success and clean up
    if (subscriptionStatus === 'success' || isApproved) {
      toast({
        title: 'Assinatura ativada!',
        description: 'Seu plano foi ativado com sucesso',
      });
      cleanUrl();
      checkSubscription();
      return;
    }
    
    // Only start polling if user just came from checkout with pending status AND has payment_type=pix
    // This prevents polling on every page load
    if (hasMpParams && paymentType === 'pix' && prefId) {
      // Check if payment is truly pending (PIX waiting for payment)
      const isPendingPix = subscriptionStatus === 'pending' || 
                           (collectionStatus === 'null' || collectionStatus === null);
      
      if (isPendingPix) {
        // Clean URL but keep preference for polling
        window.history.replaceState({}, '', '/dashboard/plans');
        preferenceIdRef.current = prefId;
        startPaymentPolling(prefId);
        return;
      }
    }
    
    // Handle failed status
    if (subscriptionStatus === 'failed') {
      toast({
        title: 'Pagamento não aprovado',
        description: 'O pagamento não foi concluído. Tente novamente.',
        variant: 'destructive',
      });
      cleanUrl();
      return;
    }
    
    // For any other case with MP params, just clean up
    if (hasMpParams) {
      cleanUrl();
    }
  }, [searchParams]);

  useEffect(() => {
    loadData();
  }, [user]);

  // Function to check payment status with Mercado Pago
  const checkPaymentStatus = useCallback(async (preferenceId: string) => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) return null;

      const response = await supabase.functions.invoke('check-mercadopago-payment', {
        body: { preferenceId },
        headers: {
          Authorization: `Bearer ${sessionData.session.access_token}`,
        },
      });

      if (response.error) {
        console.error('Error checking payment:', response.error);
        return null;
      }

      return response.data;
    } catch (error) {
      console.error('Error checking payment status:', error);
      return null;
    }
  }, []);

  // Start polling for payment confirmation
  const startPaymentPolling = useCallback((preferenceId: string) => {
    setCheckingPayment(true);
    setPaymentStatus('Aguardando confirmação do pagamento PIX...');

    // Clear any existing polling
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
    }

    // Poll every 3 seconds
    pollingRef.current = setInterval(async () => {
      const result = await checkPaymentStatus(preferenceId);
      
      if (result) {
        setPaymentStatus(result.message);

        if (result.paid || result.status === 'approved') {
          // Payment confirmed!
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
          setCheckingPayment(false);
          setPaymentStatus(null);
          
          // IMPORTANT: Clear session storage to prevent polling on next visit
          sessionStorage.removeItem('mp_preference_id');
          
          toast({
            title: 'Pagamento confirmado!',
            description: `Seu plano ${result.plan || ''} foi ativado com sucesso.`,
          });

          // Clear URL params and reload subscription
          setSearchParams({});
          await checkSubscription();
          await loadData();
        } else if (result.status === 'rejected' || result.status === 'cancelled') {
          // Payment failed
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
          setCheckingPayment(false);
          setPaymentStatus(null);
          
          // Clear session storage
          sessionStorage.removeItem('mp_preference_id');

          toast({
            title: 'Pagamento não aprovado',
            description: result.message,
            variant: 'destructive',
          });

          setSearchParams({});
        }
      }
    }, 3000);

    // Stop polling after 10 minutes
    setTimeout(() => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
        setCheckingPayment(false);
        setPaymentStatus(null);
        
        // Clear session storage on timeout
        sessionStorage.removeItem('mp_preference_id');
        
        toast({
          title: 'Tempo esgotado',
          description: 'O tempo para confirmação do pagamento expirou. Se você já pagou, aguarde alguns minutos e atualize a página.',
          variant: 'destructive',
        });
      }
    }, 10 * 60 * 1000);
  }, [checkPaymentStatus, toast, setSearchParams]);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Load plans from database
      const { data: plansData, error: plansError } = await supabase
        .from('subscription_plans')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (plansError) throw plansError;

      setPlans(plansData?.map(p => ({
        key: p.key,
        name: p.name,
        description: p.description,
        price: Number(p.price),
        revenue_limit: p.revenue_limit || p.order_limit, // Fallback para order_limit se revenue_limit não existir
        stripe_price_id: p.stripe_price_id,
        features: Array.isArray(p.features) 
          ? (p.features as unknown as string[]).map(f => String(f))
          : [],
        is_popular: p.key === 'pro',
      })) || []);

      // Load company data
      const { data: companyData } = await supabase
        .from('companies')
        .select('*')
        .eq('owner_id', user.id)
        .maybeSingle();

      setCompany(companyData);

      // Check subscription
      await checkSubscription();
    } catch (error: any) {
      console.error('Error loading data:', error);
      toast({
        title: 'Erro ao carregar dados',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const checkSubscription = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('check-subscription');

      if (error || !data) {
        console.warn('Subscription check failed, using free plan fallback:', error);
        setSubscription({
          subscribed: false,
          plan: 'free',
          revenueLimit: 2000,
          displayName: 'Plano Gratuito',
        });
        return;
      }

      setSubscription(data as SubscriptionData);
    } catch (error) {
      console.error('Error checking subscription (treated as free plan):', error);
      setSubscription({
        subscribed: false,
        plan: 'free',
        revenueLimit: 2000,
        displayName: 'Plano Gratuito',
      });
    }
  };
  const handleSubscribe = async (planKey: string) => {
    if (planKey === 'free') return;

    // Verificar se a empresa está aprovada
    if (company?.status !== 'approved') {
      toast({
        title: 'Empresa pendente de aprovação',
        description: 'Você só poderá fazer upgrade após sua empresa ser aprovada pela nossa equipe.',
        variant: 'destructive',
      });
      return;
    }

    // Abrir diálogo de escolha de método de pagamento
    setSelectedPlanForPayment(planKey);
    setPaymentMethodDialogOpen(true);
  };

  const processPayment = async (paymentMethod: 'card' | 'pix') => {
    if (!selectedPlanForPayment) return;
    
    setPaymentMethodDialogOpen(false);
    setSubscribing(selectedPlanForPayment);
    
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        toast({
          title: 'Erro',
          description: 'Você precisa estar logado para assinar',
          variant: 'destructive',
        });
        return;
      }

      // Escolher edge function baseada no método de pagamento
      const functionName = paymentMethod === 'card' 
        ? 'create-mercadopago-preapproval'  // Cartão = recorrente
        : 'create-mercadopago-pix-subscription';  // PIX = pagamento único

      const response = await supabase.functions.invoke(functionName, {
        body: { planKey: selectedPlanForPayment },
        headers: {
          Authorization: `Bearer ${sessionData.session.access_token}`,
        },
      });

      if (response.error) {
        const errAny = response.error as any;
        const status = errAny?.status ?? errAny?.context?.status;
        const rawBody = errAny?.context?.body;

        let detailMessage: string | undefined;
        if (rawBody) {
          try {
            const parsed = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
            detailMessage = parsed?.error || parsed?.message;
          } catch {
            // ignore body parse errors
          }
        }

        console.error('Subscription invoke error:', {
          message: response.error.message,
          status,
          rawBody,
        });

        throw new Error(
          detailMessage ||
            response.error.message ||
            `Erro ao processar assinatura${status ? ` (status ${status})` : ''}`
        );
      }

      if (response.data?.error) {
        throw new Error(response.data.error);
      }

      const { url, preferenceId, preapprovalId } = response.data;
      
      // Save preferenceId for polling when user returns (PIX only)
      const refId = preferenceId || preapprovalId;
      if (refId) {
        preferenceIdRef.current = refId;
        sessionStorage.setItem('mp_preference_id', refId);
      }
      
      if (url) {
        window.open(url, '_blank');
      } else {
        throw new Error('URL de checkout não retornada');
      }
    } catch (error: any) {
      const errAny = error as any;
      const status = errAny?.status ?? errAny?.context?.status;
      const rawBody = errAny?.context?.body;

      let detailMessage: string | undefined;
      if (rawBody) {
        try {
          const parsed = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
          detailMessage = parsed?.error || parsed?.message;
        } catch {
          // ignore
        }
      }

      console.error('Create-subscription failed:', {
        message: errAny?.message,
        status,
        rawBody,
      });

      toast({
        title: 'Erro ao iniciar assinatura',
        description:
          detailMessage ||
          errAny?.message ||
          `Erro desconhecido${status ? ` (status ${status})` : ''}`,
        variant: 'destructive',
      });
    } finally {
      setSubscribing(null);
      setSelectedPlanForPayment(null);
    }
  };

  const handleCancelSubscription = async () => {
    setCancelling(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        toast({
          title: 'Erro',
          description: 'Você precisa estar logado',
          variant: 'destructive',
        });
        return;
      }

      const response = await supabase.functions.invoke('cancel-mercadopago-subscription', {
        headers: {
          Authorization: `Bearer ${sessionData.session.access_token}`,
        },
      });

      if (response.error) {
        throw new Error(response.error.message || 'Erro ao cancelar assinatura');
      }

      if (response.data?.error) {
        throw new Error(response.data.error);
      }

      toast({
        title: 'Assinatura cancelada',
        description: 'Sua assinatura foi cancelada. Você voltou para o plano gratuito.',
      });

      setCancelDialogOpen(false);
      await checkSubscription();
      await loadData();
    } catch (error: any) {
      console.error('Cancel subscription error:', error);
      toast({
        title: 'Erro ao cancelar',
        description: error?.message || 'Não foi possível cancelar a assinatura',
        variant: 'destructive',
      });
    } finally {
      setCancelling(false);
    }
  };

  const getIconForPlan = (key: string) => {
    switch (key) {
      case 'enterprise':
        return Building2;
      case 'pro':
      case 'basic':
        return Crown;
      default:
        return Zap;
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  const currentPlan = subscription?.plan || 'free';
  const monthlyRevenue = company?.monthly_revenue || 0;
  const currentPlanData = plans.find(p => p.key === currentPlan);
  const basePlanLimit = currentPlanData?.revenue_limit || 2000;
  const revenueLimitBonus = subscription?.revenueLimitBonus || 0;
  const revenueLimit = subscription?.revenueLimit || basePlanLimit + revenueLimitBonus;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { 
      style: 'currency', 
      currency: 'BRL' 
    }).format(value);
  };

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto space-y-6 animate-fade-in">
        {/* Payment Status Modal */}
        {checkingPayment && (
          <Card className="border-primary bg-primary/5 animate-pulse">
            <CardContent className="py-8">
              <div className="flex flex-col items-center justify-center gap-4 text-center">
                <div className="p-4 bg-primary/10 rounded-full">
                  <QrCode className="h-12 w-12 text-primary" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-semibold">Aguardando Pagamento PIX</h3>
                  <p className="text-muted-foreground max-w-md">
                    {paymentStatus || 'Verificando status do pagamento...'}
                  </p>
                  <div className="flex items-center justify-center gap-2 text-sm text-primary">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Atualizando automaticamente...</span>
                  </div>
                </div>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (pollingRef.current) {
                      clearInterval(pollingRef.current);
                      pollingRef.current = null;
                    }
                    setCheckingPayment(false);
                    setPaymentStatus(null);
                    setSearchParams({});
                  }}
                >
                  Cancelar verificação
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold font-display">Planos e Preços</h1>
          <p className="text-muted-foreground">
            Escolha o plano ideal para o seu negócio
          </p>
        </div>

        {/* Pós-assinatura / Plano atual */}
        {subscription && (
          <Card className="border-primary/40 bg-primary/5">
            <CardContent className="py-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="text-left space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="border-primary/40 text-primary">
                    Plano atual
                  </Badge>
                  <span className="font-semibold">
                    {subscription.displayName || currentPlanData?.name || 'Plano Gratuito'}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Limite de faturamento: {revenueLimit === -1 ? 'Ilimitado' : formatCurrency(revenueLimit)} por mês
                  {revenueLimitBonus > 0 && (
                    <span className="ml-1 text-primary">
                      (inclui bônus de {formatCurrency(revenueLimitBonus)})
                    </span>
                  )}
                </p>
                {subscription.subscriptionEnd && (
                  <p className="text-xs text-muted-foreground">
                    Próximo ciclo de cobrança: {new Date(subscription.subscriptionEnd).toLocaleDateString('pt-BR')}
                  </p>
                )}
              </div>

              {searchParams.get('subscription') === 'success' && (
                <div className="flex items-center gap-2 text-sm text-primary md:text-right">
                  <Check className="h-4 w-4" />
                  <span>Assinatura ativada com sucesso.</span>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Current Usage */}
        {company && (
          <Card className={`border-primary/20 ${
            revenueLimit !== -1 && (monthlyRevenue / revenueLimit) >= 1 
              ? 'border-destructive/50 bg-destructive/5' 
              : revenueLimit !== -1 && (monthlyRevenue / revenueLimit) >= 0.8 
                ? 'border-warning/50 bg-warning/5'
                : 'bg-primary/5'
          }`}>
            <CardContent className="py-4 space-y-3">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Faturamento atual do mês</p>
                  <p className="text-2xl font-bold">
                    {formatCurrency(monthlyRevenue)} / {revenueLimit === -1 ? '∞' : formatCurrency(revenueLimit)}
                  </p>
                  {revenueLimitBonus > 0 && (
                    <p className="text-xs text-primary flex items-center gap-1 mt-1">
                      <span className="inline-block w-2 h-2 rounded-full bg-primary"></span>
                      Limite base: {formatCurrency(basePlanLimit)} + Bônus: {formatCurrency(revenueLimitBonus)}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={subscription?.subscribed ? 'default' : 'secondary'}>
                    {subscription?.displayName || 'Plano Gratuito'}
                  </Badge>
                  {subscription?.subscribed && (
                    <Button variant="outline" size="sm" onClick={() => setCancelDialogOpen(true)}>
                      <XCircle className="h-4 w-4 mr-2" />
                      Cancelar Assinatura
                    </Button>
                  )}
                </div>
              </div>
              
              {revenueLimit !== -1 && (
                <>
                  <Progress
                    value={Math.min((monthlyRevenue / revenueLimit) * 100, 100)}
                    className={`h-2 ${
                      (monthlyRevenue / revenueLimit) >= 1 
                        ? '[&>div]:bg-destructive' 
                        : (monthlyRevenue / revenueLimit) >= 0.8 
                          ? '[&>div]:bg-warning'
                          : ''
                    }`}
                  />
                  
                  {(monthlyRevenue / revenueLimit) >= 1 && (
                    <div className="flex items-center gap-2 text-destructive text-sm">
                      <AlertTriangle className="h-4 w-4" />
                      <span>Limite atingido! Sua loja não pode receber novos pedidos.</span>
                    </div>
                  )}
                  
                  {(monthlyRevenue / revenueLimit) >= 0.8 && (monthlyRevenue / revenueLimit) < 1 && (
                    <div className="flex items-center gap-2 text-warning text-sm">
                      <AlertTriangle className="h-4 w-4" />
                      <span>Você está próximo do limite mensal. Considere fazer upgrade.</span>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Histórico de Pagamentos de Assinatura */}
        {company && subscription?.subscribed && (
          <SubscriptionPaymentHistory companyId={company.id} />
        )}

        {/* Aviso de empresa pendente */}
        {company && company.status !== 'approved' && (
          <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20">
            <CardContent className="py-6 flex flex-col sm:flex-row items-center gap-4">
              <div className="bg-amber-100 dark:bg-amber-900/50 p-4 rounded-full">
                <Lock className="h-8 w-8 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="text-center sm:text-left flex-1">
                <h3 className="font-semibold text-lg mb-1">Empresa aguardando aprovação</h3>
                <p className="text-muted-foreground">
                  Você poderá fazer upgrade do seu plano após sua empresa ser aprovada pela nossa equipe.
                </p>
                <div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400 mt-2">
                  <Clock className="h-4 w-4" />
                  <span>Geralmente respondemos em até 24 horas</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Plans Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {plans.map((plan) => {
            const Icon = getIconForPlan(plan.key);
            const isCurrentPlan = currentPlan === plan.key;
            const isUpgrade = plans.findIndex(p => p.key === plan.key) > plans.findIndex(p => p.key === currentPlan);

            return (
              <Card
                key={plan.key}
                className={`relative ${
                  plan.is_popular ? 'border-primary shadow-lg' : ''
                } ${isCurrentPlan ? 'ring-2 ring-primary' : ''}`}
              >
                {plan.is_popular && (
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">
                    Mais Popular
                  </Badge>
                )}
                {isCurrentPlan && (
                  <Badge variant="secondary" className="absolute -top-3 right-4">
                    Seu Plano
                  </Badge>
                )}
                <CardHeader className="text-center pb-2">
                  <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                    <Icon className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle className="font-display">{plan.name}</CardTitle>
                  <CardDescription>
                    {plan.revenue_limit === -1
                      ? 'Faturamento ilimitado'
                      : `Até ${formatCurrency(plan.revenue_limit)}/mês`}
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-center">
                  <div className="mb-4">
                    <span className="text-3xl font-bold">
                      {plan.price === 0 ? 'Grátis' : `R$ ${plan.price.toFixed(2)}`}
                    </span>
                    {plan.price > 0 && <span className="text-muted-foreground">/mês</span>}
                  </div>
                  <ul className="space-y-2 text-sm text-left mb-6">
                    {plan.features.map((feature, index) => (
                      <li key={index} className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-primary flex-shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    className={`w-full ${plan.is_popular ? 'gradient-primary text-primary-foreground' : ''}`}
                    variant={plan.is_popular ? 'default' : 'outline'}
                    disabled={isCurrentPlan || plan.key === 'free' || subscribing !== null || (company?.status !== 'approved' && plan.key !== 'free')}
                    onClick={() => handleSubscribe(plan.key)}
                  >
                    {subscribing === plan.key ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : null}
                    {isCurrentPlan
                      ? 'Plano Atual'
                      : plan.key === 'free'
                      ? 'Gratuito'
                      : company?.status !== 'approved'
                      ? 'Pendente'
                      : isUpgrade
                      ? 'Fazer Upgrade'
                      : 'Selecionar'}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* FAQ */}
        <Card>
          <CardHeader>
            <CardTitle className="font-display">Perguntas Frequentes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-medium">Como funciona o limite de faturamento?</h4>
              <p className="text-sm text-muted-foreground">
                O sistema calcula o valor total de vendas confirmadas no mês. O contador reinicia no primeiro dia de cada mês.
              </p>
            </div>
            <div>
              <h4 className="font-medium">O que acontece se eu ultrapassar o limite?</h4>
              <p className="text-sm text-muted-foreground">
                Sua loja não poderá receber novos pedidos até que você faça upgrade do plano. Você receberá avisos quando estiver próximo do limite.
              </p>
            </div>
            <div>
              <h4 className="font-medium">Posso cancelar a qualquer momento?</h4>
              <p className="text-sm text-muted-foreground">
                Sim, você pode cancelar sua assinatura a qualquer momento. O acesso continua até o fim do período pago.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Cancel Subscription Dialog */}
        <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancelar Assinatura</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja cancelar sua assinatura? Você perderá acesso aos recursos premium e voltará para o plano gratuito com limite de R$ 2.000/mês.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={cancelling}>Voltar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleCancelSubscription}
                disabled={cancelling}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {cancelling ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Cancelando...
                  </>
                ) : (
                  'Sim, cancelar assinatura'
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Payment Method Dialog */}
        <AlertDialog open={paymentMethodDialogOpen} onOpenChange={setPaymentMethodDialogOpen}>
          <AlertDialogContent className="max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle>Escolha o método de pagamento</AlertDialogTitle>
              <AlertDialogDescription>
                Selecione como você deseja pagar sua assinatura:
              </AlertDialogDescription>
            </AlertDialogHeader>
            
            <div className="grid gap-4 py-4">
              <button
                onClick={() => processPayment('card')}
                className="flex items-start gap-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors text-left"
              >
                <div className="p-2 bg-primary/10 rounded-full">
                  <CreditCard className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold">Cartão de Crédito</h4>
                  <p className="text-sm text-muted-foreground">
                    Cobrança automática mensal. Não precisa renovar manualmente.
                  </p>
                  <Badge variant="outline" className="mt-2 text-xs">
                    Recomendado
                  </Badge>
                </div>
              </button>

              <button
                onClick={() => processPayment('pix')}
                className="flex items-start gap-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors text-left"
              >
                <div className="p-2 bg-green-100 dark:bg-green-900/50 rounded-full">
                  <QrCode className="h-6 w-6 text-green-600 dark:text-green-400" />
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold">PIX</h4>
                  <p className="text-sm text-muted-foreground">
                    Pagamento único de 1 mês. Você precisará renovar manualmente quando vencer.
                  </p>
                </div>
              </button>
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
}
