import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MapPin,
  Package,
  Navigation,
  Phone,
  Clock,
  CheckCircle,
  Loader2,
  Power,
  PowerOff,
  RefreshCw,
  LogOut,
  MapPinOff,
  Play,
  ThumbsUp,
  Bell,
  XCircle,
  Map,
  Wallet,
  DollarSign,
  TrendingUp,
  Bike,
  ChevronDown,
  ChevronUp,
  Receipt,
  Route,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { supabase } from '@/integrations/supabase/client';
import { driverSupabase } from '@/integrations/supabase/driverClient';
// Note: We use driverSupabase for queries that need driver's auth context
// and supabase for functions.invoke which don't depend on client session
import { useDriverAuth } from '@/hooks/useDriverAuth';
import { useRealtimeDriverOrders } from '@/hooks/useRealtimeDriverOrders';
import { PushNotificationButton } from '@/components/PushNotificationButton';
import { InstallAppPrompt } from '@/components/InstallAppPrompt';
import { toast } from 'sonner';
import DriverRouteMap from '@/components/map/DriverRouteMap';
import { ThemeToggle } from '@/components/ThemeToggle';
import { DriverPaymentsModal } from '@/components/drivers/DriverPaymentsModal';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import MultiDeliveryMode from '@/components/drivers/MultiDeliveryMode';
import { useCompanyColors } from '@/hooks/useCompanyColors';

interface DriverFinancials {
  pendingEarnings: number;
  totalPaid: number;
  deliveryCount: number;
}

interface OrderItem {
  id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  options: { name: string; priceModifier?: number }[] | null;
  notes: string | null;
}

interface OrderOffer {
  id: string;
  order_id: string;
  status: string;
  created_at: string;
  order: {
    id: string;
    customer_name: string;
    customer_phone: string;
    total: number;
    subtotal: number;
    delivery_fee: number;
    payment_method: string;
    created_at: string;
    notes: string | null;
    needs_change: boolean | null;
    change_for: number | null;
    delivery_address: {
      street: string;
      number: string;
      neighborhood: string;
      city: string;
      state?: string | null;
      complement?: string | null;
      reference?: string | null;
      zip_code?: string | null;
    } | null;
    company: {
      name: string;
    };
    order_items: OrderItem[];
  };
}

interface Order {
  id: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  status: string;
  total: number;
  subtotal: number;
  delivery_fee: number;
  payment_method: string;
  payment_status: string;
  created_at: string;
  notes: string | null;
  needs_change: boolean | null;
  change_for: number | null;
  queue_position: number | null;
  delivery_address: {
    street: string;
    number: string;
    neighborhood: string;
    city: string;
    state: string;
    complement: string | null;
    reference: string | null;
    zip_code: string;
  } | null;
  company: {
    name: string;
    address: string | null;
    phone: string | null;
    city: string | null;
  };
  order_items: OrderItem[];
}

export default function DriverDashboard() {
  const { user, signOut, loading: authLoading } = useDriverAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [driver, setDriver] = useState<any>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [pendingOffers, setPendingOffers] = useState<OrderOffer[]>([]);
  const [locationStatus, setLocationStatus] = useState<'pending' | 'granted' | 'denied' | 'unavailable'>('pending');
  const [updatingOrder, setUpdatingOrder] = useState<string | null>(null);
  const [acceptingOffer, setAcceptingOffer] = useState<string | null>(null);
  const [showMapForOrder, setShowMapForOrder] = useState<string | null>(null);
  const [financials, setFinancials] = useState<DriverFinancials>({ pendingEarnings: 0, totalPaid: 0, deliveryCount: 0 });
  const [showPaymentsModal, setShowPaymentsModal] = useState(false);
  const [isMultiDeliveryActive, setIsMultiDeliveryActive] = useState(false);

  // Apply company colors and get branding info (logo)
  const { branding } = useCompanyColors(driver?.company_id || null);
  
  const watchIdRef = useRef<number | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const driverIdRef = useRef<string | null>(null);

  // Update driver location in database
  const updateLocation = useCallback(async (position: GeolocationPosition) => {
    if (!driverIdRef.current) return;

    const { latitude, longitude } = position.coords;
    console.log('Updating driver location:', { latitude, longitude });

    await driverSupabase
      .from('delivery_drivers')
      .update({
        current_latitude: latitude,
        current_longitude: longitude,
        location_updated_at: new Date().toISOString(),
      })
      .eq('id', driverIdRef.current);
  }, []);

  // Start location tracking
  const startLocationTracking = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationStatus('unavailable');
      toast.error('Geolocalização não suportada pelo navegador');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocationStatus('granted');
        updateLocation(position);
        toast.success('Localização ativada');
        
        // Start continuous tracking
        watchIdRef.current = navigator.geolocation.watchPosition(
          updateLocation,
          (error) => console.error('Watch position error:', error),
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
        );

        // Fallback interval
        intervalRef.current = setInterval(() => {
          navigator.geolocation.getCurrentPosition(
            updateLocation,
            (error) => console.error('Interval position error:', error),
            { enableHighAccuracy: true }
          );
        }, 15000);
      },
      (error) => {
        console.error('Geolocation error:', error);
        if (error.code === error.PERMISSION_DENIED) {
          setLocationStatus('denied');
          toast.error('Permissão de localização negada. Ative nas configurações do navegador.');
        } else {
          setLocationStatus('unavailable');
          toast.error('Erro ao obter localização');
        }
      },
      { enableHighAccuracy: true }
    );
  }, [updateLocation]);

  // Stop location tracking
  const stopLocationTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Realtime subscription for driver orders
  useRealtimeDriverOrders({
    driverId: driver?.id || null,
    onOrderAssigned: () => {
      loadDriverData();
      loadPendingOffers();
    },
    onOrderUpdate: (updatedOrder) => {
      setOrders(prev => 
        prev.map(o => o.id === updatedOrder.id ? { ...o, ...updatedOrder } : o)
          .filter(o => ['awaiting_driver', 'ready', 'out_for_delivery'].includes(o.status))
      );
    },
  });

  // Realtime subscription for order offers
  useEffect(() => {
    if (!driver?.id) return;

    const channel = driverSupabase
      .channel('order-offers-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'order_offers',
          filter: `driver_id=eq.${driver.id}`,
        },
        (payload) => {
          console.log('Order offer change:', payload);
          if (payload.eventType === 'INSERT' && payload.new.status === 'pending') {
            // New offer received - reload offers
            loadPendingOffers();
            toast.info('Nova entrega disponível! Aceite rápido!', { duration: 5000 });
            // Play sound
            try {
              const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
              audio.volume = 0.7;
              audio.play().catch(() => {});
            } catch (e) {}
          } else if (payload.eventType === 'UPDATE') {
            if (payload.new.status === 'cancelled' || payload.new.status === 'expired') {
              // Offer was cancelled (someone else took it)
              setPendingOffers(prev => prev.filter(o => o.id !== payload.new.id));
              if (payload.new.status === 'cancelled') {
                toast.warning('Pedido já foi aceito por outro entregador');
              }
            }
          }
        }
      )
      .subscribe();

    return () => {
      driverSupabase.removeChannel(channel);
    };
  }, [driver?.id]);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      // IMPORTANT: driver area must never redirect to the admin/store auth flow
      navigate('/driver/login', { replace: true });
      return;
    }

    loadDriverData();

    return () => {
      stopLocationTracking();
    };
  }, [user, authLoading, navigate, stopLocationTracking]);

  // Load pending offers when driver is loaded
  useEffect(() => {
    if (driver?.id) {
      loadPendingOffers();
    }
  }, [driver?.id]);

  // Request location permission on mount
  useEffect(() => {
    if (driver?.id && locationStatus === 'pending') {
      driverIdRef.current = driver.id;
      startLocationTracking();
    }
  }, [driver?.id, locationStatus, startLocationTracking]);

  // Auto-request push notification permission when driver loads
  useEffect(() => {
    if (!driver?.id || !user?.id) return;

    const requestPushPermission = async () => {
      // Check if push is supported
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        console.log('[DriverDashboard] Push not supported');
        return;
      }

      // Check if already granted or denied
      if ('Notification' in window) {
        if (Notification.permission === 'granted') {
          // Already granted - just sync the subscription
          try {
            const { syncPushSubscription } = await import('@/lib/pushNotifications');
            await syncPushSubscription({
              companyId: driver.company_id,
              userId: user.id,
              userType: 'driver',
            });
            console.log('[DriverDashboard] Push subscription synced');
          } catch (e) {
            console.error('[DriverDashboard] Error syncing push:', e);
          }
          return;
        }

        if (Notification.permission === 'denied') {
          console.log('[DriverDashboard] Notifications blocked by user');
          return;
        }

        // Permission is 'default' - request it automatically
        console.log('[DriverDashboard] Requesting push permission...');
        try {
          const { subscribeToPush } = await import('@/lib/pushNotifications');
          const result = await subscribeToPush({
            companyId: driver.company_id,
            userId: user.id,
            userType: 'driver',
          });

          if (result.ok) {
            toast.success('Notificações ativadas!', {
              description: 'Você será notificado sobre novas entregas.',
            });
          } else {
            const failure = result as { ok: false; code: string; message: string };
            if (failure.code === 'permission_denied') {
              toast.warning('Ative as notificações', {
                description: 'Para receber alertas de novas entregas, permita notificações.',
              });
            }
          }
        } catch (e) {
          console.error('[DriverDashboard] Error requesting push:', e);
        }
      }
    };

    // Small delay to not block initial render
    const timer = setTimeout(requestPushPermission, 1500);
    return () => clearTimeout(timer);
  }, [driver?.id, driver?.company_id, user?.id]);

  const loadPendingOffers = useCallback(async () => {
    if (!driver?.id) return;

    try {
      const { data, error } = await driverSupabase
        .from('order_offers')
        .select(`
          id,
          order_id,
          status,
          created_at,
          order:orders(
            id,
            status,
            customer_name,
            customer_phone,
            total,
            subtotal,
            delivery_fee,
            payment_method,
            created_at,
            notes,
            needs_change,
            change_for,
            delivery_address:customer_addresses(
              street,
              number,
              neighborhood,
              city,
              state,
              complement,
              reference,
              zip_code
            ),
            company:companies(name),
            order_items(id, product_name, quantity, unit_price, total_price, options, notes)
          )
        `)
        .eq('driver_id', driver.id)
        .eq('status', 'pending')
        .in('order.status', ['awaiting_driver', 'out_for_delivery'])
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error loading pending offers:', error);
        return;
      }

      const safeData = (data || []).filter((offer): offer is typeof offer & { order: NonNullable<typeof offer['order']> } => offer.order !== null);

      // Evita ofertas duplicadas do mesmo pedido para o mesmo entregador
      const uniqueOffersMap: Record<string, typeof safeData[number]> = {};
      safeData.forEach((offer) => {
        const key = offer.order_id || (offer.order as any)?.id;
        if (key && !uniqueOffersMap[key]) {
          uniqueOffersMap[key] = offer;
        }
      });

      const uniqueOffers = Object.values(uniqueOffersMap);

      setPendingOffers(
        uniqueOffers.map((offer) => ({
          ...offer,
          order: {
            ...offer.order,
            order_items: ((offer.order as any)?.order_items || []).map((item: any) => ({
              ...item,
              options: Array.isArray(item.options) ? item.options : [],
            })),
          } as OrderOffer['order'],
        })) || []
      );
    } catch (error) {
      console.error('Error loading pending offers:', error);
    }
  }, [driver?.id]);

  const loadAssignedOrders = useCallback(
    async (driverIdToLoad: string) => {
      try {
        const { data: ordersData, error: ordersError } = await driverSupabase
          .from('orders')
          .select(`
            *,
            delivery_address:customer_addresses(street, number, neighborhood, city, state, complement, reference, zip_code),
            company:companies(name, address, phone, city),
            order_items(id, product_name, quantity, unit_price, total_price, options, notes)
          `)
          .eq('delivery_driver_id', driverIdToLoad)
          // Include queued orders in the list (cast to any to bypass TS until types are regenerated)
          .in('status', ['awaiting_driver', 'ready', 'out_for_delivery', 'queued'] as any)
          .order('queue_position', { ascending: true, nullsFirst: false })
          .order('created_at', { ascending: true });

        if (ordersError) {
          console.error('Orders fetch error:', ordersError);
          throw ordersError;
        }

        setOrders(
          ordersData?.map((order) => ({
            ...order,
            delivery_address: order.delivery_address as Order['delivery_address'],
            company: order.company as Order['company'],
            order_items: (order.order_items || []) as OrderItem[],
          })) || []
        );
      } catch (error) {
        console.error('Error loading assigned orders:', error);
      }
    },
    []
  );

  // Periodically refresh assigned orders so reatribuições refletem na tela do entregador
  useEffect(() => {
    if (!driver?.id) return;

    const interval = setInterval(() => {
      loadAssignedOrders(driver.id);
    }, 7000);

    return () => clearInterval(interval);
  }, [driver?.id, loadAssignedOrders]);


  const loadDriverData = useCallback(async () => {
    if (!user) return;

    try {
      setLoading(true);

      // Get first active driver for this user
      const { data: driverData, error: driverError } = await driverSupabase
        .from('delivery_drivers')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (driverError) {
        console.error('Driver fetch error:', driverError);
        throw driverError;
      }

      if (!driverData) {
        console.log('No active driver found for user:', user.id);
        toast.error('Você não está cadastrado como entregador ativo');
        await signOut();
        navigate('/driver/login');
        return;
      }

      console.log('Driver loaded:', driverData);
      setDriver(driverData);
      driverIdRef.current = driverData.id;

      await loadAssignedOrders(driverData.id);
    } catch (error) {
      console.error('Error loading driver data:', error);
      toast.error('Erro ao carregar dados. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }, [user, navigate, signOut, loadAssignedOrders]);

  // Load driver financials
  const loadFinancials = useCallback(async (driverId: string) => {
    try {
      // Get pending deliveries (not paid yet)
      const { data: pendingDeliveries } = await driverSupabase
        .from('driver_deliveries')
        .select('delivery_fee_earned')
        .eq('driver_id', driverId)
        .eq('status', 'pending');

      // Get paid deliveries
      const { data: payments } = await driverSupabase
        .from('driver_payments')
        .select('amount')
        .eq('driver_id', driverId);

      // Get total delivery count
      const { count: deliveryCount } = await driverSupabase
        .from('driver_deliveries')
        .select('id', { count: 'exact', head: true })
        .eq('driver_id', driverId);

      const pendingEarnings = pendingDeliveries?.reduce((sum, d) => sum + (d.delivery_fee_earned || 0), 0) || 0;
      const totalPaid = payments?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0;

      setFinancials({
        pendingEarnings,
        totalPaid,
        deliveryCount: deliveryCount || 0,
      });
    } catch (error) {
      console.error('Error loading financials:', error);
    }
  }, []);

  // Load financials when driver is loaded
  useEffect(() => {
    if (driver?.id) {
      loadFinancials(driver.id);
    }
  }, [driver?.id, loadFinancials]);

  const toggleAvailability = async () => {
    if (!driver) return;

    const newStatus = !driver.is_available;
    const { error } = await driverSupabase
      .from('delivery_drivers')
      .update({ 
        is_available: newStatus,
        driver_status: newStatus ? 'available' : 'offline'
      })
      .eq('id', driver.id);

    if (error) {
      toast.error('Erro ao atualizar disponibilidade');
      return;
    }

    setDriver({ ...driver, is_available: newStatus });
    toast.success(newStatus ? 'Você está disponível para entregas' : 'Você está indisponível');
  };

  // Accept an offer from the competitive offers system
  const acceptOffer = async (offer: OrderOffer) => {
    setAcceptingOffer(offer.id);
    
    try {
      const { data, error } = await supabase.functions.invoke('accept-order-offer', {
        body: { offerId: offer.id, orderId: offer.order_id }
      });

      if (error) throw error;
      if (data?.error) {
        toast.error(data.message || data.error);
        // Remove this offer from local state since it's no longer available
        setPendingOffers(prev => prev.filter(o => o.id !== offer.id));
        setAcceptingOffer(null);
        return;
      }

      toast.success('Pedido aceito! Você agora é responsável pela entrega.');
      setPendingOffers(prev => prev.filter(o => o.id !== offer.id));
      
      // Update local state directly instead of reloading to avoid scroll
      if (offer.order) {
        const newOrder: Order = {
          id: offer.order.id,
          customer_name: offer.order.customer_name,
          customer_phone: offer.order.customer_phone,
          customer_email: null,
          status: 'out_for_delivery',
          total: offer.order.total,
          subtotal: offer.order.subtotal,
          delivery_fee: offer.order.delivery_fee,
          payment_method: offer.order.payment_method,
          payment_status: 'pending',
          created_at: offer.order.created_at,
          notes: offer.order.notes,
          needs_change: offer.order.needs_change,
          change_for: offer.order.change_for,
          queue_position: null,
          delivery_address: offer.order.delivery_address as Order['delivery_address'],
          company: offer.order.company as Order['company'],
          order_items: offer.order.order_items,
        };
        setOrders(prev => [...prev, newOrder]);
      }
    } catch (error: any) {
      toast.error(error.message || 'Erro ao aceitar pedido');
    } finally {
      setAcceptingOffer(null);
    }
  };

  // Accept delivery - changes status from awaiting_driver to ready
  const acceptDelivery = async (orderId: string) => {
    setUpdatingOrder(orderId);
    
    const { error: orderError } = await driverSupabase
      .from('orders')
      .update({ status: 'ready' })
      .eq('id', orderId);

    if (orderError) {
      toast.error('Erro ao aceitar entrega');
      setUpdatingOrder(null);
      return;
    }

    // Update driver status to in_delivery
    await driverSupabase
      .from('delivery_drivers')
      .update({ driver_status: 'in_delivery' })
      .eq('id', driver.id);

    toast.success('Entrega aceita! Inicie quando estiver pronto.');
    
    // Update local state directly instead of reloading to avoid scroll
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: 'ready' } : o));
    setUpdatingOrder(null);
  };

  // Start delivery - changes status to out_for_delivery
  const startDelivery = async (orderId: string) => {
    setUpdatingOrder(orderId);
    
    const { error } = await driverSupabase
      .from('orders')
      .update({ status: 'out_for_delivery' })
      .eq('id', orderId);

    if (error) {
      toast.error('Erro ao iniciar entrega');
      setUpdatingOrder(null);
      return;
    }

    // Automatically show the map when starting delivery
    setShowMapForOrder(orderId);
    
    toast.success('Entrega iniciada! Boa viagem.');
    
    // Update local state directly instead of reloading to avoid scroll
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: 'out_for_delivery' } : o));
    setUpdatingOrder(null);
  };

  // Complete delivery
  const completeDelivery = async (orderId: string) => {
    if (!driver) return;
    
    setUpdatingOrder(orderId);
    
    const { error } = await driverSupabase
      .from('orders')
      .update({ 
        status: 'delivered',
        delivered_at: new Date().toISOString()
      })
      .eq('id', orderId);

    if (error) {
      toast.error('Erro ao concluir entrega');
      setUpdatingOrder(null);
      return;
    }

    // Register the delivery in driver_deliveries
    const deliveryFee = driver.per_delivery_fee || 0;
    await driverSupabase
      .from('driver_deliveries')
      .insert({
        driver_id: driver.id,
        order_id: orderId,
        company_id: driver.company_id,
        delivery_fee_earned: deliveryFee,
        status: 'pending',
        delivered_at: new Date().toISOString(),
      });

    // Close map if open
    if (showMapForOrder === orderId) {
      setShowMapForOrder(null);
    }

    // Remove the completed order from local state immediately (no scroll)
    setOrders(prev => prev.filter(o => o.id !== orderId));

    // Process the driver's queue to check for next order
    try {
      const { data: queueResult, error: queueError } = await supabase.functions.invoke('process-driver-queue', {
        body: { driverId: driver.id, companyId: driver.company_id }
      });

      if (queueError) {
        console.error('Error processing queue:', queueError);
      } else if (queueResult?.nextOrder) {
        toast.info(`Próxima entrega: ${queueResult.nextOrder.customerName}`, {
          description: `Você tem mais ${queueResult.remainingInQueue} ${queueResult.remainingInQueue === 1 ? 'pedido' : 'pedidos'} na fila.`,
          duration: 5000,
        });
        // Reload to get the new order in the list
        loadAssignedOrders(driver.id);
      }
    } catch (queueErr) {
      console.error('Error calling process-driver-queue:', queueErr);
      // Fallback: if queue function fails, still check if driver should be available
      const remainingOrders = orders.filter(o => o.id !== orderId);
      if (remainingOrders.length === 0) {
        await driverSupabase
          .from('delivery_drivers')
          .update({ 
            driver_status: 'available',
            is_available: true
          })
          .eq('id', driver.id);
      }
    }

    toast.success('Entrega concluída com sucesso!');
    // Reload financials to update totals immediately
    if (driver?.id) {
      loadFinancials(driver.id);
    }
    setUpdatingOrder(null);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const getStatusBadge = (status: string, queuePosition?: number | null) => {
    switch (status) {
      case 'queued':
        return <Badge variant="outline" className="border-amber-500 text-amber-600">Na Fila #{queuePosition || '?'}</Badge>;
      case 'awaiting_driver':
        return <Badge variant="destructive">Aguardando Aceite</Badge>;
      case 'ready':
        return <Badge variant="secondary">Aceito - Aguardando Início</Badge>;
      case 'out_for_delivery':
        return <Badge variant="default">Em Entrega</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Show location warning as a dismissible card instead of blocking the whole UI
  const LocationWarning = () => {
    if (locationStatus === 'denied' || locationStatus === 'unavailable') {
      return (
        <Card className="border-destructive bg-destructive/10">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <MapPinOff className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-destructive">
                  {locationStatus === 'denied' 
                    ? 'Localização bloqueada' 
                    : 'Localização indisponível'
                  }
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {locationStatus === 'denied' 
                    ? 'Ative a permissão de localização nas configurações do navegador para rastreamento em tempo real.'
                    : 'Seu navegador não suporta geolocalização.'
                  }
                </p>
              </div>
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => {
                  setLocationStatus('pending');
                  startLocationTracking();
                }}
              >
                Tentar
              </Button>
            </div>
          </CardContent>
        </Card>
      );
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Company Logo or Motoboy Icon */}
              {branding.logo ? (
                <div className="w-12 h-12 rounded-full overflow-hidden bg-card border-2 border-primary/20 shadow-lg flex-shrink-0">
                  <img 
                    src={branding.logo} 
                    alt={branding.name || 'Logo'} 
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      // Fallback to icon if image fails
                      e.currentTarget.style.display = 'none';
                      e.currentTarget.parentElement!.innerHTML = `
                        <div class="w-full h-full bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center">
                          <svg class="h-6 w-6 text-primary-foreground" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h3"/></svg>
                        </div>
                      `;
                    }}
                  />
                </div>
              ) : (
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-lg flex-shrink-0">
                  <Bike className="h-6 w-6 text-primary-foreground" />
                </div>
              )}
              <div className="min-w-0">
                <p className="font-semibold text-lg truncate">
                  {driver?.driver_name ? (() => {
                    const parts = driver.driver_name.trim().split(/\s+/);
                    if (parts.length === 1) return parts[0];
                    return `${parts[0]} ${parts[parts.length - 1].charAt(0)}.`;
                  })() : 'Entregador'}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {branding.name || 'Entregador'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* GPS Status with colored dot */}
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-muted/50">
                <span 
                  className={`w-2.5 h-2.5 rounded-full ${
                    locationStatus === 'granted' 
                      ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' 
                      : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]'
                  }`}
                />
                <span className="text-xs font-medium">
                  {locationStatus === 'granted' ? 'GPS' : 'GPS Off'}
                </span>
              </div>
              <Badge variant={driver?.is_available ? 'default' : 'secondary'} className="text-xs">
                {driver?.is_available ? 'Online' : 'Offline'}
              </Badge>
              <ThemeToggle />
              <Button
                variant="ghost"
                size="icon"
                onClick={async () => {
                  stopLocationTracking();
                  await signOut();
                  navigate('/driver/login');
                }}
                title="Sair"
              >
                <LogOut className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Location Warning */}
        <LocationWarning />
        
        {/* Controls */}
        <Card>
          <CardContent className="py-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {driver?.is_available ? (
                  <Power className="h-5 w-5 text-green-500" />
                ) : (
                  <PowerOff className="h-5 w-5 text-muted-foreground" />
                )}
                <Label>Disponível para entregas</Label>
              </div>
              <Switch
                checked={driver?.is_available}
                onCheckedChange={toggleAvailability}
                disabled={orders.length > 0}
              />
            </div>
            
            {orders.length > 0 && (
              <p className="text-xs text-muted-foreground">
                * Disponibilidade bloqueada enquanto houver entregas pendentes
              </p>
            )}

            <div className="pt-2 border-t border-border space-y-3">
              <PushNotificationButton
                companyId={driver?.company_id}
                userId={user?.id}
                userType="driver"
                className="w-full"
              />
              <div className="flex justify-center">
                <InstallAppPrompt 
                  name="Entregador - Cardpon"
                  short_name="Entregador"
                  description="App para entregadores - Receba e gerencie suas entregas"
                  scope="/entregador"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Financial Summary */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Wallet className="h-5 w-5 text-primary" />
              Meu Financeiro
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <DollarSign className="h-4 w-4 text-green-600 dark:text-green-400" />
                  <span className="text-sm text-muted-foreground">A receber</span>
                </div>
                <p className="text-xl font-bold text-green-600 dark:text-green-400">
                  {formatCurrency(financials.pendingEarnings)}
                </p>
              </div>
              <div className="p-4 bg-primary/10 border border-primary/20 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  <span className="text-sm text-muted-foreground">Já recebido</span>
                </div>
                <p className="text-xl font-bold text-primary">
                  {formatCurrency(financials.totalPaid)}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <span className="text-sm text-muted-foreground">Total de entregas realizadas</span>
              <Badge variant="secondary" className="text-base px-3">
                {financials.deliveryCount}
              </Badge>
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              className="w-full mt-2"
              onClick={() => setShowPaymentsModal(true)}
            >
              Ver meus pagamentos
            </Button>
          </CardContent>
        </Card>

        {/* Payments Modal */}
        <DriverPaymentsModal
          open={showPaymentsModal}
          onOpenChange={setShowPaymentsModal}
          driverId={driver?.id || ''}
          driverName={driver?.driver_name || 'Entregador'}
          pendingEarnings={financials.pendingEarnings}
          totalPaid={financials.totalPaid}
          deliveryCount={financials.deliveryCount}
        />

        {/* Pending Offers - Competitive System */}
        {pendingOffers.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-destructive animate-bounce" />
              <h2 className="font-semibold text-lg text-destructive">
                Ofertas Disponíveis ({pendingOffers.length})
              </h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Aceite rápido! Quem pegar primeiro, leva.
            </p>

            {pendingOffers.map((offer) => (
              <Card key={offer.id} className="ring-2 ring-destructive animate-pulse">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="destructive" className="text-xs animate-bounce">Disponível!</Badge>
                      <CardTitle className="text-base">{offer.order?.company?.name || 'Loja'}</CardTitle>
                    </div>
                    <Badge variant="outline">
                      {offer.order?.payment_method === 'cash' && 'Dinheiro'}
                      {offer.order?.payment_method === 'card_on_delivery' && 'Cartão'}
                      {offer.order?.payment_method === 'pix' && 'PIX'}
                      {offer.order?.payment_method === 'online' && 'Pago'}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    {offer.order && (
                      <span>{format(new Date(offer.order.created_at), "dd/MM 'às' HH:mm", { locale: ptBR })}</span>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Customer */}
                  {offer.order && (
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{offer.order.customer_name}</span>
                      <span className="font-bold text-lg text-primary">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(offer.order.total)}
                      </span>
                    </div>
                  )}

                  {/* Address Preview */}
                  {offer.order?.delivery_address && (
                    <div className="p-3 bg-muted rounded-lg space-y-3 text-sm">
                      <div className="flex items-start gap-2 text-muted-foreground">
                        <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="font-medium">
                            {offer.order.delivery_address.street}, {offer.order.delivery_address.number}
                          </p>
                          <p className="text-muted-foreground">
                            {offer.order.delivery_address.neighborhood} - {offer.order.delivery_address.city}{offer.order.delivery_address.state ? ` / ${offer.order.delivery_address.state}` : ''}
                          </p>
                          {offer.order.delivery_address.complement && (
                            <p className="text-xs text-muted-foreground mt-1">
                              <span className="font-medium">Complemento:</span> {offer.order.delivery_address.complement}
                            </p>
                          )}
                          {offer.order.delivery_address.reference && (
                            <p className="text-xs text-muted-foreground">
                              <span className="font-medium">Referência:</span> {offer.order.delivery_address.reference}
                            </p>
                          )}
                          {offer.order.delivery_address.zip_code && (
                            <p className="text-[11px] text-muted-foreground mt-1">
                              CEP: {offer.order.delivery_address.zip_code}
                            </p>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={() => {
                          const addr = offer.order.delivery_address!;
                          const address = `${addr.street}, ${addr.number}, ${addr.neighborhood}, ${addr.city}${addr.state ? `, ${addr.state}` : ''}`;
                          const encodedAddress = encodeURIComponent(address);
                          window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodedAddress}`,'_blank');
                        }}
                      >
                        <Navigation className="h-4 w-4 mr-2" />
                        Ver rota no Google Maps
                      </Button>
                    </div>
                  )}

                  {/* Order Items - Expandable */}
                  {offer.order?.order_items && offer.order.order_items.length > 0 && (
                    <Collapsible>
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="w-full justify-between p-3 bg-primary/5 border border-primary/10 rounded-lg hover:bg-primary/10">
                          <span className="flex items-center gap-2 font-medium text-sm">
                            <Receipt className="h-4 w-4" />
                            Ver Itens do Pedido ({offer.order.order_items.length})
                          </span>
                          <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="mt-2">
                        <div className="p-3 bg-primary/5 border border-primary/10 rounded-lg space-y-2">
                          {offer.order.order_items.map((item) => {
                            const options = Array.isArray(item.options) ? item.options : [];
                            return (
                              <div key={item.id} className="text-sm pb-2 border-b border-border/50 last:border-0 last:pb-0">
                                <div className="flex justify-between">
                                  <span>
                                    <span className="font-medium">{item.quantity}x</span> {item.product_name}
                                  </span>
                                  <span className="text-muted-foreground">{formatCurrency(item.total_price)}</span>
                                </div>
                                {options.length > 0 && (
                                  <p className="text-xs text-muted-foreground ml-4">
                                    + {options.map((o) => o.name).join(', ')}
                                  </p>
                                )}
                                {item.notes && (
                                  <p className="text-xs text-orange-600 dark:text-orange-400 ml-4 italic">
                                    Obs: {item.notes}
                                  </p>
                                )}
                              </div>
                            );
                          })}
                          <div className="pt-2 mt-2 border-t border-border/50 space-y-1 text-sm">
                            <div className="flex justify-between text-muted-foreground">
                              <span>Subtotal</span>
                              <span>{formatCurrency(offer.order.subtotal)}</span>
                            </div>
                            <div className="flex justify-between text-muted-foreground">
                              <span>Taxa de entrega</span>
                              <span>{formatCurrency(offer.order.delivery_fee)}</span>
                            </div>
                            <div className="flex justify-between font-bold text-base pt-1 border-t">
                              <span>Total</span>
                              <span>{formatCurrency(offer.order.total)}</span>
                            </div>
                          </div>
                          {offer.order.needs_change && offer.order.change_for && (
                            <div className="mt-2 p-2 bg-yellow-500/10 border border-yellow-500/20 rounded text-sm">
                              <span className="font-medium text-yellow-700 dark:text-yellow-400">
                                Troco para: {formatCurrency(offer.order.change_for)}
                              </span>
                            </div>
                          )}
                          {offer.order.notes && (
                            <div className="mt-2 p-2 bg-orange-500/10 border border-orange-500/20 rounded text-sm">
                              <p className="font-medium text-orange-700 dark:text-orange-400">Observações:</p>
                              <p className="text-muted-foreground">{offer.order.notes}</p>
                            </div>
                          )}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 pt-2">
                    <Button
                      className="flex-1"
                      size="lg"
                      variant="destructive"
                      onClick={() => acceptOffer(offer)}
                      disabled={acceptingOffer === offer.id}
                    >
                      {acceptingOffer === offer.id ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <ThumbsUp className="h-4 w-4 mr-2" />
                      )}
                      Aceitar Entrega
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Multi-Delivery Mode */}
        {driver?.id && orders.length > 0 && (
          <MultiDeliveryMode
            orders={orders.map(o => ({
              ...o,
              company: { name: o.company.name, address: o.company.address }
            }))}
            driverId={driver.id}
            onStartMultiDelivery={async (orderIds) => {
              // Update all selected orders to out_for_delivery
              for (const orderId of orderIds) {
                await driverSupabase
                  .from('orders')
                  .update({ status: 'out_for_delivery' })
                  .eq('id', orderId);
              }
              // Update driver status
              await driverSupabase
                .from('delivery_drivers')
                .update({ driver_status: 'in_delivery' })
                .eq('id', driver.id);
              
              setIsMultiDeliveryActive(true);
              setOrders(prev => prev.map(o => 
                orderIds.includes(o.id) ? { ...o, status: 'out_for_delivery' } : o
              ));
            }}
            onCompleteDelivery={completeDelivery}
            updatingOrder={updatingOrder}
          />
        )}

        {/* Orders */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-lg flex items-center gap-2">
              <Package className="h-5 w-5" />
              Minhas Entregas ({orders.length})
            </h2>
            <Button variant="outline" size="sm" onClick={() => { loadDriverData(); loadPendingOffers(); }}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Atualizar
            </Button>
          </div>

          {orders.length === 0 && pendingOffers.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">Nenhuma entrega pendente</p>
                <p className="text-sm text-muted-foreground mt-2">
                  Fique disponível para receber ofertas de entrega
                </p>
              </CardContent>
            </Card>
          ) : orders.length === 0 ? null : (
            orders.map((order, index) => (
              <Card key={order.id} className={order.status === 'awaiting_driver' ? 'ring-2 ring-destructive animate-pulse' : index === 0 ? 'ring-2 ring-primary' : ''}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {order.status === 'awaiting_driver' && (
                        <Badge variant="destructive" className="text-xs animate-bounce">Nova!</Badge>
                      )}
                      {order.status !== 'awaiting_driver' && index === 0 && (
                        <Badge variant="outline" className="text-xs">Próxima</Badge>
                      )}
                      <CardTitle className="text-base">{order.company.name}</CardTitle>
                    </div>
                    {getStatusBadge(order.status, order.queue_position)}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span>{format(new Date(order.created_at), "dd/MM 'às' HH:mm", { locale: ptBR })}</span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Customer Info */}
                  <div className="p-3 bg-muted/50 rounded-lg space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-lg">{order.customer_name}</span>
                    </div>
                    <a
                      href={`tel:${order.customer_phone}`}
                      className="flex items-center gap-2 text-primary hover:underline"
                    >
                      <Phone className="h-4 w-4" />
                      <span>{order.customer_phone}</span>
                    </a>
                  </div>

                  {/* Delivery Address */}
                  {order.delivery_address && (
                    <div className="p-3 bg-muted rounded-lg space-y-3">
                      <div className="flex items-start gap-3">
                        <MapPin className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                        <div className="text-sm flex-1">
                          <p className="font-medium text-base">
                            {order.delivery_address.street}, {order.delivery_address.number}
                          </p>
                          <p className="text-muted-foreground">
                            {order.delivery_address.neighborhood}
                          </p>
                          <p className="text-muted-foreground">
                            {order.delivery_address.city} - {order.delivery_address.state}
                          </p>
                          {order.delivery_address.complement && (
                            <p className="text-muted-foreground mt-1">
                              <span className="font-medium">Complemento:</span> {order.delivery_address.complement}
                            </p>
                          )}
                          {order.delivery_address.reference && (
                            <p className="text-muted-foreground">
                              <span className="font-medium">Referência:</span> {order.delivery_address.reference}
                            </p>
                          )}
                          <p className="text-muted-foreground text-xs mt-1">
                            CEP: {order.delivery_address.zip_code}
                          </p>
                        </div>
                      </div>

                      {/* In-App Route Map - show when delivery is in progress */}
                      {order.status === 'out_for_delivery' && showMapForOrder === order.id && (
                        <DriverRouteMap
                          destinationAddress={order.delivery_address}
                          onClose={() => setShowMapForOrder(null)}
                          onCompleteDelivery={() => completeDelivery(order.id)}
                          isCompletingDelivery={updatingOrder === order.id}
                        />
                      )}
                      
                      {/* Map Toggle / External Google Maps */}
                      <div className="flex gap-2">
                        {order.status === 'out_for_delivery' && (
                          <Button
                            variant={showMapForOrder === order.id ? 'secondary' : 'default'}
                            size="sm"
                            className="flex-1"
                            onClick={() => setShowMapForOrder(showMapForOrder === order.id ? null : order.id)}
                          >
                            <Map className="h-4 w-4 mr-2" />
                            {showMapForOrder === order.id ? 'Ocultar mapa' : 'Ver rota no app'}
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          className={order.status === 'out_for_delivery' ? '' : 'w-full'}
                          onClick={() => {
                            const address = `${order.delivery_address!.street}, ${order.delivery_address!.number}, ${order.delivery_address!.neighborhood}, ${order.delivery_address!.city}, ${order.delivery_address!.state}`;
                            const encodedAddress = encodeURIComponent(address);
                            window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodedAddress}`,'_blank');
                          }}
                        >
                          <Navigation className="h-4 w-4 mr-2" />
                          Google Maps
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Order Items */}
                  {order.order_items && order.order_items.length > 0 && (
                    <div className="p-3 bg-primary/5 border border-primary/10 rounded-lg">
                      <p className="font-medium text-sm mb-2 flex items-center gap-2">
                        <Package className="h-4 w-4" />
                        Itens do Pedido
                      </p>
                      <div className="space-y-2">
                        {order.order_items.map((item) => {
                          const options = Array.isArray(item.options) ? item.options : [];
                          return (
                            <div key={item.id} className="text-sm pb-2 border-b border-border/50 last:border-0 last:pb-0">
                              <div className="flex justify-between">
                                <span>
                                  <span className="font-medium">{item.quantity}x</span> {item.product_name}
                                </span>
                                <span className="text-muted-foreground">{formatCurrency(item.total_price)}</span>
                              </div>
                              {options.length > 0 && (
                                <p className="text-xs text-muted-foreground ml-4">
                                  + {options.map((o) => o.name).join(', ')}
                                </p>
                              )}
                              {item.notes && (
                                <p className="text-xs text-orange-600 dark:text-orange-400 ml-4 italic">
                                  Obs: {item.notes}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Payment Info */}
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <div className="flex justify-between items-center text-sm">
                      <span>Forma de pagamento:</span>
                      <Badge variant="outline">
                        {order.payment_method === 'cash' && 'Dinheiro'}
                        {order.payment_method === 'card_on_delivery' && 'Cartão na entrega'}
                        {order.payment_method === 'pix' && 'PIX'}
                        {order.payment_method === 'online' && 'Pago online'}
                      </Badge>
                    </div>
                    {order.needs_change && order.change_for && (
                      <div className="mt-2 p-2 bg-yellow-500/10 border border-yellow-500/20 rounded text-sm">
                        <span className="font-medium text-yellow-700 dark:text-yellow-400">
                          Troco para: {formatCurrency(order.change_for)}
                        </span>
                      </div>
                    )}
                    <div className="mt-2 space-y-1 text-sm">
                      <div className="flex justify-between text-muted-foreground">
                        <span>Subtotal</span>
                        <span>{formatCurrency(order.subtotal)}</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>Taxa de entrega</span>
                        <span>{formatCurrency(order.delivery_fee)}</span>
                      </div>
                      <div className="flex justify-between font-bold text-base pt-1 border-t">
                        <span>Total</span>
                        <span>{formatCurrency(order.total)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Notes */}
                  {order.notes && (
                    <div className="p-3 bg-orange-500/10 border border-orange-500/20 rounded-lg text-sm">
                      <p className="font-medium text-orange-700 dark:text-orange-400">Observações:</p>
                      <p className="text-muted-foreground mt-1">{order.notes}</p>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 pt-2">
                    {order.status === 'awaiting_driver' && (
                      <Button
                        className="flex-1"
                        size="lg"
                        variant="destructive"
                        onClick={() => acceptDelivery(order.id)}
                        disabled={updatingOrder === order.id}
                      >
                        {updatingOrder === order.id ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <ThumbsUp className="h-4 w-4 mr-2" />
                        )}
                        Aceitar Entrega
                      </Button>
                    )}
                    {order.status === 'ready' && (
                      <Button
                        className="flex-1"
                        size="lg"
                        onClick={() => startDelivery(order.id)}
                        disabled={updatingOrder === order.id}
                      >
                        {updatingOrder === order.id ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Play className="h-4 w-4 mr-2" />
                        )}
                        Iniciar Entrega
                      </Button>
                    )}
                    {order.status === 'out_for_delivery' && (
                      <Button
                        className="flex-1"
                        size="lg"
                        variant="default"
                        onClick={() => completeDelivery(order.id)}
                        disabled={updatingOrder === order.id}
                      >
                        {updatingOrder === order.id ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <CheckCircle className="h-4 w-4 mr-2" />
                        )}
                        Concluir Entrega
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </main>
    </div>
  );
}
