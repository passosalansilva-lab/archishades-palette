import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Loader2, Package, Clock, History } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface TrackOrderModalProps {
  open: boolean;
  onClose: () => void;
  companyId: string;
}

interface RecentOrder {
  id: string;
  status: string;
  total: number;
  created_at: string;
  customer_name: string;
}

const statusLabels: Record<string, string> = {
  pending: 'Aguardando',
  confirmed: 'Confirmado',
  preparing: 'Preparando',
  ready: 'Pronto',
  awaiting_driver: 'Aguardando entregador',
  queued: 'Aguardando entregador',
  out_for_delivery: 'Em entrega',
  delivered: 'Entregue',
  cancelled: 'Cancelado',
};

export function TrackOrderModal({ open, onClose, companyId }: TrackOrderModalProps) {
  const navigate = useNavigate();
  const [searchType, setSearchType] = useState<'code' | 'email'>('code');
  const [orderId, setOrderId] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [showOrders, setShowOrders] = useState(false);

  const handleTrackByCode = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!orderId.trim()) {
      toast.error('Digite o código do pedido');
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('find-order-by-code', {
        body: {
          companyId,
          code: orderId.trim(),
        },
      });

      if (error) throw error;

      const foundOrder = (data as { order?: { id: string } } | null)?.order;

      if (!foundOrder) {
        toast.error('Pedido não encontrado', {
          description: 'Verifique o código e tente novamente',
        });
        setLoading(false);
        return;
      }

      onClose();
      navigate(`/track/${foundOrder.id}`);
    } catch (error: any) {
      console.error('Error finding order via function:', error);
      toast.error('Erro ao buscar pedido');
    } finally {
      setLoading(false);
    }
  };

  const fetchOrdersByEmail = async (identifier: string) => {
    if (!identifier.trim()) {
      toast.error('Digite seu email');
      return;
    }

    const value = identifier.toLowerCase().trim();
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('customer-orders-search', {
        body: {
          emailOrPhone: value,
          companyId,
        },
      });

      if (error) throw error;

      const orders = (data as { orders?: RecentOrder[] } | null)?.orders || [];

      if (orders.length === 0) {
        toast.error('Nenhum pedido encontrado', {
          description: 'Não encontramos pedidos com este email',
        });
        return;
      }

      setRecentOrders(orders.map((o) => ({
        id: o.id,
        status: o.status,
        total: o.total,
        created_at: o.created_at,
        customer_name: o.customer_name,
      })));
      setShowOrders(true);

      // Persistir identificador para futuras visitas
      try {
        localStorage.setItem('menupro_last_customer_identifier', value);
      } catch (e) {
        console.error('Erro ao salvar identificador do cliente para acompanhamento:', e);
      }
    } catch (error: any) {
      console.error('Error finding orders via function:', error);
      toast.error('Erro ao buscar pedidos');
    } finally {
      setLoading(false);
    }
  };

  const handleSearchByEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetchOrdersByEmail(email);
  };

  const handleSelectOrder = (orderId: string) => {
    onClose();
    navigate(`/track/${orderId}`);
  };

  // Ao abrir o modal, tenta usar automaticamente o último identificador salvo
  useEffect(() => {
    if (!open) return;

    try {
      const storedIdentifier = localStorage.getItem('menupro_last_customer_identifier');
      if (storedIdentifier) {
        setSearchType('email');
        setEmail(storedIdentifier);
        fetchOrdersByEmail(storedIdentifier);
      }
    } catch (e) {
      console.error('Erro ao ler identificador salvo para acompanhamento:', e);
    }
  }, [open]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const handleClose = () => {
    setOrderId('');
    setEmail('');
    setRecentOrders([]);
    setShowOrders(false);
    setSearchType('code');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            Acompanhar Pedido
          </DialogTitle>
          <DialogDescription>
            Acompanhe o status do seu pedido em tempo real
          </DialogDescription>
        </DialogHeader>

        {!showOrders ? (
          <div className="space-y-4">
            {/* Tabs */}
            <div className="flex gap-2">
              <Button
                variant={searchType === 'code' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSearchType('code')}
                className={searchType === 'code' ? 'gradient-primary text-primary-foreground' : ''}
              >
                <Search className="mr-2 h-4 w-4" />
                Por código
              </Button>
              <Button
                variant={searchType === 'email' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSearchType('email')}
                className={searchType === 'email' ? 'gradient-primary text-primary-foreground' : ''}
              >
                <History className="mr-2 h-4 w-4" />
                Por email
              </Button>
            </div>

            {searchType === 'code' ? (
              <form onSubmit={handleTrackByCode} className="space-y-4">
                <div>
                  <Input
                    placeholder="Código do pedido (ex: abc123...)"
                    value={orderId}
                    onChange={(e) => setOrderId(e.target.value)}
                    disabled={loading}
                    autoFocus
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    O código foi enviado no seu WhatsApp ou está na confirmação do pedido
                  </p>
                </div>
                <Button 
                  type="submit" 
                  className="w-full gradient-primary text-primary-foreground"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Buscando...
                    </>
                  ) : (
                    <>
                      <Search className="mr-2 h-4 w-4" />
                      Buscar pedido
                    </>
                  )}
                </Button>
              </form>
            ) : (
              <form onSubmit={handleSearchByEmail} className="space-y-4">
                <div>
                  <Input
                    type="email"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                    autoFocus
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Digite o email usado no pedido
                  </p>
                </div>
                <Button 
                  type="submit" 
                  className="w-full gradient-primary text-primary-foreground"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Buscando...
                    </>
                  ) : (
                    <>
                      <History className="mr-2 h-4 w-4" />
                      Ver meus pedidos
                    </>
                  )}
                </Button>
              </form>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowOrders(false)}
              className="mb-2"
            >
              ← Voltar
            </Button>
            
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {recentOrders.map((order) => (
                <button
                  key={order.id}
                  onClick={() => handleSelectOrder(order.id)}
                  className="w-full p-3 rounded-lg border border-border hover:border-primary/50 hover:bg-accent/50 transition-all text-left"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">
                      #{order.id.slice(0, 8)}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      order.status === 'delivered' 
                        ? 'bg-success/10 text-success'
                        : order.status === 'cancelled'
                        ? 'bg-destructive/10 text-destructive'
                        : 'bg-primary/10 text-primary'
                    }`}>
                      {statusLabels[order.status] || order.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {format(new Date(order.created_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
                    <span className="ml-auto font-medium text-foreground">
                      {formatCurrency(order.total)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
