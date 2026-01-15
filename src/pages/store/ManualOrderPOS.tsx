import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Search,
  Plus,
  Minus,
  Trash2,
  ShoppingCart,
  User,
  MapPin,
  CreditCard,
  Banknote,
  Smartphone,
  Wallet,
  ArrowLeft,
  Check,
  Loader2,
  Package,
  Store,
  Truck,
  Settings2,
  UtensilsCrossed,
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { GroupedOptionsDisplay } from '@/components/ui/grouped-options-display';
import { Database } from '@/integrations/supabase/types';
import { POSProductModal, SelectedOption } from '@/components/pos/POSProductModal';

type PaymentMethod = Database['public']['Enums']['payment_method'];

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
  category?: Category;
}

interface CartItem {
  product: Product;
  quantity: number;
  notes: string;
  options: SelectedOption[];
  calculatedPrice: number; // Price including options
}

interface CustomerData {
  name: string;
  phone: string;
  email: string;
}

interface AddressData {
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  zip_code: string;
  reference: string;
}

const paymentMethods: { value: PaymentMethod; label: string; icon: typeof CreditCard }[] = [
  { value: 'cash', label: 'Dinheiro', icon: Banknote },
  { value: 'pix', label: 'PIX', icon: Smartphone },
  { value: 'card_on_delivery', label: 'Cartão na entrega', icon: CreditCard },
  { value: 'online', label: 'Cartão online', icon: Wallet },
];

export default function ManualOrderPOS() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, staffCompany } = useAuth();
  const { toast } = useToast();

  const [companyId, setCompanyId] = useState<string | null>(null);
  const [companyData, setCompanyData] = useState<{ delivery_fee: number; min_order_value: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Products state
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Cart state
  const [cart, setCart] = useState<CartItem[]>([]);
  
  // Product modal state
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [productModalOpen, setProductModalOpen] = useState(false);

  // Customer state
  const [customer, setCustomer] = useState<CustomerData>({
    name: '',
    phone: '',
    email: '',
  });

  // Delivery state
  const [deliveryType, setDeliveryType] = useState<'pickup' | 'delivery' | 'table'>('pickup');
  const [tableSessionId, setTableSessionId] = useState<string | null>(null);
  const [tableNumber, setTableNumber] = useState<number | null>(null);
  const [availableTables, setAvailableTables] = useState<{ id: string; table_number: number; name: string | null; status: string }[]>([]);
  const [showTableSelector, setShowTableSelector] = useState(false);
  const [address, setAddress] = useState<AddressData>({
    street: '',
    number: '',
    complement: '',
    neighborhood: '',
    city: '',
    state: '',
    zip_code: '',
    reference: '',
  });

  // Payment state
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [needsChange, setNeedsChange] = useState(false);
  const [changeFor, setChangeFor] = useState('');

  // Order notes
  const [orderNotes, setOrderNotes] = useState('');

  // Load company and products
  useEffect(() => {
    loadData();
  }, [user, staffCompany]);

  // Check for table params
  useEffect(() => {
    const tableId = searchParams.get('table');
    const sessionId = searchParams.get('session');
    if (sessionId) {
      setTableSessionId(sessionId);
      setDeliveryType('table');
    }
    if (tableId) {
      // Fetch table number
      supabase
        .from('tables')
        .select('table_number')
        .eq('id', tableId)
        .maybeSingle()
        .then(({ data }) => {
          if (data) setTableNumber(data.table_number);
        });
    }
  }, [searchParams]);

  const loadData = async () => {
    if (!user) return;

    setLoading(true);
    try {
      // Get company
      const companyQuery = staffCompany?.companyId
        ? supabase.from('companies').select('id, delivery_fee, min_order_value').eq('id', staffCompany.companyId).maybeSingle()
        : supabase.from('companies').select('id, delivery_fee, min_order_value').eq('owner_id', user.id).maybeSingle();

      const { data: company, error: companyError } = await companyQuery;
      if (companyError) throw companyError;
      if (!company) {
        toast({ title: 'Empresa não encontrada', variant: 'destructive' });
        navigate('/dashboard/orders');
        return;
      }

      setCompanyId(company.id);
      setCompanyData({
        delivery_fee: company.delivery_fee || 0,
        min_order_value: company.min_order_value || 0,
      });

      // Load categories
      const { data: categoriesData, error: categoriesError } = await supabase
        .from('categories')
        .select('id, name, sort_order')
        .eq('company_id', company.id)
        .eq('is_active', true)
        .order('sort_order');

      if (categoriesError) throw categoriesError;
      setCategories(categoriesData || []);

      // Load products
      const { data: productsData, error: productsError } = await supabase
        .from('products')
        .select('id, name, description, price, image_url, is_active, category_id')
        .eq('company_id', company.id)
        .eq('is_active', true)
        .order('sort_order');

      if (productsError) throw productsError;

      // Attach category info to products
      const productsWithCategory = (productsData || []).map((p) => ({
        ...p,
        category: categoriesData?.find((c) => c.id === p.category_id),
      }));

      setProducts(productsWithCategory);

      // Load tables for table selection
      const { data: tablesData } = await supabase
        .from('tables')
        .select('id, table_number, name, status')
        .eq('company_id', company.id)
        .eq('is_active', true)
        .order('table_number');
      
      setAvailableTables(tablesData || []);
    } catch (error: any) {
      console.error('Error loading data:', error);
      toast({
        title: 'Erro ao carregar dados',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Select table and create/find session
  const handleSelectTable = async (tableId: string, tableNum: number) => {
    if (!companyId) return;
    
    try {
      // Check if table has an open session
      const { data: existingSession } = await supabase
        .from('table_sessions')
        .select('id')
        .eq('table_id', tableId)
        .eq('status', 'open')
        .maybeSingle();

      if (existingSession) {
        // Use existing session
        setTableSessionId(existingSession.id);
      } else {
        // Create new session
        const { data: newSession, error } = await supabase
          .from('table_sessions')
          .insert({
            company_id: companyId,
            table_id: tableId,
            customer_name: customer.name || null,
            customer_count: 1,
          })
          .select('id')
          .single();

        if (error) throw error;
        setTableSessionId(newSession.id);
      }

      setTableNumber(tableNum);
      setShowTableSelector(false);
      toast({ title: `Mesa ${tableNum} selecionada` });
    } catch (error: any) {
      console.error('Error selecting table:', error);
      toast({ title: 'Erro ao selecionar mesa', description: error.message, variant: 'destructive' });
    }
  };

  // Filter products
  const filteredProducts = useMemo(() => {
    let filtered = products;

    if (selectedCategory) {
      filtered = filtered.filter((p) => p.category_id === selectedCategory);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          p.description?.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [products, selectedCategory, searchQuery]);

  // Cart functions
  const openProductModal = (product: Product) => {
    setSelectedProduct(product);
    setProductModalOpen(true);
  };

  const handleAddToCartFromModal = (
    product: Product,
    quantity: number,
    options: SelectedOption[],
    notes: string,
    calculatedPrice: number
  ) => {
    // Generate a unique key for items with same product but different options
    const optionKey = options.map(o => o.optionId).sort().join('-');
    
    setCart((prev) => {
      // Only merge if same product AND same options
      const existing = prev.find(
        (item) => item.product.id === product.id && 
        item.options.map(o => o.optionId).sort().join('-') === optionKey
      );
      
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id && 
          item.options.map(o => o.optionId).sort().join('-') === optionKey
            ? { ...item, quantity: item.quantity + quantity }
            : item
        );
      }
      
      return [...prev, { product, quantity, notes, options, calculatedPrice }];
    });
  };

  const removeFromCart = (index: number) => {
    setCart((prev) => prev.filter((_, i) => i !== index));
  };

  const updateQuantity = (index: number, delta: number) => {
    setCart((prev) =>
      prev
        .map((item, i) =>
          i === index
            ? { ...item, quantity: Math.max(0, item.quantity + delta) }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  };

  const updateItemNotes = (index: number, notes: string) => {
    setCart((prev) =>
      prev.map((item, i) => (i === index ? { ...item, notes } : item))
    );
  };

  // Calculations
  const subtotal = cart.reduce(
    (sum, item) => sum + item.calculatedPrice * item.quantity,
    0
  );
  const deliveryFee = deliveryType === 'delivery' ? (companyData?.delivery_fee || 0) : 0;
  const total = subtotal + deliveryFee;

  const formatCurrency = (value: number) =>
    value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  // Submit order
  const handleSubmit = async () => {
    if (!companyId) return;

    // Validations
    if (cart.length === 0) {
      toast({ title: 'Adicione pelo menos um item ao pedido', variant: 'destructive' });
      return;
    }

    // Require customer data for delivery and pickup
    if (deliveryType === 'delivery' || deliveryType === 'pickup') {
      if (!customer.name.trim()) {
        toast({ title: 'Informe o nome do cliente', variant: 'destructive' });
        return;
      }

      if (!customer.phone.trim()) {
        toast({ title: 'Informe o telefone do cliente', variant: 'destructive' });
        return;
      }
    }

    if (deliveryType === 'delivery') {
      if (!address.street.trim() || !address.number.trim() || !address.neighborhood.trim() || !address.city.trim() || !address.state.trim()) {
        toast({ title: 'Preencha o endereço completo', variant: 'destructive' });
        return;
      }
    }

    setSubmitting(true);
    try {
      // Create or update customer only if data is provided
      let customerId: string | null = null;

      const hasCustomerData = customer.name.trim() && customer.phone.trim();
      
      if (hasCustomerData) {
        const cleanPhone = customer.phone.replace(/\D/g, '');

        const { data: upsertResult, error: upsertError } = await supabase.functions.invoke(
          'pos-upsert-customer',
          {
            body: {
              companyId,
              name: customer.name,
              phone: cleanPhone,
              email: customer.email || null,
            },
          }
        );

        if (upsertError) throw upsertError;
        customerId = (upsertResult as any)?.customerId || null;
      }

      // Create address if delivery
      let addressId: string | null = null;
      if (deliveryType === 'delivery') {
        const { data: newAddress, error: addressError } = await supabase
          .from('customer_addresses')
          .insert({
            customer_id: customerId,
            street: address.street,
            number: address.number,
            complement: address.complement || null,
            neighborhood: address.neighborhood,
            city: address.city,
            state: address.state,
            zip_code: address.zip_code.replace(/\D/g, ''),
            reference: address.reference || null,
          })
          .select('id')
          .single();

        if (addressError) throw addressError;
        addressId = newAddress.id;
      }

      // Create order
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          company_id: companyId,
          customer_id: customerId,
          customer_name: customer.name.trim() || null,
          customer_phone: customer.phone.trim() ? customer.phone.replace(/\D/g, '') : null,
          customer_email: customer.email || null,
          delivery_address_id: addressId,
          table_session_id: deliveryType === 'table' ? tableSessionId : null,
          payment_method: paymentMethod,
          payment_status: paymentMethod === 'cash' || paymentMethod === 'card_on_delivery' ? 'pending' : 'pending',
          status: 'confirmed', // Manual orders start as confirmed
          subtotal,
          delivery_fee: deliveryFee,
          total,
          notes: deliveryType === 'table' && tableNumber ? `Mesa ${tableNumber}. ${orderNotes || ''}`.trim() : (orderNotes || null),
          needs_change: paymentMethod === 'cash' ? needsChange : false,
          change_for: paymentMethod === 'cash' && needsChange ? parseFloat(changeFor) || null : null,
          source: deliveryType === 'table' ? 'table' : deliveryType === 'pickup' ? 'pickup' : 'pos', // Mark source
        })
        .select('id')
        .single();

      if (orderError) throw orderError;

      // Create order items
      const orderItems = cart.map((item) => ({
        order_id: order.id,
        product_id: item.product.id,
        product_name: item.product.name,
        quantity: item.quantity,
        unit_price: item.calculatedPrice,
        total_price: item.calculatedPrice * item.quantity,
        notes: item.notes || null,
        options: item.options.length > 0 
          ? item.options.map(o => ({ name: o.name, groupName: o.groupName, priceModifier: o.priceModifier }))
          : null,
        requires_preparation: (item.product as any).requires_preparation !== false,
      }));

      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(orderItems);

      if (itemsError) throw itemsError;

      toast({
        title: 'Pedido criado com sucesso!',
        description: `Pedido #${order.id.slice(0, 8)} foi registrado.`,
      });

      navigate('/dashboard/orders');
    } catch (error: any) {
      console.error('Error creating order:', error);
      toast({
        title: 'Erro ao criar pedido',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col lg:h-[calc(100vh-4rem)]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b bg-background sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard/orders')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold">Novo Pedido Manual</h1>
              <p className="text-sm text-muted-foreground">PDV - Ponto de Venda</p>
            </div>
          </div>
          <Badge variant="outline" className="text-base px-3 py-1">
            <ShoppingCart className="h-4 w-4 mr-2" />
            {cart.length} {cart.length === 1 ? 'item' : 'itens'}
          </Badge>
        </div>

        {/* Main content */}
        <div className="flex-1 flex flex-col lg:grid lg:grid-cols-3 lg:overflow-hidden">
          {/* Products Section */}
          <div className="lg:col-span-2 lg:border-r flex flex-col lg:overflow-hidden">
            {/* Search and filters */}
            <div className="p-4 border-b space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar produtos..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>

              {/* Category tabs */}
              <ScrollArea className="w-full whitespace-nowrap">
                <div className="flex gap-2 pb-1">
                  <Button
                    variant={selectedCategory === null ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedCategory(null)}
                  >
                    Todos
                  </Button>
                  {categories.map((cat) => (
                    <Button
                      key={cat.id}
                      variant={selectedCategory === cat.id ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setSelectedCategory(cat.id)}
                      className="whitespace-nowrap"
                    >
                      {cat.name}
                    </Button>
                  ))}
                </div>
              </ScrollArea>
            </div>

            {/* Products grid */}
            <ScrollArea className="flex-1 p-4 lg:max-h-[calc(100vh-14rem)]">
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 pb-4">
                {filteredProducts.map((product) => {
                  const inCart = cart.find((item) => item.product.id === product.id);
                  const totalQty = cart
                    .filter((item) => item.product.id === product.id)
                    .reduce((sum, item) => sum + item.quantity, 0);
                  return (
                    <Card
                      key={product.id}
                      className={cn(
                        'cursor-pointer hover:border-primary transition-colors relative overflow-hidden',
                        inCart && 'border-primary bg-primary/5'
                      )}
                      onClick={() => openProductModal(product)}
                    >
                      {product.image_url && (
                        <div className="aspect-square overflow-hidden">
                          <img
                            src={product.image_url}
                            alt={product.name}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}
                      <CardContent className={cn('p-3', !product.image_url && 'pt-4')}>
                        <p className="font-medium text-sm line-clamp-2">{product.name}</p>
                        <p className="text-primary font-bold mt-1">
                          {formatCurrency(product.price)}
                        </p>
                        {product.category && (
                          <span className="inline-block mt-2 text-xs px-2 py-0.5 bg-secondary text-secondary-foreground rounded-md">
                            {product.category.name}
                          </span>
                        )}
                      </CardContent>
                      {totalQty > 0 && (
                        <div className="absolute top-2 right-2 bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold">
                          {totalQty}
                        </div>
                      )}
                    </Card>
                  );
                })}

                {filteredProducts.length === 0 && (
                  <div className="col-span-full text-center py-12 text-muted-foreground">
                    <Package className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>Nenhum produto encontrado</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Order Summary Section */}
          <div className="flex flex-col bg-muted/30 border-t lg:border-t-0 lg:overflow-hidden min-h-[400px] lg:min-h-0">
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-6">
                {/* Cart items */}
                <div>
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <ShoppingCart className="h-4 w-4" />
                    Itens do Pedido
                  </h3>

                  {cart.length === 0 ? (
                    <Card className="p-6 text-center text-muted-foreground">
                      <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">Adicione produtos clicando neles</p>
                    </Card>
                  ) : (
                    <div className="space-y-2">
                      {cart.map((item, index) => (
                        <Card key={`${item.product.id}-${index}`} className="p-3">
                          <div className="flex items-start gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm truncate">{item.product.name}</p>
                              {item.options.length > 0 && (
                                <GroupedOptionsDisplay 
                                  options={item.options} 
                                  variant="badges"
                                  className="mt-1"
                                />
                              )}
                              <p className="text-xs text-muted-foreground mt-1">
                                {formatCurrency(item.calculatedPrice)} cada
                              </p>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => updateQuantity(index, -1)}
                              >
                                <Minus className="h-3 w-3" />
                              </Button>
                              <span className="w-8 text-center font-medium text-sm">
                                {item.quantity}
                              </span>
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => updateQuantity(index, 1)}
                              >
                                <Plus className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive hover:text-destructive"
                                onClick={() => removeFromCart(index)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                          <div className="flex justify-between items-center mt-2 pt-2 border-t">
                            <Input
                              placeholder="Observação do item..."
                              value={item.notes}
                              onChange={(e) => updateItemNotes(index, e.target.value)}
                              className="h-7 text-xs"
                            />
                            <span className="font-semibold text-sm ml-2 whitespace-nowrap">
                              {formatCurrency(item.calculatedPrice * item.quantity)}
                            </span>
                          </div>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>

                <Separator />

                {/* Customer data (for delivery and pickup) */}
                {(deliveryType === 'delivery' || deliveryType === 'pickup') && (
                  <div>
                    <h3 className="font-semibold mb-3 flex items-center gap-2">
                      <User className="h-4 w-4" />
                      Dados do Cliente
                    </h3>
                    <div className="space-y-3">
                      <div>
                        <Label className="text-xs">Nome *</Label>
                        <Input
                          placeholder="Nome do cliente"
                          value={customer.name}
                          onChange={(e) => setCustomer({ ...customer, name: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Telefone *</Label>
                        <Input
                          placeholder="(00) 00000-0000"
                          value={customer.phone}
                          onChange={(e) => setCustomer({ ...customer, phone: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">E-mail (opcional)</Label>
                        <Input
                          type="email"
                          placeholder="email@exemplo.com"
                          value={customer.email}
                          onChange={(e) => setCustomer({ ...customer, email: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {(deliveryType === 'delivery' || deliveryType === 'pickup') && <Separator />}

                {/* Delivery type */}
                <div>
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Tipo de Atendimento
                  </h3>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setDeliveryType('table');
                        if (!tableNumber) {
                          setShowTableSelector(true);
                        }
                      }}
                      className={cn(
                        'flex flex-col items-center gap-2 p-3 border rounded-lg cursor-pointer transition-colors',
                        deliveryType === 'table' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
                      )}
                    >
                      <UtensilsCrossed className="h-5 w-5" />
                      <span className="text-sm font-medium">Mesa</span>
                      {tableNumber && deliveryType === 'table' && (
                        <span className="text-xs text-primary font-bold">#{tableNumber}</span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeliveryType('pickup')}
                      className={cn(
                        'flex flex-col items-center gap-2 p-3 border rounded-lg cursor-pointer transition-colors',
                        deliveryType === 'pickup' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
                      )}
                    >
                      <Store className="h-5 w-5" />
                      <span className="text-sm font-medium">Retirada</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeliveryType('delivery')}
                      className={cn(
                        'flex flex-col items-center gap-2 p-3 border rounded-lg cursor-pointer transition-colors',
                        deliveryType === 'delivery' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
                      )}
                    >
                      <Truck className="h-5 w-5" />
                      <span className="text-sm font-medium">Entrega</span>
                    </button>
                  </div>

                  {/* Table selector */}
                  {deliveryType === 'table' && (
                    <div className="mt-4 space-y-3">
                      {tableNumber ? (
                        <div className="flex items-center justify-between p-3 bg-primary/10 rounded-lg border border-primary/20">
                          <div className="flex items-center gap-2">
                            <UtensilsCrossed className="h-4 w-4 text-primary" />
                            <span className="font-medium">Mesa {tableNumber}</span>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowTableSelector(true)}
                          >
                            Alterar
                          </Button>
                        </div>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full"
                          onClick={() => setShowTableSelector(true)}
                        >
                          <UtensilsCrossed className="h-4 w-4 mr-2" />
                          Selecionar Mesa
                        </Button>
                      )}

                      {showTableSelector && (
                        <div className="border rounded-lg p-3 bg-background space-y-2">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium">Escolha uma mesa</span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setShowTableSelector(false)}
                            >
                              ✕
                            </Button>
                          </div>
                          {availableTables.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-4">
                              Nenhuma mesa cadastrada
                            </p>
                          ) : (
                            <div className="grid grid-cols-4 gap-2 max-h-40 overflow-y-auto">
                              {availableTables.map((table) => (
                                <button
                                  key={table.id}
                                  type="button"
                                  onClick={() => handleSelectTable(table.id, table.table_number)}
                                  className={cn(
                                    'p-2 text-center border rounded-lg transition-colors text-sm',
                                    table.status === 'occupied' 
                                      ? 'bg-amber-100 dark:bg-amber-900/30 border-amber-300' 
                                      : 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-300 hover:border-primary'
                                  )}
                                >
                                  <span className="font-bold">{table.table_number}</span>
                                  {table.name && <span className="block text-xs text-muted-foreground truncate">{table.name}</span>}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Address fields */}
                  {deliveryType === 'delivery' && (
                    <div className="mt-4 space-y-3">
                      <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-2">
                          <Label className="text-xs">Rua *</Label>
                          <Input
                            placeholder="Rua / Avenida"
                            value={address.street}
                            onChange={(e) => setAddress({ ...address, street: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Nº *</Label>
                          <Input
                            placeholder="Nº"
                            value={address.number}
                            onChange={(e) => setAddress({ ...address, number: e.target.value })}
                          />
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs">Complemento</Label>
                        <Input
                          placeholder="Apto, bloco..."
                          value={address.complement}
                          onChange={(e) => setAddress({ ...address, complement: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Bairro *</Label>
                        <Input
                          placeholder="Bairro"
                          value={address.neighborhood}
                          onChange={(e) => setAddress({ ...address, neighborhood: e.target.value })}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs">Cidade *</Label>
                          <Input
                            placeholder="Cidade"
                            value={address.city}
                            onChange={(e) => setAddress({ ...address, city: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Estado *</Label>
                          <Input
                            placeholder="UF"
                            maxLength={2}
                            value={address.state}
                            onChange={(e) => setAddress({ ...address, state: e.target.value.toUpperCase() })}
                          />
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs">CEP</Label>
                        <Input
                          placeholder="00000-000"
                          value={address.zip_code}
                          onChange={(e) => setAddress({ ...address, zip_code: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Referência</Label>
                        <Input
                          placeholder="Próximo a..."
                          value={address.reference}
                          onChange={(e) => setAddress({ ...address, reference: e.target.value })}
                        />
                      </div>
                    </div>
                  )}
                </div>

                <Separator />

                {/* Payment method */}
                <div>
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <CreditCard className="h-4 w-4" />
                    Forma de Pagamento
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    {paymentMethods.map((method) => (
                      <button
                        key={method.value}
                        type="button"
                        onClick={() => setPaymentMethod(method.value)}
                        className={cn(
                          'flex items-center gap-2 p-3 border rounded-lg cursor-pointer transition-colors',
                          paymentMethod === method.value ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
                        )}
                      >
                        <method.icon className="h-4 w-4" />
                        <span className="text-sm">{method.label}</span>
                      </button>
                    ))}
                  </div>

                  {/* Change for cash */}
                  {paymentMethod === 'cash' && (
                    <div className="mt-3 space-y-2">
                      <Label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={needsChange}
                          onChange={(e) => setNeedsChange(e.target.checked)}
                          className="rounded"
                        />
                        <span className="text-sm">Precisa de troco</span>
                      </Label>
                      {needsChange && (
                        <div>
                          <Label className="text-xs">Troco para quanto?</Label>
                          <Input
                            type="number"
                            placeholder="Ex: 50.00"
                            value={changeFor}
                            onChange={(e) => setChangeFor(e.target.value)}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <Separator />

                {/* Order notes */}
                <div>
                  <Label className="text-xs">Observações do Pedido</Label>
                  <Textarea
                    placeholder="Observações gerais do pedido..."
                    value={orderNotes}
                    onChange={(e) => setOrderNotes(e.target.value)}
                    rows={2}
                  />
                </div>
              </div>
            </ScrollArea>

            {/* Order total and submit */}
            <div className="p-4 border-t bg-background">
              <div className="space-y-2 mb-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatCurrency(subtotal)}</span>
                </div>
                {deliveryType === 'delivery' && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Taxa de entrega</span>
                    <span>{formatCurrency(deliveryFee)}</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between font-bold text-lg">
                  <span>Total</span>
                  <span className="text-primary">{formatCurrency(total)}</span>
                </div>
              </div>

              <Button
                className="w-full"
                size="lg"
                onClick={handleSubmit}
                disabled={submitting || cart.length === 0}
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Criando pedido...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Finalizar Pedido
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
      
      {/* Product Modal */}
      <POSProductModal
        product={selectedProduct}
        open={productModalOpen}
        onClose={() => {
          setProductModalOpen(false);
          setSelectedProduct(null);
        }}
        onAddToCart={handleAddToCartFromModal}
      />
    </DashboardLayout>
  );
}
