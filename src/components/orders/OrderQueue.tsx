import { Package, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { Database } from '@/integrations/supabase/types';

type OrderStatus = Database['public']['Enums']['order_status'];
type PaymentMethod = Database['public']['Enums']['payment_method'];

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
  created_at: string;
  customer_name: string;
  customer_phone: string;
  status: OrderStatus;
  payment_method: PaymentMethod;
  payment_status: string;
  total: number;
  source?: string;
  order_items?: OrderItem[];
}

const statusConfig: Record<OrderStatus, { label: string; color: string; bgLight: string }> = {
  pending: { label: 'Pendente', color: 'bg-yellow-500', bgLight: 'bg-yellow-500/10' },
  confirmed: { label: 'Confirmado', color: 'bg-blue-500', bgLight: 'bg-blue-500/10' },
  preparing: { label: 'Preparando', color: 'bg-orange-500', bgLight: 'bg-orange-500/10' },
  ready: { label: 'Pronto', color: 'bg-purple-500', bgLight: 'bg-purple-500/10' },
  awaiting_driver: { label: 'Aguardando', color: 'bg-amber-500', bgLight: 'bg-amber-500/10' },
  queued: { label: 'Na Fila', color: 'bg-indigo-500', bgLight: 'bg-indigo-500/10' },
  out_for_delivery: { label: 'A caminho', color: 'bg-cyan-500', bgLight: 'bg-cyan-500/10' },
  delivered: { label: 'Entregue', color: 'bg-green-500', bgLight: 'bg-green-500/10' },
  cancelled: { label: 'Cancelado', color: 'bg-red-500', bgLight: 'bg-red-500/10' },
};

const paymentMethodLabels: Record<PaymentMethod, string> = {
  pix: 'PIX',
  cash: 'Dinheiro',
  card_on_delivery: 'Cartão',
  online: 'Online',
  pay_at_counter: 'Balcão',
};

interface OrderQueueProps {
  orders: any[];
  selectedOrderId: string | null;
  onSelectOrder: (order: any) => void;
  title?: string;
}

export function OrderQueue({ orders, selectedOrderId, onSelectOrder, title = "Fila de Pedidos" }: OrderQueueProps) {
  return (
    <div className="flex flex-col h-full bg-card rounded-xl border shadow-sm overflow-hidden">
      {/* Header fixo com fundo */}
      <div className="flex items-center gap-2 p-4 border-b bg-muted/30 shrink-0">
        <Package className="h-5 w-5 text-primary" />
        <h2 className="font-semibold">{title}</h2>
        <Badge variant="secondary" className="ml-auto text-sm font-bold">
          {orders.length}
        </Badge>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="space-y-2 p-3">
          <AnimatePresence>
            {orders.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Package className="h-12 w-12 mx-auto mb-3 opacity-20" />
                <p className="text-sm">Nenhum pedido na fila</p>
              </div>
            ) : (
              orders.map((order, index) => (
                <motion.div
                  key={order.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -50 }}
                  transition={{ duration: 0.2, delay: index * 0.02 }}
                >
                  <OrderQueueCard
                    order={order}
                    isSelected={selectedOrderId === order.id}
                    isOldest={index === 0}
                    onClick={() => onSelectOrder(order)}
                  />
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>
      </ScrollArea>
    </div>
  );
}

interface OrderQueueCardProps {
  order: Order;
  isSelected: boolean;
  isOldest: boolean;
  onClick: () => void;
}

function OrderQueueCard({ order, isSelected, isOldest, onClick }: OrderQueueCardProps) {
  const isOnlinePayment = order.payment_method === 'pix' || order.payment_method === 'online';
  const isPaid = order.payment_status === 'paid';

  const getSourceBadge = () => {
    switch (order.source) {
      case 'pos':
        return <Badge className="text-[9px] px-1 py-0 bg-violet-500/90 text-white">PDV</Badge>;
      case 'table':
        return <Badge className="text-[9px] px-1 py-0 bg-amber-500/90 text-white">Mesa</Badge>;
      case 'pickup':
        return <Badge className="text-[9px] px-1 py-0 bg-emerald-500/90 text-white">Retirada</Badge>;
      default:
        return <Badge className="text-[9px] px-1 py-0 bg-sky-500/90 text-white">Online</Badge>;
    }
  };

  return (
    <Card
      className={cn(
        "cursor-pointer transition-all hover:shadow-md border-l-4",
        isSelected ? "ring-2 ring-primary shadow-md bg-primary/5" : "hover:border-primary/50",
        isOldest && !isSelected ? "ring-2 ring-destructive/40 bg-destructive/5" : "",
        statusConfig[order.status].color.replace('bg-', 'border-l-')
      )}
      onClick={onClick}
    >
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-mono font-bold text-sm">#{order.id.slice(0, 6).toUpperCase()}</span>
              {getSourceBadge()}
              {isOldest && (
                <Badge className="text-[9px] px-1 py-0 bg-destructive text-destructive-foreground">
                  Mais antigo
                </Badge>
              )}
            </div>
            <p className="text-sm font-medium truncate mt-1">{order.customer_name}</p>
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              <Badge
                variant="secondary"
                className={cn(
                  "text-[10px] px-1.5 py-0",
                  statusConfig[order.status].bgLight,
                  statusConfig[order.status].color.replace('bg-', 'text-').replace('-500', '-700')
                )}
              >
                {statusConfig[order.status].label}
              </Badge>
              <span className="text-xs text-muted-foreground">{order.order_items?.length || 0} itens</span>
              {isOnlinePayment && (
                <Badge
                  className={cn(
                    "text-[9px] px-1 py-0",
                    isPaid ? 'bg-emerald-500/90 text-white' : 'bg-amber-100 text-amber-700'
                  )}
                >
                  {isPaid ? '✓' : '⏳'}
                </Badge>
              )}
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="font-bold text-sm text-primary">R$ {Number(order.total).toFixed(2)}</p>
            <p className="text-[10px] text-muted-foreground flex items-center gap-0.5 justify-end mt-1">
              <Clock className="h-3 w-3" />
              {formatDistanceToNow(new Date(order.created_at), {
                addSuffix: false,
                locale: ptBR,
              })}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

