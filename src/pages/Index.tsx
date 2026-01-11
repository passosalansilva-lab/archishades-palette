import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from 'next-themes';
import {
  Smartphone,
  Truck,
  BarChart3,
  ArrowRight,
  Check,
  Star,
  Zap,
  CreditCard,
  FileText,
  Package,
  Globe,
  Mail,
  Phone,
  ChefHat,
  Shield,
  TrendingUp,
  Clock,
  Receipt,
  MapPinned,
  QrCode,
  Menu,
  X,
  Users,
  Heart,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useSystemLogo } from '@/hooks/useSystemLogo';
import { ChromaKeyImage } from '@/components/ui/chroma-key-image';
import foodPizza from '@/assets/food-pizza-transparent.png';
import foodBurger from '@/assets/food-burger-transparent.png';
import foodSushi from '@/assets/food-sushi-transparent.png';
import foodAcai from '@/assets/food-acai-transparent.png';

const features = [
  { icon: Smartphone, title: 'Cardápio Digital', description: 'Interface moderna e responsiva com QR Code integrado para seus clientes.' },
  { icon: QrCode, title: 'Pedido em Mesa', description: 'QR Code exclusivo por mesa para pedidos direto do celular do cliente.' },
  { icon: ChefHat, title: 'KDS - Cozinha', description: 'Tela para tablet na cozinha com pedidos em tempo real e controle de preparo.', isNew: true },
  { icon: CreditCard, title: 'Pagamento Online', description: 'Receba via PIX e cartão pelo Mercado Pago e PicPay.' },
  { icon: FileText, title: 'Nota Fiscal', description: 'Emissão automática de NF-e integrada ao seu fluxo.' },
  { icon: Truck, title: 'Gestão de Entregas', description: 'Rastreamento GPS em tempo real para você e seu cliente.' },
  { icon: BarChart3, title: 'Relatórios', description: 'Métricas detalhadas e insights para decisões estratégicas.' },
  { icon: Zap, title: 'Notificações Push', description: 'Alertas instantâneos para novos pedidos e atualizações.' },
];

function FeaturesMegaMenu() {
  return (
    <div className="w-[760px] rounded-2xl bg-white border border-orange-200 shadow-2xl backdrop-blur-xl p-6">
      <div className="grid grid-cols-3 gap-4">
        {features.map((feature) => (
          <div
            key={feature.title}
            className="flex gap-4 p-4 rounded-xl hover:bg-orange-50 transition group cursor-pointer"
          >
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center shrink-0">
              <feature.icon className="h-5 w-5 text-white" />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-semibold text-gray-900 text-sm">
                  {feature.title}
                </h4>

                {'isNew' in feature && feature.isNew && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-gradient-to-r from-green-500 to-emerald-500 text-white font-bold">
                    Novo
                  </span>
                )}
              </div>

              <p className="text-xs text-gray-500 leading-snug mt-1">
                {feature.description}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 border-t border-orange-100 pt-4 flex items-center justify-between">
        <span className="text-sm text-gray-500">
          Plataforma completa para delivery
        </span>

        <a
          href="#features"
          className="text-sm font-semibold text-orange-600 hover:text-orange-700 flex items-center gap-2"
        >
          Ver todas
          <ArrowRight className="h-4 w-4" />
        </a>
      </div>
    </div>
  );
}

const integrations = [
  { name: 'Mercado Pago', description: 'Pix, cartão e boleto', icon: CreditCard },
  { name: 'PicPay', description: 'Receba via Pix', icon: Receipt },
  { name: 'Focus NFe', description: 'Emissão fiscal', icon: FileText },
  { name: 'Mapbox', description: 'Rastreamento GPS', icon: MapPinned },
];

const benefits = [
  { icon: TrendingUp, title: 'Aumente suas vendas', description: 'Plataforma otimizada para conversão.' },
  { icon: Clock, title: 'Economize tempo', description: 'Automatize processos operacionais.' },
  { icon: Shield, title: 'Sem taxa sobre pedidos', description: 'Você não paga comissão por venda.' },
];

interface LandingStats {
  total_orders: number;
  total_companies: number;
  avg_rating: number;
}

interface Testimonial {
  id: string;
  author_name: string;
  author_role: string | null;
  content: string;
  rating: number;
}

interface Plan {
  id: string;
  name: string;
  description: string | null;
  price: number;
  features: string[] | null;
  revenue_limit: number | null;
}

export default function Index() {
  const { user, hasRole } = useAuth();
  const { setTheme } = useTheme();
  const { logoUrl } = useSystemLogo("landing");
  const [stats, setStats] = useState<LandingStats | null>(null);
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [currentFoodIndex, setCurrentFoodIndex] = useState(0);
  const [open, setOpen] = useState(false);
  
  const foodImages = [
    { src: foodPizza, alt: 'Pizza', label: 'Pizzarias' },
    { src: foodBurger, alt: 'Hambúrguer', label: 'Hamburguerias' },
    { src: foodSushi, alt: 'Sushi', label: 'Japonês' },
    { src: foodAcai, alt: 'Açaí', label: 'Açaiterias' },
  ];

  useEffect(() => {
    setTheme('light');
  }, [setTheme]);

  useEffect(() => {
    loadStats();
    loadTestimonials();
    loadPlans();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentFoodIndex((prev) => (prev + 1) % foodImages.length);
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  const loadStats = async () => {
    try {
      const { data, error } = await supabase.rpc('get_landing_stats');
      if (error) throw error;
      setStats(data as unknown as LandingStats);
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  const loadTestimonials = async () => {
    try {
      const { data, error } = await supabase
        .from('testimonials')
        .select('id, author_name, author_role, content, rating')
        .eq('is_featured', true)
        .eq('is_approved', true)
        .limit(3);

      if (error) throw error;
      setTestimonials(data || []);
    } catch (error) {
      console.error('Error loading testimonials:', error);
    }
  };

  const loadPlans = async () => {
    try {
      setLoadingPlans(true);
      const { data, error } = await supabase
        .from('subscription_plans')
        .select('id, name, description, price, features, revenue_limit')
        .eq('is_active', true)
        .order('price', { ascending: true });

      if (error) throw error;
      setPlans((data || []) as Plan[]);
    } catch (error) {
      console.error('Error loading plans:', error);
    } finally {
      setLoadingPlans(false);
    }
  };

  const formatNumber = (num: number) => {
    if (num >= 1000) return (num / 1000).toFixed(0) + 'k+';
    return num.toString();
  };

  const getDashboardPath = () => {
    if (!user) return '/';
    if (hasRole('delivery_driver') && !hasRole('store_owner') && !hasRole('super_admin')) {
      return '/driver';
    }
    return '/dashboard';
  };

  return (
    <div className="min-h-screen bg-white font-sans antialiased">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white lg:bg-white/90 md:backdrop-blur-lg border-b border-gray-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 md:px-6">
          <div className="flex h-16 md:h-20 items-center justify-between">
            <Link to={getDashboardPath()} className="flex items-center">
              <ChromaKeyImage
                src={logoUrl}
                alt="CardpOn"
                className="h-10 md:h-14 w-auto"
              />
            </Link>

            <nav className="hidden lg:flex items-center gap-8 relative">
              <div className="relative group">
                <button className="relative font-medium text-gray-700 hover:text-orange-600 transition-colors duration-200">
                  Funcionalidades
                  <span className="absolute -bottom-2 left-0 w-0 h-0.5 bg-gradient-to-r from-orange-500 to-red-500 group-hover:w-full transition-all duration-300" />
                </button>

                <div className="absolute left-1/2 top-full pt-6 -translate-x-1/2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300">
                  <FeaturesMegaMenu />
                </div>
              </div>

              <a href="#pricing" className="relative font-medium text-gray-700 hover:text-orange-600 transition-colors duration-200 group">
                Planos
                <span className="absolute -bottom-2 left-0 w-0 h-0.5 bg-gradient-to-r from-orange-500 to-red-500 group-hover:w-full transition-all duration-300" />
              </a>

              <a href="#contact" className="relative font-medium text-gray-700 hover:text-orange-600 transition-colors duration-200 group">
                Contato
                <span className="absolute -bottom-2 left-0 w-0 h-0.5 bg-gradient-to-r from-orange-500 to-red-500 group-hover:w-full transition-all duration-300" />
              </a>
            </nav>

            <div className="hidden lg:flex items-center gap-4">
              {user ? (
                <Link
                  to={getDashboardPath()}
                  className="px-6 py-2.5 rounded-full bg-gradient-to-r from-orange-500 to-red-500 text-white font-semibold shadow-lg shadow-orange-500/30 hover:shadow-xl hover:scale-105 transition-all duration-200"
                >
                  Abrir painel
                </Link>
              ) : (
                <>
                  <Link
                    to="/auth?mode=login"
                    className="font-medium text-gray-700 hover:text-orange-600 transition-colors duration-200"
                  >
                    Entrar
                  </Link>

                  <Link
                    to="/auth?mode=signup"
                    className="px-6 py-2.5 rounded-full bg-gradient-to-r from-orange-500 to-red-500 text-white font-semibold shadow-lg shadow-orange-500/30 hover:shadow-xl hover:scale-105 transition-all duration-200"
                  >
                    Criar cardápio grátis
                  </Link>
                </>
              )}
            </div>

            <button
              onClick={() => setOpen(true)}
              className="lg:hidden p-2 rounded-lg hover:bg-orange-50 transition-colors"
            >
              <Menu className="w-6 h-6 text-orange-600" />
            </button>
          </div>
        </div>

        {/* Mobile Drawer */}
        <div
          className={`fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm transition-opacity duration-300 ${
            open ? "opacity-100 visible" : "opacity-0 invisible pointer-events-none"
          }`}
          onClick={() => setOpen(false)}
        />

        <div
          className={`fixed top-0 right-0 h-full w-[85%] max-w-sm bg-white z-[70] shadow-2xl transition-transform duration-300 ${
            open ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <div className="p-6 flex flex-col h-full bg-white">
            <div className="flex items-center justify-between mb-8">
              <ChromaKeyImage src={logoUrl} alt="CardpOn" className="h-10" />
              <button onClick={() => setOpen(false)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-6 h-6 text-gray-600" />
              </button>
            </div>

            <nav className="flex flex-col gap-6 text-lg font-medium text-gray-700">
              <a href="#features" onClick={() => setOpen(false)} className="hover:text-orange-600 transition-colors">Funcionalidades</a>
              <a href="#pricing" onClick={() => setOpen(false)} className="hover:text-orange-600 transition-colors">Planos</a>
              <a href="#contact" onClick={() => setOpen(false)} className="hover:text-orange-600 transition-colors">Contato</a>
            </nav>

            <div className="mt-auto pt-6 border-t border-gray-200 flex flex-col gap-4">
              {user ? (
                <Link
                  to={getDashboardPath()}
                  className="w-full text-center py-3 rounded-xl bg-gradient-to-r from-orange-500 to-red-500 text-white font-semibold"
                  onClick={() => setOpen(false)}
                >
                  Abrir painel
                </Link>
              ) : (
                <>
                  <Link
                    to="/auth?mode=login"
                    className="w-full text-center py-3 rounded-xl border-2 border-orange-200 text-orange-600 font-semibold hover:bg-orange-50 transition-colors"
                    onClick={() => setOpen(false)}
                  >
                    Entrar
                  </Link>

                  <Link
                    to="/auth?mode=signup"
                    className="w-full text-center py-3 rounded-xl bg-gradient-to-r from-orange-500 to-red-500 text-white font-semibold shadow-lg shadow-orange-500/30"
                    onClick={() => setOpen(false)}
                  >
                    Criar cardápio grátis
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section - Redesigned */}
      <section className="relative py-12 sm:py-16 lg:py-24 overflow-hidden bg-gradient-to-br from-orange-50 via-white to-red-50">
        {/* Decorative elements */}
        <div className="absolute top-20 right-10 w-72 h-72 bg-orange-200 rounded-full blur-3xl opacity-20" />
        <div className="absolute bottom-20 left-10 w-96 h-96 bg-red-200 rounded-full blur-3xl opacity-20" />
        
        <div className="container max-w-7xl mx-auto px-4 sm:px-6 relative z-10">
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
            {/* Left - Text */}
            <div className="text-center lg:text-left">
              <div className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full bg-white border border-orange-200 shadow-sm mb-4 sm:mb-6 text-xs sm:text-sm">
                <Sparkles className="w-3 h-3 sm:w-4 sm:h-4 text-orange-500 flex-shrink-0" />
                <span className="font-semibold text-orange-600 leading-tight">
                  Grátis até R$ 2.000/mês • Sem taxa sobre pedidos
                </span>
              </div>
              
              <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black tracking-tight text-gray-900 mb-4 sm:mb-6 leading-tight">
                Seu delivery
                <br />
                <span className="bg-gradient-to-r from-orange-500 via-red-500 to-orange-600 bg-clip-text text-transparent">
                  mais rápido
                </span>
                <br />
                e lucrativo
              </h1>
              
              <p className="text-base sm:text-lg lg:text-xl text-gray-600 mb-6 sm:mb-8 max-w-xl mx-auto lg:mx-0 leading-relaxed px-4 lg:px-0">
                Plataforma completa com cardápio digital, gestão de pedidos e entregas em tempo real. Tudo que você precisa para crescer.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center lg:justify-start mb-8 sm:mb-12 px-4 lg:px-0">
                <Button size="lg" asChild className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white px-6 sm:px-8 h-12 sm:h-14 text-sm sm:text-base font-bold shadow-xl shadow-orange-500/30 hover:shadow-2xl hover:scale-105 transition-all duration-200 w-full sm:w-auto">
                  <Link to="/auth?mode=signup">
                    Começar gratuitamente
                    <ArrowRight className="ml-2 h-4 w-4 sm:h-5 sm:w-5" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild className="border-2 border-gray-200 text-gray-700 hover:bg-gray-50 h-12 sm:h-14 text-sm sm:text-base font-semibold w-full sm:w-auto">
                  <a href="#features">
                    <Globe className="mr-2 h-4 w-4 sm:h-5 sm:w-5" />
                    Ver demonstração
                  </a>
                </Button>
              </div>
              
              {/* Social Proof Stats */}
              <div className="grid grid-cols-3 gap-4 sm:gap-6 pt-6 sm:pt-8 border-t border-gray-200 px-4 lg:px-0">
                <div className="text-center lg:text-left">
                  <div className="text-2xl sm:text-3xl lg:text-4xl font-black text-gray-900 mb-1">
                    {stats ? formatNumber(stats.total_orders) : '—'}
                  </div>
                  <div className="text-xs sm:text-sm text-gray-500 font-medium">Pedidos realizados</div>
                </div>
                <div className="text-center lg:text-left">
                  <div className="text-2xl sm:text-3xl lg:text-4xl font-black text-gray-900 mb-1">
                    {stats ? formatNumber(stats.total_companies) : '—'}
                  </div>
                  <div className="text-xs sm:text-sm text-gray-500 font-medium">Restaurantes ativos</div>
                </div>
                <div className="text-center lg:text-left">
                  <div className="flex items-center justify-center lg:justify-start gap-1 mb-1">
                    <span className="text-2xl sm:text-3xl lg:text-4xl font-black text-gray-900">
                      {stats ? stats.avg_rating.toFixed(1) : '—'}
                    </span>
                    <Star className="h-5 w-5 sm:h-6 sm:w-6 text-orange-500 fill-orange-500" />
                  </div>
                  <div className="text-xs sm:text-sm text-gray-500 font-medium">Avaliação média</div>
                </div>
              </div>
            </div>

            {/* Right - Food Carousel with Enhanced Design */}
            <div className="relative hidden lg:block">
              <div className="relative w-full h-[520px] flex items-center justify-center">
                {/* Animated gradient circles */}
                <div className="absolute w-[420px] h-[420px] rounded-full bg-gradient-to-br from-orange-400/30 to-red-400/30 animate-pulse" />
                <div className="absolute w-[340px] h-[340px] rounded-full bg-white shadow-2xl" />
                
                {/* Food image with rotation animation */}
                <div className="relative z-10 w-[280px] h-[280px] flex items-center justify-center">
                  {foodImages.map((food, index) => (
                    <div
                      key={food.alt}
                      className={`absolute inset-0 flex items-center justify-center transition-all duration-700 ${
                        index === currentFoodIndex ? 'opacity-100 scale-100 rotate-0' : 'opacity-0 scale-90 rotate-12'
                      }`}
                    >
                      <ChromaKeyImage
                        src={food.src}
                        alt={food.alt}
                        className="w-full h-full object-contain drop-shadow-2xl"
                      />
                    </div>
                  ))}
                </div>

                {/* Category label with animation */}
                <div className="absolute bottom-12 left-1/2 -translate-x-1/2 z-20">
                  <div className="px-6 py-3 rounded-full bg-white border-2 border-orange-200 shadow-lg">
                    <span className="text-base font-bold bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">
                      {foodImages[currentFoodIndex].label}
                    </span>
                  </div>
                </div>

                {/* Enhanced floating cards with icons */}
                <div className="absolute right-0 top-20 bg-white p-4 rounded-2xl shadow-xl border-2 border-green-100 animate-fade-in">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-green-400 to-emerald-500 rounded-xl flex items-center justify-center">
                      <Package className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-gray-900">Novo pedido!</div>
                      <div className="text-xs text-gray-500 font-semibold">R$ 89,90 • Pizza</div>
                    </div>
                  </div>
                </div>

                <div className="absolute left-0 bottom-28 bg-white p-4 rounded-2xl shadow-xl border-2 border-blue-100 animate-fade-in" style={{ animationDelay: '0.3s' }}>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center">
                      <Truck className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-gray-900">Em entrega</div>
                      <div className="text-xs text-gray-500 font-semibold">12 min restantes</div>
                    </div>
                  </div>
                </div>

                <div className="absolute right-4 bottom-16 bg-white p-3 rounded-xl shadow-lg border-2 border-orange-100 animate-fade-in" style={{ animationDelay: '0.6s' }}>
                  <div className="flex items-center gap-2">
                    <Heart className="h-5 w-5 text-red-500 fill-red-500" />
                    <span className="text-xs font-bold text-gray-700">Cliente satisfeito</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits Bar - Enhanced */}
      <section className="py-8 sm:py-10 lg:py-12 bg-gradient-to-r from-orange-500 via-red-500 to-orange-600 relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS13aWR0aD0iMC41IiBvcGFjaXR5PSIwLjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-10" />
        <div className="container max-w-6xl mx-auto px-4 sm:px-6 relative z-10">
          <div className="grid gap-4 sm:gap-6 lg:gap-8 grid-cols-1 sm:grid-cols-3">
            {benefits.map((benefit) => (
              <div key={benefit.title} className="flex items-center gap-3 sm:gap-4 bg-white/10 backdrop-blur-sm rounded-xl sm:rounded-2xl p-4 sm:p-5 border border-white/20">
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center flex-shrink-0">
                  <benefit.icon className="h-6 w-6 sm:h-7 sm:w-7 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm sm:text-base mb-0.5 sm:mb-1">{benefit.title}</h3>
                  <p className="text-white/90 text-xs sm:text-sm">{benefit.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section - Enhanced Grid */}
      <section id="features" className="py-16 sm:py-20 lg:py-24 bg-gradient-to-b from-gray-50 to-white">
        <div className="container max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12 sm:mb-16">
            <div className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full bg-orange-100 text-orange-700 text-xs sm:text-sm font-semibold mb-3 sm:mb-4">
              <Zap className="w-3 h-3 sm:w-4 sm:h-4" />
              Funcionalidades
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-gray-900 mb-3 sm:mb-4 px-4">
              Tudo para seu
              <span className="bg-gradient-to-r from-orange-500 to-red-500 bg-clip-text text-transparent"> delivery crescer</span>
            </h2>
            <p className="text-base sm:text-lg lg:text-xl text-gray-600 max-w-3xl mx-auto px-4">
              Solução completa com todas as ferramentas necessárias para gerenciar seu negócio com profissionalismo
            </p>
          </div>
          
          <div className="grid gap-6 sm:gap-8 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((feature, index) => (
              <div 
                key={feature.title} 
                className="group relative p-6 sm:p-8 rounded-2xl sm:rounded-3xl border-2 border-gray-100 bg-white hover:border-orange-200 hover:shadow-2xl hover:shadow-orange-500/10 transition-all duration-300 hover:-translate-y-2"
              >
                {'isNew' in feature && feature.isNew && (
                  <div className="absolute -top-2 sm:-top-3 -right-2 sm:-right-3 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full bg-gradient-to-r from-green-500 to-emerald-500 text-white text-xs font-bold shadow-lg">
                    Novo!
                  </div>
                )}
                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center mb-5 sm:mb-6 group-hover:scale-110 group-hover:rotate-6 transition-transform duration-300 shadow-lg shadow-orange-500/30">
                  <feature.icon className="h-7 w-7 sm:h-8 sm:w-8 text-white" />
                </div>
                <h3 className="font-bold text-gray-900 mb-2 sm:mb-3 text-lg sm:text-xl">{feature.title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Integrations - Simplified */}
      <section className="py-20 bg-white border-t border-gray-100">
        <div className="container max-w-6xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-black text-gray-900 mb-4">
              Integrações <span className="bg-gradient-to-r from-orange-500 to-red-500 bg-clip-text text-transparent">poderosas</span>
            </h2>
            <p className="text-gray-600 text-lg">
              Conectado com as melhores plataformas do mercado
            </p>
          </div>
          
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {integrations.map((integration) => (
              <div 
                key={integration.name} 
                className="flex items-center gap-4 p-6 rounded-2xl border-2 border-gray-100 bg-gradient-to-br from-gray-50 to-white hover:border-orange-200 hover:shadow-lg transition-all duration-300"
              >
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-orange-100 to-red-100 flex items-center justify-center flex-shrink-0">
                  <integration.icon className="h-7 w-7 text-orange-600" />
                </div>
                <div>
                  <div className="font-bold text-gray-900 text-base">{integration.name}</div>
                  <div className="text-sm text-gray-500">{integration.description}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* App Demos - Phone Mockups Enhanced */}
      <section id="demos" className="py-24 bg-gradient-to-br from-gray-50 via-orange-50/30 to-gray-50 overflow-hidden">
        <div className="container max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-orange-200 text-orange-700 text-sm font-semibold mb-4 shadow-sm">
              <Smartphone className="w-4 h-4" />
              Aplicativos
            </div>
            <h2 className="text-4xl sm:text-5xl font-black text-gray-900 mb-4">
              Experiência completa
              <span className="bg-gradient-to-r from-orange-500 to-red-500 bg-clip-text text-transparent"> mobile</span>
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Apps nativos para clientes e entregadores com interface moderna e intuitiva
            </p>
          </div>
          
          <div className="grid gap-16 lg:gap-24 lg:grid-cols-2">
            {/* Customer Menu Demo */}
            <div className="flex flex-col items-center">
              <div className="relative mb-8">
                <div className="relative w-[300px] h-[600px] bg-gradient-to-br from-gray-900 to-black rounded-[3rem] p-4 shadow-2xl shadow-gray-900/50">
                  <div className="absolute top-4 left-1/2 -translate-x-1/2 w-32 h-7 bg-black rounded-b-3xl z-10" />
                  
                  <div className="relative w-full h-full bg-gradient-to-br from-orange-100 via-white to-red-50 rounded-[2.5rem] overflow-hidden shadow-inner">
                    <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center">
                      <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center mb-6 shadow-2xl shadow-orange-500/50 animate-pulse">
                        <ChefHat className="h-10 w-10 text-white" />
                      </div>
                      <p className="text-base text-gray-800 font-bold mb-2">
                        Cardápio Digital Interativo
                      </p>
                      <p className="text-sm text-gray-500">
                        Seus clientes navegam e fazem pedidos com facilidade
                      </p>
                    </div>
                  </div>
                  
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-32 h-1.5 bg-gray-700 rounded-full" />
                </div>
                
                <div className="absolute -right-6 top-24 bg-white p-4 rounded-2xl shadow-xl border-2 border-green-100 animate-fade-in">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center">
                      <Check className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <span className="text-sm font-bold text-gray-900 block">Pedido #1234</span>
                      <span className="text-xs text-gray-500">R$ 89,90</span>
                    </div>
                  </div>
                </div>
                
                <div className="absolute -left-6 bottom-36 bg-white p-4 rounded-2xl shadow-xl border-2 border-orange-100 animate-fade-in" style={{ animationDelay: '0.4s' }}>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center">
                      <Package className="h-5 w-5 text-white" />
                    </div>
                    <span className="text-sm font-bold text-gray-700">Preparando</span>
                  </div>
                </div>
              </div>
              
              <h3 className="text-2xl font-black text-gray-900 mb-3">Cardápio Digital</h3>
              <p className="text-base text-gray-600 text-center max-w-sm leading-relaxed">
                Interface moderna e responsiva para seus clientes navegarem pelo menu e fazerem pedidos em segundos
              </p>
            </div>

            {/* Driver Tracking Demo */}
            <div className="flex flex-col items-center">
              <div className="relative mb-8">
                <div className="relative w-[300px] h-[600px] bg-gradient-to-br from-gray-900 to-black rounded-[3rem] p-4 shadow-2xl shadow-gray-900/50">
                  <div className="absolute top-4 left-1/2 -translate-x-1/2 w-32 h-7 bg-black rounded-b-3xl z-10" />
                  
                  <div className="relative w-full h-full bg-gradient-to-br from-blue-100 via-white to-indigo-50 rounded-[2.5rem] overflow-hidden shadow-inner">
                    <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center">
                      <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mb-6 shadow-2xl shadow-blue-500/50 animate-pulse">
                        <Truck className="h-10 w-10 text-white" />
                      </div>
                      <p className="text-base text-gray-800 font-bold mb-2">
                        App do Entregador
                      </p>
                      <p className="text-sm text-gray-500">
                        Gestão completa de entregas com GPS em tempo real
                      </p>
                    </div>
                  </div>
                  
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-32 h-1.5 bg-gray-700 rounded-full" />
                </div>
                
                <div className="absolute -right-6 top-36 bg-white p-4 rounded-2xl shadow-xl border-2 border-blue-100 animate-fade-in">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                      <MapPinned className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <span className="text-sm font-bold text-gray-900 block">GPS Ativo</span>
                      <span className="text-xs text-gray-500">2.3 km</span>
                    </div>
                  </div>
                </div>
                
                <div className="absolute -left-6 bottom-44 bg-white p-4 rounded-2xl shadow-xl border-2 border-green-100 animate-fade-in" style={{ animationDelay: '0.4s' }}>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center">
                      <Check className="h-5 w-5 text-white" />
                    </div>
                    <span className="text-sm font-bold text-gray-700">Entregue!</span>
                  </div>
                </div>
              </div>
              
              <h3 className="text-2xl font-black text-gray-900 mb-3">App do Entregador</h3>
              <p className="text-base text-gray-600 text-center max-w-sm leading-relaxed">
                Seus entregadores acompanham todas as entregas com navegação GPS integrada e atualizações em tempo real
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How it works - Enhanced */}
      <section className="py-24 bg-white">
        <div className="container max-w-5xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-4xl sm:text-5xl font-black text-gray-900 mb-4">
              Comece em
              <span className="bg-gradient-to-r from-orange-500 to-red-500 bg-clip-text text-transparent"> 3 passos</span>
            </h2>
            <p className="text-xl text-gray-600">Configure tudo em menos de 10 minutos</p>
          </div>
          
          <div className="grid gap-12 md:grid-cols-3">
            {[
              { step: '1', icon: Users, title: 'Crie sua conta', desc: 'Cadastro gratuito em 2 minutos. Sem cartão de crédito necessário.' },
              { step: '2', icon: ChefHat, title: 'Monte o cardápio', desc: 'Adicione produtos, fotos e preços com nossa interface intuitiva.' },
              { step: '3', icon: Zap, title: 'Receba pedidos', desc: 'Compartilhe seu link e comece a vender imediatamente.' },
            ].map((item) => (
              <div key={item.step} className="relative text-center group">
                <div className="relative inline-flex items-center justify-center mb-6">
                  <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center shadow-2xl shadow-orange-500/40 group-hover:scale-110 transition-transform duration-300">
                    <item.icon className="h-12 w-12 text-white" />
                  </div>
                  <div className="absolute -top-2 -right-2 w-10 h-10 rounded-full bg-white border-4 border-orange-500 flex items-center justify-center font-black text-orange-600 text-lg shadow-lg">
                    {item.step}
                  </div>
                </div>
                <h3 className="font-black text-gray-900 mb-3 text-xl">{item.title}</h3>
                <p className="text-base text-gray-600 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials - Enhanced */}
      {testimonials.length > 0 && (
        <section className="py-24 bg-gradient-to-br from-gray-50 to-white">
          <div className="container max-w-6xl mx-auto px-6">
            <div className="text-center mb-16">
              <h2 className="text-4xl sm:text-5xl font-black text-gray-900 mb-4">
                Amado por
                <span className="bg-gradient-to-r from-orange-500 to-red-500 bg-clip-text text-transparent"> restaurantes</span>
              </h2>
              <p className="text-xl text-gray-600">Veja o que nossos clientes dizem sobre nós</p>
            </div>
            
            <div className="grid gap-8 md:grid-cols-3">
              {testimonials.map((testimonial) => (
                <div key={testimonial.id} className="bg-white p-8 rounded-3xl border-2 border-gray-100 shadow-lg hover:shadow-2xl hover:border-orange-200 transition-all duration-300 hover:-translate-y-2">
                  <div className="flex items-center gap-1 mb-6">
                    {Array.from({ length: testimonial.rating }).map((_, i) => (
                      <Star key={i} className="h-5 w-5 text-orange-500 fill-orange-500" />
                    ))}
                  </div>
                  <p className="text-gray-700 mb-6 leading-relaxed text-base font-medium">&ldquo;{testimonial.content}&rdquo;</p>
                  <div className="flex items-center gap-4 pt-6 border-t border-gray-100">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center">
                      <ChefHat className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <div className="text-base font-bold text-gray-900">{testimonial.author_name}</div>
                      {testimonial.author_role && (
                        <div className="text-sm text-gray-500">{testimonial.author_role}</div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Pricing - Enhanced */}
      <section id="pricing" className="py-24 bg-white">
        <div className="container max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-orange-100 text-orange-700 text-sm font-semibold mb-4">
              <CreditCard className="w-4 h-4" />
              Preços transparentes
            </div>
            <h2 className="text-4xl sm:text-5xl font-black text-gray-900 mb-4">
              Planos que
              <span className="bg-gradient-to-r from-orange-500 to-red-500 bg-clip-text text-transparent"> crescem com você</span>
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Escolha o plano ideal baseado no seu faturamento mensal
            </p>
          </div>
          
          {loadingPlans ? (
            <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4 max-w-6xl mx-auto">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-96 rounded-3xl bg-gradient-to-br from-gray-100 to-gray-200 animate-pulse" />
              ))}
            </div>
          ) : plans.length > 0 ? (
            <>
              <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4 max-w-6xl mx-auto mb-16">
                {plans.map((plan, index) => {
                  const isPopular = index === 2;
                  return (
                    <div
                      key={plan.id}
                      className={`relative p-8 rounded-3xl border-2 transition-all duration-300 hover:-translate-y-2 ${
                        isPopular
                          ? 'border-orange-400 bg-gradient-to-b from-orange-50 via-white to-red-50 shadow-2xl shadow-orange-500/20 scale-105'
                          : 'border-gray-200 bg-white hover:border-orange-300 hover:shadow-xl'
                      }`}
                    >
                      {isPopular && (
                        <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                          <span className="px-4 py-2 text-sm font-bold bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-full shadow-lg">
                            Mais Popular
                          </span>
                        </div>
                      )}
                      
                      <div className="text-center mb-8">
                        <h3 className="font-black text-gray-900 text-xl mb-3">{plan.name}</h3>
                        {plan.revenue_limit ? (
                          <p className="text-sm text-gray-600 font-medium">
                            Até R$ {plan.revenue_limit.toLocaleString('pt-BR')}/mês
                          </p>
                        ) : (
                          <p className="text-sm text-gray-600 font-medium">Faturamento ilimitado</p>
                        )}
                      </div>
                      
                      <div className="text-center mb-8">
                        {plan.price === 0 ? (
                          <span className="text-4xl font-black text-emerald-600">Grátis</span>
                        ) : (
                          <div>
                            <span className="text-5xl font-black text-gray-900">
                              {plan.price}
                            </span>
                            <span className="text-gray-500 text-lg font-semibold">/mês</span>
                          </div>
                        )}
                      </div>
                      
                      {plan.description && (
                        <p className="text-sm text-gray-600 text-center mb-8 font-medium">{plan.description}</p>
                      )}
                      
                      {plan.features && plan.features.length > 0 && (
                        <ul className="space-y-3 mb-8">
                          {(plan.features as string[]).slice(0, 5).map((feature, idx) => (
                            <li key={idx} className="flex items-start gap-3 text-sm text-gray-700">
                              <Check className="h-5 w-5 text-emerald-500 mt-0.5 flex-shrink-0" />
                              <span className="font-medium">{feature}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      
                      <Button
                        asChild
                        className={`w-full h-12 text-base font-bold rounded-xl ${
                          isPopular
                            ? 'bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white shadow-lg shadow-orange-500/30'
                            : 'bg-gray-900 hover:bg-gray-800 text-white'
                        }`}
                      >
                        <Link to="/auth?mode=signup">
                          {plan.price === 0 ? 'Começar grátis' : 'Assinar agora'}
                        </Link>
                      </Button>
                    </div>
                  );
                })}
              </div>
              
              <div className="max-w-3xl mx-auto p-8 rounded-3xl bg-gradient-to-r from-emerald-50 to-green-50 border-2 border-emerald-200">
                <div className="flex items-start gap-6">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center flex-shrink-0 shadow-lg">
                    <Check className="h-7 w-7 text-white" />
                  </div>
                  <div>
                    <h3 className="font-black text-gray-900 mb-3 text-lg">Como funciona?</h3>
                    <p className="text-base text-gray-700 leading-relaxed">
                      Comece <strong className="text-emerald-700">gratuitamente</strong> e use todas as funcionalidades enquanto 
                      faturar até <strong className="text-emerald-700">R$ 2.000/mês</strong>. Quando ultrapassar esse valor, 
                      escolha o plano adequado ao seu faturamento. <strong className="text-emerald-700">Sem cobrança retroativa!</strong>
                    </p>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="text-center text-gray-500 py-16">
              <Package className="h-16 w-16 mx-auto mb-4 text-gray-300" />
              <p className="text-lg">Nenhum plano disponível no momento.</p>
            </div>
          )}
        </div>
      </section>

      {/* CTA - Enhanced */}
      <section className="py-24 bg-gradient-to-r from-orange-500 via-red-500 to-orange-600 relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS13aWR0aD0iMC41IiBvcGFjaXR5PSIwLjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-10" />
        <div className="container max-w-5xl mx-auto px-6 text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/20 backdrop-blur-sm border border-white/30 text-white text-sm font-semibold mb-6">
            <Zap className="w-4 h-4" />
            Comece agora mesmo
          </div>
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white mb-6">
            Pronto para revolucionar
            <br />
            seu delivery?
          </h2>
          <p className="text-xl text-white/90 mb-10 max-w-2xl mx-auto leading-relaxed">
            Junte-se a centenas de restaurantes que já transformaram sua operação e aumentaram suas vendas com nossa plataforma
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Button size="lg" asChild className="bg-white text-orange-600 hover:bg-gray-50 px-10 h-16 text-lg font-bold shadow-2xl hover:scale-105 transition-all duration-200">
              <Link to="/auth?mode=signup">
                Criar conta grátis
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
            <span className="text-white/80 text-sm font-medium">
              ✓ Grátis até R$ 2.000/mês • ✓ Sem cartão • ✓ Sem taxa sobre pedidos
            </span>
          </div>
        </div>
      </section>

      {/* Footer - Enhanced */}
      <footer id="contact" className="bg-gradient-to-b from-gray-900 to-black text-gray-400 py-20">
        <div className="container max-w-6xl mx-auto px-6">
          <div className="grid gap-12 md:grid-cols-4 mb-16">
            <div className="md:col-span-2">
              <Link to={getDashboardPath()} className="inline-block mb-6">
                <ChromaKeyImage
                  src={logoUrl}
                  alt="Cardápio On"
                  className="h-10 w-auto brightness-0 invert opacity-80"
                />
              </Link>
              <p className="text-base leading-relaxed max-w-md text-gray-400 mb-6">
                A plataforma mais completa para transformar seu delivery. Gestão profissional, 
                cardápio digital e pagamentos online integrados.
              </p>
              <div className="flex gap-3">
                <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors cursor-pointer">
                  <Mail className="h-5 w-5 text-gray-300" />
                </div>
              </div>
            </div>
            
            <div>
              <h4 className="font-bold text-white mb-6 text-sm uppercase tracking-wider">Produto</h4>
              <ul className="space-y-4">
                <li><a href="#features" className="text-base hover:text-orange-400 transition-colors">Funcionalidades</a></li>
                <li><a href="#pricing" className="text-base hover:text-orange-400 transition-colors">Planos</a></li>
                <li><a href="#demos" className="text-base hover:text-orange-400 transition-colors">Demonstração</a></li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-bold text-white mb-6 text-sm uppercase tracking-wider">Contato</h4>
              <ul className="space-y-4 text-base">
                <li className="flex items-start gap-3">
                  <Mail className="h-5 w-5 text-orange-500 mt-0.5 flex-shrink-0" />
                  <span>contato@cardapon.com.br</span>
                </li>
                <li className="flex items-start gap-3">
                  <Phone className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                  <a 
                    href="https://wa.me/5518996192561?text=Olá!%20Gostaria%20de%20saber%20mais%20sobre%20o%20CardpOn."
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-green-400 transition-colors"
                  >
                    WhatsApp Suporte
                  </a>
                </li>
              </ul>
            </div>
          </div>
          
          <div className="border-t border-gray-800 pt-10 flex flex-col sm:flex-row justify-between items-center gap-6 text-base">
            <p className="text-gray-500">© 2025 Cardápio On. Todos os direitos reservados.</p>
            <div className="flex gap-8">
              <Link to="/termos" className="hover:text-orange-400 transition-colors font-medium">Termos de Uso</Link>
              <Link to="/privacidade" className="hover:text-orange-400 transition-colors font-medium">Privacidade</Link>
            </div>
          </div>
        </div>
      </footer>

      <style>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        .animate-fade-in {
          animation: fade-in 0.6s ease-out forwards;
        }
      `}</style>
    </div>
  );
}