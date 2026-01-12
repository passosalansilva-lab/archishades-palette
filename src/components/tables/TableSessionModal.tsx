import { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Minus,
  Trash2,
  ShoppingCart,
  Loader2,
  Receipt,
  Clock,
  Users,
  Check,
  CreditCard,
  Banknote,
  Smartphone,
  Wallet,
  DollarSign,
  UtensilsCrossed,
  ChefHat,
  Sparkles,
  Split,
  ArrowLeft,
} from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { POSProductModal, SelectedOption } from '@/components/pos/POSProductModal';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { motion, AnimatePresence } from 'framer-motion';
import { SplitBillModal, SplitResult } from './SplitBillModal';

interface TableSession {
  id: string;
  table_id: string;
  customer_name: string | null;
  customer_count: number;
  opened_at: string;
  status: string;
  notes: string | null;
}

interface Table {
  id: string;
  table_number: number;
  name: string | null;
}

interface OrderItem {
  id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  notes: string | null;
  options: any;
  created_at: string;
  order_id: string;
}

interface Order {
  id: string;
  total: number;
  status: string;
  created_at: string;
  payment_method: string;
  payment_status: string;
}

interface Category {
  id: string;
  name: string;
  sort_order: number;
}

interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  is_active: boolean;
  category_id: string | null;
}

interface CartItem {
  product: Product;
  quantity: number;
  notes: string;
  options: SelectedOption[];
  calculatedPrice: number;
}

interface TableSessionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  table: Table | null;
  session: TableSession | null;
  companyId: string;
  onUpdate: () => void;
}

const PAYMENT_METHODS = [
  { id: 'cash', label: 'Dinheiro', icon: Banknote, color: 'from-green-500 to-emerald-500' },
  { id: 'pix', label: 'PIX', icon: Smartphone, color: 'from-teal-500 to-cyan-500' },
  { id: 'credit_card', label: 'Crédito', icon: CreditCard, color: 'from-blue-500 to-indigo-500' },
  { id: 'debit_card', label: 'Débito', icon: Wallet, color: 'from-purple-500 to-violet-500' },
];

export function TableSessionModal({
  open,
  onOpenChange,
  table,
  session,
  companyId,
  onUpdate,
}: TableSessionModalProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<'items' | 'add'>('items');

  // Session data
  const [orders, setOrders] = useState<Order[]>([]);
  const [allItems, setAllItems] = useState<OrderItem[]>([]);

  // Add items
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);

  // Product modal for options
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [productModalOpen, setProductModalOpen] = useState(false);

  // Payment dialog
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>('cash');
  const [closingSession, setClosingSession] = useState(false);

  // Split bill
  const [splitBillOpen, setSplitBillOpen] = useState(false);
  const [splits, setSplits] = useState<SplitResult[]>([]);
  const [currentSplitIndex, setCurrentSplitIndex] = useState<number | null>(null);
  const [paidSplits, setPaidSplits] = useState<Set<number>>(new Set());
  const [splitPaymentDialogOpen, setSplitPaymentDialogOpen] = useState(false);

  const formatCurrency = (value: number) =>
    value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const loadSessionData = useCallback(async () => {
    if (!session) return;
    setLoading(true);

    try {
      // Load orders for this session (ignore cancelled)
      const { data: ordersData, error: ordersError } = await supabase
        .from('orders')
        .select('id, total, status, created_at, payment_method, payment_status')
        .eq('table_session_id', session.id)
        .neq('status', 'cancelled')
        .order('created_at');

      if (ordersError) throw ordersError;
      setOrders(ordersData || []);

      // Load all items from all orders
      if (ordersData && ordersData.length > 0) {
        const orderIds = ordersData.map((o) => o.id);
        const { data: itemsData, error: itemsError } = await supabase
          .from('order_items')
          .select('*')
          .in('order_id', orderIds)
          .order('created_at');

        if (itemsError) throw itemsError;
        setAllItems(itemsData || []);
      } else {
        setAllItems([]);
      }
    } catch (error: any) {
      console.error('Error loading session data:', error);
      toast({ title: 'Erro ao carregar dados', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [session, toast]);

  const loadProducts = useCallback(async () => {
    if (!companyId) return;

    try {
      // Load categories
      const { data: catData } = await supabase
        .from('categories')
        .select('id, name, sort_order')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .order('sort_order');

      setCategories(catData || []);
      if (catData && catData.length > 0 && !selectedCategory) {
        setSelectedCategory(catData[0].id);
      }

      // Load products
      const { data: prodData } = await supabase
        .from('products')
        .select('id, name, description, price, image_url, is_active, category_id, requires_preparation')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .order('name');

      setProducts(prodData || []);
    } catch (error: any) {
      console.error('Error loading products:', error);
    }
  }, [companyId, selectedCategory]);

  useEffect(() => {
    if (open && session) {
      loadSessionData();
      loadProducts();
      setCart([]);
      setActiveTab('items');
      // Reset split bill state
      setSplits([]);
      setCurrentSplitIndex(null);
      setPaidSplits(new Set());
    }
  }, [open, session, loadSessionData, loadProducts]);

  // Realtime subscription for orders on this session
  useEffect(() => {
    if (!open || !session) return;

    const channel = supabase
      .channel(`session-orders-${session.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `table_session_id=eq.${session.id}`
        },
        (payload) => {
          console.log('[TableSessionModal] Order changed:', payload);
          loadSessionData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [open, session, loadSessionData]);

  const totalSession = allItems.reduce((sum, item) => sum + item.total_price, 0);
  const cartTotal = cart.reduce((sum, item) => sum + item.calculatedPrice * item.quantity, 0);

  const filteredProducts = products.filter((p) => {
    const matchesCategory = !selectedCategory || p.category_id === selectedCategory;
    const matchesSearch =
      !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const handleProductClick = (product: Product) => {
    setSelectedProduct(product);
    setProductModalOpen(true);
  };

  const handleAddToCart = (
    product: Product,
    quantity: number,
    options: SelectedOption[],
    notes: string,
    calculatedPrice: number
  ) => {
    setCart((prev) => [
      ...prev,
      { product, quantity, notes, options, calculatedPrice },
    ]);
    setProductModalOpen(false);
    setSelectedProduct(null);
  };

  const updateCartQuantity = (index: number, delta: number) => {
    setCart((prev) =>
      prev
        .map((c, i) =>
          i === index ? { ...c, quantity: Math.max(0, c.quantity + delta) } : c
        )
        .filter((c) => c.quantity > 0)
    );
  };

  const removeFromCart = (index: number) => {
    setCart((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddItems = async () => {
    if (!session || !companyId || cart.length === 0) return;

    setSubmitting(true);
    try {
      const subtotal = cartTotal;
      const total = subtotal;

      // Check if ALL items don't require preparation (e.g., sodas, industrialized products)
      const allItemsNoPreparation = cart.every(
        (c) => (c.product as any).requires_preparation === false
      );

      // If all items don't need preparation, go directly to 'ready' (served)
      // Otherwise, go to 'confirmed' to enter preparation flow
      const orderStatus = allItemsNoPreparation ? 'ready' : 'confirmed';

      // Create order for table (source: 'table' to differentiate from 'pos' or 'online')
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          company_id: companyId,
          table_session_id: session.id,
          customer_name: session.customer_name || 'Cliente',
          customer_phone: '00000000000',
          payment_method: 'cash' as any,
          payment_status: 'pending' as any,
          status: orderStatus as any,
          subtotal,
          delivery_fee: 0,
          total,
          source: 'table', // Different source for table orders
        })
        .select('id')
        .single();

      if (orderError) throw orderError;

      // Create order items with options
      const items = cart.map((c) => ({
        order_id: order.id,
        product_id: c.product.id,
        product_name: c.product.name,
        quantity: c.quantity,
        unit_price: c.calculatedPrice,
        total_price: c.calculatedPrice * c.quantity,
        notes: c.notes || null,
        options: c.options.length > 0 
          ? JSON.parse(JSON.stringify(c.options)) 
          : null,
        requires_preparation: (c.product as any).requires_preparation !== false,
      }));

      const { error: itemsError } = await supabase.from('order_items').insert(items);
      if (itemsError) throw itemsError;

      // Update table status to occupied if not already
      await supabase
        .from('tables')
        .update({ status: 'occupied' })
        .eq('id', session.table_id);

      toast({ title: 'Itens adicionados!' });
      setCart([]);
      setActiveTab('items');
      loadSessionData();
      onUpdate();
    } catch (error: any) {
      console.error('Error adding items:', error);
      toast({ title: 'Erro ao adicionar itens', description: error.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenPaymentDialog = () => {
    if (allItems.length === 0) {
      toast({ title: 'Nenhum item na mesa', variant: 'destructive' });
      return;
    }
    setPaymentDialogOpen(true);
  };

  const handleOpenSplitBill = () => {
    if (allItems.length === 0) {
      toast({ title: 'Nenhum item na mesa', variant: 'destructive' });
      return;
    }
    setSplitBillOpen(true);
  };

  const handleSplitConfirm = (newSplits: SplitResult[]) => {
    setSplits(newSplits);
    setPaidSplits(new Set());
    setCurrentSplitIndex(null);
    toast({ title: 'Conta dividida!', description: `Dividida entre ${newSplits.length} pessoas` });
  };

  const handlePaySplit = (index: number) => {
    setCurrentSplitIndex(index);
    setSelectedPaymentMethod('cash');
    setSplitPaymentDialogOpen(true);
  };

  const handleConfirmSplitPayment = async () => {
    if (currentSplitIndex === null) return;
    
    setClosingSession(true);
    try {
      // Mark this split as paid
      const newPaidSplits = new Set(paidSplits);
      newPaidSplits.add(currentSplitIndex);
      setPaidSplits(newPaidSplits);
      
      toast({ 
        title: `Pessoa ${currentSplitIndex + 1} pagou!`, 
        description: formatCurrency(splits[currentSplitIndex].amount) 
      });
      
      setSplitPaymentDialogOpen(false);
      setCurrentSplitIndex(null);
      
      // Check if all splits are paid
      if (newPaidSplits.size === splits.length) {
        // All paid - close session
        await handleCloseSessionFinal();
      }
    } catch (error: any) {
      toast({ title: 'Erro ao processar pagamento', description: error.message, variant: 'destructive' });
    } finally {
      setClosingSession(false);
    }
  };

  const handleCloseSessionFinal = async () => {
    if (!session || !companyId) return;
    
    const orderIds = orders.map((o) => o.id);
    
    for (const orderId of orderIds) {
      await supabase
        .from('orders')
        .update({
          payment_method: splits.length > 0 ? 'split' as any : selectedPaymentMethod as any,
          payment_status: 'paid' as any,
          status: 'delivered' as any,
        })
        .eq('id', orderId);
    }

    await supabase
      .from('table_sessions')
      .update({ 
        status: 'closed', 
        closed_at: new Date().toISOString(),
        customer_name: null,
        customer_phone: null,
        customer_count: null,
      })
      .eq('id', session.id);

    await supabase
      .from('waiter_calls')
      .update({ status: 'cancelled', completed_at: new Date().toISOString() })
      .eq('table_id', session.table_id)
      .in('status', ['pending', 'acknowledged']);

    await supabase
      .from('tables')
      .update({ status: 'available' })
      .eq('id', session.table_id);

    toast({ title: 'Conta fechada com sucesso!' });
    setSplits([]);
    setPaidSplits(new Set());
    onOpenChange(false);
    onUpdate();
  };

  const handleCloseSession = async () => {
    if (!session || !companyId) return;

    setClosingSession(true);
    try {
      await handleCloseSessionFinal();
      setPaymentDialogOpen(false);
    } catch (error: any) {
      console.error('Error closing session:', error);
      toast({ title: 'Erro ao fechar conta', description: error.message, variant: 'destructive' });
    } finally {
      setClosingSession(false);
    }
  };

  const handleClearSplits = () => {
    setSplits([]);
    setPaidSplits(new Set());
    setCurrentSplitIndex(null);
  };

  const remainingToPay = splits.length > 0 
    ? splits.reduce((sum, split, i) => paidSplits.has(i) ? sum : sum + split.amount, 0)
    : totalSession;

  // Parse options to display
  const formatItemOptions = (options: any): string => {
    if (!options) return '';
    if (Array.isArray(options)) {
      return options.map((opt: any) => opt.name).join(', ');
    }
    return '';
  };

  // Format session duration
  const getSessionDuration = () => {
    if (!session) return '';
    const opened = new Date(session.opened_at);
    const now = new Date();
    const diffMs = now.getTime() - opened.getTime();
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 0) {
      return `${hours}h ${minutes}min`;
    }
    return `${minutes}min`;
  };

  if (!table || !session) return null;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-xl md:max-w-2xl lg:max-w-3xl p-0 flex flex-col bg-gradient-to-br from-background via-background to-muted/30">
          {/* Enhanced Header */}
          <SheetHeader className="p-0">
            <div className="relative overflow-hidden">
              {/* Decorative background */}
              <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent" />
              <div className="absolute -top-10 -right-10 w-40 h-40 bg-primary/10 rounded-full blur-3xl" />
              
              <div className="relative p-6">
                <div className="flex items-start justify-between gap-4">
                  {/* Table Info */}
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg shadow-primary/25">
                        <span className="text-2xl font-black text-primary-foreground">
                          {table.table_number}
                        </span>
                      </div>
                      <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 border-2 border-background flex items-center justify-center">
                        <Check className="w-3 h-3 text-white" />
                      </div>
                    </div>
                    <div>
                      <SheetTitle className="text-2xl font-bold">
                        Mesa {table.table_number}
                      </SheetTitle>
                      {table.name && (
                        <p className="text-muted-foreground text-sm">{table.name}</p>
                      )}
                      <div className="flex items-center gap-3 mt-2">
                        {session.customer_name && (
                          <Badge variant="secondary" className="gap-1 font-medium">
                            <Users className="w-3 h-3" />
                            {session.customer_name}
                          </Badge>
                        )}
                        <Badge variant="outline" className="gap-1">
                          <Clock className="w-3 h-3" />
                          {getSessionDuration()}
                        </Badge>
                        {session.customer_count > 0 && (
                          <Badge variant="outline" className="gap-1">
                            <Users className="w-3 h-3" />
                            {session.customer_count} {session.customer_count === 1 ? 'pessoa' : 'pessoas'}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Total */}
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Total</p>
                    <p className="text-3xl font-black text-primary">{formatCurrency(totalSession)}</p>
                    <p className="text-sm text-muted-foreground">{allItems.length} itens</p>
                  </div>
                </div>
              </div>
            </div>
          </SheetHeader>

          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="flex-1 flex flex-col overflow-hidden">
            <TabsList className="mx-4 p-1 h-12 bg-muted/50">
              <TabsTrigger value="items" className="flex-1 gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm h-10">
                <Receipt className="h-4 w-4" />
                <span>Conta</span>
                {allItems.length > 0 && (
                  <Badge variant="secondary" className="ml-1 bg-primary/10 text-primary">
                    {allItems.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="add" className="flex-1 gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm h-10">
                <Plus className="h-4 w-4" />
                <span>Adicionar</span>
                {cart.length > 0 && (
                  <Badge className="ml-1 bg-primary text-primary-foreground">
                    {cart.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="items" className="flex-1 overflow-hidden m-0 flex flex-col">
              {loading ? (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center">
                    <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">Carregando...</p>
                  </div>
                </div>
              ) : allItems.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8">
                  <div className="w-20 h-20 rounded-full bg-muted/50 flex items-center justify-center mb-4">
                    <UtensilsCrossed className="h-10 w-10 opacity-50" />
                  </div>
                  <p className="text-lg font-medium mb-1">Mesa vazia</p>
                  <p className="text-sm text-center mb-6">Nenhum pedido ainda. Adicione itens para começar!</p>
                  <Button onClick={() => setActiveTab('add')} className="gap-2">
                    <Plus className="h-4 w-4" />
                    Adicionar primeiro item
                  </Button>
                </div>
              ) : (
                <>
                  <ScrollArea className="flex-1 px-4 py-3">
                    <AnimatePresence mode="popLayout">
                      <div className="space-y-2">
                        {allItems.map((item, index) => (
                          <motion.div
                            key={item.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            transition={{ delay: index * 0.05 }}
                          >
                            <Card className="overflow-hidden hover:shadow-md transition-shadow">
                              <CardContent className="p-4">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-primary/10 text-primary text-xs font-bold">
                                        {item.quantity}x
                                      </span>
                                      <span className="font-semibold truncate">{item.product_name}</span>
                                    </div>
                                    {item.options && (
                                      <p className="text-xs text-primary/80 ml-8">
                                        {formatItemOptions(item.options)}
                                      </p>
                                    )}
                                    {item.notes && (
                                      <p className="text-xs text-muted-foreground ml-8 italic">
                                        Obs: {item.notes}
                                      </p>
                                    )}
                                  </div>
                                  <div className="text-right shrink-0">
                                    <div className="font-bold text-lg">{formatCurrency(item.total_price)}</div>
                                    <div className="text-xs text-muted-foreground">
                                      {formatCurrency(item.unit_price)} / un
                                    </div>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          </motion.div>
                        ))}
                      </div>
                    </AnimatePresence>
                  </ScrollArea>

                  {/* Enhanced Summary Footer */}
                  <div className="p-4 border-t bg-gradient-to-t from-muted/50 to-transparent">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Cliente</span>
                        <span className="font-medium">{session.customer_name || 'Não identificado'}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Pessoas</span>
                        <span className="font-medium">{session.customer_count || 1}</span>
                      </div>
                      <Separator />
                      
                      {/* Split Bill Section */}
                      {splits.length > 0 ? (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Split className="h-4 w-4 text-primary" />
                              <span className="font-semibold">Conta Dividida</span>
                            </div>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={handleClearSplits}
                              className="text-muted-foreground hover:text-destructive"
                            >
                              <ArrowLeft className="h-4 w-4 mr-1" />
                              Voltar
                            </Button>
                          </div>
                          
                          <div className="grid gap-2">
                            {splits.map((split, index) => {
                              const isPaid = paidSplits.has(index);
                              return (
                                <motion.div
                                  key={index}
                                  initial={{ opacity: 0, y: 10 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  transition={{ delay: index * 0.05 }}
                                >
                                  <Card className={cn(
                                    "p-3 transition-all",
                                    isPaid 
                                      ? "bg-emerald-500/10 border-emerald-500/30" 
                                      : "hover:shadow-md cursor-pointer hover:border-primary/30"
                                  )}>
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-3">
                                        <div className={cn(
                                          "w-10 h-10 rounded-full flex items-center justify-center font-bold",
                                          isPaid 
                                            ? "bg-emerald-500 text-white" 
                                            : "bg-primary/10 text-primary"
                                        )}>
                                          {isPaid ? <Check className="h-5 w-5" /> : index + 1}
                                        </div>
                                        <div>
                                          <div className="font-medium">{split.label}</div>
                                          {split.items && split.items.length > 0 && (
                                            <div className="text-xs text-muted-foreground">
                                              {split.items.length} itens
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-3">
                                        <div className={cn(
                                          "text-lg font-bold",
                                          isPaid ? "text-emerald-600" : "text-primary"
                                        )}>
                                          {formatCurrency(split.amount)}
                                        </div>
                                        {isPaid ? (
                                          <Badge variant="secondary" className="bg-emerald-500/20 text-emerald-700">
                                            Pago
                                          </Badge>
                                        ) : (
                                          <Button 
                                            size="sm"
                                            onClick={() => handlePaySplit(index)}
                                            className="gap-1"
                                          >
                                            <DollarSign className="h-4 w-4" />
                                            Pagar
                                          </Button>
                                        )}
                                      </div>
                                    </div>
                                  </Card>
                                </motion.div>
                              );
                            })}
                          </div>
                          
                          {/* Remaining Summary */}
                          <div className="flex items-center justify-between pt-2">
                            <span className="text-muted-foreground">Falta pagar:</span>
                            <span className={cn(
                              "text-xl font-bold",
                              remainingToPay === 0 ? "text-emerald-600" : "text-primary"
                            )}>
                              {formatCurrency(remainingToPay)}
                            </span>
                          </div>
                          
                          {paidSplits.size === splits.length && splits.length > 0 && (
                            <Button 
                              className="w-full h-12 text-base font-semibold gap-2 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700" 
                              size="lg"
                              onClick={handleCloseSessionFinal}
                            >
                              <Check className="h-5 w-5" />
                              Finalizar Mesa
                            </Button>
                          )}
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center justify-between">
                            <span className="text-lg font-semibold">Total da Mesa</span>
                            <span className="text-2xl font-black text-primary">{formatCurrency(totalSession)}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <Button 
                              variant="outline"
                              className="h-12 text-base font-semibold gap-2" 
                              size="lg" 
                              onClick={handleOpenSplitBill}
                              disabled={allItems.length === 0}
                            >
                              <Split className="h-5 w-5" />
                              Dividir
                            </Button>
                            <Button 
                              className="h-12 text-base font-semibold gap-2 bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary shadow-lg shadow-primary/25" 
                              size="lg" 
                              onClick={handleOpenPaymentDialog}
                              disabled={allItems.length === 0}
                            >
                              <DollarSign className="h-5 w-5" />
                              Fechar
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </>
              )}
            </TabsContent>

            <TabsContent value="add" className="flex-1 overflow-hidden m-0 flex flex-col">
              {/* Search and Categories */}
              <div className="p-4 border-b space-y-3 bg-muted/30">
                <Input
                  placeholder="Buscar produto..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-11"
                />
                <ScrollArea className="w-full">
                  <div className="flex gap-2 pb-1">
                    {categories.map((cat) => (
                      <Button
                        key={cat.id}
                        variant={selectedCategory === cat.id ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setSelectedCategory(cat.id)}
                        className={cn(
                          "shrink-0 h-9",
                          selectedCategory === cat.id && "shadow-md"
                        )}
                      >
                        {cat.name}
                      </Button>
                    ))}
                  </div>
                </ScrollArea>
              </div>

              <div className="flex-1 flex overflow-hidden">
                {/* Products grid */}
                <ScrollArea className="flex-1 p-4">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {filteredProducts.map((product) => (
                      <motion.div
                        key={product.id}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <Card
                          className="cursor-pointer hover:shadow-lg transition-all overflow-hidden border-2 border-transparent hover:border-primary/20"
                          onClick={() => handleProductClick(product)}
                        >
                          <CardContent className="p-0">
                            {product.image_url ? (
                              <div className="aspect-[4/3] overflow-hidden bg-muted">
                                <img 
                                  src={product.image_url} 
                                  alt={product.name}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            ) : (
                              <div className="aspect-[4/3] bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center">
                                <ChefHat className="w-8 h-8 text-muted-foreground/50" />
                              </div>
                            )}
                            <div className="p-3">
                              <div className="font-medium text-sm truncate">{product.name}</div>
                              <div className="text-primary font-bold mt-1">
                                {formatCurrency(product.price)}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </motion.div>
                    ))}
                  </div>
                </ScrollArea>

                {/* Cart sidebar */}
                <AnimatePresence>
                  {cart.length > 0 && (
                    <motion.div
                      initial={{ width: 0, opacity: 0 }}
                      animate={{ width: 280, opacity: 1 }}
                      exit={{ width: 0, opacity: 0 }}
                      className="border-l bg-muted/30 flex flex-col overflow-hidden"
                    >
                      <div className="p-4 border-b font-semibold flex items-center gap-2 bg-primary/5">
                        <ShoppingCart className="h-4 w-4 text-primary" />
                        <span>Carrinho</span>
                        <Badge className="ml-auto">{cart.length}</Badge>
                      </div>
                      <ScrollArea className="flex-1">
                        <div className="p-3 space-y-2">
                          {cart.map((item, index) => (
                            <Card key={index} className="p-3">
                              <div className="flex items-start justify-between gap-2 mb-2">
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium truncate">{item.product.name}</div>
                                  {item.options.length > 0 && (
                                    <p className="text-xs text-primary mt-0.5">
                                      {item.options.map(o => o.name).join(', ')}
                                    </p>
                                  )}
                                </div>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6 shrink-0 text-destructive hover:text-destructive"
                                  onClick={() => removeFromCart(index)}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1">
                                  <Button
                                    size="icon"
                                    variant="outline"
                                    className="h-7 w-7"
                                    onClick={() => updateCartQuantity(index, -1)}
                                  >
                                    <Minus className="h-3 w-3" />
                                  </Button>
                                  <span className="w-8 text-center font-medium">{item.quantity}</span>
                                  <Button
                                    size="icon"
                                    variant="outline"
                                    className="h-7 w-7"
                                    onClick={() => updateCartQuantity(index, 1)}
                                  >
                                    <Plus className="h-3 w-3" />
                                  </Button>
                                </div>
                                <span className="font-bold text-primary">
                                  {formatCurrency(item.calculatedPrice * item.quantity)}
                                </span>
                              </div>
                            </Card>
                          ))}
                        </div>
                      </ScrollArea>
                      <div className="p-4 border-t bg-background/80 backdrop-blur space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="font-semibold">Total:</span>
                          <span className="text-xl font-bold text-primary">{formatCurrency(cartTotal)}</span>
                        </div>
                        <Button
                          className="w-full h-11 font-semibold gap-2"
                          onClick={handleAddItems}
                          disabled={submitting || cart.length === 0}
                        >
                          {submitting ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Sparkles className="h-4 w-4" />
                          )}
                          Confirmar Itens
                        </Button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>

      {/* Product modal with options */}
      <POSProductModal
        product={selectedProduct}
        open={productModalOpen}
        onClose={() => {
          setProductModalOpen(false);
          setSelectedProduct(null);
        }}
        onAddToCart={handleAddToCart}
      />

      {/* Enhanced Payment Dialog */}
      <AlertDialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center">
                <Receipt className="h-6 w-6 text-primary-foreground" />
              </div>
              <div>
                <AlertDialogTitle className="text-xl">Fechar Conta</AlertDialogTitle>
                <AlertDialogDescription className="text-base">
                  Mesa {table?.table_number}
                </AlertDialogDescription>
              </div>
            </div>
          </AlertDialogHeader>

          <div className="py-4 space-y-4">
            {/* Total Display */}
            <div className="text-center py-4 px-6 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20">
              <p className="text-sm text-muted-foreground mb-1">Total a Pagar</p>
              <p className="text-4xl font-black text-primary">{formatCurrency(totalSession)}</p>
            </div>

            {/* Payment Methods */}
            <div>
              <Label className="text-sm font-medium mb-3 block">Forma de Pagamento</Label>
              <RadioGroup
                value={selectedPaymentMethod}
                onValueChange={setSelectedPaymentMethod}
                className="grid grid-cols-2 gap-3"
              >
                {PAYMENT_METHODS.map((method) => {
                  const Icon = method.icon;
                  const isSelected = selectedPaymentMethod === method.id;
                  return (
                    <div key={method.id}>
                      <RadioGroupItem
                        value={method.id}
                        id={method.id}
                        className="peer sr-only"
                      />
                      <Label
                        htmlFor={method.id}
                        className={cn(
                          "flex flex-col items-center justify-center gap-2 rounded-xl border-2 p-4 cursor-pointer transition-all",
                          "hover:bg-muted/50",
                          isSelected 
                            ? "border-primary bg-primary/5 shadow-md" 
                            : "border-muted bg-background"
                        )}
                      >
                        <div className={cn(
                          "w-10 h-10 rounded-full flex items-center justify-center transition-colors",
                          isSelected 
                            ? `bg-gradient-to-br ${method.color} text-white` 
                            : "bg-muted text-muted-foreground"
                        )}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <span className={cn(
                          "text-sm font-medium",
                          isSelected && "text-primary"
                        )}>
                          {method.label}
                        </span>
                      </Label>
                    </div>
                  );
                })}
              </RadioGroup>
            </div>
          </div>

          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel disabled={closingSession} className="flex-1">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleCloseSession}
              disabled={closingSession}
              className="flex-1 bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary gap-2"
            >
              {closingSession ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Split Bill Modal */}
      <SplitBillModal
        open={splitBillOpen}
        onOpenChange={setSplitBillOpen}
        total={totalSession}
        items={allItems.map(item => ({
          id: item.id,
          product_name: item.product_name,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total_price: item.total_price,
        }))}
        onConfirm={handleSplitConfirm}
      />

      {/* Split Payment Dialog */}
      <AlertDialog open={splitPaymentDialogOpen} onOpenChange={setSplitPaymentDialogOpen}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center">
                <Users className="h-6 w-6 text-primary-foreground" />
              </div>
              <div>
                <AlertDialogTitle className="text-xl">
                  Pagar - Pessoa {currentSplitIndex !== null ? currentSplitIndex + 1 : ''}
                </AlertDialogTitle>
                <AlertDialogDescription className="text-base">
                  Mesa {table?.table_number}
                </AlertDialogDescription>
              </div>
            </div>
          </AlertDialogHeader>

          <div className="py-4 space-y-4">
            {/* Amount Display */}
            <div className="text-center py-4 px-6 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20">
              <p className="text-sm text-muted-foreground mb-1">Valor</p>
              <p className="text-4xl font-black text-primary">
                {currentSplitIndex !== null && splits[currentSplitIndex] 
                  ? formatCurrency(splits[currentSplitIndex].amount) 
                  : '-'}
              </p>
            </div>

            {/* Payment Methods */}
            <div>
              <Label className="text-sm font-medium mb-3 block">Forma de Pagamento</Label>
              <RadioGroup
                value={selectedPaymentMethod}
                onValueChange={setSelectedPaymentMethod}
                className="grid grid-cols-2 gap-3"
              >
                {PAYMENT_METHODS.map((method) => {
                  const Icon = method.icon;
                  const isSelected = selectedPaymentMethod === method.id;
                  return (
                    <div key={method.id}>
                      <RadioGroupItem
                        value={method.id}
                        id={`split-${method.id}`}
                        className="peer sr-only"
                      />
                      <Label
                        htmlFor={`split-${method.id}`}
                        className={cn(
                          "flex flex-col items-center justify-center gap-2 rounded-xl border-2 p-4 cursor-pointer transition-all",
                          "hover:bg-muted/50",
                          isSelected 
                            ? "border-primary bg-primary/5 shadow-md" 
                            : "border-muted bg-background"
                        )}
                      >
                        <div className={cn(
                          "w-10 h-10 rounded-full flex items-center justify-center transition-colors",
                          isSelected 
                            ? `bg-gradient-to-br ${method.color} text-white` 
                            : "bg-muted text-muted-foreground"
                        )}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <span className={cn(
                          "text-sm font-medium",
                          isSelected && "text-primary"
                        )}>
                          {method.label}
                        </span>
                      </Label>
                    </div>
                  );
                })}
              </RadioGroup>
            </div>
          </div>

          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel disabled={closingSession} className="flex-1">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleConfirmSplitPayment}
              disabled={closingSession}
              className="flex-1 bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary gap-2"
            >
              {closingSession ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
