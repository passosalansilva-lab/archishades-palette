import { useState, ReactNode, useMemo, useRef, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Store,
  UtensilsCrossed,
  ShoppingBag,
  Truck,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronDown,
  ChevronRight,
  Ticket,
  Crown,
  Tag,
  Sliders,
  ScrollText,
  Star,
  HelpCircle,
  Package,
  FileText,
  BookOpen,
  Bell,
  Shield,
  Users,
  Megaphone,
  ClipboardList,
  Building2,
  Percent,
  StarHalf,
  History,
  CreditCard,
  QrCode,
  Wallet,
  Volume2,
  UserCog,
  ChefHat,
  Gift,
  Activity,
  Rocket,
  RotateCcw,
  Mail,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/useAuth";
import { useStaffPermissions } from "@/hooks/useStaffPermissions";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { useOrderNotifications } from "@/hooks/useOrderNotifications";
import { useWaiterCallNotifications } from "@/hooks/useWaiterCallNotifications";
import { useUserCompany } from "@/hooks/useUserCompany";
import { NotificationDropdown } from "./NotificationDropdown";
import { SidebarOrdersBadge } from "./SidebarOrdersBadge";
import { PendingOrdersAlert } from "./PendingOrdersAlert";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/ThemeToggle";
import { FloatingOrdersButton } from "./FloatingOrdersButton";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useSystemLogo } from "@/hooks/useSystemLogo";

interface NavItem {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
  roles?: string[];
  permission?: string;
  featureKey?: string; // Chave da feature para verificar acesso
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

// Items exclusivos de Super Admin (ficam dentro do submenu)
const superAdminNavItems: NavItem[] = [
  { label: "Empresas", href: "/dashboard/companies", icon: Building2, roles: ["super_admin"] },
  { label: "Gerenciar Planos", href: "/dashboard/admin/plans", icon: Sliders, roles: ["super_admin"] },
  { label: "Funcionalidades", href: "/dashboard/admin/features", icon: Package, roles: ["super_admin"] },
  { label: "Transações Cartão", href: "/dashboard/admin/card-transactions", icon: CreditCard, roles: ["super_admin"] },
  { label: "Nota Fiscal (NFe)", href: "/dashboard/admin/nfe", icon: FileText, roles: ["super_admin"] },
  { label: "Logs do Sistema", href: "/dashboard/admin/logs", icon: ScrollText, roles: ["super_admin"] },
  { label: "Saúde das Integrações", href: "/dashboard/admin/integrations", icon: Activity, roles: ["super_admin"] },
  { label: "Config. Onboarding", href: "/dashboard/admin/onboarding", icon: BookOpen, roles: ["super_admin"] },
  { label: "Indicações (Admin)", href: "/dashboard/admin/referrals", icon: Crown, roles: ["super_admin"] },
  { label: "Solicitações de Estorno", href: "/dashboard/admin/refunds", icon: RotateCcw, roles: ["super_admin"] },
  { label: "Templates de Email", href: "/dashboard/admin/email-templates", icon: Mail, roles: ["super_admin"] },
  { label: "Notas de Versão", href: "/dashboard/admin/release-notes", icon: Rocket, roles: ["super_admin"] },
  { label: "Config. Sistema", href: "/dashboard/admin/system", icon: Settings, roles: ["super_admin"] },
];

// Grupos de navegação organizados por tema
const navGroups: NavGroup[] = [
  {
    title: "Principal",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, roles: ["super_admin", "store_owner"], permission: "can_view_reports", featureKey: "dashboard" },
      { label: "Pedidos", href: "/dashboard/orders", icon: ClipboardList, roles: ["store_owner", "delivery_driver", "store_staff"], permission: "can_manage_orders", featureKey: "orders" },
      { label: "Cozinha (KDS)", href: "/dashboard/kds", icon: ChefHat, roles: ["store_owner", "store_staff"], permission: "can_manage_orders", featureKey: "kds" },
      { label: "Mesas", href: "/dashboard/tables", icon: UtensilsCrossed, roles: ["store_owner", "store_staff"], permission: "can_manage_orders", featureKey: "tables" },
    ],
  },
  {
    title: "Minha Loja",
    items: [
      { label: "Dados da Loja", href: "/dashboard/store", icon: Store, roles: ["store_owner"], featureKey: "store_settings" },
      { label: "Cardápio", href: "/dashboard/menu", icon: UtensilsCrossed, roles: ["store_owner", "store_staff"], permission: "can_manage_menu", featureKey: "menu" },
      { label: "Estoque", href: "/dashboard/inventory", icon: Package, roles: ["store_owner", "store_staff"], permission: "can_manage_inventory", featureKey: "inventory" },
      { label: "Notas Fiscais", href: "/dashboard/nfe", icon: FileText, roles: ["store_owner"], featureKey: "nfe" },
    ],
  },
  {
    title: "Marketing",
    items: [
      { label: "Promoções", href: "/dashboard/promotions", icon: Megaphone, roles: ["store_owner", "store_staff"], permission: "can_manage_promotions", featureKey: "promotions" },
      { label: "Cupons", href: "/dashboard/coupons", icon: Percent, roles: ["store_owner", "store_staff"], permission: "can_manage_coupons", featureKey: "coupons" },
      { label: "Indique e Ganhe", href: "/dashboard/referrals", icon: Gift, roles: ["store_owner"], featureKey: "referrals" },
      { label: "Sorteios", href: "/dashboard/lottery", icon: Ticket, roles: ["store_owner"], featureKey: "lottery" },
    ],
  },
  {
    title: "Operações",
    items: [
      { label: "Entregadores", href: "/dashboard/drivers", icon: Truck, roles: ["store_owner", "store_staff"], permission: "can_manage_drivers", featureKey: "drivers" },
      { label: "Equipe", href: "/dashboard/staff", icon: Users, roles: ["store_owner"], featureKey: "staff" },
      { label: "Avaliações", href: "/dashboard/reviews", icon: StarHalf, roles: ["store_owner", "store_staff"], permission: "can_manage_reviews", featureKey: "reviews" },
      { label: "PDV / Caixa", href: "/dashboard/pos", icon: ShoppingBag, roles: ["store_owner", "store_staff"], featureKey: "pos" },
      { label: "Transações Online", href: "/dashboard/transactions", icon: Wallet, roles: ["store_owner"], featureKey: "transactions" },
    ],
  },
  {
    title: "Configurações",
    items: [
      { label: "Planos", href: "/dashboard/plans", icon: CreditCard, roles: ["store_owner"], featureKey: "plans" },
      { label: "Notificações", href: "/dashboard/notifications", icon: Bell, roles: ["super_admin", "store_owner", "store_staff"], featureKey: "notifications" },
      { label: "Sons e Alertas", href: "/dashboard/notifications/sounds", icon: Volume2, roles: ["store_owner"], featureKey: "notification_sounds" },
      { label: "Logs de Atividade", href: "/dashboard/logs", icon: History, roles: ["store_owner"], featureKey: "activity_logs" },
      { label: "Configurações", href: "/dashboard/settings", icon: Settings, roles: ["super_admin", "store_owner", "delivery_driver", "store_staff"], featureKey: "settings" },
    ],
  },
  {
    title: "Suporte",
    items: [
      { label: "Ajuda", href: "/dashboard/help", icon: HelpCircle, roles: ["super_admin", "store_owner", "delivery_driver", "store_staff"], featureKey: "help" },
    ],
  },
];

// Indicador Premium no sidebar (sem hook aqui para evitar múltiplos fetches)
function PremiumBadge({ variant }: { variant: 'premium' | 'owned' }) {
  const base =
    "inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold";

  if (variant === 'owned') {
    return (
      <span className={cn(base, "bg-primary text-primary-foreground")}> 
        <Crown className="h-3 w-3" />
      </span>
    );
  }

  return (
    <span className={cn(base, "bg-accent text-accent-foreground")}> 
      <Crown className="h-3 w-3" />
    </span>
  );
}

interface DashboardLayoutProps {
  children: ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut, hasRole, roles, loading, staffCompany } = useAuth();
  const { hasPermission, isStoreStaff, isOwnerOrAdmin } = useStaffPermissions();
  const { hasFeatureAccess, getFeaturePrice, allFeatures, loading: featuresLoading } = useFeatureAccess();
  const { company: userCompany } = useUserCompany();
  const { logoUrl } = useSystemLogo("sidebar");

  // Enable real-time order notifications
  const { realtimeStatus } = useOrderNotifications();
  
  // Enable real-time waiter call notifications (global - works on any page)
  useWaiterCallNotifications();

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  // Preserve sidebar scroll position across navigation (DashboardLayout mounts per page)
  const SIDEBAR_SCROLL_KEY = "dashboard.sidebarScrollTop";

  useEffect(() => {
    const stored = sessionStorage.getItem(SIDEBAR_SCROLL_KEY);
    const top = stored ? Number(stored) : 0;

    requestAnimationFrame(() => {
      if (navRef.current && Number.isFinite(top)) {
        navRef.current.scrollTop = top;
      }
    });

    return () => {
      if (navRef.current) {
        sessionStorage.setItem(SIDEBAR_SCROLL_KEY, String(navRef.current.scrollTop));
      }
    };
  }, []);

  const handleNavClick = () => {
    if (navRef.current) {
      sessionStorage.setItem(SIDEBAR_SCROLL_KEY, String(navRef.current.scrollTop));
    }
    setSidebarOpen(false);
  };

  // super_admin sees ALL items (hierarchy)
  const isSuperAdmin = hasRole('super_admin');
  
  // Check if current route is a super admin route (to keep submenu open)
  const isSuperAdminRoute = superAdminNavItems.some(item => location.pathname === item.href);
  const [superAdminOpen, setSuperAdminOpen] = useState(isSuperAdminRoute);

// Função para filtrar um item baseado em roles, permissions e features
const canSeeItem = (item: NavItem): boolean => {
  const featureRecord =
    item.featureKey && !featuresLoading
      ? allFeatures.find((f) => f.key === item.featureKey)
      : undefined;

  // 1) Feature ativa/inativa (vale para TODO mundo) — mas só se a feature existir no cadastro
  if (item.featureKey && !featuresLoading && featureRecord && featureRecord.is_active === false) {
    return false;
  }

  // 2) Super admin: não aplica gating por plano/compra, apenas respeita ativa/inativa
  if (isSuperAdmin) return true;

  // 3) Sem restrição de role
  if (!item.roles) return true;

  // Enquanto os papéis ainda estão carregando, exibimos todos os itens
  // exceto os exclusivos de super_admin, para não esconder o menu do lojista.
  if (loading || roles.length === 0) {
    return !item.roles.includes('super_admin');
  }

  // Check role first
  const hasRequiredRole = item.roles.some((role) => hasRole(role as any));
  if (!hasRequiredRole) return false;

  // If user is store_staff and item has permission requirement, check permission
  if (isStoreStaff && !isOwnerOrAdmin && item.permission) {
    if (!hasPermission(item.permission as any)) return false;
  }

  // 4) Acesso à feature (plano/compra) — apenas quando a feature existe no cadastro
  if (item.featureKey && !featuresLoading && featureRecord) {
    const access = hasFeatureAccess(item.featureKey);
    if (!access.hasAccess) {
      const featurePrice = getFeaturePrice(item.featureKey);
      // Se não tem preço configurado, esconder do menu
      if (!featurePrice) return false;
      // Se tem preço, pode aparecer (para incentivar compra)
    }
  }

  return true;
};

  // Filtra os grupos, mantendo apenas os que têm itens visíveis
  const filteredNavGroups = useMemo(() => {
    return navGroups
      .map((group) => ({
        ...group,
        items: group.items.filter(canSeeItem),
      }))
      .filter((group) => group.items.length > 0);
  }, [isSuperAdmin, loading, roles, hasRole, isStoreStaff, isOwnerOrAdmin, hasPermission, hasFeatureAccess, allFeatures, featuresLoading]);

  const userInitials =
    user?.user_metadata?.full_name
      ?.split(" ")
      .map((n: string) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "U";

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed left-0 top-0 z-50 h-full w-64 bg-sidebar text-sidebar-foreground transition-transform duration-300 lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-20 items-center justify-between px-4 border-b border-sidebar-border">
            <Link to="/" className="flex items-center gap-2">
              <img 
                src={logoUrl} 
                alt="Cardápio On" 
                className="h-16 w-auto object-contain"
              />
            </Link>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden text-sidebar-foreground hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Navigation */}
          <nav ref={navRef} className="flex-1 overflow-y-auto py-4 px-3 scrollbar-hide">
            <div className="space-y-6">
              {/* Super Admin Submenu */}
              {isSuperAdmin && (
                <div>
                  <Collapsible open={superAdminOpen} onOpenChange={setSuperAdminOpen}>
                    <CollapsibleTrigger asChild>
                      <button
                        className={cn(
                          "flex w-full items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                          isSuperAdminRoute
                            ? "bg-destructive/20 text-destructive border border-destructive/40"
                            : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                        )}
                      >
                        <Shield className="h-5 w-5" />
                        <span className="flex-1 text-left">Super Admin</span>
                        <ChevronRight
                          className={cn(
                            "h-4 w-4 transition-transform",
                            superAdminOpen && "rotate-90"
                          )}
                        />
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-1 ml-4 space-y-1">
                      {superAdminNavItems.map((item) => {
                        const isActive = location.pathname === item.href;
                        return (
                          <Link
                            key={item.href}
                            to={item.href}
                            onClick={handleNavClick}
                            className={cn(
                              "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                              isActive
                                ? "bg-sidebar-primary text-sidebar-primary-foreground"
                                : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                            )}
                          >
                            <item.icon className="h-4 w-4" />
                            <span>{item.label}</span>
                          </Link>
                        );
                      })}
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              )}

              {/* Grouped nav items */}
              {filteredNavGroups.map((group) => (
                <div key={group.title}>
                  <h3 className="px-3 mb-2 text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider">
                    {group.title}
                  </h3>
                  <ul className="space-y-1">
                    {group.items.map((item) => {
                      const isActive = location.pathname === item.href;
                      const isPedidos = item.href === "/dashboard/orders";

                      let premiumVariant: 'premium' | 'owned' | null = null;
                      if (item.featureKey) {
                        const access = hasFeatureAccess(item.featureKey);
                        const pricing = getFeaturePrice(item.featureKey);
                        const isPremium = !!pricing;

                        if (access.source === 'purchased') {
                          premiumVariant = 'owned';
                        } else if (access.source !== 'plan' && isPremium) {
                          premiumVariant = 'premium';
                        }
                      }

                      return (
                        <li key={item.href}>
                          <Link
                            to={item.href}
                            onClick={handleNavClick}
                            className={cn(
                              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors border border-transparent",
                              isPedidos
                                ? "border-primary/60 bg-sidebar-primary/10 text-sidebar-foreground shadow-sm"
                                : "",
                              isActive
                                ? "bg-sidebar-primary text-sidebar-primary-foreground border-primary shadow-md"
                                : !isPedidos
                                  ? "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                                  : "hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                            )}
                          >
                            <item.icon className="h-5 w-5" />
                            <span className="flex-1">{item.label}</span>
                            {isPedidos && <SidebarOrdersBadge />}
                            {premiumVariant && <PremiumBadge variant={premiumVariant} />}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </nav>

          {/* User section */}
          <div className="border-t border-sidebar-border p-4">
            {/* Show company name for staff */}
            {isStoreStaff && staffCompany && (
              <div className="mb-3 px-2 py-1.5 bg-sidebar-accent/50 rounded-lg">
                <p className="text-xs text-sidebar-foreground/70">Empresa</p>
                <p className="text-sm font-medium truncate">{staffCompany.companyName}</p>
              </div>
            )}
            <div className="flex items-center gap-3">
              <Avatar className="h-9 w-9 ring-2 ring-sidebar-primary/30">
                <AvatarImage src={userCompany?.logo_url || user?.user_metadata?.avatar_url} className="object-cover" />
                <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground text-sm">
                  {userInitials}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user?.user_metadata?.full_name || "Usuário"}</p>
                <p className="text-xs text-sidebar-foreground/70 truncate">
                  {roles[0] === "super_admin"
                    ? "Super Admin"
                    : roles[0] === "store_owner"
                      ? "Lojista"
                      : roles[0] === "delivery_driver"
                        ? "Entregador"
                        : roles[0] === "store_staff"
                          ? "Funcionário"
                          : "Usuário"}
                </p>
              </div>
              <button
                onClick={handleSignOut}
                className="p-1.5 rounded-md text-sidebar-foreground/70 hover:text-destructive hover:bg-destructive/10 transition-colors"
                title="Sair"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-border/80 bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:px-6">
          {/* Mobile menu */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="flex items-center justify-center rounded-md p-2 text-foreground hover:bg-accent/60 hover:text-accent-foreground lg:hidden"
            aria-label="Abrir menu lateral"
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Alerta de pedidos pendentes + Indicador de conexão realtime + ações */}
          <div className="flex-1 flex items-center justify-end gap-3">
            {/* Alerta de pedidos pendentes/confirmados */}
            <PendingOrdersAlert />
            {realtimeStatus !== 'idle' && (
              <div
                className={cn(
                  'hidden sm:inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
                  realtimeStatus === 'connected'
                    ? 'border-emerald-500/60 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5'
                    : realtimeStatus === 'connecting'
                      ? 'border-amber-500/60 text-amber-600 dark:text-amber-400 bg-amber-500/5'
                      : 'border-destructive/60 text-destructive bg-destructive/5'
                )}
              >
                <span
                  className={cn(
                    'h-2 w-2 rounded-full',
                    realtimeStatus === 'connected'
                      ? 'bg-emerald-500'
                      : realtimeStatus === 'connecting'
                        ? 'bg-amber-500 animate-pulse'
                        : 'bg-destructive animate-pulse'
                  )}
                />
                <span>
                  {realtimeStatus === 'connected' && 'Tempo real ativo'}
                  {realtimeStatus === 'connecting' && 'Conectando tempo real...'}
                  {realtimeStatus === 'error' && 'Erro na conexão em tempo real'}
                </span>
              </div>
            )}

            {/* Ações do header */}
            <div className="flex items-center gap-3">
              <ThemeToggle />
              <NotificationDropdown />

              {/* User menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="gap-2 px-2.5 py-1.5 hover:bg-accent/60">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={user?.user_metadata?.avatar_url} />
                      <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                        {userInitials}
                      </AvatarFallback>
                    </Avatar>
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <div className="px-2 py-1.5">
                    <p className="text-sm font-medium">{user?.user_metadata?.full_name || "Usuário"}</p>
                    <p className="text-xs text-muted-foreground">{user?.email}</p>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/dashboard/settings">
                      <Settings className="mr-2 h-4 w-4" />
                      Configurações
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
                    <LogOut className="mr-2 h-4 w-4" />
                    Sair
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 lg:p-6">{children}</main>
      </div>

      {/* Botão flutuante de pedidos, renderizado em todas as páginas do dashboard */}
      <FloatingOrdersButton />
    </div>
  );
}

