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
  FileText,
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
import { BarcodeScanner } from '@/components/comandas/BarcodeScanner';
import { CloseComandaDialog } from '@/components/comandas/CloseComandaDialog';

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

interface GeneratedComanda {
  id: string;
  number: number;
  used_at: string | null;
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
  const [availableComandas, setAvailableComandas] = useState<GeneratedComanda[]>([]);
  const [selectedGeneratedComanda, setSelectedGeneratedComanda] = useState<number | null>(null);

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
  const [scannerLoading, setScannerLoading] = useState(false);

  // Comanda history for the selected number
  interface ComandaHistory {
    totalUses: number;
    totalValue: number;
    lastUse: string | null;
    lastValue: number;
    history: Array<{ date: string; total: number; status: string }>;
  }
  const [comandaHistory, setComandaHistory] = useState<ComandaHistory | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    loadData();
  }, [user, staffCompany]);

  useEffect(() => {
    if (companyId) {
      loadComandas();
      loadProducts();
      loadAvailableComandas();
    }
  }, [companyId]);

  // Load available comandas when dialog opens
  useEffect(() => {
    if (showNewDialog && companyId) {
      loadAvailableComandas();
    }
  }, [showNewDialog, companyId]);

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

  const loadAvailableComandas = async () => {
    if (!companyId) return;

    try {
      // Get unused generated comandas
      const { data: generated, error: genError } = await (supabase as any)
        .from('generated_comandas')
        .select('id, number, used_at')
        .eq('company_id', companyId)
        .is('used_at', null)
        .order('number', { ascending: true });

      if (genError) throw genError;

      // Get currently OPEN comandas only (closed ones are reusable!)
      const { data: openComandas } = await (supabase as any)
        .from('comandas')
        .select('number')
        .eq('company_id', companyId)
        .eq('status', 'open');

      const openNumbers = new Set((openComandas || []).map((c: any) => c.number));
      
      // Filter out numbers that are currently open
      const available = (generated || []).filter((g: any) => !openNumbers.has(g.number));
      
      setAvailableComandas(available);
    } catch (error: any) {
      console.error('Error loading available comandas:', error);
    }
  };

  const handleCreateComanda = async () => {
    if (!companyId) return;

    setCreatingComanda(true);
    try {
      let number: number;
      let generatedComandaId: string | null = null;

      if (selectedGeneratedComanda) {
        // Use selected/scanned comanda number (barcode card)
        number = selectedGeneratedComanda;

        // Always try to link with generated_comandas row by number (even if it was used before)
        const { data: genRow, error: genRowError } = await (supabase as any)
          .from('generated_comandas')
          .select('id')
          .eq('company_id', companyId)
          .eq('number', number)
          .maybeSingle();

        if (genRowError) throw genRowError;
        if (genRow?.id) generatedComandaId = genRow.id;
      } else if (isManualNumber) {
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

      // If there is already an OPEN comanda with this number (other device/account), just open it
      const { data: existingOpen, error: existingOpenError } = await (supabase as any)
        .from('comandas')
        .select('*')
        .eq('company_id', companyId)
        .eq('number', number)
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(1);

      if (existingOpenError) throw existingOpenError;

      const openComanda = Array.isArray(existingOpen) ? existingOpen[0] : null;
      if (openComanda) {
        toast({ title: `Comanda #${number} já está aberta. Abrindo...` });
        setShowNewDialog(false);
        setIsManualNumber(false);
        setSelectedGeneratedComanda(null);
        setSelectedComanda(openComanda as Comanda);
        setStatusFilter('open');
        loadComandaItems((openComanda as any).id);
        loadComandas();
        loadAvailableComandas();
        setCreatingComanda(false);
        return;
      }

      const { data: newComanda, error } = await (supabase as any)
        .from('comandas')
        .insert({
          company_id: companyId,
          number,
          customer_name: newComandaName || null,
          customer_phone: newComandaPhone || null,
          is_manual_number: isManualNumber || !!selectedGeneratedComanda,
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          toast({ title: 'Esse número de comanda já está em uso (aberta)', variant: 'destructive' });
          setCreatingComanda(false);
          return;
        }
        throw error;
      }

      // Mark generated comanda as used
      if (generatedComandaId) {
        await (supabase as any)
          .from('generated_comandas')
          .update({
            used_at: new Date().toISOString(),
            comanda_id: newComanda.id,
          })
          .eq('id', generatedComandaId);
      } else if (selectedGeneratedComanda) {
        // Fallback: if we scanned a number but didn't find the row id, try by number
        await (supabase as any)
          .from('generated_comandas')
          .update({
            used_at: new Date().toISOString(),
            comanda_id: newComanda.id,
          })
          .eq('company_id', companyId)
          .eq('number', number);
      }

      toast({ title: `Comanda #${number} criada com sucesso` });
      setShowNewDialog(false);
      setNewComandaNumber('');
      setNewComandaName('');
      setNewComandaPhone('');
      setIsManualNumber(false);
      setSelectedGeneratedComanda(null);
      setSelectedComanda(newComanda as Comanda);
      loadComandas();
      loadAvailableComandas();
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

  const handleCloseComanda = async (
    paymentMethod: 'dinheiro' | 'cartao' | 'pix',
    amountReceived: number,
    changeAmount: number
  ) => {
    if (!selectedComanda || !companyId) return;

    setClosingComanda(true);
    try {
      // Calculate total from DB to avoid "zerado" when state is stale
      const { data: dbItems, error: dbItemsError } = await (supabase as any)
        .from('comanda_items')
        .select('total_price')
        .eq('comanda_id', selectedComanda.id);

      if (dbItemsError) throw dbItemsError;

      const dbItemsTotal = (dbItems || []).reduce((sum: number, item: any) => sum + (item.total_price || 0), 0);
      const stateItemsTotal = comandaItems.reduce((sum, item) => sum + (item.total_price || 0), 0);
      const computed = dbItemsTotal > 0 ? dbItemsTotal : stateItemsTotal;
      const finalTotal = computed > 0 ? computed : selectedComanda.total;

      const { error } = await (supabase as any)
        .from('comandas')
        .update({
          status: 'closed',
          closed_at: new Date().toISOString(),
          payment_method: paymentMethod,
          amount_received: amountReceived,
          change_amount: changeAmount,
          total: finalTotal,
        })
        .eq('id', selectedComanda.id);

      if (error) throw error;

      // Free the card number for reuse (generated card)
      await (supabase as any)
        .from('generated_comandas')
        .update({ used_at: null, comanda_id: null })
        .eq('company_id', companyId)
        .eq('number', selectedComanda.number);

      const methodLabel = paymentMethod === 'dinheiro' ? 'Dinheiro' : paymentMethod === 'cartao' ? 'Cartão' : 'PIX';
      toast({
        title: `Comanda #${selectedComanda.number} fechada`,
        description: `Pagamento: ${methodLabel}${changeAmount > 0 ? ` - Troco: R$ ${changeAmount.toFixed(2).replace('.', ',')}` : ''}`,
      });

      setShowCloseDialog(false);
      setSelectedComanda(null);
      loadComandas();
      loadAvailableComandas();
    } catch (error: any) {
      console.error('Error closing comanda:', error);
      toast({ title: 'Erro ao fechar comanda', description: error.message, variant: 'destructive' });
    } finally {
      setClosingComanda(false);
    }
  };

  const handleCancelComanda = async () => {
    if (!selectedComanda || !companyId) return;

    setClosingComanda(true);
    try {
      const { error } = await (supabase as any)
        .from('comandas')
        .update({ status: 'cancelled', closed_at: new Date().toISOString() })
        .eq('id', selectedComanda.id);

      if (error) throw error;

      // Free the card number for reuse (generated card)
      await (supabase as any)
        .from('generated_comandas')
        .update({ used_at: null, comanda_id: null })
        .eq('company_id', companyId)
        .eq('number', selectedComanda.number);

      toast({ title: `Comanda #${selectedComanda.number} cancelada` });
      setShowCancelDialog(false);
      setSelectedComanda(null);
      loadComandas();
      loadAvailableComandas();
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

  // Sound effects for scanner feedback
  const playSuccessSound = () => {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 800;
    oscillator.type = 'sine';
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.2);
  };

  const playErrorSound = () => {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 300;
    oscillator.type = 'square';
    gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.3);
  };

  // Load history for a specific comanda number
  const loadComandaHistory = async (comandaNumber: number) => {
    if (!companyId) return;
    
    setLoadingHistory(true);
    try {
      const { data, error } = await (supabase as any)
        .from('comandas')
        .select('total, status, closed_at, created_at')
        .eq('company_id', companyId)
        .eq('number', comandaNumber)
        .in('status', ['closed', 'cancelled'])
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;

      if (data && data.length > 0) {
        const totalUses = data.length;
        const totalValue = data.reduce((sum: number, c: any) => sum + (c.total || 0), 0);
        const lastUse = data[0].closed_at || data[0].created_at;
        const lastValue = data[0].total || 0;
        
        setComandaHistory({
          totalUses,
          totalValue,
          lastUse,
          lastValue,
          history: data.map((c: any) => ({
            date: c.closed_at || c.created_at,
            total: c.total || 0,
            status: c.status,
          })),
        });
      } else {
        setComandaHistory(null);
      }
    } catch (error) {
      console.error('Error loading comanda history:', error);
      setComandaHistory(null);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Handle barcode scan - find or create comanda
  const handleBarcodeScan = async (comandaNumber: number) => {
    if (!companyId) return;

    setScannerLoading(true);
    try {
      // Always check DB first (multi-user safe)
      const { data: openData, error: openError } = await (supabase as any)
        .from('comandas')
        .select('*')
        .eq('company_id', companyId)
        .eq('number', comandaNumber)
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(1);

      if (openError) throw openError;

      const dbOpenComanda = Array.isArray(openData) ? openData[0] : null;

      if (dbOpenComanda) {
        playSuccessSound();
        setSelectedComanda(dbOpenComanda as Comanda);
        setStatusFilter('open');
        toast({ title: `✅ Comanda #${comandaNumber} aberta encontrada` });
        return;
      }

      // If not open, comanda is reusable (card/barcode): offer to create a new one
      playSuccessSound();
      setSelectedGeneratedComanda(comandaNumber);
      setIsManualNumber(false);
      setNewComandaNumber('');
      loadComandaHistory(comandaNumber);
      setShowNewDialog(true);
      toast({
        title: `🆕 Criar Comanda #${comandaNumber}`,
        description: 'Complete os dados para criar a comanda',
      });
    } catch (error: any) {
      console.error('Error scanning comanda:', error);
      toast({ title: 'Erro no scanner', description: error.message, variant: 'destructive' });
    } finally {
      setScannerLoading(false);
    }
  };

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
            <div className="flex items-center gap-2">
              <BarcodeScanner 
                onScan={handleBarcodeScan} 
                isLoading={scannerLoading}
              />
              <Button 
                variant="outline" 
                onClick={() => navigate('/dashboard/comandas/print')}
                className="gap-2"
                title="Imprimir comandas em lote para gráfica"
              >
                <FileText className="h-4 w-4" />
                <span className="hidden sm:inline">Imprimir Lote</span>
              </Button>
              <Button onClick={() => setShowNewDialog(true)} size="lg" className="gap-2">
                <Plus className="h-5 w-5" />
                Nova Comanda
              </Button>
            </div>
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
      <Dialog open={showNewDialog} onOpenChange={(open) => {
        setShowNewDialog(open);
        if (!open) {
          setSelectedGeneratedComanda(null);
          setIsManualNumber(false);
          setComandaHistory(null);
        }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova Comanda</DialogTitle>
            <DialogDescription>
              Selecione uma comanda impressa ou crie uma nova.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* History Section - shows when a comanda number is selected via scan */}
            {selectedGeneratedComanda && (
              <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold flex items-center gap-2">
                    <Receipt className="h-4 w-4 text-primary" />
                    Comanda #{selectedGeneratedComanda}
                  </h4>
                  {loadingHistory && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                </div>
                
                {comandaHistory ? (
                  <>
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div className="bg-background rounded-md p-2">
                        <div className="text-lg font-bold text-primary">{comandaHistory.totalUses}</div>
                        <div className="text-xs text-muted-foreground">vezes usada</div>
                      </div>
                      <div className="bg-background rounded-md p-2">
                        <div className="text-lg font-bold text-green-600">
                          {formatCurrency(comandaHistory.totalValue)}
                        </div>
                        <div className="text-xs text-muted-foreground">total acumulado</div>
                      </div>
                      <div className="bg-background rounded-md p-2">
                        <div className="text-lg font-bold">
                          {formatCurrency(comandaHistory.lastValue)}
                        </div>
                        <div className="text-xs text-muted-foreground">última vez</div>
                      </div>
                    </div>
                    
                    {comandaHistory.lastUse && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Último uso: {formatDate(comandaHistory.lastUse)} às {formatTime(comandaHistory.lastUse)}
                      </p>
                    )}
                    
                    {/* Recent history */}
                    {comandaHistory.history.length > 1 && (
                      <details className="text-sm">
                        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                          Ver últimos {comandaHistory.history.length} usos
                        </summary>
                        <div className="mt-2 space-y-1 max-h-24 overflow-y-auto">
                          {comandaHistory.history.map((h, i) => (
                            <div key={i} className="flex justify-between text-xs bg-background rounded px-2 py-1">
                              <span>{formatDate(h.date)}</span>
                              <span className={cn(
                                'font-medium',
                                h.status === 'cancelled' ? 'text-destructive line-through' : 'text-green-600'
                              )}>
                                {formatCurrency(h.total)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </>
                ) : !loadingHistory ? (
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <span className="text-green-600">✨</span>
                    Primeira vez usando esta comanda!
                  </p>
                ) : null}
              </div>
            )}

            {/* Available Comandas Section */}
            {availableComandas.length > 0 && (
              <div className="space-y-2">
                <Label>Comandas Disponíveis</Label>
                <ScrollArea className="h-32 rounded-md border p-2">
                  <div className="flex flex-wrap gap-2">
                    {availableComandas.map((gc) => (
                      <Button
                        key={gc.id}
                        type="button"
                        variant={selectedGeneratedComanda === gc.number ? 'default' : 'outline'}
                        size="sm"
                        className="h-10 min-w-[60px]"
                        onClick={() => {
                          const newNumber = selectedGeneratedComanda === gc.number ? null : gc.number;
                          setSelectedGeneratedComanda(newNumber);
                          setIsManualNumber(false);
                          setNewComandaNumber('');
                          if (newNumber) {
                            loadComandaHistory(newNumber);
                          } else {
                            setComandaHistory(null);
                          }
                        }}
                      >
                        #{gc.number}
                      </Button>
                    ))}
                  </div>
                </ScrollArea>
                <p className="text-xs text-muted-foreground">
                  {availableComandas.length} comanda(s) impressa(s) disponível(is)
                </p>
              </div>
            )}

            {availableComandas.length === 0 && (
              <div className="rounded-lg border border-dashed p-4 text-center text-muted-foreground">
                <FileText className="mx-auto h-8 w-8 mb-2 opacity-50" />
                <p className="text-sm">Nenhuma comanda pré-impressa disponível</p>
                <Button
                  variant="link"
                  size="sm"
                  className="mt-1"
                  onClick={() => {
                    setShowNewDialog(false);
                    navigate('/dashboard/comandas/imprimir');
                  }}
                >
                  Imprimir comandas em lote
                </Button>
              </div>
            )}

            {/* Divider if has available comandas */}
            {availableComandas.length > 0 && (
              <div className="relative">
                <Separator />
                <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background px-2 text-xs text-muted-foreground">
                  ou
                </span>
              </div>
            )}

            {/* Manual Number Toggle */}
            <div className="flex items-center justify-between">
              <Label htmlFor="manual-number">Digitar número manualmente</Label>
              <Switch
                id="manual-number"
                checked={isManualNumber}
                onCheckedChange={(checked) => {
                  setIsManualNumber(checked);
                  if (checked) {
                    setSelectedGeneratedComanda(null);
                  }
                }}
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

            <Separator />

            {/* Customer Info */}
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
            <Button 
              onClick={handleCreateComanda} 
              disabled={creatingComanda || (isManualNumber && !newComandaNumber)}
            >
              {creatingComanda ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              {selectedGeneratedComanda 
                ? `Abrir Comanda #${selectedGeneratedComanda}` 
                : 'Criar Comanda'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Items Dialog */}
      <Dialog open={showAddItems} onOpenChange={setShowAddItems}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col p-0">
          {/* Header */}
          <div className="px-6 py-4 border-b bg-gradient-to-r from-primary/5 to-transparent">
            <DialogTitle className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <ShoppingBag className="h-5 w-5 text-primary" />
              </div>
              <div>
                <span className="text-xl">Adicionar Itens</span>
                <p className="text-sm text-muted-foreground font-normal">
                  Comanda #{selectedComanda?.number}
                  {selectedComanda?.customer_name && ` • ${selectedComanda.customer_name}`}
                </p>
              </div>
            </DialogTitle>
          </div>

          <div className="flex-1 flex overflow-hidden">
            {/* Products Section */}
            <div className="flex-1 flex flex-col overflow-hidden p-4">
              {/* Search and Categories */}
              <div className="space-y-3 mb-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar produto..."
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    className="pl-9 h-11"
                  />
                </div>
                <ScrollArea className="w-full whitespace-nowrap">
                  <div className="flex gap-2 pb-2">
                    <Button
                      variant={selectedCategory === null ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setSelectedCategory(null)}
                      className="rounded-full"
                    >
                      Todos
                    </Button>
                    {categories.map((cat) => (
                      <Button
                        key={cat.id}
                        variant={selectedCategory === cat.id ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setSelectedCategory(cat.id)}
                        className="rounded-full"
                      >
                        {cat.name}
                      </Button>
                    ))}
                  </div>
                </ScrollArea>
              </div>

              {/* Products Grid */}
              <ScrollArea className="flex-1">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 pr-4">
                  {filteredProducts.map((product) => (
                    <Card
                      key={product.id}
                      className="cursor-pointer group hover:shadow-lg hover:border-primary/50 transition-all duration-200 overflow-hidden"
                      onClick={() => openProductModal(product)}
                    >
                      {/* Product Image */}
                      <div className="aspect-square relative bg-muted overflow-hidden">
                        {product.image_url ? (
                          <img
                            src={product.image_url}
                            alt={product.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted to-muted-foreground/10">
                            <ShoppingBag className="h-10 w-10 text-muted-foreground/30" />
                          </div>
                        )}
                        {/* Quick add overlay */}
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <div className="bg-white rounded-full p-2 shadow-lg transform scale-90 group-hover:scale-100 transition-transform">
                            <Plus className="h-5 w-5 text-primary" />
                          </div>
                        </div>
                      </div>
                      {/* Product Info */}
                      <CardContent className="p-3">
                        <p className="font-medium text-sm line-clamp-2 min-h-[2.5rem]">
                          {product.name}
                        </p>
                        <p className="text-base text-primary font-bold mt-1">
                          {formatCurrency(product.price)}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
                {filteredProducts.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <Search className="h-12 w-12 mb-3 opacity-30" />
                    <p>Nenhum produto encontrado</p>
                  </div>
                )}
              </ScrollArea>
            </div>

            {/* Cart Sidebar */}
            <div className="w-80 border-l bg-muted/30 flex flex-col">
              {/* Cart Header */}
              <div className="p-4 border-b bg-background">
                <h3 className="font-semibold flex items-center gap-2">
                  <Receipt className="h-4 w-4 text-primary" />
                  Itens Selecionados
                  {cart.length > 0 && (
                    <Badge variant="secondary" className="ml-auto">
                      {cart.reduce((sum, item) => sum + item.quantity, 0)}
                    </Badge>
                  )}
                </h3>
              </div>

              {/* Cart Items */}
              <ScrollArea className="flex-1 p-4">
                {cart.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                    <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-3">
                      <ShoppingBag className="h-8 w-8 opacity-30" />
                    </div>
                    <p className="text-sm text-center">
                      Clique nos produtos para adicionar à comanda
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {cart.map((item, index) => (
                      <Card key={index} className="overflow-hidden">
                        <CardContent className="p-0">
                          <div className="flex gap-3">
                            {/* Item Image */}
                            <div className="w-16 h-16 flex-shrink-0 bg-muted">
                              {item.product.image_url ? (
                                <img
                                  src={item.product.image_url}
                                  alt={item.product.name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <ShoppingBag className="h-5 w-5 text-muted-foreground/30" />
                                </div>
                              )}
                            </div>
                            {/* Item Info */}
                            <div className="flex-1 py-2 pr-2">
                              <div className="flex items-start justify-between">
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium line-clamp-1">
                                    {item.product.name}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {item.quantity}x {formatCurrency(item.calculatedPrice)}
                                  </p>
                                  {item.options.length > 0 && (
                                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                                      {item.options.map(o => o.name).join(', ')}
                                    </p>
                                  )}
                                </div>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                  onClick={() => setCart((prev) => prev.filter((_, i) => i !== index))}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                              <p className="text-sm font-bold text-primary mt-1">
                                {formatCurrency(item.calculatedPrice * item.quantity)}
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </ScrollArea>

              {/* Cart Footer */}
              <div className="p-4 border-t bg-background space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-medium">{formatCurrency(cartTotal)}</span>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <span className="text-lg font-semibold">Total</span>
                  <span className="text-xl font-bold text-primary">{formatCurrency(cartTotal)}</span>
                </div>
                <Button
                  onClick={handleAddItemsToComanda}
                  disabled={cart.length === 0 || addingItems}
                  className="w-full h-12 text-base"
                  size="lg"
                >
                  {addingItems ? (
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  ) : (
                    <Check className="h-5 w-5 mr-2" />
                  )}
                  Confirmar Itens
                </Button>
              </div>
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
      <CloseComandaDialog
        open={showCloseDialog}
        onOpenChange={setShowCloseDialog}
        comandaNumber={selectedComanda?.number || 0}
        total={
          selectedComanda
            ? Math.max(
                selectedComanda.total || 0,
                comandaItems.reduce((sum, item) => sum + (item.total_price || 0), 0)
              )
            : 0
        }
        onConfirm={handleCloseComanda}
        isLoading={closingComanda}
      />

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
