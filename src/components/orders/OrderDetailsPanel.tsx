import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Clock,
  Package,
  CheckCircle,
  ChefHat,
  Truck,
  XCircle,
  Loader2,
  Phone,
  MapPin,
  UserPlus,
  Users,
  AlertTriangle,
  AlertCircle,
  Send,
  FileText,
  CreditCard,
  Banknote,
  Smartphone,
  Wallet,
  Store,
  UtensilsCrossed,
  ListOrdered,
  X,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { PrintReceipt } from '@/components/orders/PrintReceipt';
import { OrderRefundHistory } from '@/components/orders/OrderRefundHistory';
import { cn } from '@/lib/utils';
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
  requires_preparation?: boolean;
}

interface DeliveryAddress {
  id: string;
  street: string;
  number: string;
  complement: string | null;
  neighborhood: string;
  city: string;
  state: string;
  zip_code: string;
  reference: string | null;
}

interface DeliveryDriver {
  id: string;
  driver_name: string | null;
  driver_phone: string | null;
  is_available: boolean;
  driver_status: string | null;
}

interface Coupon {
  id: string;
  code: string;
  discount_type: string;
  discount_value: number;
}

interface ReferralCode {
  id: string;
  code: string;
  customers?: {
    name: string;
  };
}

interface Order {
  id: string;
  created_at: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  customer_id: string | null;
  status: OrderStatus;
  payment_method: PaymentMethod;
  payment_status: string;
  subtotal: number;
  delivery_fee: number;
  discount_amount: number | null;
  total: number;
  notes: string | null;
  delivery_driver_id: string | null;
  delivery_address_id: string | null;
  coupon_id: string | null;
  referral_code_id: string | null;
  needs_change?: boolean;
  change_for?: number | null;
  cancellation_reason?: string | null;
  source?: string;
  table_session_id?: string | null;
  order_items?: OrderItem[];
  customer_addresses?: DeliveryAddress;
  delivery_driver?: DeliveryDriver;
  coupons?: Coupon;
  customer_referral_codes?: ReferralCode;
}

const statusConfig: Record<OrderStatus, { label: string; icon: typeof Clock; color: string }> = {
  pending: { label: 'Pendente', icon: Clock, color: 'bg-yellow-500' },
  confirmed: { label: 'Confirmado', icon: CheckCircle, color: 'bg-blue-500' },
  preparing: { label: 'Preparando', icon: ChefHat, color: 'bg-orange-500' },
  ready: { label: 'Pronto', icon: Package, color: 'bg-purple-500' },
  awaiting_driver: { label: 'Aguardando Entregador', icon: Truck, color: 'bg-amber-500' },
  queued: { label: 'Na Fila', icon: ListOrdered, color: 'bg-indigo-500' },
  out_for_delivery: { label: 'A caminho', icon: Truck, color: 'bg-cyan-500' },
  delivered: { label: 'Entregue', icon: CheckCircle, color: 'bg-green-500' },
  cancelled: { label: 'Cancelado', icon: XCircle, color: 'bg-red-500' },
};

const paymentMethodLabels: Record<PaymentMethod, string> = {
  pix: 'PIX',
  cash: 'Dinheiro',
  card_on_delivery: 'Cartão na entrega',
  online: 'Cartão online',
  pay_at_counter: 'Pagar no balcão',
};

const statusFlow: OrderStatus[] = ['pending', 'confirmed', 'preparing', 'ready', 'awaiting_driver', 'out_for_delivery', 'delivered'];
const tableStatusFlow: OrderStatus[] = ['pending', 'confirmed', 'preparing', 'ready', 'delivered'];
const pickupStatusFlow: OrderStatus[] = ['pending', 'confirmed', 'preparing', 'ready', 'delivered'];

const getStatusLabel = (status: OrderStatus, source?: string): string => {
  if (status === 'delivered') {
    if (source === 'table') return 'Servido';
    if (source === 'pickup') return 'Retirado';
  }
  return statusConfig[status].label;
};

const getNextStatus = (currentStatus: OrderStatus, source?: string): OrderStatus | null => {
  let flow = statusFlow;
  if (source === 'table') flow = tableStatusFlow;
  else if (source === 'pickup') flow = pickupStatusFlow;
  
  const currentIndex = flow.indexOf(currentStatus);
  if (currentIndex === -1 || currentIndex === flow.length - 1) return null;
  return flow[currentIndex + 1];
};

interface OrderDetailsPanelProps {
  order: any | null;
  companyName: string;
  autoPrintKitchen: boolean;
  autoPrintMode: 'kitchen' | 'full' | 'both';
  autoPrintTrigger: number;
  availableDrivers: any[];
  updatingStatus: boolean;
  assigningDriver: boolean;
  onClose: () => void;
  onUpdateStatus: (orderId: string, newStatus: OrderStatus) => Promise<void>;
  onAssignDriver: (orderId: string, driverId: string) => Promise<void>;
  onReassignDriver: (orderId: string, driverId: string) => Promise<void>;
  onBroadcastToDrivers: (orderId: string) => Promise<void>;
  onCancelOrder: (order: any) => void;
  onConvertToDelivery: (order: any) => void;
}

export function OrderDetailsPanel({
  order,
  companyName,
  autoPrintKitchen,
  autoPrintMode,
  autoPrintTrigger,
  availableDrivers,
  updatingStatus,
  assigningDriver,
  onClose,
  onUpdateStatus,
  onAssignDriver,
  onReassignDriver,
  onBroadcastToDrivers,
  onCancelOrder,
  onConvertToDelivery,
}: OrderDetailsPanelProps) {
  if (!order) {
    return (
      <Card className="h-full flex items-center justify-center bg-muted/20">
        <div className="text-center text-muted-foreground p-8">
          <Package className="h-16 w-16 mx-auto mb-4 opacity-20" />
          <p className="text-lg font-medium">Selecione um pedido</p>
          <p className="text-sm">para ver os detalhes aqui</p>
        </div>
      </Card>
    );
  }

  const nextStatus = getNextStatus(order.status, order.source);
  const StatusIcon = statusConfig[order.status].icon;
  const isDeliveryOrder = order.source !== 'table' && order.source !== 'pickup' && order.source !== 'pos';

  return (
    <Card className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <CardHeader className="pb-3 shrink-0 border-b">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <CardTitle className="text-xl font-display">
                Pedido #{order.id.slice(0, 8)}
              </CardTitle>
              <Badge 
                className={cn(
                  "text-sm",
                  statusConfig[order.status].color,
                  "text-white"
                )}
              >
                {getStatusLabel(order.status, order.source)}
              </Badge>
            </div>
            <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
              <span>{order.customer_name}</span>
              <span>•</span>
              <span>
                {formatDistanceToNow(new Date(order.created_at), {
                  addSuffix: true,
                  locale: ptBR,
                })}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <PrintReceipt
              order={order}
              companyName={companyName}
              autoPrintEnabled={autoPrintKitchen}
              autoPrintMode={autoPrintMode}
              autoPrintTrigger={autoPrintTrigger}
            />
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>

      {/* Scrollable Content */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-5">
          {/* Source Badge */}
          <div className="flex justify-center">
            {order.source === 'pos' && (
              <Badge className="text-sm px-4 py-1.5 bg-violet-500 text-white font-semibold">
                <Store className="h-4 w-4 mr-2" />
                Pedido PDV
              </Badge>
            )}
            {order.source === 'table' && (
              <Badge className="text-sm px-4 py-1.5 bg-amber-500 text-white font-semibold">
                <UtensilsCrossed className="h-4 w-4 mr-2" />
                Pedido Mesa
              </Badge>
            )}
            {order.source === 'pickup' && (
              <Badge className="text-sm px-4 py-1.5 bg-emerald-500 text-white font-semibold">
                <Package className="h-4 w-4 mr-2" />
                Retirada no Balcão
              </Badge>
            )}
            {(!order.source || order.source === 'online') && (
              <Badge className="text-sm px-4 py-1.5 bg-sky-500 text-white font-semibold">
                <Smartphone className="h-4 w-4 mr-2" />
                Pedido Online
              </Badge>
            )}
          </div>

          {/* Quick Actions */}
          {order.status !== 'delivered' && order.status !== 'cancelled' && (
            <div className="space-y-2">
              {nextStatus && (() => {
                const NextIcon = statusConfig[nextStatus].icon;
                return (
                  <Button
                    className="w-full h-12 text-base"
                    onClick={() => onUpdateStatus(order.id, nextStatus)}
                    disabled={updatingStatus}
                  >
                    {updatingStatus ? (
                      <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    ) : (
                      <NextIcon className="h-5 w-5 mr-2" />
                    )}
                    Avançar para {getStatusLabel(nextStatus, order.source)}
                    <ArrowRight className="h-5 w-5 ml-2" />
                  </Button>
                );
              })()}
              
              <div className="flex gap-2">
                {order.source === 'pickup' && !['delivered', 'cancelled'].includes(order.status) && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => onConvertToDelivery(order)}
                  >
                    <Truck className="h-4 w-4 mr-2" />
                    Converter p/ Delivery
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:bg-destructive/10"
                  onClick={() => onCancelOrder(order)}
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Cancelar
                </Button>
              </div>
            </div>
          )}

          <Separator />

          {/* Customer Info */}
          <div className="space-y-2">
            <h4 className="font-medium text-sm text-muted-foreground">Cliente</h4>
            <p className="font-medium">{order.customer_name}</p>
            <div className="flex items-center gap-2 text-sm">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <a href={`tel:${order.customer_phone}`} className="hover:underline">
                {order.customer_phone}
              </a>
            </div>
            {order.customer_email && (
              <p className="text-sm text-muted-foreground">{order.customer_email}</p>
            )}
          </div>

          {/* Address */}
          {order.customer_addresses && (
            <div className="space-y-2">
              <h4 className="font-medium text-sm text-muted-foreground flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Endereço de Entrega
              </h4>
              <p className="text-sm">
                {order.customer_addresses.street}, {order.customer_addresses.number}
                {order.customer_addresses.complement && `, ${order.customer_addresses.complement}`}
              </p>
              <p className="text-sm">
                {order.customer_addresses.neighborhood} - {order.customer_addresses.city}/{order.customer_addresses.state}
              </p>
              <p className="text-sm text-muted-foreground">
                CEP: {order.customer_addresses.zip_code}
              </p>
              {order.customer_addresses.reference && (
                <p className="text-sm text-muted-foreground italic">
                  Ref: {order.customer_addresses.reference}
                </p>
              )}
            </div>
          )}

          {/* Driver Assignment - Only for delivery orders */}
          {isDeliveryOrder && (order.status === 'ready' || order.status === 'awaiting_driver' || order.status === 'out_for_delivery') && (
            <div className="space-y-3">
              <h4 className="font-medium text-sm text-muted-foreground flex items-center gap-2">
                <Truck className="h-4 w-4" />
                Entregador
              </h4>
              
              {order.delivery_driver_id ? (
                <div className="space-y-3">
                  {(() => {
                    const currentDriver = availableDrivers.find(d => d.id === order.delivery_driver_id);
                    return currentDriver ? (
                      <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                        <div>
                          <p className="font-medium">{currentDriver.driver_name || 'Entregador'}</p>
                          {currentDriver.driver_phone && (
                            <p className="text-sm text-muted-foreground">{currentDriver.driver_phone}</p>
                          )}
                          <Badge variant={
                            currentDriver.driver_status === 'in_delivery' ? 'default' :
                            currentDriver.driver_status === 'pending_acceptance' ? 'secondary' :
                            'outline'
                          } className="mt-1">
                            {currentDriver.driver_status === 'in_delivery' ? 'Em entrega' :
                             currentDriver.driver_status === 'pending_acceptance' ? 'Aguardando aceite' :
                             currentDriver.driver_status === 'available' ? 'Disponível' : 
                             currentDriver.driver_status || 'Offline'}
                          </Badge>
                        </div>
                      </div>
                    ) : (
                      <div className="p-3 bg-muted rounded-lg">
                        <p className="text-sm text-muted-foreground">Entregador atribuído</p>
                      </div>
                    );
                  })()}
                  
                  {order.status !== 'out_for_delivery' && (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">Reatribuir para outro:</p>
                      <div className="flex flex-wrap gap-2">
                        {availableDrivers
                          .filter(d => d.id !== order.delivery_driver_id && d.is_available && d.driver_status === 'available')
                          .slice(0, 3)
                          .map((driver) => (
                            <Button
                              key={driver.id}
                              variant="outline"
                              size="sm"
                              onClick={() => onReassignDriver(order.id, driver.id)}
                              disabled={assigningDriver}
                            >
                              {assigningDriver ? (
                                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                              ) : (
                                <Users className="h-3 w-3 mr-1" />
                              )}
                              {driver.driver_name?.split(' ')[0] || 'Entregador'}
                            </Button>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {(() => {
                    const eligibleDrivers = availableDrivers.filter(
                      (d) => d.is_available && d.driver_status === 'available'
                    );

                    return (
                      <div className="space-y-3">
                        {eligibleDrivers.length > 1 && (
                          <Button
                            variant="default"
                            size="sm"
                            className="w-full"
                            onClick={() => onBroadcastToDrivers(order.id)}
                            disabled={assigningDriver || order.status !== 'ready'}
                          >
                            {assigningDriver ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <Send className="h-4 w-4 mr-2" />
                            )}
                            Enviar para todos os entregadores
                          </Button>
                        )}

                        <div className="flex flex-wrap gap-2">
                          {eligibleDrivers.slice(0, 4).map((driver) => (
                            <Button
                              key={driver.id}
                              variant="outline"
                              size="sm"
                              onClick={() => onAssignDriver(order.id, driver.id)}
                              disabled={assigningDriver}
                            >
                              <UserPlus className="h-3 w-3 mr-1" />
                              {driver.driver_name?.split(' ')[0] || 'Entregador'}
                            </Button>
                          ))}
                        </div>

                        {eligibleDrivers.length === 0 && (
                          <p className="text-sm text-amber-600">Nenhum entregador disponível</p>
                        )}
                      </div>
                    );
                  })()}
                </>
              )}
            </div>
          )}

          <Separator />

          {/* Items */}
          <div className="space-y-3">
            <h4 className="font-medium text-sm text-muted-foreground">Itens do Pedido</h4>
            {order.order_items?.map((item) => {
              const options = Array.isArray(item.options) ? item.options as { name: string; priceModifier: number }[] : [];
              return (
                <div key={item.id} className="flex justify-between text-sm p-2 rounded-lg bg-muted/50">
                  <div className="flex-1">
                    <span className="font-semibold text-primary">{item.quantity}x</span>{' '}
                    <span className="font-medium">{item.product_name}</span>
                    {options.length > 0 && (
                      <div className="mt-0.5 ml-4 space-y-0.5">
                        {options.map((o, idx) => (
                          <p key={idx} className="text-xs text-muted-foreground">
                            • {o.name}
                          </p>
                        ))}
                      </div>
                    )}
                    {item.notes && (
                      <p className="text-xs text-orange-600 italic mt-1 ml-4">📝 {item.notes}</p>
                    )}
                  </div>
                  <span className="font-medium">R$ {Number(item.total_price).toFixed(2)}</span>
                </div>
              );
            })}
          </div>

          {/* Notes */}
          {order.notes && (
            <div className="p-3 bg-yellow-500/10 rounded-lg border border-yellow-500/20">
              <p className="text-sm font-medium text-yellow-700 dark:text-yellow-400">📝 Observações:</p>
              <p className="text-sm text-yellow-600 dark:text-yellow-300">{order.notes}</p>
            </div>
          )}

          <Separator />

          {/* Totals */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span>R$ {Number(order.subtotal).toFixed(2)}</span>
            </div>
            {(order.discount_amount ?? 0) > 0 && (
              <div className="flex justify-between text-sm text-green-600">
                <span className="flex items-center gap-1">
                  Desconto
                  {order.coupons?.code && (
                    <Badge variant="secondary" className="text-xs px-1.5 py-0">
                      {order.coupons.code}
                    </Badge>
                  )}
                </span>
                <span>-R$ {Number(order.discount_amount).toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Taxa de entrega</span>
              <span>R$ {Number(order.delivery_fee).toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-bold text-lg pt-2 border-t">
              <span>Total</span>
              <span className="text-primary">R$ {Number(order.total).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm pt-2 items-center gap-2">
              <span className="text-muted-foreground">Pagamento</span>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                <Badge variant="outline">
                  {paymentMethodLabels[order.payment_method]}
                </Badge>
                {(order.payment_method === 'online' || order.payment_method === 'pix') && (
                  <Badge 
                    variant={order.payment_status === 'paid' ? 'default' : 'secondary'}
                    className={order.payment_status === 'paid' ? 'bg-emerald-500 text-white' : ''}
                  >
                    {order.payment_status === 'paid' && '✓ Pago'}
                    {order.payment_status === 'pending' && 'Aguardando'}
                    {order.payment_status === 'failed' && 'Falhou'}
                  </Badge>
                )}
                {order.payment_method === 'cash' && order.needs_change && (
                  <Badge variant="secondary">
                    Troco para R$ {Number(order.change_for || order.total).toFixed(2)}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* Cancellation Reason */}
          {order.status === 'cancelled' && order.cancellation_reason && (
            <div className="p-3 bg-red-500/10 rounded-lg border border-red-500/20">
              <p className="text-sm font-medium text-red-700 dark:text-red-400">Motivo do cancelamento:</p>
              <p className="text-sm text-red-600 dark:text-red-300">{order.cancellation_reason}</p>
            </div>
          )}

          {/* Refund History */}
          <OrderRefundHistory orderId={order.id} />
        </div>
      </ScrollArea>
    </Card>
  );
}
