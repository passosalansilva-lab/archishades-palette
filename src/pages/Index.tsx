import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTheme } from 'next-themes';
import { motion, AnimatePresence } from 'framer-motion';
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
  Play,
  Sparkles,
  ArrowUpRight,
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
  { icon: Smartphone, title: 'Cardápio Digital', description: 'Interface moderna com QR Code integrado para seus clientes.', color: 'from-orange-500 to-red-500' },
  { icon: QrCode, title: 'Pedido em Mesa', description: 'QR Code exclusivo por mesa para pedidos direto do celular.', color: 'from-violet-500 to-purple-600' },
  { icon: ChefHat, title: 'KDS - Cozinha', description: 'Tela para tablet na cozinha com pedidos em tempo real.', isNew: true, color: 'from-emerald-500 to-green-600' },
  { icon: CreditCard, title: 'Pagamento Online', description: 'Receba via PIX e cartão pelo Mercado Pago e PicPay.', color: 'from-blue-500 to-cyan-500' },
  { icon: FileText, title: 'Nota Fiscal', description: 'Emissão automática de NF-e integrada ao seu fluxo.', color: 'from-amber-500 to-orange-500' },
  { icon: Truck, title: 'Gestão de Entregas', description: 'Rastreamento GPS em tempo real para você e seu cliente.', color: 'from-pink-500 to-rose-500' },
  { icon: BarChart3, title: 'Relatórios', description: 'Métricas detalhadas e insights para decisões estratégicas.', color: 'from-indigo-500 to-blue-600' },
  { icon: Zap, title: 'Notificações Push', description: 'Alertas instantâneos para novos pedidos e atualizações.', color: 'from-yellow-500 to-amber-500' },
];

const integrations = [
  { name: 'Mercado Pago', description: 'Pix, cartão e boleto', icon: CreditCard },
  { name: 'PicPay', description: 'Receba via Pix', icon: Receipt },
  { name: 'Focus NFe', description: 'Emissão fiscal', icon: FileText },
  { name: 'Mapbox', description: 'Rastreamento GPS', icon: MapPinned },
];

const benefits = [
  { icon: TrendingUp, title: 'Aumente suas vendas', description: 'Plataforma otimizada para conversão.', stat: '+47%', statLabel: 'em vendas' },
  { icon: Clock, title: 'Economize tempo', description: 'Automatize processos operacionais.', stat: '3h', statLabel: 'economizadas/dia' },
  { icon: Shield, title: 'Zero taxas', description: 'Você não paga comissão por venda.', stat: '0%', statLabel: 'de taxa' },
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
  const { user, hasRole, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { setTheme } = useTheme();
  const { logoUrl } = useSystemLogo("landing");
  const [stats, setStats] = useState<LandingStats | null>(null);
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [currentFoodIndex, setCurrentFoodIndex] = useState(0);
  const [open, setOpen] = useState(false);

  // Redirect logged-in users to dashboard automatically
  useEffect(() => {
    if (authLoading) return;
    
    if (user) {
      if (hasRole('delivery_driver') && !hasRole('store_owner') && !hasRole('super_admin')) {
        navigate('/driver', { replace: true });
      } else {
        navigate('/dashboard', { replace: true });
      }
    }
  }, [user, authLoading, hasRole, navigate]);
  
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

  // Close mobile menu when screen becomes large
  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 1024px)');
    const handleChange = (e: MediaQueryListEvent | MediaQueryList) => {
      if (e.matches && open) {
        setOpen(false);
      }
    };
    
    handleChange(mediaQuery);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [open]);

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
    <div className="min-h-screen bg-white font-sans antialiased overflow-x-hidden">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 lg:h-20 items-center justify-between">
            <Link to={getDashboardPath()} className="flex items-center">
              <ChromaKeyImage
                src={logoUrl}
                alt="CardapOn"
                className="h-9 lg:h-12 w-auto"
              />
            </Link>

            <nav className="hidden lg:flex items-center gap-1">
              {[
                { label: 'Funcionalidades', href: '#features' },
                { label: 'Demonstração', href: '#demos' },
                { label: 'Planos', href: '#pricing' },
                { label: 'Contato', href: '#contact' },
              ].map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="px-4 py-2 text-sm font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-all"
                >
                  {link.label}
                </a>
              ))}
            </nav>

            <div className="hidden lg:flex items-center gap-3">
              {user ? (
                <Link
                  to={getDashboardPath()}
                  className="px-6 py-2.5 rounded-full bg-gray-900 text-white font-semibold hover:bg-gray-800 transition-all"
                >
                  Abrir painel
                </Link>
              ) : (
                <>
                  <Link
                    to="/auth?mode=login"
                    className="px-4 py-2.5 text-sm font-semibold text-gray-700 hover:text-gray-900 transition-colors"
                  >
                    Entrar
                  </Link>
                  <Link
                    to="/auth?mode=signup"
                    className="px-6 py-2.5 rounded-full bg-gray-900 text-white font-semibold hover:bg-gray-800 transition-all text-sm"
                  >
                    Começar grátis
                  </Link>
                </>
              )}
            </div>

            <button
              onClick={() => setOpen(true)}
              className="lg:hidden p-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 transition-colors"
            >
              <Menu className="w-5 h-5 text-gray-700" />
            </button>
          </div>
        </div>

        {/* Mobile Drawer */}
        <AnimatePresence>
          {open && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
                onClick={() => setOpen(false)}
              />
              <motion.div
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                className="fixed top-0 right-0 h-full w-[85%] max-w-sm bg-white z-[70] shadow-2xl"
              >
                <div className="p-6 flex flex-col h-full">
                  <div className="flex items-center justify-between mb-10">
                    <ChromaKeyImage src={logoUrl} alt="CardapOn" className="h-9" />
                    <button 
                      onClick={() => setOpen(false)} 
                      className="p-2.5 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
                    >
                      <X className="w-5 h-5 text-gray-600" />
                    </button>
                  </div>

                  <nav className="flex flex-col gap-2">
                    {[
                      { label: 'Funcionalidades', href: '#features' },
                      { label: 'Demonstração', href: '#demos' },
                      { label: 'Planos', href: '#pricing' },
                      { label: 'Contato', href: '#contact' },
                    ].map((link) => (
                      <a
                        key={link.href}
                        href={link.href}
                        onClick={() => setOpen(false)}
                        className="px-4 py-3 text-lg font-semibold text-gray-700 hover:text-gray-900 hover:bg-gray-50 rounded-xl transition-all"
                      >
                        {link.label}
                      </a>
                    ))}
                  </nav>

                  <div className="mt-auto pt-6 border-t border-gray-100 flex flex-col gap-3">
                    {user ? (
                      <Link
                        to={getDashboardPath()}
                        className="w-full text-center py-3.5 rounded-xl bg-gray-900 text-white font-semibold"
                        onClick={() => setOpen(false)}
                      >
                        Abrir painel
                      </Link>
                    ) : (
                      <>
                        <Link
                          to="/auth?mode=login"
                          className="w-full text-center py-3.5 rounded-xl border-2 border-gray-200 text-gray-700 font-semibold hover:bg-gray-50 transition-colors"
                          onClick={() => setOpen(false)}
                        >
                          Entrar
                        </Link>
                        <Link
                          to="/auth?mode=signup"
                          className="w-full text-center py-3.5 rounded-xl bg-gray-900 text-white font-semibold"
                          onClick={() => setOpen(false)}
                        >
                          Começar grátis
                        </Link>
                      </>
                    )}
                  </div>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </header>

      {/* Hero Section - Bold Design */}
      <section className="relative pt-32 lg:pt-40 pb-20 lg:pb-32 overflow-hidden">
        {/* Background Elements */}
        <div className="absolute inset-0 bg-gradient-to-br from-orange-50 via-white to-rose-50" />
        <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-gradient-to-br from-orange-200/40 to-rose-200/40 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-gradient-to-tr from-amber-100/50 to-orange-100/50 rounded-full blur-3xl translate-y-1/2 -translate-x-1/3" />
        
        <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Left - Text Content */}
            <motion.div 
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="text-center lg:text-left"
            >
              {/* Badge */}
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2 }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-orange-100 to-rose-100 border border-orange-200/50 mb-6"
              >
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-500 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500" />
                </span>
                <span className="text-sm font-semibold text-orange-700">
                  Grátis até R$ 2.000/mês
                </span>
              </motion.div>
              
              {/* Headline */}
              <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-black tracking-tight text-gray-900 mb-6 leading-[1.1]">
                Seu delivery
                <br />
                <span className="relative">
                  <span className="relative z-10 bg-gradient-to-r from-orange-500 via-rose-500 to-orange-600 bg-clip-text text-transparent">
                    mais lucrativo
                  </span>
                  <svg className="absolute -bottom-2 left-0 w-full h-3 text-orange-200" viewBox="0 0 200 8" fill="currentColor">
                    <path d="M0 6C50 0 150 0 200 6V8H0V6Z" />
                  </svg>
                </span>
              </h1>
              
              <p className="text-lg sm:text-xl text-gray-600 mb-8 max-w-xl mx-auto lg:mx-0 leading-relaxed">
                Cardápio digital, gestão de pedidos e entregas em tempo real. 
                <strong className="text-gray-900"> Sem taxa sobre vendas.</strong>
              </p>
              
              {/* CTAs */}
              <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start mb-12">
                <Button 
                  size="lg" 
                  asChild 
                  className="bg-gray-900 hover:bg-gray-800 text-white px-8 h-14 text-base font-bold rounded-xl shadow-xl shadow-gray-900/20 hover:shadow-2xl hover:scale-[1.02] transition-all duration-200"
                >
                  <Link to="/auth?mode=signup">
                    Começar gratuitamente
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Link>
                </Button>
                <Button 
                  size="lg" 
                  variant="outline" 
                  asChild 
                  className="border-2 border-gray-200 bg-white/50 backdrop-blur-sm text-gray-700 hover:bg-white h-14 text-base font-semibold rounded-xl"
                >
                  <a href="#demos">
                    <Play className="mr-2 h-5 w-5" />
                    Ver demonstração
                  </a>
                </Button>
              </div>
              
              {/* Stats Row */}
              <div className="grid grid-cols-3 gap-6 pt-8 border-t border-gray-200/70">
                <div>
                  <div className="text-3xl sm:text-4xl font-black text-gray-900">
                    {stats ? formatNumber(stats.total_orders) : '—'}
                  </div>
                  <div className="text-sm text-gray-500 font-medium mt-1">Pedidos</div>
                </div>
                <div>
                  <div className="text-3xl sm:text-4xl font-black text-gray-900">
                    {stats ? formatNumber(stats.total_companies) : '—'}
                  </div>
                  <div className="text-sm text-gray-500 font-medium mt-1">Restaurantes</div>
                </div>
                <div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl sm:text-4xl font-black text-gray-900">
                      {stats ? stats.avg_rating.toFixed(1) : '—'}
                    </span>
                    <Star className="h-5 w-5 text-amber-500 fill-amber-500" />
                  </div>
                  <div className="text-sm text-gray-500 font-medium mt-1">Avaliação</div>
                </div>
              </div>
            </motion.div>

            {/* Right - Visual */}
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="relative hidden lg:block"
            >
              <div className="relative w-full aspect-square max-w-[540px] mx-auto">
                {/* Main Circle */}
                <div className="absolute inset-8 rounded-full bg-gradient-to-br from-orange-100 via-white to-rose-100 shadow-2xl shadow-orange-200/50" />
                
                {/* Food Image */}
                <div className="absolute inset-0 flex items-center justify-center p-16">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={currentFoodIndex}
                      initial={{ opacity: 0, scale: 0.8, rotate: -10 }}
                      animate={{ opacity: 1, scale: 1, rotate: 0 }}
                      exit={{ opacity: 0, scale: 0.8, rotate: 10 }}
                      transition={{ duration: 0.5 }}
                      className="w-full h-full"
                    >
                      <ChromaKeyImage
                        src={foodImages[currentFoodIndex].src}
                        alt={foodImages[currentFoodIndex].alt}
                        className="w-full h-full object-contain drop-shadow-2xl"
                      />
                    </motion.div>
                  </AnimatePresence>
                </div>

                {/* Category Badge */}
                <motion.div 
                  key={`label-${currentFoodIndex}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="absolute bottom-16 left-1/2 -translate-x-1/2 z-20"
                >
                  <div className="px-6 py-3 rounded-full bg-white shadow-xl border border-gray-100">
                    <span className="text-base font-bold text-gray-900">
                      {foodImages[currentFoodIndex].label}
                    </span>
                  </div>
                </motion.div>

                {/* Floating Cards */}
                <motion.div 
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.5 }}
                  className="absolute right-0 top-16 bg-white p-4 rounded-2xl shadow-xl border border-gray-100"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-emerald-400 to-green-500 rounded-xl flex items-center justify-center">
                      <Package className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-gray-900">Novo pedido!</div>
                      <div className="text-xs text-gray-500">R$ 89,90 • Pizza</div>
                    </div>
                  </div>
                </motion.div>

                <motion.div 
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.7 }}
                  className="absolute left-0 bottom-32 bg-white p-4 rounded-2xl shadow-xl border border-gray-100"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center">
                      <Truck className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-gray-900">Em entrega</div>
                      <div className="text-xs text-gray-500">12 min restantes</div>
                    </div>
                  </div>
                </motion.div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Benefits Bar */}
      <section className="py-6 bg-gray-900 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-orange-600/10 via-transparent to-rose-600/10" />
        <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="flex flex-wrap justify-center gap-8 lg:gap-16">
            {benefits.map((benefit, index) => (
              <motion.div 
                key={benefit.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="flex items-center gap-4"
              >
                <div className="text-3xl font-black text-white">{benefit.stat}</div>
                <div>
                  <div className="text-sm font-semibold text-white">{benefit.title}</div>
                  <div className="text-xs text-gray-400">{benefit.statLabel}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section - Bento Grid */}
      <section id="features" className="py-24 lg:py-32 bg-gray-50">
        <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-gray-200 shadow-sm mb-6">
              <Sparkles className="w-4 h-4 text-orange-500" />
              <span className="text-sm font-semibold text-gray-700">Funcionalidades</span>
            </div>
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black text-gray-900 mb-4">
              Tudo que você precisa
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Ferramentas profissionais para gerenciar seu delivery do início ao fim
            </p>
          </motion.div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
            {features.map((feature, index) => (
              <motion.div 
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.05 }}
                className="group relative p-6 lg:p-8 rounded-3xl bg-white border border-gray-100 hover:border-gray-200 shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1"
              >
                {'isNew' in feature && feature.isNew && (
                  <div className="absolute -top-3 right-6 px-3 py-1.5 rounded-full bg-emerald-500 text-white text-xs font-bold shadow-lg">
                    Novo
                  </div>
                )}
                <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${feature.color} flex items-center justify-center mb-5 group-hover:scale-110 transition-transform duration-300 shadow-lg`}>
                  <feature.icon className="h-7 w-7 text-white" />
                </div>
                <h3 className="font-bold text-gray-900 mb-2 text-lg">{feature.title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Integrations */}
      <section className="py-20 bg-white border-y border-gray-100">
        <div className="container max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row items-center gap-12">
            <div className="lg:w-1/3">
              <h2 className="text-3xl sm:text-4xl font-black text-gray-900 mb-4">
                Integrações poderosas
              </h2>
              <p className="text-gray-600">
                Conectado com as melhores plataformas do mercado para facilitar sua operação.
              </p>
            </div>
            <div className="lg:w-2/3 grid grid-cols-2 sm:grid-cols-4 gap-4">
              {integrations.map((integration, index) => (
                <motion.div 
                  key={integration.name}
                  initial={{ opacity: 0, scale: 0.9 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  className="flex flex-col items-center p-6 rounded-2xl bg-gray-50 border border-gray-100 hover:bg-white hover:shadow-lg hover:border-gray-200 transition-all duration-300"
                >
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center mb-3">
                    <integration.icon className="h-6 w-6 text-gray-700" />
                  </div>
                  <div className="text-sm font-bold text-gray-900 text-center">{integration.name}</div>
                  <div className="text-xs text-gray-500 text-center">{integration.description}</div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Demo Section */}
      <section id="demos" className="py-24 lg:py-32 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS13aWR0aD0iMC41IiBvcGFjaXR5PSIwLjA1Ii8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+')] opacity-50" />
        
        <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 border border-white/20 mb-6">
              <Smartphone className="w-4 h-4 text-orange-400" />
              <span className="text-sm font-semibold text-white">Experiência Mobile</span>
            </div>
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white mb-4">
              Apps web modernos
            </h2>
            <p className="text-xl text-gray-400 max-w-2xl mx-auto">
              Seus clientes e entregadores terão a melhor experiência
            </p>
          </motion.div>
          
          <div className="grid lg:grid-cols-2 gap-16 lg:gap-24">
            {/* Customer App */}
            <motion.div 
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="flex flex-col items-center"
            >
              <div className="relative mb-8">
                <div className="relative w-[280px] h-[580px] bg-gray-800 rounded-[3rem] p-3 shadow-2xl">
                  <div className="absolute top-3 left-1/2 -translate-x-1/2 w-28 h-6 bg-black rounded-b-2xl z-10" />
                  <div className="relative w-full h-full bg-gradient-to-br from-orange-50 via-white to-rose-50 rounded-[2.5rem] overflow-hidden flex flex-col items-center justify-center p-8">
                    <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-orange-500 to-rose-500 flex items-center justify-center mb-6 shadow-xl">
                      <ChefHat className="h-10 w-10 text-white" />
                    </div>
                    <p className="text-lg font-bold text-gray-900 mb-2">Cardápio Digital</p>
                    <p className="text-sm text-gray-500 text-center">Interface intuitiva para seus clientes</p>
                  </div>
                </div>
                
                {/* Floating Elements */}
                <div className="absolute -right-4 top-20 bg-white p-3 rounded-xl shadow-xl border border-gray-100">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center">
                      <Check className="h-4 w-4 text-white" />
                    </div>
                    <div className="text-xs">
                      <span className="font-bold text-gray-900 block">Pedido #1234</span>
                      <span className="text-gray-500">R$ 89,90</span>
                    </div>
                  </div>
                </div>
              </div>
              <h3 className="text-2xl font-black text-white mb-2">Para seus clientes</h3>
              <p className="text-gray-400 text-center max-w-sm">
                Cardápio responsivo e moderno para pedidos rápidos
              </p>
            </motion.div>

            {/* Driver App */}
            <motion.div 
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="flex flex-col items-center"
            >
              <div className="relative mb-8">
                <div className="relative w-[280px] h-[580px] bg-gray-800 rounded-[3rem] p-3 shadow-2xl">
                  <div className="absolute top-3 left-1/2 -translate-x-1/2 w-28 h-6 bg-black rounded-b-2xl z-10" />
                  <div className="relative w-full h-full bg-gradient-to-br from-blue-50 via-white to-indigo-50 rounded-[2.5rem] overflow-hidden flex flex-col items-center justify-center p-8">
                    <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mb-6 shadow-xl">
                      <Truck className="h-10 w-10 text-white" />
                    </div>
                    <p className="text-lg font-bold text-gray-900 mb-2">App do Entregador</p>
                    <p className="text-sm text-gray-500 text-center">Gestão completa com GPS em tempo real</p>
                  </div>
                </div>
                
                {/* Floating Elements */}
                <div className="absolute -left-4 top-32 bg-white p-3 rounded-xl shadow-xl border border-gray-100">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center">
                      <MapPinned className="h-4 w-4 text-white" />
                    </div>
                    <div className="text-xs">
                      <span className="font-bold text-gray-900 block">GPS Ativo</span>
                      <span className="text-gray-500">2.3 km</span>
                    </div>
                  </div>
                </div>
              </div>
              <h3 className="text-2xl font-black text-white mb-2">Para entregadores</h3>
              <p className="text-gray-400 text-center max-w-sm">
                Navegação GPS e gestão de entregas integrada
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section className="py-24 lg:py-32 bg-white">
        <div className="container max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black text-gray-900 mb-4">
              Comece em 3 passos
            </h2>
            <p className="text-xl text-gray-600">Configure tudo em menos de 10 minutos</p>
          </motion.div>
          
          <div className="grid md:grid-cols-3 gap-8 lg:gap-12">
            {[
              { step: '01', icon: Users, title: 'Crie sua conta', desc: 'Cadastro gratuito em 2 minutos. Sem cartão necessário.' },
              { step: '02', icon: ChefHat, title: 'Monte o cardápio', desc: 'Adicione produtos, fotos e preços com nossa interface intuitiva.' },
              { step: '03', icon: Zap, title: 'Receba pedidos', desc: 'Compartilhe seu link e comece a vender imediatamente.' },
            ].map((item, index) => (
              <motion.div 
                key={item.step}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="relative text-center group"
              >
                <div className="relative inline-flex items-center justify-center mb-6">
                  <div className="w-24 h-24 rounded-3xl bg-gray-100 group-hover:bg-gray-900 flex items-center justify-center transition-all duration-300 group-hover:scale-110">
                    <item.icon className="h-12 w-12 text-gray-400 group-hover:text-white transition-colors" />
                  </div>
                  <div className="absolute -top-3 -right-3 w-10 h-10 rounded-full bg-orange-500 flex items-center justify-center font-bold text-white text-sm shadow-lg">
                    {item.step}
                  </div>
                </div>
                <h3 className="font-black text-gray-900 mb-2 text-xl">{item.title}</h3>
                <p className="text-gray-600">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      {testimonials.length > 0 && (
        <section className="py-24 lg:py-32 bg-gray-50">
          <div className="container max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-16"
            >
              <h2 className="text-4xl sm:text-5xl font-black text-gray-900 mb-4">
                Amado por restaurantes
              </h2>
              <p className="text-xl text-gray-600">Veja o que nossos clientes dizem</p>
            </motion.div>
            
            <div className="grid md:grid-cols-3 gap-8">
              {testimonials.map((testimonial, index) => (
                <motion.div 
                  key={testimonial.id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm hover:shadow-xl transition-all duration-300"
                >
                  <div className="flex items-center gap-1 mb-6">
                    {Array.from({ length: testimonial.rating }).map((_, i) => (
                      <Star key={i} className="h-5 w-5 text-amber-500 fill-amber-500" />
                    ))}
                  </div>
                  <p className="text-gray-700 mb-6 leading-relaxed">&ldquo;{testimonial.content}&rdquo;</p>
                  <div className="flex items-center gap-4 pt-6 border-t border-gray-100">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-orange-400 to-rose-500 flex items-center justify-center">
                      <span className="text-white font-bold text-lg">
                        {testimonial.author_name.charAt(0)}
                      </span>
                    </div>
                    <div>
                      <div className="font-bold text-gray-900">{testimonial.author_name}</div>
                      {testimonial.author_role && (
                        <div className="text-sm text-gray-500">{testimonial.author_role}</div>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Pricing */}
      <section id="pricing" className="py-24 lg:py-32 bg-white">
        <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gray-100 mb-6">
              <CreditCard className="w-4 h-4 text-gray-600" />
              <span className="text-sm font-semibold text-gray-700">Preços transparentes</span>
            </div>
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black text-gray-900 mb-4">
              Planos simples e justos
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Pague apenas quando seu negócio crescer
            </p>
          </motion.div>
          
          {loadingPlans ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-96 rounded-3xl bg-gray-100 animate-pulse" />
              ))}
            </div>
          ) : plans.length > 0 ? (
            <>
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto mb-12">
                {plans.map((plan, index) => {
                  const isPopular = index === 2;
                  return (
                    <motion.div
                      key={plan.id}
                      initial={{ opacity: 0, y: 20 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: index * 0.1 }}
                      className={`relative p-6 lg:p-8 rounded-3xl border-2 transition-all duration-300 ${
                        isPopular
                          ? 'border-orange-400 bg-gradient-to-b from-orange-50 to-white shadow-xl scale-105'
                          : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-lg'
                      }`}
                    >
                      {isPopular && (
                        <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                          <span className="px-4 py-1.5 text-xs font-bold bg-orange-500 text-white rounded-full">
                            Mais Popular
                          </span>
                        </div>
                      )}
                      
                      <div className="mb-6">
                        <h3 className="font-bold text-gray-900 text-lg mb-1">{plan.name}</h3>
                        {plan.revenue_limit ? (
                          <p className="text-sm text-gray-500">
                            Até R$ {plan.revenue_limit.toLocaleString('pt-BR')}/mês
                          </p>
                        ) : (
                          <p className="text-sm text-gray-500">Faturamento ilimitado</p>
                        )}
                      </div>
                      
                      <div className="mb-6">
                        {plan.price === 0 ? (
                          <span className="text-4xl font-black text-emerald-600">Grátis</span>
                        ) : (
                          <div className="flex items-baseline gap-1">
                            <span className="text-sm text-gray-500">R$</span>
                            <span className="text-4xl font-black text-gray-900">{plan.price}</span>
                            <span className="text-gray-500">/mês</span>
                          </div>
                        )}
                      </div>
                      
                      {plan.features && plan.features.length > 0 && (
                        <ul className="space-y-3 mb-8">
                          {(plan.features as string[]).slice(0, 5).map((feature, idx) => (
                            <li key={idx} className="flex items-start gap-2 text-sm text-gray-600">
                              <Check className="h-4 w-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                              <span>{feature}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      
                      <Button
                        asChild
                        className={`w-full h-12 font-semibold rounded-xl ${
                          isPopular
                            ? 'bg-orange-500 hover:bg-orange-600 text-white'
                            : 'bg-gray-900 hover:bg-gray-800 text-white'
                        }`}
                      >
                        <Link to="/auth?mode=signup">
                          {plan.price === 0 ? 'Começar grátis' : 'Assinar'}
                        </Link>
                      </Button>
                    </motion.div>
                  );
                })}
              </div>
              
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="max-w-3xl mx-auto p-8 rounded-3xl bg-gradient-to-r from-emerald-50 to-green-50 border border-emerald-200"
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-emerald-500 flex items-center justify-center flex-shrink-0">
                    <Check className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 mb-2">Como funciona?</h3>
                    <p className="text-gray-700">
                      Comece <strong className="text-emerald-700">gratuitamente</strong> e use todas as funcionalidades enquanto 
                      faturar até <strong className="text-emerald-700">R$ 2.000/mês</strong>. Quando ultrapassar, escolha o plano 
                      adequado. <strong className="text-emerald-700">Sem cobrança retroativa!</strong>
                    </p>
                  </div>
                </div>
              </motion.div>
            </>
          ) : (
            <div className="text-center text-gray-500 py-16">
              <Package className="h-16 w-16 mx-auto mb-4 text-gray-300" />
              <p className="text-lg">Nenhum plano disponível no momento.</p>
            </div>
          )}
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24 lg:py-32 bg-gray-900 relative overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-orange-500/20 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-rose-500/20 rounded-full blur-3xl" />
        </div>
        
        <div className="container max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white mb-6 leading-tight">
              Pronto para transformar
              <br />
              seu delivery?
            </h2>
            <p className="text-xl text-gray-400 mb-10 max-w-2xl mx-auto">
              Junte-se a centenas de restaurantes que já aumentaram suas vendas
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-8">
              <Button 
                size="lg" 
                asChild 
                className="bg-white text-gray-900 hover:bg-gray-100 px-10 h-14 text-base font-bold rounded-xl shadow-2xl hover:scale-105 transition-all duration-200"
              >
                <Link to="/auth?mode=signup">
                  Criar conta grátis
                  <ArrowUpRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
            </div>
            <div className="flex flex-wrap justify-center gap-6 text-sm text-gray-500">
              <span className="flex items-center gap-2">
                <Check className="h-4 w-4 text-emerald-500" />
                Grátis até R$ 2.000/mês
              </span>
              <span className="flex items-center gap-2">
                <Check className="h-4 w-4 text-emerald-500" />
                Sem cartão de crédito
              </span>
              <span className="flex items-center gap-2">
                <Check className="h-4 w-4 text-emerald-500" />
                Sem taxa sobre pedidos
              </span>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer id="contact" className="bg-black text-gray-400 py-16">
        <div className="container max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-12 mb-12">
            <div className="md:col-span-2">
              <Link to={getDashboardPath()} className="inline-block mb-6">
                <ChromaKeyImage
                  src={logoUrl}
                  alt="CardapioOn"
                  className="h-10 w-auto brightness-0 invert opacity-80"
                />
              </Link>
              <p className="leading-relaxed max-w-md mb-6">
                A plataforma mais completa para transformar seu delivery. 
                Gestão profissional, cardápio digital e pagamentos online integrados.
              </p>
            </div>
            
            <div>
              <h4 className="font-bold text-white mb-4 text-sm uppercase tracking-wider">Produto</h4>
              <ul className="space-y-3">
                <li><a href="#features" className="hover:text-white transition-colors">Funcionalidades</a></li>
                <li><a href="#pricing" className="hover:text-white transition-colors">Planos</a></li>
                <li><a href="#demos" className="hover:text-white transition-colors">Demonstração</a></li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-bold text-white mb-4 text-sm uppercase tracking-wider">Contato</h4>
              <ul className="space-y-3">
                <li className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-orange-500" />
                  <span>contato@cardapon.com.br</span>
                </li>
                <li className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-green-500" />
                  <a 
                    href="https://wa.me/5518996192561?text=Olá!%20Gostaria%20de%20saber%20mais%20sobre%20o%20CardpOn."
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-white transition-colors"
                  >
                    WhatsApp Suporte
                  </a>
                </li>
              </ul>
            </div>
          </div>
          
          <div className="border-t border-gray-800 pt-8 flex flex-col sm:flex-row justify-between items-center gap-4">
            <p className="text-sm text-gray-500">© 2025 Cardápio On. Todos os direitos reservados.</p>
            <div className="flex gap-6 text-sm">
              <Link to="/termos" className="hover:text-white transition-colors">Termos</Link>
              <Link to="/privacidade" className="hover:text-white transition-colors">Privacidade</Link>
            </div>
          </div>
        </div>
      </footer>

      {/* WhatsApp Floating Button */}
      <a
        href="https://wa.me/5518996192561?text=Olá! Gostaria de saber mais sobre o Cardápio On."
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white font-semibold px-5 py-3 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105"
      >
        <svg 
          className="w-6 h-6" 
          fill="currentColor" 
          viewBox="0 0 24 24"
        >
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
        </svg>
        Saiba mais
      </a>
    </div>
  );
}
