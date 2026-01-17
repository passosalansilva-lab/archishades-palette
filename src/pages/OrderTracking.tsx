import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Package,
  Clock,
  CheckCircle,
  Truck,
  MapPin,
  Phone,
  Loader2,
  ChefHat,
  CircleCheck,
  XCircle,
  RefreshCw,
  ArrowLeft,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import DeliveryMap from '@/components/map/DeliveryMap';
import { PushNotificationButton } from '@/components/PushNotificationButton';
import { OrderReviewForm } from '@/components/orders/OrderReviewForm';

function hexToHsl(hex: string): string | null {
  const cleanHex = hex.replace('#', '');
  if (cleanHex.length !== 6) return null;
  const r = parseInt(cleanHex.slice(0, 2), 16) / 255;
  const g = parseInt(cleanHex.slice(2, 4), 16) / 255;
  const b = parseInt(cleanHex.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0, s = 0;
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



interface OrderItem {
  id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  options: unknown;
  notes: string | null;
}

interface Order {
  id: string;
  customer_name: string;
  status: string;
  total: number;
  subtotal: number;
  delivery_fee: number;
  created_at: string;
  estimated_delivery_time: string | null;
  notes: string | null;
  delivery_driver_id: string | null;
  company_id: string;
  payment_method: string;
  payment_status: string;
  source: string;
  table_session_id: string | null;
  company: {
    name: string;
    phone: string | null;
    logo_url: string | null;
    primary_color: string | null;
    address: string | null;
  };
  items: OrderItem[];
  hasReview?: boolean;
  reviewsEnabled?: boolean;
}
 
 const statusConfig: Record<string, { label: string; shortLabel: string; icon: typeof Package; badgeClass: string }> = {
   pending: { label: 'Aguardando confirmação', shortLabel: 'Aguardando', icon: Clock, badgeClass: 'bg-warning/10 text-warning-foreground border-warning/40' },
   confirmed: { label: 'Pedido confirmado', shortLabel: 'Confirmado', icon: CheckCircle, badgeClass: 'bg-primary/10 text-primary border-primary/40' },
   preparing: { label: 'Em preparação', shortLabel: 'Preparando', icon: ChefHat, badgeClass: 'bg-secondary/20 text-secondary-foreground border-secondary/40' },
   ready: { label: 'Pronto para entrega', shortLabel: 'Pronto', icon: Package, badgeClass: 'bg-primary/10 text-primary border-primary/40' },
   awaiting_driver: { label: 'Aguardando entregador', shortLabel: 'Aguard. Entreg.', icon: Truck, badgeClass: 'bg-muted text-muted-foreground border-border' },
   queued: { label: 'Aguardando entregador', shortLabel: 'Aguard. Entreg.', icon: Truck, badgeClass: 'bg-muted text-muted-foreground border-border' },
   out_for_delivery: { label: 'A caminho', shortLabel: 'A caminho', icon: Truck, badgeClass: 'bg-primary/10 text-primary border-primary/40' },
   delivered: { label: 'Entregue', shortLabel: 'Entregue', icon: CircleCheck, badgeClass: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/40' },
   cancelled: { label: 'Cancelado', shortLabel: 'Cancelado', icon: XCircle, badgeClass: 'bg-destructive/10 text-destructive border-destructive/40' },
 };

 // Status config específico para pedidos de mesa
 const tableStatusConfig: Record<string, { label: string; shortLabel: string; icon: typeof Package; badgeClass: string }> = {
   pending: { label: 'Aguardando confirmação', shortLabel: 'Aguardando', icon: Clock, badgeClass: 'bg-warning/10 text-warning-foreground border-warning/40' },
   confirmed: { label: 'Pedido confirmado', shortLabel: 'Confirmado', icon: CheckCircle, badgeClass: 'bg-primary/10 text-primary border-primary/40' },
   preparing: { label: 'Em preparação', shortLabel: 'Preparando', icon: ChefHat, badgeClass: 'bg-secondary/20 text-secondary-foreground border-secondary/40' },
   ready: { label: 'Pronto para servir', shortLabel: 'Pronto', icon: Package, badgeClass: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/40' },
   delivered: { label: 'Servido', shortLabel: 'Servido', icon: CircleCheck, badgeClass: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/40' },
   cancelled: { label: 'Cancelado', shortLabel: 'Cancelado', icon: XCircle, badgeClass: 'bg-destructive/10 text-destructive border-destructive/40' },
 };
 
 const statusSteps = ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered'];
 const tableStatusSteps = ['pending', 'confirmed', 'preparing', 'ready', 'delivered'];

// Notification sound URL - usando som local
const NOTIFICATION_SOUND_URL = '/sounds/default-notification.mp3';

export default function OrderTracking() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Função para voltar ao cardápio
  const handleBackToMenu = useCallback(async () => {
    if (order?.company_id) {
      try {
        const { data } = await supabase
          .from('companies')
          .select('slug')
          .eq('id', order.company_id)
          .single();
        
        if (data?.slug) {
          navigate(`/menu/${data.slug}`);
        } else {
          navigate(-1);
        }
      } catch {
        navigate(-1);
      }
    } else {
      navigate(-1);
    }
  }, [order?.company_id, navigate]);

  // Initialize audio element
  useEffect(() => {
    audioRef.current = new Audio(NOTIFICATION_SOUND_URL);
    audioRef.current.volume = 0.6;
    
    return () => {
      if (audioRef.current) {
        audioRef.current = null;
      }
    };
  }, []);

  // Play notification sound and vibrate
  const playNotificationSound = useCallback(() => {
    // Play sound
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch((err) => {
        console.log('Could not play notification sound:', err);
      });
    }
    
    // Vibrate on mobile devices (pattern: vibrate 200ms, pause 100ms, vibrate 200ms)
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate([200, 100, 200]);
      } catch (err) {
        console.log('Could not vibrate:', err);
      }
    }
  }, []);

  const loadOrder = useCallback(async () => {
    if (!orderId) return;

    try {
      const { data, error } = await supabase.functions.invoke('order-tracking-get', {
        body: { orderId },
      });

      if (error) throw error;

      const response = data as { order?: Order } | null;

      if (!response || !response.order) {
        setError('Pedido não encontrado');
        setLoading(false);
        return;
      }

      setOrder(response.order);
      setLastUpdate(new Date());
    } catch (err: any) {
      console.error('Error loading order via function:', err);
      setError('Erro ao carregar pedido');
    } finally {
      setLoading(false);
      setIsUpdating(false);
    }
  }, [orderId]);

  useEffect(() => {
    if (!orderId) return;
    
    loadOrder();
    
    // Subscribe to realtime updates using the public order_public_status table
    // This table mirrors order status and doesn't require authentication
    const channel = supabase
      .channel(`order-public-status-${orderId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'order_public_status',
          filter: `order_id=eq.${orderId}`,
        },
        (payload) => {
          console.log('Order public status updated in realtime:', payload);
          setIsUpdating(true);
          
          const newStatus = payload.new.status as string;
          const oldStatus = payload.old?.status as string;
          
          if (newStatus !== oldStatus) {
            const statusInfo = statusConfig[newStatus];
            if (statusInfo) {
              // Play notification sound
              playNotificationSound();
              
              // Show toast notification
               toast.info(`Status atualizado: ${statusInfo.label}`, {
                 icon: <statusInfo.icon className="h-4 w-4 text-primary" />,
                 duration: 5000,
               });
            }
          }
          
          // Reload full order data when status changes
          loadOrder();
        }
      )
      .subscribe((status) => {
        console.log('Realtime subscription status for order tracking:', status);
      });

    return () => {
      console.log('Cleaning up realtime subscription');
      supabase.removeChannel(channel);
    };
  }, [orderId, loadOrder, playNotificationSound]);

  // Fallback: periodic polling in case realtime connection is lost
  useEffect(() => {
    if (!orderId) return;
    if (!order) return;
    if (order.status === 'delivered' || order.status === 'cancelled') return;

    console.log('Starting fallback polling for order tracking');

    const interval = setInterval(() => {
      console.log('Polling order status for tracking page');
      loadOrder();
    }, 15000);

    return () => {
      console.log('Stopping fallback polling for order tracking');
      clearInterval(interval);
    };
  }, [orderId, order, loadOrder]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="py-12 text-center">
            <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-semibold mb-2">Pedido não encontrado</h2>
            <p className="text-muted-foreground">
              Verifique o link e tente novamente
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

   const isTableOrder = order.source === 'table' || !!order.table_session_id;
   const activeStatusConfig = isTableOrder ? tableStatusConfig : statusConfig;
   const activeStatusSteps = isTableOrder ? tableStatusSteps : statusSteps;
   const currentStatus = activeStatusConfig[order.status] || statusConfig[order.status];
   const isCancelled = order.status === 'cancelled';
 
   const primaryHsl = order.company.primary_color ? hexToHsl(order.company.primary_color) : null;
 
   return (
     <div 
       className="min-h-screen bg-background"
       style={primaryHsl ? ({ '--primary': primaryHsl } as any) : undefined}
     >
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          {/* Botão Voltar */}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleBackToMenu}
            className="shrink-0"
            title="Voltar ao cardápio"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          
          {order.company.logo_url ? (
            <img
              src={order.company.logo_url}
              alt={order.company.name}
              className="h-10 w-10 rounded-lg object-cover"
            />
          ) : (
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Package className="h-5 w-5 text-primary" />
            </div>
          )}
          <div className="flex-1">
            <h1 className="font-semibold">{order.company.name}</h1>
            <p className="text-sm text-muted-foreground">
              Pedido #{order.id.slice(0, 8)}
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Push Notification Button */}
        <div className="flex justify-center">
          <PushNotificationButton
            orderId={order.id}
            companyId={order.company_id}
            userType="customer"
          />
        </div>

        {/* Status Card */}
        <Card className={isUpdating ? 'animate-pulse' : ''}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg">Status do Pedido</CardTitle>
                {isUpdating && <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsUpdating(true);
                    loadOrder();
                  }}
                  className="text-xs flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <RefreshCw className="h-3 w-3" />
                  Recarregar agora
                </button>
                 <Badge
                   variant="outline"
                   className={`border ${currentStatus.badgeClass}`}
                 >
                   {currentStatus.label}
                 </Badge>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Última atualização: {format(lastUpdate, "HH:mm:ss", { locale: ptBR })}
            </p>
          </CardHeader>
          <CardContent>
            {/* Progress Steps */}
            {!isCancelled && (
               <div className="py-4">
                 <div className="relative flex items-center justify-between">
                   {activeStatusSteps.map((step, index) => {
                      const stepConfig = activeStatusConfig[step];
                      // Map awaiting_driver and queued to ready for visual display (customer shouldn't see these internal statuses)
                      const displayStatus = ['awaiting_driver', 'queued'].includes(order.status) ? 'ready' : order.status;
                      const orderStepIndex = activeStatusSteps.indexOf(displayStatus as any);
                      const isCompleted = orderStepIndex >= index;
                      const isCurrent = displayStatus === step;
 
                     return (
                       <div key={step} className="flex flex-col items-center relative z-10 flex-1">
                         <div
                           className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-all ${
                             isCompleted
                               ? 'bg-primary text-primary-foreground'
                               : 'bg-muted text-muted-foreground'
                           } ${isCurrent ? 'ring-4 ring-primary/20' : ''}`}
                         >
                           <stepConfig.icon className="h-4 w-4 sm:h-5 sm:w-5" />
                         </div>
                         <span className={`text-[10px] sm:text-xs mt-2 text-center leading-tight ${
                           isCompleted ? 'text-foreground font-medium' : 'text-muted-foreground'
                         }`}>
                           {stepConfig.shortLabel}
                         </span>
                       </div>
                     );
                   })}
                   {/* Progress Line */}
                   <div className="absolute top-4 sm:top-5 left-[8%] right-[8%] h-0.5 bg-muted -z-0">
                     <div
                       className="h-full bg-primary transition-all duration-500"
                       style={{
                         width: `${Math.min((activeStatusSteps.indexOf(['awaiting_driver', 'queued'].includes(order.status) ? 'ready' : order.status as any) / (activeStatusSteps.length - 1)) * 100, 100)}%`,
                       }}
                     />
                   </div>
                 </div>
               </div>
            )}

            {isCancelled && (
              <div className="py-4 text-center">
                <XCircle className="h-12 w-12 mx-auto mb-2 text-destructive" />
                <p className="text-destructive font-medium">Pedido cancelado</p>
              </div>
            )}

            {order.estimated_delivery_time && !isCancelled && order.status !== 'delivered' && (
              <div className="mt-4 pt-4 border-t">
                <div className="flex items-center justify-between p-3 rounded-lg bg-primary/5 border border-primary/10">
                  <div className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-primary" />
                    <div>
                      <p className="text-sm font-medium">Previsão de entrega</p>
                      <p className="text-xs text-muted-foreground">
                        {order.status === 'pending' || order.status === 'confirmed' 
                          ? 'Preparação + entrega' 
                          : order.status === 'preparing' 
                            ? 'Finalizando preparo'
                            : 'Saindo para entrega'}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-primary">
                      {format(new Date(order.estimated_delivery_time), "HH:mm", { locale: ptBR })}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      ~{Math.max(0, Math.round((new Date(order.estimated_delivery_time).getTime() - new Date().getTime()) / 60000))} min
                    </p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Delivery Map - Show when out for delivery */}
        {order.status === 'out_for_delivery' && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Localização do Entregador
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DeliveryMap
                driverId={order.delivery_driver_id}
                companyAddress={order.company.address || undefined}
              />
            </CardContent>
          </Card>
        )}

        {/* Order Details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Detalhes do Pedido</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {order.items.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">
                Carregando itens...
              </p>
            ) : (
              <div className="space-y-3">
                {order.items.map((item) => {
                  const options = Array.isArray(item.options) 
                    ? (item.options as { name: string; priceModifier?: number }[]) 
                    : [];
                  return (
                    <div key={item.id} className="pb-3 border-b border-border last:border-0 last:pb-0">
                      <div className="flex justify-between">
                        <div className="flex-1">
                          <span className="font-medium">{item.quantity}x</span>{' '}
                          <span className="font-medium">{item.product_name}</span>
                        </div>
                        <span className="font-medium">
                          {formatCurrency(item.total_price)}
                        </span>
                      </div>
                      {options.length > 0 && (
                        <p className="text-sm text-muted-foreground mt-1 ml-6">
                          + {options.map((o) => o.name).join(', ')}
                        </p>
                      )}
                      {item.notes && (
                        <p className="text-sm text-muted-foreground mt-1 ml-6 italic">
                          Obs: {item.notes}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <Separator />

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatCurrency(order.subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Taxa de entrega</span>
                <span>{formatCurrency(order.delivery_fee)}</span>
              </div>
              <div className="flex justify-between font-semibold text-base pt-2 border-t">
                <span>Total</span>
                <span>{formatCurrency(order.total)}</span>
              </div>
              
              {/* Payment Info */}
              <div className="flex justify-between items-center pt-2 border-t">
                <span className="text-muted-foreground">Forma de pagamento</span>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">
                    {order.payment_method === 'pix' && 'PIX'}
                    {order.payment_method === 'cash' && 'Dinheiro'}
                    {order.payment_method === 'card_on_delivery' && 'Cartão na entrega'}
                    {order.payment_method === 'online' && 'Cartão online'}
                  </Badge>
                  {(order.payment_method === 'pix' || order.payment_method === 'online') && (
                    <Badge 
                      variant={order.payment_status === 'paid' ? 'default' : 'secondary'}
                      className={order.payment_status === 'paid' ? 'bg-emerald-500 text-white' : ''}
                    >
                      {order.payment_status === 'paid' ? '✓ Pago' : 'Aguardando'}
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            {order.notes && (
              <>
                <Separator />
                <div>
                  <p className="text-sm text-muted-foreground">Observações:</p>
                  <p className="text-sm mt-1">{order.notes}</p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Contact */}
        {order.company.phone && (
          <Card>
            <CardContent className="py-4">
              <a
                href={`tel:${order.company.phone}`}
                className="flex items-center gap-3 text-primary hover:underline"
              >
                <Phone className="h-5 w-5" />
                <span>Ligar para {order.company.name}</span>
              </a>
            </CardContent>
          </Card>
        )}

        {/* Review Form - Show after delivery if reviews are enabled */}
        {order.status === 'delivered' && !order.hasReview && order.reviewsEnabled !== false && (
          <OrderReviewForm
            orderId={order.id}
            companyId={order.company_id}
            companyName={order.company.name}
            onReviewSubmitted={() => setOrder(prev => prev ? { ...prev, hasReview: true } : null)}
          />
        )}

        {/* Order Info */}
        <div className="text-center text-sm text-muted-foreground">
          <p>
            Pedido realizado em{' '}
            {format(new Date(order.created_at), "dd 'de' MMMM 'às' HH:mm", { locale: ptBR })}
          </p>
        </div>
      </main>
    </div>
  );
}
