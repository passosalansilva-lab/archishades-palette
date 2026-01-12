import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useNotificationSound } from '@/hooks/useNotificationSound';

interface OrderPayload {
  id: string;
  customer_name: string;
  total: number;
  status: string;
  created_at: string;
}

// Track notified orders to prevent duplicates (shared across all instances)
const notifiedOrders = new Set<string>();
const NOTIFICATION_COOLDOWN = 5000; // 5 seconds cooldown per order

// ====== Push Notification Functions ======

interface SendNotificationParams {
  orderId?: string;
  companyId?: string;
  userId?: string;
  userType?: 'customer' | 'driver' | 'store_owner';
  title: string;
  body: string;
  url: string;
  tag?: string;
}

export async function sendOrderNotification({
  orderId,
  companyId,
  userId,
  userType,
  title,
  body,
  url,
  tag = 'order-update',
}: SendNotificationParams) {
  try {
    console.log('Sending notification:', { orderId, companyId, userId, userType, title });

    // Use supabase.functions.invoke para garantir que usamos o projeto correto
    const { data, error } = await supabase.functions.invoke('send-push-notification', {
      body: {
        orderId,
        companyId,
        userId,
        userType,
        payload: {
          title,
          body,
          icon: '/pwa-192x192.png',
          badge: '/pwa-192x192.png',
          tag,
          data: {
            url,
            orderId,
            timestamp: new Date().toISOString(),
          },
        },
      },
    });

    if (error) {
      console.error('Error sending notification:', error);
      return false;
    }

    console.log('Notification sent:', data);
    return true;
  } catch (error) {
    console.error('Error sending notification:', error);
    return false;
  }
}

export async function notifyOrderStatusChange(
  orderId: string,
  newStatus: string,
  customerName: string,
  companySlug: string
) {
  const statusMessages: Record<string, { title: string; body: string }> = {
    confirmed: {
      title: '✅ Pedido Confirmado!',
      body: `${customerName}, seu pedido foi confirmado e está sendo preparado.`,
    },
    preparing: {
      title: '👨‍🍳 Preparando seu pedido',
      body: `${customerName}, seu pedido está sendo preparado com carinho!`,
    },
    ready: {
      title: '📦 Pedido Pronto!',
      body: `${customerName}, seu pedido está pronto e aguardando entrega.`,
    },
    out_for_delivery: {
      title: '🚚 Saiu para Entrega!',
      body: `${customerName}, seu pedido saiu para entrega e chegará em breve!`,
    },
    delivered: {
      title: '🎉 Pedido Entregue!',
      body: `${customerName}, seu pedido foi entregue. Bom apetite!`,
    },
    cancelled: {
      title: '❌ Pedido Cancelado',
      body: `${customerName}, infelizmente seu pedido foi cancelado.`,
    },
  };

  const message = statusMessages[newStatus];
  if (!message) return;

  await sendOrderNotification({
    orderId,
    userType: 'customer',
    title: message.title,
    body: message.body,
    url: `/cardapio/${companySlug}/rastreamento/${orderId}`,
    tag: `order-${orderId}-${newStatus}`,
  });
}

export async function notifyDriverNewOrder(
  orderId: string,
  driverId: string,
  customerName: string,
  deliveryAddress: string
) {
  await sendOrderNotification({
    orderId,
    userId: driverId,
    userType: 'driver',
    title: '🔔 Novo Pedido Atribuído!',
    body: `Pedido para ${customerName} - ${deliveryAddress}`,
    url: `/entregador`,
    tag: `driver-order-${orderId}`,
  });
}

export async function notifyStoreNewOrder(
  companyId: string,
  orderId: string,
  customerName: string,
  orderTotal: number
) {
  await sendOrderNotification({
    companyId,
    userType: 'store_owner',
    title: '🛒 Novo Pedido Recebido!',
    body: `Pedido de ${customerName} - R$ ${orderTotal.toFixed(2)}`,
    url: `/dashboard/orders`,
    tag: `store-order-${orderId}`,
  });
}

// ====== Realtime Notifications Hook ======

export type RealtimeConnectionStatus = 'idle' | 'connecting' | 'connected' | 'error';

export function useOrderNotifications() {
  const { user } = useAuth();
  const companyIdRef = useRef<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeConnectionStatus>('idle');

  useEffect(() => {
    if (!user) {
      setRealtimeStatus('idle');
      return;
    }

    const loadSound = async () => {
      try {
        const { data, error } = await supabase
          .from('notification_sound_settings')
          .select('sound_key, enabled, volume')
          .eq('user_id', user.id)
          .eq('event_type', 'new_order')
          .maybeSingle();

        // Som padrão do sistema
        const DEFAULT_NOTIFICATION_SOUND = '/sounds/default-notification.mp3';
        
        let soundKey = DEFAULT_NOTIFICATION_SOUND;
        let enabled = true;
        let volume = 0.6;

        if (!error && data) {
          // Se não tiver sound_key configurado ou for 'classic', usa o padrão do sistema
          const configuredSound = (data as any).sound_key?.trim();
          if (configuredSound && configuredSound !== 'classic' && configuredSound !== 'default') {
            soundKey = configuredSound;
          }
          enabled = (data as any).enabled ?? true;
          volume = (data as any).volume ?? 0.6;
        }

        if (!enabled) {
          audioRef.current = null;
          return;
        }

        const audio = new Audio(soundKey);
        audio.volume = volume;
        audioRef.current = audio;
      } catch (e) {
        console.error('Erro ao carregar som de novo pedido:', e);
      }
    };

    loadSound();

    return () => {
      if (audioRef.current) {
        audioRef.current = null;
      }
    };
  }, [user]);

  useEffect(() => {
    if (!user) {
      setRealtimeStatus('idle');
      return;
    }

    const setupRealtimeSubscription = async () => {
      setRealtimeStatus('connecting');

      // Descobre a empresa do usuário (dono OU staff)
      let company: { id: string; slug: string } | null = null;

      // Primeiro tenta via vínculo de staff
      const { data: staffRow, error: staffError } = await supabase
        .from('company_staff')
        .select('company_id, companies:company_id(id, slug)')
        .eq('user_id', user.id)
        .maybeSingle();

      if (staffError) {
        console.error('[useOrderNotifications] Erro ao buscar company_staff:', staffError);
      } else if (staffRow && (staffRow as any).companies) {
        company = (staffRow as any).companies as { id: string; slug: string };
      }

      // Se não for staff, tenta como dono da empresa
      if (!company) {
        const { data: ownerCompany, error: ownerError } = await supabase
          .from('companies')
          .select('id, slug')
          .eq('owner_id', user.id)
          .maybeSingle();

        if (ownerError) {
          console.error('[useOrderNotifications] Erro ao buscar empresa do dono:', ownerError);
        }

        if (ownerCompany) {
          company = ownerCompany as any;
        }
      }

      if (!company) {
        console.log('[useOrderNotifications] Nenhuma empresa encontrada para o usuário (dono ou staff)');
        setRealtimeStatus('error');
        return;
      }

      companyIdRef.current = company.id;
      console.log('[useOrderNotifications] Configurando realtime para empresa:', company.id);

      // Subscribe to new orders
      const channel = supabase
        .channel('orders-realtime')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'orders',
            filter: `company_id=eq.${company.id}`,
          },
          async (payload) => {
            const newOrder = payload.new as OrderPayload;
            
            // Validate order data exists
            if (!newOrder?.id || !newOrder?.customer_name || newOrder.total === undefined) {
              console.warn('[useOrderNotifications] Invalid order payload, skipping notification:', payload);
              return;
            }

            // Check if we already notified for this order (prevent duplicates)
            const notificationKey = `insert-${newOrder.id}`;
            if (notifiedOrders.has(notificationKey)) {
              console.log('[useOrderNotifications] Duplicate notification blocked for:', newOrder.id);
              return;
            }

            // Add to notified set and remove after cooldown
            notifiedOrders.add(notificationKey);
            setTimeout(() => notifiedOrders.delete(notificationKey), NOTIFICATION_COOLDOWN);

            // Verify order actually exists in database with items (prevent phantom notifications)
            // Small delay to ensure order_items are inserted
            await new Promise(resolve => setTimeout(resolve, 500));
            
            const { data: orderWithItems, error: verifyError } = await supabase
              .from('orders')
              .select('id, order_items(id)')
              .eq('id', newOrder.id)
              .maybeSingle();

            if (verifyError || !orderWithItems) {
              console.warn('[useOrderNotifications] Phantom order detected (not found), skipping:', newOrder.id);
              notifiedOrders.delete(notificationKey);
              return;
            }

            // Check if order has items (empty orders are phantom/incomplete)
            const hasItems = orderWithItems.order_items && orderWithItems.order_items.length > 0;
            if (!hasItems) {
              console.warn('[useOrderNotifications] Order without items detected, skipping:', newOrder.id);
              notifiedOrders.delete(notificationKey);
              return;
            }

            console.log('[useOrderNotifications] New order verified:', newOrder.id);
            
            // Play notification sound
            if (audioRef.current) {
              audioRef.current.currentTime = 0;
              audioRef.current.play().catch(console.error);
            }

            toast.success(`Novo pedido de ${newOrder.customer_name}!`, {
              description: `Valor: R$ ${Number(newOrder.total).toFixed(2)}`,
              duration: 10000,
              action: {
                label: 'Ver pedidos',
                onClick: () => {
                  window.location.href = '/dashboard/orders';
                },
              },
            });

            // Send push notification to store owner
            await notifyStoreNewOrder(
              company.id,
              newOrder.id,
              newOrder.customer_name,
              Number(newOrder.total)
            );
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'orders',
            filter: `company_id=eq.${company.id}`,
          },
          async (payload) => {
            console.log('Order updated:', payload);
            const updatedOrder = payload.new as OrderPayload;
            const oldOrder = payload.old as OrderPayload;
            
            // Send push notification for status changes
            if (updatedOrder.status !== oldOrder.status) {
              await notifyOrderStatusChange(
                updatedOrder.id,
                updatedOrder.status,
                updatedOrder.customer_name,
                company.slug
              );
            }

            // Only show toast for important status changes
            if (updatedOrder.status === 'cancelled') {
              toast.error(`Pedido cancelado`, {
                description: `Cliente: ${updatedOrder.customer_name}`,
                duration: 8000,
              });
            }
          }
        )
        .subscribe((status) => {
          console.log('Realtime subscription status:', status);
          if (status === 'SUBSCRIBED') {
            setRealtimeStatus('connected');
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            setRealtimeStatus('error');
          }
        });

      return () => {
        console.log('Cleaning up realtime subscription');
        supabase.removeChannel(channel);
        setRealtimeStatus('idle');
      };
    };

    const cleanupPromise = setupRealtimeSubscription();
    
    return () => {
      cleanupPromise.then((cleanup) => cleanup?.());
    };
  }, [user]);

  return { realtimeStatus };
}
