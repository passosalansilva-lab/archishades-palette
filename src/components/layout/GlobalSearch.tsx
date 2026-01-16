import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Loader2, User, ShoppingCart, Package as PackageIcon } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { useUserCompany } from "@/hooks/useUserCompany";
import { supabase } from "@/integrations/supabase/client";
import {
  LayoutDashboard,
  Store,
  UtensilsCrossed,
  ShoppingBag,
  Truck,
  Settings,
  Ticket,
  Crown,
  Sliders,
  ScrollText,
  Package,
  FileText,
  BookOpen,
  Bell,
  Users,
  Megaphone,
  ClipboardList,
  Building2,
  Percent,
  StarHalf,
  CreditCard,
  Wallet,
  Volume2,
  UserCog,
  ChefHat,
  Gift,
  Activity,
  Rocket,
  RotateCcw,
  Mail,
  Receipt,
  Brain,
  HelpCircle,
} from "lucide-react";

interface SearchItem {
  label: string;
  href: string;
  icon: any;
  keywords: string[];
  category: string;
  roles?: string[];
}

interface DatabaseResult {
  id: string;
  type: 'order' | 'product' | 'customer';
  title: string;
  subtitle?: string;
  href: string;
  badge?: string;
  badgeVariant?: 'default' | 'secondary' | 'destructive' | 'outline';
}

const searchItems: SearchItem[] = [
  // Principal
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, keywords: ["inicio", "home", "painel", "dashboard"], category: "Principal" },
  { label: "Pedidos", href: "/dashboard/orders", icon: ClipboardList, keywords: ["pedidos", "orders", "vendas"], category: "Principal" },
  { label: "Cozinha (KDS)", href: "/dashboard/kds", icon: ChefHat, keywords: ["cozinha", "kds", "kitchen", "preparo"], category: "Principal" },
  { label: "Mesas", href: "/dashboard/tables", icon: UtensilsCrossed, keywords: ["mesas", "tables", "restaurante"], category: "Principal" },
  { label: "Comandas", href: "/dashboard/comandas", icon: Receipt, keywords: ["comandas", "fichas", "bar"], category: "Principal" },
  
  // Minha Loja
  { label: "Dados da Loja", href: "/dashboard/store", icon: Store, keywords: ["loja", "store", "configurações", "dados"], category: "Minha Loja" },
  { label: "Cardápio", href: "/dashboard/menu", icon: UtensilsCrossed, keywords: ["cardapio", "menu", "produtos", "itens"], category: "Minha Loja" },
  { label: "Estoque", href: "/dashboard/inventory", icon: Package, keywords: ["estoque", "inventory", "inventario", "ingredientes"], category: "Minha Loja" },
  { label: "Notas Fiscais", href: "/dashboard/nfe", icon: FileText, keywords: ["nfe", "nota fiscal", "fiscal"], category: "Minha Loja" },
  
  // Marketing
  { label: "Promoções", href: "/dashboard/promotions", icon: Megaphone, keywords: ["promoções", "promotions", "ofertas"], category: "Marketing" },
  { label: "Cupons", href: "/dashboard/coupons", icon: Percent, keywords: ["cupons", "coupons", "desconto"], category: "Marketing" },
  { label: "Indique e Ganhe", href: "/dashboard/referrals", icon: Gift, keywords: ["indicações", "referrals", "indique"], category: "Marketing" },
  { label: "Sorteios", href: "/dashboard/lottery", icon: Ticket, keywords: ["sorteios", "lottery", "prêmios"], category: "Marketing" },
  
  // Operações
  { label: "Entregadores", href: "/dashboard/drivers", icon: Truck, keywords: ["entregadores", "drivers", "motoboy", "delivery"], category: "Operações" },
  { label: "Equipe", href: "/dashboard/staff", icon: Users, keywords: ["equipe", "staff", "funcionários"], category: "Operações" },
  { label: "Avaliações", href: "/dashboard/reviews", icon: StarHalf, keywords: ["avaliações", "reviews", "feedback"], category: "Operações" },
  { label: "PDV / Caixa", href: "/dashboard/pos", icon: ShoppingBag, keywords: ["pdv", "caixa", "pos", "venda"], category: "Operações" },
  { label: "Vendas Online", href: "/dashboard/customer-transactions", icon: Wallet, keywords: ["vendas", "transactions", "online"], category: "Operações" },
  
  // Minha Conta
  { label: "Meu Perfil", href: "/dashboard/settings", icon: UserCog, keywords: ["perfil", "profile", "minha conta"], category: "Minha Conta" },
  { label: "Som de Notificações", href: "/dashboard/notification-sound", icon: Volume2, keywords: ["som", "notificação", "audio"], category: "Minha Conta" },
  { label: "Push Notifications", href: "/dashboard/notifications", icon: Bell, keywords: ["push", "notifications", "alertas"], category: "Minha Conta" },
  { label: "Histórico de Atividades", href: "/dashboard/activity", icon: ScrollText, keywords: ["atividades", "activity", "histórico", "logs"], category: "Minha Conta" },
  
  // Sistema
  { label: "Pagamentos PIX", href: "/dashboard/pix", icon: CreditCard, keywords: ["pix", "pagamentos", "transferência"], category: "Sistema" },
  { label: "Transações Cartão", href: "/dashboard/card", icon: CreditCard, keywords: ["cartão", "card", "transações"], category: "Sistema" },
  { label: "Planos e Assinatura", href: "/dashboard/plans", icon: Crown, keywords: ["planos", "plans", "assinatura"], category: "Sistema" },
  
  // Suporte
  { label: "Central de Ajuda", href: "/dashboard/help", icon: HelpCircle, keywords: ["ajuda", "help", "suporte", "wiki"], category: "Suporte" },
  
  // Super Admin
  { label: "Empresas", href: "/dashboard/companies", icon: Building2, keywords: ["empresas", "companies", "lojas"], category: "Super Admin", roles: ["super_admin"] },
  { label: "Gerenciar Planos", href: "/dashboard/admin/plans", icon: Sliders, keywords: ["planos admin", "gerenciar planos"], category: "Super Admin", roles: ["super_admin"] },
  { label: "Funcionalidades", href: "/dashboard/admin/features", icon: Package, keywords: ["funcionalidades", "features", "recursos"], category: "Super Admin", roles: ["super_admin"] },
  { label: "Transações Cartão (Admin)", href: "/dashboard/admin/card-transactions", icon: CreditCard, keywords: ["transações admin", "cartão admin"], category: "Super Admin", roles: ["super_admin"] },
  { label: "Nota Fiscal (NFe) Admin", href: "/dashboard/admin/nfe", icon: FileText, keywords: ["nfe admin", "fiscal admin"], category: "Super Admin", roles: ["super_admin"] },
  { label: "Logs do Sistema", href: "/dashboard/admin/logs", icon: ScrollText, keywords: ["logs", "sistema", "debug"], category: "Super Admin", roles: ["super_admin"] },
  { label: "Logs de IA", href: "/dashboard/admin/ai-logs", icon: Brain, keywords: ["ia", "ai", "inteligência artificial", "logs ia"], category: "Super Admin", roles: ["super_admin"] },
  { label: "Saúde das Integrações", href: "/dashboard/admin/integrations", icon: Activity, keywords: ["integrações", "saúde", "health"], category: "Super Admin", roles: ["super_admin"] },
  { label: "Config. Onboarding", href: "/dashboard/admin/onboarding", icon: BookOpen, keywords: ["onboarding", "configurar"], category: "Super Admin", roles: ["super_admin"] },
  { label: "Indicações (Admin)", href: "/dashboard/admin/referrals", icon: Crown, keywords: ["indicações admin", "referrals admin"], category: "Super Admin", roles: ["super_admin"] },
  { label: "Solicitações de Estorno", href: "/dashboard/admin/refunds", icon: RotateCcw, keywords: ["estorno", "refunds", "devolução"], category: "Super Admin", roles: ["super_admin"] },
  { label: "Templates de Email", href: "/dashboard/admin/email-templates", icon: Mail, keywords: ["email", "templates", "modelos"], category: "Super Admin", roles: ["super_admin"] },
  { label: "Notas de Versão", href: "/dashboard/admin/release-notes", icon: Rocket, keywords: ["versão", "release", "notas"], category: "Super Admin", roles: ["super_admin"] },
  { label: "Config. Sistema", href: "/dashboard/admin/system", icon: Settings, keywords: ["sistema", "configurações", "settings"], category: "Super Admin", roles: ["super_admin"] },
];

const statusLabels: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pending: { label: "Pendente", variant: "secondary" },
  confirmed: { label: "Confirmado", variant: "default" },
  preparing: { label: "Preparando", variant: "default" },
  ready: { label: "Pronto", variant: "default" },
  out_for_delivery: { label: "Em entrega", variant: "default" },
  delivered: { label: "Entregue", variant: "outline" },
  cancelled: { label: "Cancelado", variant: "destructive" },
};

// Custom debounce hook
function useDebounceValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [dbResults, setDbResults] = useState<DatabaseResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const navigate = useNavigate();
  const { roles } = useAuth();
  const { company } = useUserCompany();
  const companyId = company?.id;
  
  const debouncedQuery = useDebounceValue(query, 300);

  // Keyboard shortcut
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  // Search database when query changes
  useEffect(() => {
    if (!debouncedQuery || debouncedQuery.length < 2 || !companyId) {
      setDbResults([]);
      return;
    }

    const searchDatabase = async () => {
      setIsSearching(true);
      const results: DatabaseResult[] = [];
      const searchTerm = `%${debouncedQuery}%`;

      try {
        // Search orders
        const { data: orders } = await supabase
          .from("orders")
          .select("id, customer_name, customer_phone, total, status, created_at")
          .eq("company_id", companyId)
          .or(`customer_name.ilike.${searchTerm},customer_phone.ilike.${searchTerm},id.ilike.${searchTerm}`)
          .order("created_at", { ascending: false })
          .limit(5);

        if (orders) {
          orders.forEach(order => {
            const statusInfo = statusLabels[order.status] || { label: order.status, variant: 'secondary' as const };
            results.push({
              id: order.id,
              type: 'order',
              title: `Pedido #${order.id.slice(0, 8)}`,
              subtitle: `${order.customer_name} • R$ ${order.total.toFixed(2)}`,
              href: `/dashboard/orders?highlight=${order.id}`,
              badge: statusInfo.label,
              badgeVariant: statusInfo.variant,
            });
          });
        }

        // Search products
        const { data: products } = await supabase
          .from("products")
          .select("id, name, price, is_active")
          .eq("company_id", companyId)
          .or(`name.ilike.${searchTerm},description.ilike.${searchTerm}`)
          .order("name")
          .limit(5);

        if (products) {
          products.forEach(product => {
            results.push({
              id: product.id,
              type: 'product',
              title: product.name,
              subtitle: `R$ ${product.price.toFixed(2)}`,
              href: `/dashboard/menu?product=${product.id}`,
              badge: product.is_active ? "Ativo" : "Inativo",
              badgeVariant: product.is_active ? "outline" : "destructive",
            });
          });
        }

        // Search customers
        const { data: customers } = await supabase
          .from("customers")
          .select("id, name, phone, email")
          .or(`name.ilike.${searchTerm},phone.ilike.${searchTerm},email.ilike.${searchTerm}`)
          .limit(5);

        if (customers) {
          customers.forEach(customer => {
            results.push({
              id: customer.id,
              type: 'customer',
              title: customer.name,
              subtitle: customer.phone + (customer.email ? ` • ${customer.email}` : ''),
              href: `/dashboard/orders?customer=${customer.id}`,
            });
          });
        }

        setDbResults(results);
      } catch (error) {
        console.error("Error searching database:", error);
      } finally {
        setIsSearching(false);
      }
    };

    searchDatabase();
  }, [debouncedQuery, companyId]);

  const handleSelect = useCallback((href: string) => {
    setOpen(false);
    setQuery("");
    navigate(href);
  }, [navigate]);

  // Reset query when dialog closes
  useEffect(() => {
    if (!open) {
      setQuery("");
      setDbResults([]);
    }
  }, [open]);

  // Filter items based on user roles
  const filteredItems = useMemo(() => {
    return searchItems.filter(item => {
      if (!item.roles) return true;
      return item.roles.some(role => roles.includes(role as any));
    });
  }, [roles]);

  // Group items by category
  const groupedItems = useMemo(() => {
    return filteredItems.reduce((acc, item) => {
      if (!acc[item.category]) {
        acc[item.category] = [];
      }
      acc[item.category].push(item);
      return acc;
    }, {} as Record<string, SearchItem[]>);
  }, [filteredItems]);

  // Group database results by type
  const groupedDbResults = useMemo(() => {
    return {
      orders: dbResults.filter(r => r.type === 'order'),
      products: dbResults.filter(r => r.type === 'product'),
      customers: dbResults.filter(r => r.type === 'customer'),
    };
  }, [dbResults]);

  const hasDbResults = dbResults.length > 0;
  const showDbSection = debouncedQuery.length >= 2;

  return (
    <>
      <Button
        variant="outline"
        className="relative h-9 w-full justify-start rounded-md bg-muted/50 text-sm font-normal text-muted-foreground shadow-none sm:pr-12 md:w-40 lg:w-64"
        onClick={() => setOpen(true)}
      >
        <Search className="mr-2 h-4 w-4" />
        <span className="hidden lg:inline-flex">Pesquisar...</span>
        <span className="inline-flex lg:hidden">Pesquisar</span>
        <kbd className="pointer-events-none absolute right-[0.3rem] top-[0.3rem] hidden h-6 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
          <span className="text-xs">⌘</span>K
        </kbd>
      </Button>
      
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput 
          placeholder="Pesquisar páginas, pedidos, produtos, clientes..." 
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          {/* Loading indicator */}
          {isSearching && (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              <span className="text-sm text-muted-foreground">Buscando...</span>
            </div>
          )}

          {/* Database results */}
          {showDbSection && !isSearching && (
            <>
              {groupedDbResults.orders.length > 0 && (
                <CommandGroup heading="Pedidos">
                  {groupedDbResults.orders.map((result) => (
                    <CommandItem
                      key={result.id}
                      value={`order ${result.title} ${result.subtitle}`}
                      onSelect={() => handleSelect(result.href)}
                      className="cursor-pointer"
                    >
                      <ShoppingCart className="mr-2 h-4 w-4 text-orange-500" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{result.title}</span>
                          {result.badge && (
                            <Badge variant={result.badgeVariant} className="text-xs">
                              {result.badge}
                            </Badge>
                          )}
                        </div>
                        {result.subtitle && (
                          <span className="text-xs text-muted-foreground truncate block">{result.subtitle}</span>
                        )}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              {groupedDbResults.products.length > 0 && (
                <CommandGroup heading="Produtos">
                  {groupedDbResults.products.map((result) => (
                    <CommandItem
                      key={result.id}
                      value={`product ${result.title} ${result.subtitle}`}
                      onSelect={() => handleSelect(result.href)}
                      className="cursor-pointer"
                    >
                      <PackageIcon className="mr-2 h-4 w-4 text-blue-500" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{result.title}</span>
                          {result.badge && (
                            <Badge variant={result.badgeVariant} className="text-xs">
                              {result.badge}
                            </Badge>
                          )}
                        </div>
                        {result.subtitle && (
                          <span className="text-xs text-muted-foreground truncate block">{result.subtitle}</span>
                        )}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              {groupedDbResults.customers.length > 0 && (
                <CommandGroup heading="Clientes">
                  {groupedDbResults.customers.map((result) => (
                    <CommandItem
                      key={result.id}
                      value={`customer ${result.title} ${result.subtitle}`}
                      onSelect={() => handleSelect(result.href)}
                      className="cursor-pointer"
                    >
                      <User className="mr-2 h-4 w-4 text-green-500" />
                      <div className="flex-1 min-w-0">
                        <span className="font-medium">{result.title}</span>
                        {result.subtitle && (
                          <span className="text-xs text-muted-foreground truncate block">{result.subtitle}</span>
                        )}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              {showDbSection && !hasDbResults && !isSearching && debouncedQuery.length >= 2 && (
                <div className="py-4 text-center text-sm text-muted-foreground">
                  Nenhum pedido, produto ou cliente encontrado para "{debouncedQuery}"
                </div>
              )}

              {hasDbResults && <CommandSeparator />}
            </>
          )}

          {/* Static navigation items */}
          <CommandEmpty>
            {!showDbSection && "Digite para pesquisar..."}
            {showDbSection && !hasDbResults && "Nenhum resultado encontrado."}
          </CommandEmpty>
          
          {Object.entries(groupedItems).map(([category, items]) => (
            <CommandGroup key={category} heading={category}>
              {items.map((item) => (
                <CommandItem
                  key={item.href}
                  value={`${item.label} ${item.keywords.join(" ")}`}
                  onSelect={() => handleSelect(item.href)}
                  className="cursor-pointer"
                >
                  <item.icon className="mr-2 h-4 w-4" />
                  <span>{item.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  );
}
