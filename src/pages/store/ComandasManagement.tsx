import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Search,
  ClipboardList,
  User,
  Phone,
  DollarSign,
  Clock,
  ChevronRight,
  MoreVertical,
  Trash2,
  X,
  Check,
  Loader2,
  Receipt,
  Hash,
  Printer,
  ShoppingBag,
  Calendar,
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { Switch } from '@/components/ui/switch';
import { POSProductModal, SelectedOption } from '@/components/pos/POSProductModal';
import { PrintComanda } from '@/components/comandas/PrintComanda';

interface Comanda {
  id: string;
  number: number;
  customer_name: string | null;
  customer_phone: string | null;
  status: 'open' | 'closed' | 'cancelled';
  notes: string | null;
  is_manual_number: boolean;
  created_at: string;
  closed_at: string | null;
  total: number;
  table_session_id: string | null;
}

interface ComandaItem {
  id: string;
  comanda_id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  options: any;
  notes: string | null;
  created_at: string;
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
  category?: Category;
}

interface CartItem {
  product: Product;
  quantity: number;
  notes: string;
  options: SelectedOption[];
  calculatedPrice: number;
}

export default function ComandasManagement() {
  const navigate = useNavigate();
  const { user, staffCompany } = useAuth();
  const { toast } = useToast();

  const [companyId, setCompanyId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [comandas, setComandas] = useState<Comanda[]>([]);
  const [selectedComanda, setSelectedComanda] = useState<Comanda | null>(null);
  const [comandaItems, setComandaItems] = useState<ComandaItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  // New comanda dialog
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newComandaNumber, setNewComandaNumber] = useState('');
  const [newComandaName, setNewComandaName] = useState('');
  const [newComandaPhone, setNewComandaPhone] = useState('');
  const [isManualNumber, setIsManualNumber] = useState(false);
  const [creatingComanda, setCreatingComanda] = useState(false);

  // Add items
  const [showAddItems, setShowAddItems] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [productSearch, setProductSearch] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [addingItems, setAddingItems] = useState(false);

  // Close/cancel dialogs
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [closingComanda, setClosingComanda] = useState(false);

  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'closed'>('open');

  useEffect(() => {
    loadData();
  }, [user, staffCompany]);

  useEffect(() => {
    if (companyId) {
      loadComandas();
      loadProducts();
    }
  }, [companyId]);

  useEffect(() => {
    if (selectedComanda) {
      loadComandaItems(selectedComanda.id);
    }
  }, [selectedComanda]);

  // Realtime subscription
  useEffect(() => {
    if (!companyId) return;

    const channel = supabase
      .channel('comandas-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'comandas', filter: `company_id=eq.${companyId}` },
        () => loadComandas()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'comanda_items' },
        (payload) => {
          if (selectedComanda && (payload.new as any)?.comanda_id === selectedComanda.id) {
            loadComandaItems(selectedComanda.id);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [companyId, selectedComanda]);

  const loadData = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const companyQuery = staffCompany?.companyId
        ? supabase.from('companies').select('id, name').eq('id', staffCompany.companyId).maybeSingle()
        : supabase.from('companies').select('id, name').eq('owner_id', user.id).maybeSingle();

      const { data: company, error } = await companyQuery;
      if (error) throw error;
      if (!company) {
        toast({ title: 'Empresa não encontrada', variant: 'destructive' });
        navigate('/dashboard');
        return;
      }

      setCompanyId(company.id);
      setCompanyName(company.name || 'Estabelecimento');
    } catch (error: any) {
      console.error('Error loading data:', error);
      toast({ title: 'Erro ao carregar dados', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const loadComandas = async () => {
    if (!companyId) return;

    try {
      const { data, error } = await (supabase as any)
        .from('comandas')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setComandas((data as Comanda[]) || []);
    } catch (error: any) {
      console.error('Error loading comandas:', error);
    }
  };

  const loadComandaItems = async (comandaId: string) => {
    setLoadingItems(true);
    try {
      const { data, error } = await (supabase as any)
        .from('comanda_items')
        .select('*')
        .eq('comanda_id', comandaId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setComandaItems((data as ComandaItem[]) || []);
    } catch (error: any) {
      console.error('Error loading comanda items:', error);
    } finally {
      setLoadingItems(false);
    }
  };

  const loadProducts = async () => {
    if (!companyId) return;

    try {
      const [categoriesRes, productsRes] = await Promise.all([
        supabase
          .from('categories')
          .select('id, name, sort_order')
          .eq('company_id', companyId)
          .eq('is_active', true)
          .order('sort_order'),
        supabase
          .from('products')
          .select('id, name, description, price, image_url, is_active, category_id')
          .eq('company_id', companyId)
          .eq('is_active', true)
          .order('sort_order'),
      ]);

      if (categoriesRes.error) throw categoriesRes.error;
      if (productsRes.error) throw productsRes.error;

      setCategories(categoriesRes.data || []);
      const productsWithCategory = (productsRes.data || []).map((p) => ({
        ...p,
        category: categoriesRes.data?.find((c) => c.id === p.category_id),
      }));
      setProducts(productsWithCategory);
    } catch (error: any) {
      console.error('Error loading products:', error);
    }
  };

  const handleCreateComanda = async () => {
    if (!companyId) return;

    setCreatingComanda(true);
    try {
      let number: number;

      if (isManualNumber) {
        const parsed = parseInt(newComandaNumber, 10);
        if (isNaN(parsed) || parsed <= 0) {
          toast({ title: 'Número inválido', variant: 'destructive' });
          setCreatingComanda(false);
          return;
        }
        number = parsed;
      } else {
        // Get next number from function
        const { data, error } = await (supabase as any).rpc('get_next_comanda_number', { p_company_id: companyId });
        if (error) throw error;
        number = data as number;
      }

      const { data: newComanda, error } = await (supabase as any)
        .from('comandas')
        .insert({
          company_id: companyId,
          number,
          customer_name: newComandaName || null,
          customer_phone: newComandaPhone || null,
          is_manual_number: isManualNumber,
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          toast({ title: 'Esse número de comanda já está em uso hoje', variant: 'destructive' });
          setCreatingComanda(false);
          return;
        }
        throw error;
      }

      toast({ title: `Comanda #${number} criada com sucesso` });
      setShowNewDialog(false);
      setNewComandaNumber('');
      setNewComandaName('');
      setNewComandaPhone('');
      setIsManualNumber(false);
      setSelectedComanda(newComanda as Comanda);
      loadComandas();
    } catch (error: any) {
      console.error('Error creating comanda:', error);
      toast({ title: 'Erro ao criar comanda', description: error.message, variant: 'destructive' });
    } finally {
      setCreatingComanda(false);
    }
  };

  const handleAddItemsToComanda = async () => {
    if (!selectedComanda || cart.length === 0) return;

    setAddingItems(true);
    try {
      const items = cart.map((item) => ({
        comanda_id: selectedComanda.id,
        product_id: item.product.id,
        product_name: item.product.name,
        quantity: item.quantity,
        unit_price: item.calculatedPrice,
        total_price: item.calculatedPrice * item.quantity,
        options: item.options.length > 0
          ? item.options.map((o) => ({ name: o.name, groupName: o.groupName, priceModifier: o.priceModifier }))
          : null,
        notes: item.notes || null,
      }));

      const { error } = await (supabase as any).from('comanda_items').insert(items);
      if (error) throw error;

      toast({ title: 'Itens adicionados com sucesso' });
      setCart([]);
      setShowAddItems(false);
      loadComandaItems(selectedComanda.id);
      loadComandas(); // Refresh totals
    } catch (error: any) {
      console.error('Error adding items:', error);
      toast({ title: 'Erro ao adicionar itens', description: error.message, variant: 'destructive' });
    } finally {
      setAddingItems(false);
    }
  };

  const handleRemoveItem = async (itemId: string) => {
    try {
      const { error } = await (supabase as any).from('comanda_items').delete().eq('id', itemId);
      if (error) throw error;
      toast({ title: 'Item removido' });
      if (selectedComanda) {
        loadComandaItems(selectedComanda.id);
        loadComandas();
      }
    } catch (error: any) {
      console.error('Error removing item:', error);
      toast({ title: 'Erro ao remover item', description: error.message, variant: 'destructive' });
    }
  };

  const handleCloseComanda = async () => {
    if (!selectedComanda) return;

    setClosingComanda(true);
    try {
      const { error } = await (supabase as any)
        .from('comandas')
        .update({ status: 'closed', closed_at: new Date().toISOString() })
        .eq('id', selectedComanda.id);

      if (error) throw error;

      toast({ title: `Comanda #${selectedComanda.number} fechada` });
      setShowCloseDialog(false);
      setSelectedComanda(null);
      loadComandas();
    } catch (error: any) {
      console.error('Error closing comanda:', error);
      toast({ title: 'Erro ao fechar comanda', description: error.message, variant: 'destructive' });
    } finally {
      setClosingComanda(false);
    }
  };

  const handleCancelComanda = async () => {
    if (!selectedComanda) return;

    setClosingComanda(true);
    try {
      const { error } = await (supabase as any)
        .from('comandas')
        .update({ status: 'cancelled', closed_at: new Date().toISOString() })
        .eq('id', selectedComanda.id);

      if (error) throw error;

      toast({ title: `Comanda #${selectedComanda.number} cancelada` });
      setShowCancelDialog(false);
      setSelectedComanda(null);
      loadComandas();
    } catch (error: any) {
      console.error('Error cancelling comanda:', error);
      toast({ title: 'Erro ao cancelar comanda', description: error.message, variant: 'destructive' });
    } finally {
      setClosingComanda(false);
    }
  };

  const filteredComandas = useMemo(() => {
    let filtered = comandas;

    if (statusFilter !== 'all') {
      filtered = filtered.filter((c) => c.status === statusFilter);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (c) =>
          c.number.toString().includes(query) ||
          c.customer_name?.toLowerCase().includes(query) ||
          c.customer_phone?.includes(query)
      );
    }

    return filtered;
  }, [comandas, statusFilter, searchQuery]);

  const filteredProducts = useMemo(() => {
    let filtered = products;

    if (selectedCategory) {
      filtered = filtered.filter((p) => p.category_id === selectedCategory);
    }

    if (productSearch.trim()) {
      const query = productSearch.toLowerCase();
      filtered = filtered.filter((p) => p.name.toLowerCase().includes(query));
    }

    return filtered;
  }, [products, selectedCategory, productSearch]);

  const formatCurrency = (value: number) =>
    value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('pt-BR');
  };

  const openProductModal = (product: Product) => {
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
    setCart((prev) => [...prev, { product, quantity, notes, options, calculatedPrice }]);
  };

  const cartTotal = cart.reduce((sum, item) => sum + item.calculatedPrice * item.quantity, 0);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'open':
        return <Badge className="bg-green-500">Aberta</Badge>;
      case 'closed':
        return <Badge variant="secondary">Fechada</Badge>;
      case 'cancelled':
        return <Badge variant="destructive">Cancelada</Badge>;
      default:
        return null;
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

  // Calculate stats
  const openComandas = comandas.filter((c) => c.status === 'open');
  const totalOpenValue = openComandas.reduce((sum, c) => sum + c.total, 0);
  const todayClosedValue = comandas
    .filter((c) => c.status === 'closed' && c.closed_at && new Date(c.closed_at).toDateString() === new Date().toDateString())
    .reduce((sum, c) => sum + c.total, 0);

  return (
    <DashboardLayout>
      <div className="flex flex-col h-[calc(100vh-4rem)]">
        {/* Header */}
        <div className="p-4 border-b bg-gradient-to-r from-primary/5 to-transparent">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Receipt className="h-6 w-6 text-primary" />
                Comandas
              </h1>
              <p className="text-muted-foreground text-sm">
                Gerencie as comandas do estabelecimento
              </p>
            </div>
            <Button onClick={() => setShowNewDialog(true)} size="lg" className="gap-2">
              <Plus className="h-5 w-5" />
              Nova Comanda
            </Button>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="bg-background/60 backdrop-blur">
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-full bg-green-500/10">
                    <Receipt className="h-4 w-4 text-green-500" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Abertas</p>
                    <p className="text-xl font-bold">{openComandas.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-background/60 backdrop-blur">
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-full bg-primary/10">
                    <DollarSign className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Em Aberto</p>
                    <p className="text-xl font-bold">{formatCurrency(totalOpenValue)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-background/60 backdrop-blur">
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-full bg-blue-500/10">
                    <Check className="h-4 w-4 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Fechadas Hoje</p>
                    <p className="text-xl font-bold">{formatCurrency(todayClosedValue)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-background/60 backdrop-blur">
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-full bg-amber-500/10">
                    <ShoppingBag className="h-4 w-4 text-amber-500" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total Hoje</p>
                    <p className="text-xl font-bold">{comandas.filter((c) => new Date(c.created_at).toDateString() === new Date().toDateString()).length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Comandas List */}
          <div className="w-full md:w-1/3 lg:w-1/4 border-r flex flex-col bg-muted/20">
            {/* Filters */}
            <div className="p-3 space-y-3 border-b bg-background">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por número ou nome..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="flex gap-1">
                <Button
                  variant={statusFilter === 'open' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setStatusFilter('open')}
                  className="flex-1"
                >
                  <span className="hidden sm:inline">Abertas</span>
                  <span className="sm:hidden">Abert.</span>
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                    {comandas.filter((c) => c.status === 'open').length}
                  </Badge>
                </Button>
                <Button
                  variant={statusFilter === 'closed' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setStatusFilter('closed')}
                  className="flex-1"
                >
                  <span className="hidden sm:inline">Fechadas</span>
                  <span className="sm:hidden">Fech.</span>
                </Button>
                <Button
                  variant={statusFilter === 'all' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setStatusFilter('all')}
                  className="flex-1"
                >
                  Todas
                </Button>
              </div>
            </div>

            {/* List */}
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-2">
                {filteredComandas.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <ClipboardList className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>Nenhuma comanda encontrada</p>
                  </div>
                ) : (
                  filteredComandas.map((comanda) => (
                    <Card
                      key={comanda.id}
                      className={cn(
                        'cursor-pointer transition-colors hover:bg-accent/50',
                        selectedComanda?.id === comanda.id && 'ring-2 ring-primary'
                      )}
                      onClick={() => setSelectedComanda(comanda)}
                    >
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-bold text-lg">#{comanda.number}</span>
                              {getStatusBadge(comanda.status)}
                            </div>
                            {comanda.customer_name && (
                              <p className="text-sm text-muted-foreground flex items-center gap-1">
                                <User className="h-3 w-3" />
                                {comanda.customer_name}
                              </p>
                            )}
                            <div className="flex items-center justify-between mt-2">
                              <span className="text-xs text-muted-foreground">
                                {formatTime(comanda.created_at)}
                              </span>
                              <span className="font-medium text-primary">
                                {formatCurrency(comanda.total)}
                              </span>
                            </div>
                          </div>
                          <ChevronRight className="h-5 w-5 text-muted-foreground" />
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Comanda Details */}
          <div className="hidden md:flex flex-1 flex-col">
            {selectedComanda ? (
              <>
                {/* Details Header */}
                <div className="p-4 border-b bg-muted/30">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-xl font-bold flex items-center gap-2">
                        Comanda #{selectedComanda.number}
                        {getStatusBadge(selectedComanda.status)}
                      </h2>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                        {selectedComanda.customer_name && (
                          <span className="flex items-center gap-1">
                            <User className="h-4 w-4" />
                            {selectedComanda.customer_name}
                          </span>
                        )}
                        {selectedComanda.customer_phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-4 w-4" />
                            {selectedComanda.customer_phone}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Clock className="h-4 w-4" />
                          {formatDate(selectedComanda.created_at)} {formatTime(selectedComanda.created_at)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Print button - always visible */}
                      <PrintComanda
                        comanda={selectedComanda}
                        items={comandaItems}
                        companyName={companyName}
                        variant="button"
                      />

                      {selectedComanda.status === 'open' && (
                        <>
                          <Button onClick={() => setShowAddItems(true)}>
                            <Plus className="h-4 w-4 mr-2" />
                            Adicionar Itens
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" size="icon">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="bg-popover">
                              <DropdownMenuItem onClick={() => setShowCloseDialog(true)}>
                                <Check className="h-4 w-4 mr-2" />
                                Fechar Comanda
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => setShowCancelDialog(true)}
                                className="text-destructive"
                              >
                                <X className="h-4 w-4 mr-2" />
                                Cancelar Comanda
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Items List */}
                <ScrollArea className="flex-1 p-4">
                  {loadingItems ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    </div>
                  ) : comandaItems.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <ClipboardList className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p>Nenhum item na comanda</p>
                      {selectedComanda.status === 'open' && (
                        <Button
                          variant="outline"
                          className="mt-4"
                          onClick={() => setShowAddItems(true)}
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Adicionar Itens
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {comandaItems.map((item) => (
                        <Card key={item.id}>
                          <CardContent className="p-3">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">{item.quantity}x</span>
                                  <span>{item.product_name}</span>
                                </div>
                                {item.options && Array.isArray(item.options) && item.options.length > 0 && (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {item.options.map((o: any) => o.name).join(', ')}
                                  </p>
                                )}
                                {item.notes && (
                                  <p className="text-xs text-muted-foreground italic mt-1">
                                    {item.notes}
                                  </p>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{formatCurrency(item.total_price)}</span>
                                {selectedComanda.status === 'open' && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-destructive"
                                    onClick={() => handleRemoveItem(item.id)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </ScrollArea>

                {/* Total Footer */}
                <div className="p-4 border-t bg-muted/30">
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-medium">Total</span>
                    <span className="text-2xl font-bold text-primary">
                      {formatCurrency(selectedComanda.total)}
                    </span>
                  </div>
                  {selectedComanda.status === 'open' && (
                    <Button className="w-full mt-3" onClick={() => setShowCloseDialog(true)}>
                      <DollarSign className="h-4 w-4 mr-2" />
                      Fechar e Pagar
                    </Button>
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <ClipboardList className="h-16 w-16 mx-auto mb-4 opacity-50" />
                  <p>Selecione uma comanda para ver os detalhes</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* New Comanda Dialog */}
      <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Comanda</DialogTitle>
            <DialogDescription>
              Crie uma nova comanda para registrar os pedidos do cliente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="manual-number">Número manual</Label>
              <Switch
                id="manual-number"
                checked={isManualNumber}
                onCheckedChange={setIsManualNumber}
              />
            </div>
            {isManualNumber && (
              <div className="space-y-2">
                <Label htmlFor="comanda-number">Número da Comanda</Label>
                <div className="relative">
                  <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="comanda-number"
                    type="number"
                    min="1"
                    placeholder="Ex: 42"
                    value={newComandaNumber}
                    onChange={(e) => setNewComandaNumber(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="customer-name">Nome do Cliente (opcional)</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="customer-name"
                  placeholder="Ex: João Silva"
                  value={newComandaName}
                  onChange={(e) => setNewComandaName(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="customer-phone">Telefone (opcional)</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="customer-phone"
                  placeholder="Ex: (11) 99999-9999"
                  value={newComandaPhone}
                  onChange={(e) => setNewComandaPhone(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateComanda} disabled={creatingComanda}>
              {creatingComanda ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              Criar Comanda
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Items Dialog */}
      <Dialog open={showAddItems} onOpenChange={setShowAddItems}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Adicionar Itens - Comanda #{selectedComanda?.number}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 flex gap-4 overflow-hidden">
            {/* Products */}
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar produto..."
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="flex gap-2 mb-3 flex-wrap">
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
                  >
                    {cat.name}
                  </Button>
                ))}
              </div>
              <ScrollArea className="flex-1">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {filteredProducts.map((product) => (
                    <Card
                      key={product.id}
                      className="cursor-pointer hover:bg-accent/50 transition-colors"
                      onClick={() => openProductModal(product)}
                    >
                      <CardContent className="p-3">
                        <p className="font-medium text-sm line-clamp-2">{product.name}</p>
                        <p className="text-sm text-primary font-medium mt-1">
                          {formatCurrency(product.price)}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            </div>

            {/* Cart */}
            <div className="w-72 border-l pl-4 flex flex-col">
              <h3 className="font-medium mb-3">Itens a adicionar</h3>
              <ScrollArea className="flex-1">
                {cart.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Nenhum item selecionado
                  </p>
                ) : (
                  <div className="space-y-2">
                    {cart.map((item, index) => (
                      <Card key={index}>
                        <CardContent className="p-2">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <p className="text-sm font-medium">
                                {item.quantity}x {item.product.name}
                              </p>
                              <p className="text-xs text-primary">
                                {formatCurrency(item.calculatedPrice * item.quantity)}
                              </p>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => setCart((prev) => prev.filter((_, i) => i !== index))}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </ScrollArea>
              <Separator className="my-3" />
              <div className="flex items-center justify-between mb-3">
                <span className="font-medium">Total</span>
                <span className="font-bold text-primary">{formatCurrency(cartTotal)}</span>
              </div>
              <Button
                onClick={handleAddItemsToComanda}
                disabled={cart.length === 0 || addingItems}
                className="w-full"
              >
                {addingItems ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Plus className="h-4 w-4 mr-2" />
                )}
                Adicionar à Comanda
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Product Modal */}
      {selectedProduct && (
        <POSProductModal
          open={productModalOpen}
          onClose={() => setProductModalOpen(false)}
          product={selectedProduct}
          onAddToCart={handleAddToCart}
        />
      )}

      {/* Close Comanda Dialog */}
      <AlertDialog open={showCloseDialog} onOpenChange={setShowCloseDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Fechar Comanda #{selectedComanda?.number}?</AlertDialogTitle>
            <AlertDialogDescription>
              O total da comanda é{' '}
              <span className="font-bold text-primary">
                {formatCurrency(selectedComanda?.total || 0)}
              </span>
              . Após fechar, não será possível adicionar mais itens.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleCloseComanda} disabled={closingComanda}>
              {closingComanda ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Check className="h-4 w-4 mr-2" />
              )}
              Fechar Comanda
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel Comanda Dialog */}
      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar Comanda #{selectedComanda?.number}?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. A comanda será marcada como cancelada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelComanda}
              disabled={closingComanda}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {closingComanda ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <X className="h-4 w-4 mr-2" />
              )}
              Cancelar Comanda
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
