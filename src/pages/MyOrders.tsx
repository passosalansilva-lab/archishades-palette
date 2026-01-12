import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CancelOrderDialog } from "@/components/orders/CancelOrderDialog";
import {
  Loader2,
  Search,
  ShoppingBag,
  MapPin,
  Phone,
  Clock,
  Package,
  CheckCircle,
  XCircle,
  Truck,
  ArrowLeft,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
// Notification sound URL - usando som local
const NOTIFICATION_SOUND_URL = "/sounds/default-notification.mp3";

function hexToHsl(hex: string): string | null {
  const cleanHex = hex.replace("#", "");
  if (cleanHex.length !== 6) return null;
  const r = parseInt(cleanHex.slice(0, 2), 16) / 255;
  const g = parseInt(cleanHex.slice(2, 4), 16) / 255;
  const b = parseInt(cleanHex.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0,
    s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }

  const hh = Math.round(h * 360);
  const ss = Math.round(s * 100);
  const ll = Math.round(l * 100);
  return `${hh} ${ss}% ${ll}%`;
}

type OrderStatus =
  | "pending"
  | "confirmed"
  | "preparing"
  | "ready"
  | "awaiting_driver"
  | "out_for_delivery"
  | "delivered"
  | "cancelled";

interface OrderItem {
  id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  notes?: string | null;
}

interface Order {
  id: string;
  status: OrderStatus;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string;
  total: number;
  delivery_fee: number;
  payment_method: string;
  created_at: string;
  cancellation_reason?: string | null;
  table_session_id?: string | null;
  order_items: OrderItem[];
  customer_addresses: {
    street: string;
    number: string;
    neighborhood: string;
    city: string;
    state: string;
    complement?: string | null;
  } | null;
}

const statusConfig: Record<OrderStatus, { label: string; icon: typeof Clock; colorClass: string }> = {
  pending: { label: "Pendente", icon: Clock, colorClass: "bg-warning/10 text-warning-foreground border-warning/40" },
  confirmed: { label: "Confirmado", icon: CheckCircle, colorClass: "bg-primary/10 text-primary border-primary/40" },
  preparing: {
    label: "Preparando",
    icon: Package,
    colorClass: "bg-secondary/20 text-secondary-foreground border-secondary/40",
  },
  ready: { label: "Pronto", icon: Package, colorClass: "bg-primary/10 text-primary border-primary/40" },
  awaiting_driver: {
    label: "Aguardando Entregador",
    icon: Truck,
    colorClass: "bg-muted text-muted-foreground border-border",
  },
  out_for_delivery: { label: "A caminho", icon: Truck, colorClass: "bg-primary/10 text-primary border-primary/40" },
  delivered: {
    label: "Entregue",
    icon: CheckCircle,
    colorClass: "bg-emerald-500/10 text-emerald-600 border-emerald-500/40",
  },
  cancelled: {
    label: "Cancelado",
    icon: XCircle,
    colorClass: "bg-destructive/10 text-destructive border-destructive/40",
  },
};

export default function MyOrders() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();

  // Slug da empresa usado para voltar ao cardápio e aplicar tema
  const slug = searchParams.get("company");

  const handleBackClick = useCallback(() => {
    // 1) Se tiver slug na URL, volta direto para o cardápio dessa loja
    if (slug) {
      navigate(`/menu/${slug}`);
      return;
    }

    // 2) Tenta recuperar o slug do carrinho salvo no localStorage
    try {
      const storedCart = localStorage.getItem("menupro_cart");
      if (storedCart) {
        const parsed = JSON.parse(storedCart);
        const companySlug = parsed?.companySlug || parsed?.company?.slug;
        if (companySlug) {
          navigate(`/menu/${companySlug}`);
          return;
        }
      }
    } catch (error) {
      console.error("Erro ao ler menupro_cart do localStorage:", error);
    }

    // 3) Fallback: volta para a raiz
    navigate("/");
  }, [navigate, slug]);

  const [emailOrPhone, setEmailOrPhone] = useState("");
  const [searchPerformed, setSearchPerformed] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [orderToCancel, setOrderToCancel] = useState<Order | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [companyPrimaryHsl, setCompanyPrimaryHsl] = useState<string | null>(null);
  const [updatingOrderIds, setUpdatingOrderIds] = useState<string[]>([]);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const updateTimeoutsRef = useRef<Record<string, number>>({});

  // Inicializa o som de notificação
  useEffect(() => {
    audioRef.current = new Audio(NOTIFICATION_SOUND_URL);
    audioRef.current.volume = 0.6;

    return () => {
      if (audioRef.current) {
        audioRef.current = null;
      }
    };
  }, []);

  // Busca as cores da empresa quando vier o slug na URL
  useEffect(() => {
    if (!slug) return;

    supabase
      .from("companies_public")
      .select("primary_color")
      .eq("slug", slug)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.primary_color) {
          const hsl = hexToHsl(data.primary_color);
          if (hsl) {
            setCompanyPrimaryHsl(hsl);
          }
        }
      });
  }, [slug]);

  const canCancelOrder = (status: OrderStatus): boolean => {
    return status === "pending" || status === "confirmed";
  };

  const searchOrders = async (overrideValue?: string) => {
    const valueRaw = overrideValue ?? emailOrPhone;

    if (!valueRaw.trim()) {
      toast({
        title: "Digite seu email ou telefone",
        description: "Informe o email ou telefone usado no pedido",
        variant: "destructive",
      });
      return;
    }

    const sanitized = valueRaw.trim().toLowerCase();

    setLoading(true);
    setSearchPerformed(true);

    try {
      const { data, error } = await supabase.functions.invoke("customer-orders-search", {
        body: {
          emailOrPhone: sanitized,
        },
      });

      if (error) throw error;

      const fetchedOrders = (data as { orders?: Order[] } | null)?.orders || [];

      setOrders(fetchedOrders);

      if (fetchedOrders.length === 0) {
        toast({
          title: "Nenhum pedido encontrado",
          description: "Não encontramos pedidos com esse email ou telefone",
        });
      } else {
        // Persistimos o identificador para futuras visitas sem precisar digitar de novo
        try {
          localStorage.setItem("menupro_last_customer_identifier", sanitized);
        } catch (e) {
          console.error("Erro ao salvar identificador do cliente:", e);
        }
      }
    } catch (error: any) {
      console.error("Error searching orders via function:", error);
      toast({
        title: "Erro ao buscar pedidos",
        description: error.message || "Tente novamente",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Realtime + busca automática: acompanha mudanças de status e usa identificador salvo
  useEffect(() => {
    if (loading || searchPerformed) return;

    // Fallback: último identificador salvo no navegador (email ou telefone do cliente)
    try {
      const storedIdentifier = localStorage.getItem("menupro_last_customer_identifier");
      if (storedIdentifier) {
        searchOrders(storedIdentifier);
      }
    } catch (e) {
      console.error("Erro ao ler identificador salvo do cliente:", e);
    }
  }, [searchPerformed, loading]);

  // Toca som de notificação quando o status mudar
  const playStatusChangeSound = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch((err) => console.log("Não foi possível tocar o som de status:", err));
    }
  }, []);

  // Assina atualizações em tempo real para os pedidos carregados
  useEffect(() => {
    if (!orders.length) return;

    const orderIds = orders.map((o) => o.id);
    const filter = `id=in.(${orderIds.join(",")})`;

    const channel = supabase
      .channel(`my-orders-${orderIds.join("-")}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "orders",
          filter,
        },
        (payload) => {
          const newStatus = payload.new.status as OrderStatus;
          const orderId = payload.new.id as string;

          // Marca visualmente o pedido como "atualizando em tempo real" por alguns segundos
          setUpdatingOrderIds((prev) => (prev.includes(orderId) ? prev : [...prev, orderId]));

          // Limpa timeout anterior, se existir
          if (updateTimeoutsRef.current[orderId]) {
            window.clearTimeout(updateTimeoutsRef.current[orderId]);
          }

          updateTimeoutsRef.current[orderId] = window.setTimeout(() => {
            setUpdatingOrderIds((prev) => prev.filter((id) => id !== orderId));
            delete updateTimeoutsRef.current[orderId];
          }, 4000);

          setOrders((prev) => {
            const existing = prev.find((o) => o.id === orderId);
            if (!existing) return prev;

            const statusChanged = existing.status !== newStatus;
            const updated = prev.map((o) =>
              o.id === orderId
                ? {
                    ...o,
                    status: newStatus,
                    cancellation_reason: (payload.new.cancellation_reason as string | null) ?? o.cancellation_reason,
                  }
                : o,
            );

            if (statusChanged) {
              playStatusChangeSound();
              const config = statusConfig[newStatus];
              if (config) {
                toast({
                  title: "Status do pedido atualizado",
                  description: config.label,
                });
              }
            }

            return updated;
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      // Limpa todos os timeouts pendentes ao desmontar / recarregar lista
      Object.values(updateTimeoutsRef.current).forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
      updateTimeoutsRef.current = {};
      setUpdatingOrderIds([]);
    };
  }, [orders, playStatusChangeSound, toast]);

  const handleCancelOrder = async (order: Order, reason: string) => {
    setCancelling(true);
    try {
      const { error } = await supabase
        .from("orders")
        .update({
          status: "cancelled",
          cancellation_reason: reason,
        })
        .eq("id", order.id);

      if (error) throw error;

      // If this was a table order, check if we need to close the table session
      if (order.table_session_id) {
        // Check if there are any other non-cancelled orders for this session
        const { data: otherOrders, error: checkError } = await supabase
          .from("orders")
          .select("id")
          .eq("table_session_id", order.table_session_id)
          .neq("id", order.id)
          .neq("status", "cancelled")
          .limit(1);

        if (!checkError && (!otherOrders || otherOrders.length === 0)) {
          // No other active orders, close the table session
          await supabase
            .from("table_sessions")
            .update({ 
              status: "closed", 
              closed_at: new Date().toISOString() 
            })
            .eq("id", order.table_session_id);
        }
      }

      // Update local state
      setOrders((prev) =>
        prev.map((o) => (o.id === order.id ? { ...o, status: "cancelled" as const, cancellation_reason: reason } : o)),
      );

      toast({
        title: "Pedido cancelado",
        description: "Seu pedido foi cancelado com sucesso.",
      });

      setShowCancelDialog(false);
      setOrderToCancel(null);
    } catch (error: any) {
      console.error("Error cancelling order:", error);
      toast({
        title: "Erro ao cancelar pedido",
        description: error.message || "Tente novamente",
        variant: "destructive",
      });
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div
      className="min-h-screen bg-background pb-24"
      style={companyPrimaryHsl ? ({ "--primary": companyPrimaryHsl } as any) : undefined}
    >
      {/* Top bar similar to cardápio */}
    <header className="sticky top-0 z-20 bg-gradient-to-b from-primary/95 to-primary/85 text-primary-foreground shadow-md backdrop-blur">
  <div className="max-w-4xl mx-auto px-4">
    <div className="h-14 flex items-center justify-center relative">

      {/* Título */}
      <div className="text-center">
        <h1 className="font-display font-semibold text-sm sm:text-base leading-tight">
          Meus pedidos
        </h1>
        <p className="text-[11px] text-primary-foreground/80">
          Acompanhe seus pedidos em tempo real
        </p>
      </div>

    </div>
  </div>
</header>


      <main className="max-w-4xl mx-auto px-4 pt-5 space-y-6 animate-fade-in">
        {/* Botão voltar ao cardápio no topo */}
        <Button variant="outline" onClick={handleBackClick} className="w-full rounded-full">
          Voltar para o cardápio
        </Button>

        {/* Login simples por email ou telefone - esconde se já tiver pedidos encontrados */}
        {!(searchPerformed && orders.length > 0) && (
          <Card className="rounded-3xl border-border/60 shadow-card">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Search className="h-5 w-5 text-primary" />
                Entrar para ver seus pedidos
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="search">Email ou Telefone</Label>
                <Input
                  id="search"
                  type="text"
                  placeholder="Digite o email ou telefone usado no pedido"
                  value={emailOrPhone}
                  onChange={(e) => setEmailOrPhone(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && searchOrders()}
                  className="h-11 rounded-full"
                />
              </div>
              <Button
                onClick={() => searchOrders()}
                className="w-full h-11 rounded-full font-semibold"
                disabled={loading}
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Entrar e ver meus pedidos
              </Button>
            </CardContent>
          </Card>
        )}


        {/* Orders List */}
        {searchPerformed && !loading && (
          <div className="space-y-4">
            {orders.length === 0 ? (
              <Card className="rounded-3xl border-dashed border-border/60 bg-muted/40">
                <CardContent className="py-10 text-center text-muted-foreground flex flex-col items-center justify-center gap-3">
                  <ShoppingBag className="h-10 w-10 opacity-60" />
                  <p className="text-sm">Nenhum pedido encontrado</p>
                </CardContent>
              </Card>
            ) : (
              orders.map((order) => {
                const StatusIcon = statusConfig[order.status].icon;
                const isCancellable = canCancelOrder(order.status);

                return (
                  <Card key={order.id} className="rounded-3xl border-border/60 shadow-card">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="space-y-1">
                          <p className="font-mono text-xs text-muted-foreground">Pedido #{order.id.slice(0, 8)}</p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(order.created_at), "dd 'de' MMM 'às' HH:mm", { locale: ptBR })}
                          </p>
                          {updatingOrderIds.includes(order.id) && (
                            <p className="text-[10px] text-primary font-medium flex items-center gap-1">
                              <span className="inline-flex h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                              Atualizando em tempo real
                            </p>
                          )}
                        </div>
                        <Badge
                          variant="outline"
                          className={`flex items-center gap-1 px-2 py-1 rounded-full text-[11px] border ${statusConfig[order.status].colorClass}`}
                        >
                          <StatusIcon className="h-3 w-3" />
                          {statusConfig[order.status].label}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4 pt-1">
                      {/* Order Items */}
                      <div className="space-y-2">
                        <h4 className="font-semibold text-sm">Itens do pedido</h4>
                        {order.order_items.map((item) => (
                          <div key={item.id} className="flex justify-between text-sm text-muted-foreground">
                            <span>
                              {item.quantity}x {item.product_name}
                            </span>
                            <span>R$ {item.total_price.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>

                      {/* Delivery Address */}
                      {order.customer_addresses && (
                        <div className="space-y-1 text-sm">
                          <h4 className="font-semibold flex items-center gap-2">
                            <MapPin className="h-4 w-4" />
                            Endereço de entrega
                          </h4>
                          <p className="text-muted-foreground">
                            {order.customer_addresses.street}, {order.customer_addresses.number}
                            {order.customer_addresses.complement && ` - ${order.customer_addresses.complement}`}
                          </p>
                          <p className="text-muted-foreground">
                            {order.customer_addresses.neighborhood}, {order.customer_addresses.city} -{" "}
                            {order.customer_addresses.state}
                          </p>
                        </div>
                      )}

                      {/* Contact */}
                      <div className="space-y-1 text-sm">
                        <h4 className="font-semibold flex items-center gap-2">
                          <Phone className="h-4 w-4" />
                          Contato
                        </h4>
                        <p className="text-muted-foreground">{order.customer_phone}</p>
                        {order.customer_email && <p className="text-muted-foreground">{order.customer_email}</p>}
                      </div>

                      {/* Total */}
                      <div className="flex justify-between items-center pt-2 border-t border-border/60">
                        <span className="text-sm text-muted-foreground">Total</span>
                        <span className="text-lg font-bold text-primary">R$ {order.total.toFixed(2)}</span>
                      </div>

                      {/* Cancellation Reason */}
                      {order.status === "cancelled" && order.cancellation_reason && (
                        <div className="p-3 bg-destructive/5 border border-destructive/20 rounded-2xl">
                          <p className="text-sm font-semibold text-destructive">Motivo do cancelamento</p>
                          <p className="text-sm text-muted-foreground mt-1">{order.cancellation_reason}</p>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex flex-col sm:flex-row gap-2 pt-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 rounded-full"
                          onClick={() => navigate(`/track/${order.id}`)}
                        >
                          Rastrear pedido
                        </Button>

                        {isCancellable && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 rounded-full text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => {
                              setOrderToCancel(order);
                              setShowCancelDialog(true);
                            }}
                          >
                            Cancelar pedido
                          </Button>
                        )}

                        {!isCancellable && order.status !== "cancelled" && order.status !== "delivered" && (
                          <div className="flex-1 text-xs text-muted-foreground text-center">
                            Pedido em preparo. Para cancelar, entre em contato com a loja.
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        )}

        {/* Botão de voltar já está no topo do conteúdo */}
      </main>

      {/* Cancel Order Dialog */}
      {orderToCancel && (
        <CancelOrderDialog
          open={showCancelDialog}
          onOpenChange={setShowCancelDialog}
          onConfirm={async (reason) => {
            await handleCancelOrder(orderToCancel, reason);
          }}
          orderNumber={`#${orderToCancel.id.slice(0, 8)}`}
          loading={cancelling}
        />
      )}
    </div>
  );
}
