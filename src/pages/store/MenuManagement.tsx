import React, { useEffect, useState, useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Plus, Loader2, GripVertical, Trash2, ChevronDown, Settings2, Link2, Share2, Clock, FileText, X, Upload, Eye, TrendingUp, ArrowUpDown, Pencil, Pizza } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ImageUpload } from '@/components/ui/image-upload';
import { CurrencyInput } from '@/components/ui/currency-input';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { SortableProductCard } from '@/components/menu/SortableProductCard';
import { ComboEditor } from '@/components/menu/ComboEditor';
import { AcaiSizeOptionsEditor } from '@/components/menu/AcaiSizeOptionsEditor';
import { ProductFormSheet } from '@/components/menu/ProductFormSheet';
import { CategoryPeriodLinker } from '@/components/menu/CategoryPeriodLinker';
import { BulkImportModal } from '@/components/menu/BulkImportModal';
import { MenuPreviewModal } from '@/components/menu/MenuPreviewModal';
import { PizzaManagementPanel } from '@/components/menu/PizzaManagementPanel';
import { useFormDraft, isDraftMeaningful } from '@/hooks/useFormDraft';
import { cn } from '@/lib/utils';

interface CategoryFormDraft {
  name: string;
  description: string;
  type: 'normal' | 'pizza' | 'acai' | 'combos';
}

interface Category {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  sort_order: number;
  is_active: boolean;
  category_type?: string;
}

interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  promotional_price?: number | null;
  image_url: string | null;
  is_active: boolean;
  is_featured: boolean;
  category_id: string | null;
  preparation_time_minutes: number | null;
  sort_order: number;
  product_type?: string;
}

interface Combo {
  id: string;
  product_id: string;
  price_type: 'fixed' | 'percentage';
  discount_percent: number | null;
}

export default function MenuManagement() {
  const { user, staffCompany } = useAuth();
  const { toast } = useToast();
  const { getDraft: getCategoryDraft, saveDraft: saveCategoryDraft, clearDraft: clearCategoryDraft } = useFormDraft<CategoryFormDraft>('category');
  const { getDraft: getProductDraft, clearDraft: clearProductDraft } = useFormDraft<any>('product');

  const [companyId, setCompanyId] = useState<string | null>(null);
  const [companySlug, setCompanySlug] = useState<string | null>(null);
  const [menuPublished, setMenuPublished] = useState(false);
  const [publishingMenu, setPublishingMenu] = useState(false);
  const [publishingMode, setPublishingMode] = useState<'publish' | 'unpublish'>('publish');

  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [combos, setCombos] = useState<Combo[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const [productSheet, setProductSheet] = useState<{
    open: boolean;
    product: Product | null;
    categoryId: string | null;
  }>({ open: false, product: null, categoryId: null });

  // Draft banner state
  const [pendingProductDraft, setPendingProductDraft] = useState<{ name: string } | null>(null);
  const [pendingCategoryDraft, setPendingCategoryDraft] = useState<{ name: string } | null>(null);

  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    product: Product | null;
  }>({ open: false, product: null });
  const [deleting, setDeleting] = useState(false);

  const [deleteCategoryDialog, setDeleteCategoryDialog] = useState<{
    open: boolean;
    category: Category | null;
  }>({ open: false, category: null });
  const [deletingCategory, setDeletingCategory] = useState(false);

  const [categoryDialog, setCategoryDialog] = useState<{
    open: boolean;
    category: Category | null;
  }>({ open: false, category: null });
  const [savingCategory, setSavingCategory] = useState(false);
  const [categoryType, setCategoryType] = useState<'normal' | 'pizza' | 'acai' | 'combos'>('normal');

  const [comboSheet, setComboSheet] = useState<{
    open: boolean;
    comboId: string | null;
    productId: string | null;
    categoryId: string | null;
  }>({ open: false, comboId: null, productId: null, categoryId: null });

  const [pizzaCategoryIds, setPizzaCategoryIds] = useState<string[]>([]);
  const [acaiCategoryIds, setAcaiCategoryIds] = useState<string[]>([]);
  const [pizzaCategoryBasePrices, setPizzaCategoryBasePrices] = useState<Record<string, number>>({});
  const [acaiCategoryBasePrices, setAcaiCategoryBasePrices] = useState<Record<string, number>>({});
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});
  const [acaiEditorSheet, setAcaiEditorSheet] = useState<{ open: boolean; categoryId: string; categoryName: string }>({ open: false, categoryId: '', categoryName: '' });
  const [showDayPeriodsEditor, setShowDayPeriodsEditor] = useState(false);
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [menuPreviewOpen, setMenuPreviewOpen] = useState(false);
  const [pizzaPanelOpen, setPizzaPanelOpen] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor));

  // Check for pending drafts on mount
  useEffect(() => {
    const productDraft = getProductDraft();
    if (productDraft && isDraftMeaningful(productDraft.data, ['name'])) {
      setPendingProductDraft({ name: productDraft.data.name || 'Novo produto' });
    }
    
    const categoryDraft = getCategoryDraft();
    if (categoryDraft && isDraftMeaningful(categoryDraft.data, ['name'])) {
      setPendingCategoryDraft({ name: categoryDraft.data.name || 'Nova categoria' });
    }
  }, [getProductDraft, getCategoryDraft]);

  // Auto-save category draft when dialog is open
  const saveCategoryDraftIfMeaningful = useCallback(() => {
    if (categoryDialog.open && !categoryDialog.category?.id) {
      const draftData: CategoryFormDraft = {
        name: categoryDialog.category?.name || '',
        description: categoryDialog.category?.description || '',
        type: categoryType,
      };
      if (isDraftMeaningful(draftData, ['name'])) {
        saveCategoryDraft(draftData, draftData.name || 'Nova categoria');
      }
    }
  }, [categoryDialog, categoryType, saveCategoryDraft]);

  useEffect(() => {
    if (categoryDialog.open) {
      const timer = setTimeout(saveCategoryDraftIfMeaningful, 500);
      return () => clearTimeout(timer);
    }
  }, [categoryDialog, saveCategoryDraftIfMeaningful]);

  const handleContinueProductDraft = () => {
    setProductSheet({ open: true, product: null, categoryId: null });
    setPendingProductDraft(null);
  };

  const handleDismissProductDraft = () => {
    clearProductDraft();
    setPendingProductDraft(null);
  };

  const handleContinueCategoryDraft = () => {
    const draft = getCategoryDraft();
    if (draft) {
      setCategoryType(draft.data.type || 'normal');
      setCategoryDialog({
        open: true,
        category: {
          id: '',
          name: draft.data.name || '',
          description: draft.data.description || '',
          image_url: null,
          sort_order: 0,
          is_active: true,
        },
      });
      // Clear the draft immediately after restoring it
      clearCategoryDraft();
      toast({
        title: 'Rascunho restaurado',
        description: `Continuando a criar "${draft.data.name || 'categoria'}"`,
      });
    }
    setPendingCategoryDraft(null);
  };

  const handleDismissCategoryDraft = () => {
    clearCategoryDraft();
    setPendingCategoryDraft(null);
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const loadData = async () => {
    if (!user) return;

    try {
      setLoading(true);

      const companyQuery = staffCompany?.companyId
        ? supabase
            .from('companies')
            .select('id, slug, menu_published')
            .eq('id', staffCompany.companyId)
            .single()
        : supabase
            .from('companies')
            .select('id, slug, menu_published')
            .eq('owner_id', user.id)
            .single();

      const { data: company, error: companyError } = await companyQuery;
      if (companyError) throw companyError;

      setCompanyId(company.id);
      setCompanySlug(company.slug);
      setMenuPublished(!!company.menu_published);

      const [{ data: categoriesData, error: categoriesError }, { data: productsData, error: productsError }, { data: combosData, error: combosError }, { data: pizzaCategoriesData, error: pizzaCategoriesError }, { data: acaiCategoriesData, error: acaiCategoriesError }] =
        await Promise.all([
          supabase
            .from('categories')
            .select('*, category_type')
            .eq('company_id', company.id)
            .order('sort_order'),
          supabase
            .from('products')
            .select('*')
            .eq('company_id', company.id)
            .order('sort_order'),
          supabase
            .from('combos')
            .select('*')
            .eq('company_id', company.id),
          supabase
            .from('pizza_categories')
            .select('category_id')
            .eq('company_id', company.id),
          supabase
            .from('acai_categories')
            .select('category_id')
            .eq('company_id', company.id),
        ]);
 
       if (categoriesError) throw categoriesError;
       if (productsError) throw productsError;
       if (combosError) throw combosError;
       if (pizzaCategoriesError) throw pizzaCategoriesError;
       if (acaiCategoriesError) throw acaiCategoriesError;
 
       setCategories(categoriesData || []);
       setProducts(productsData || []);
       setCombos((combosData || []).map(c => ({ ...c, price_type: c.price_type as 'fixed' | 'percentage' })));
       setPizzaCategoryIds((pizzaCategoriesData || []).map((pc: any) => pc.category_id));
       setAcaiCategoryIds((acaiCategoriesData || []).map((ac: any) => ac.category_id));
    } catch (error: any) {
      console.error(error);
      toast({
        title: 'Erro ao carregar cardápio',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Preço base por categoria de pizza (tamanho "Grande" ou primeiro tamanho)
  useEffect(() => {
    const loadPizzaBasePrices = async () => {
      try {
        if (!categories.length) {
          setPizzaCategoryBasePrices({});
          return;
        }

        const categoryIds = categories.map((c) => c.id);

        const { data, error } = await supabase
          .from('pizza_category_sizes')
          .select('category_id, name, base_price')
          .in('category_id', categoryIds);

        if (error) {
          console.error('Erro ao carregar tamanhos de pizza (painel):', error);
          return;
        }

        const map: Record<string, number> = {};

        categoryIds.forEach((catId) => {
          const sizesForCategory = (data || []).filter((row: any) => row.category_id === catId);
          if (!sizesForCategory.length) return;

          const grande = sizesForCategory.find((s: any) =>
            String(s.name || '').toLowerCase().includes('grande')
          );
          const chosen = grande || sizesForCategory[0];
          const basePrice = Number(chosen.base_price || 0);
          if (basePrice > 0) {
            map[catId] = basePrice;
          }
        });

        setPizzaCategoryBasePrices(map);
      } catch (err) {
        console.error('Erro inesperado ao carregar preços base de pizza (painel):', err);
      }
    };

    loadPizzaBasePrices();
  }, [categories]);
  // Preço base por categoria de pizza (tamanho "Grande" ou primeiro tamanho)
  useEffect(() => {
    const loadPizzaBasePrices = async () => {
      try {
        if (!pizzaCategoryIds.length) {
          setPizzaCategoryBasePrices({});
          return;
        }

        const { data, error } = await supabase
          .from('pizza_category_sizes')
          .select('category_id, name, base_price')
          .in('category_id', pizzaCategoryIds);

        if (error) {
          console.error('Erro ao carregar tamanhos de pizza (painel):', error);
          return;
        }

        const map: Record<string, number> = {};

        pizzaCategoryIds.forEach((catId) => {
          const sizesForCategory = (data || []).filter((row: any) => row.category_id === catId);
          if (!sizesForCategory.length) return;

          const grande = sizesForCategory.find((s: any) =>
            String(s.name || '').toLowerCase().includes('grande')
          );
          const chosen = grande || sizesForCategory[0];
          const basePrice = Number(chosen.base_price || 0);
          if (basePrice > 0) {
            map[catId] = basePrice;
          }
        });

        setPizzaCategoryBasePrices(map);
      } catch (err) {
        console.error('Erro inesperado ao carregar preços base de pizza (painel):', err);
      }
    };

    loadPizzaBasePrices();
  }, [pizzaCategoryIds]);

  // Preço base por categoria de açaí (primeiro tamanho)
  useEffect(() => {
    const loadAcaiBasePrices = async () => {
      try {
        if (!acaiCategoryIds.length) {
          setAcaiCategoryBasePrices({});
          return;
        }

        const { data, error } = await supabase
          .from('acai_category_sizes')
          .select('category_id, name, base_price')
          .in('category_id', acaiCategoryIds);

        if (error) {
          console.error('Erro ao carregar tamanhos de açaí (painel):', error);
          return;
        }

        const map: Record<string, number> = {};

        acaiCategoryIds.forEach((catId) => {
          const sizesForCategory = (data || []).filter((row: any) => row.category_id === catId);
          if (!sizesForCategory.length) return;

          const chosen = sizesForCategory[0];
          const basePrice = Number(chosen.base_price || 0);
          if (basePrice > 0) {
            map[catId] = basePrice;
          }
        });

        setAcaiCategoryBasePrices(map);
      } catch (err) {
        console.error('Erro inesperado ao carregar preços base de açaí (painel):', err);
      }
    };

    loadAcaiBasePrices();
  }, [acaiCategoryIds]);

  const toggleMenuPublished = async () => {
    if (!companyId || publishingMenu) return;

    const newValue = !menuPublished;

    // Validação: não permitir publicar sem ao menos um produto em uma categoria
    if (newValue) {
      const hasProductInCategory = products.some(
        (p) => p.category_id && categories.some((c) => c.id === p.category_id)
      );

      if (!hasProductInCategory) {
        toast({
          title: 'Cardápio sem produtos',
          description: 'Adicione pelo menos um produto em uma categoria antes de publicar o cardápio.',
          variant: 'destructive',
        });
        return;
      }
    }

    try {
      setPublishingMode(newValue ? 'publish' : 'unpublish');
      setPublishingMenu(true);
      const { error } = await supabase
        .from('companies')
        .update({ menu_published: newValue })
        .eq('id', companyId);

      if (error) throw error;

      setMenuPublished(newValue);
      toast({
        title: newValue
          ? 'Parabéns, seu cardápio foi publicado'
          : 'Cardápio em modo rascunho',
        description: newValue
          ? 'Seu cardápio agora está disponível no link público.'
          : 'Seu cardápio deixou de estar público; apenas o preview funciona.',
      });
    } catch (error: any) {
      console.error(error);
      toast({
        title: 'Erro ao atualizar publicação do cardápio',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setTimeout(() => setPublishingMenu(false), 1500);
    }
  };

  const saveCategory = async (values: {
    name: string;
    description: string;
    type: 'normal' | 'pizza' | 'acai' | 'combos';
    id?: string;
  }) => {
    if (!companyId || !values.name.trim()) return;

    try {
      setSavingCategory(true);
      
      // Check if we're editing an existing category
      if (values.id) {
        const { error } = await supabase
          .from('categories')
          .update({
            name: values.name.trim(),
            description: values.description.trim() || null,
          })
          .eq('id', values.id);
        if (error) throw error;
        toast({ title: 'Categoria atualizada com sucesso' });
      } else {
        // Create new category
        const payload = {
          company_id: companyId,
          name: values.name.trim(),
          description: values.description.trim() || null,
          is_active: true,
          category_type: values.type === 'combos' ? 'combos' : 'products',
        };

        const { data, error } = await supabase
          .from('categories')
          .insert(payload)
          .select('*')
          .single();
        if (error) throw error;

        if (values.type === 'pizza') {
          const { error: pizzaError } = await supabase.from('pizza_categories').insert({
            company_id: companyId,
            category_id: data.id,
          });
          if (pizzaError) throw pizzaError;
        }

        if (values.type === 'acai') {
          const { error: acaiError } = await supabase.from('acai_categories').insert({
            company_id: companyId,
            category_id: data.id,
          });
          if (acaiError) throw acaiError;
        }

        toast({ title: 'Categoria criada com sucesso' });
        clearCategoryDraft();
        setPendingCategoryDraft(null);
      }
      
      setCategoryDialog({ open: false, category: null });
      setCategoryType('normal');
      await loadData();
    } catch (error: any) {
      console.error(error);
      toast({
        title: 'Erro ao salvar categoria',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setSavingCategory(false);
    }
  };

  const handleCategoryDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = categories.findIndex((c) => c.id === active.id);
    const newIndex = categories.findIndex((c) => c.id === over.id);

    const reordered = arrayMove(categories, oldIndex, newIndex);
    setCategories(reordered);

    try {
      await Promise.all(
        reordered.map((cat, index) =>
          supabase.from('categories').update({ sort_order: index }).eq('id', cat.id),
        ),
      );
    } catch (error: any) {
      console.error(error);
      toast({
        title: 'Erro ao salvar ordem das categorias',
        description: error.message,
        variant: 'destructive',
      });
      loadData();
    }
  };

  const handleProductDragEnd = async (event: DragEndEvent, categoryId: string) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const categoryProducts = products.filter((p) => p.category_id === categoryId);
    const oldIndex = categoryProducts.findIndex((p) => p.id === active.id);
    const newIndex = categoryProducts.findIndex((p) => p.id === over.id);

    const reorderedCategoryProducts = arrayMove(categoryProducts, oldIndex, newIndex);

    const otherProducts = products.filter((p) => p.category_id !== categoryId);
    const newProducts = [...otherProducts, ...reorderedCategoryProducts];

    setProducts(newProducts);

    try {
      await Promise.all(
        reorderedCategoryProducts.map((prod, index) =>
          supabase
            .from('products')
            .update({ sort_order: index })
            .eq('id', prod.id),
        ),
      );
    } catch (error: any) {
      console.error(error);
      toast({
        title: 'Erro ao salvar ordem dos produtos',
        description: error.message,
        variant: 'destructive',
      });
      loadData();
    }
  };

  const openNewProduct = (categoryId: string) => {
    setProductSheet({ open: true, product: null, categoryId });
  };
 
  const openEditProduct = (product: Product) => {
    setProductSheet({ open: true, product, categoryId: product.category_id });
  };

  const toggleProductActive = async (product: Product) => {
    try {
      const { error } = await supabase
        .from('products')
        .update({ is_active: !product.is_active })
        .eq('id', product.id);
      if (error) throw error;
      await loadData();
    } catch (error: any) {
      toast({
        title: 'Erro ao atualizar produto',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const confirmDeleteProduct = async () => {
    if (!deleteDialog.product) return;

    try {
      setDeleting(true);
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', deleteDialog.product.id);
      if (error) throw error;
      toast({ title: 'Produto excluído' });
      setDeleteDialog({ open: false, product: null });
      await loadData();
    } catch (error: any) {
      toast({
        title: 'Erro ao excluir produto',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
    }
  };

  const filteredProducts = (categoryId: string) => {
    return products.filter((product) => {
      if (product.category_id !== categoryId) return false;
      if (!searchQuery.trim()) return true;
      const query = searchQuery.toLowerCase();
      return (
        product.name.toLowerCase().includes(query) ||
        product.description?.toLowerCase().includes(query)
      );
    });
  };

  const openNewCombo = (categoryId: string) => {
    if (!companyId) return;
    // Apenas abre o sheet sem criar produto - o produto será criado ao salvar
    setComboSheet({ open: true, comboId: null, productId: null, categoryId });
  };

  const openEditCombo = (product: Product) => {
    const combo = combos.find((c) => c.product_id === product.id);
    setComboSheet({ open: true, comboId: combo?.id || null, productId: product.id, categoryId: product.category_id });
  };

  const emptyCategories = categories.filter(
    (category) => !products.some((product) => product.category_id === category.id),
  );

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Pending Draft Banners */}
        {(pendingProductDraft || pendingCategoryDraft) && (
          <div className="space-y-2">
            {pendingProductDraft && (
              <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-primary/20 bg-primary/5">
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-sm font-medium">Rascunho de produto pendente</p>
                    <p className="text-xs text-muted-foreground">
                      Continue criando "{pendingProductDraft.name}"
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={handleContinueProductDraft}>
                    Continuar
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={handleDismissProductDraft}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
            {pendingCategoryDraft && (
              <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-primary/20 bg-primary/5">
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-sm font-medium">Rascunho de categoria pendente</p>
                    <p className="text-xs text-muted-foreground">
                      Continue criando "{pendingCategoryDraft.name}"
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={handleContinueCategoryDraft}>
                    Continuar
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={handleDismissCategoryDraft}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold">Gerenciar Cardápio</h1>
            <p className="text-muted-foreground mt-1">
              Crie categorias, adicione produtos e organize a ordem que aparece para seus clientes.
            </p>
          </div>
          {companySlug && (
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
              <Button
                variant={menuPublished ? 'outline' : 'default'}
                onClick={() => {
                  setCategoryType('normal');
                  toggleMenuPublished();
                }}
                disabled={publishingMenu}
              >
                {publishingMenu ? (
                  <span className="inline-flex items-center gap-2 animate-pulse">
                    <span className="flex gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                      <span className="h-1.5 w-1.5 rounded-full bg-primary/70" />
                      <span className="h-1.5 w-1.5 rounded-full bg-primary/40" />
                    </span>
                    {menuPublished
                      ? 'Atualizando cardápio...'
                      : 'Publicando seu cardápio...'}
                  </span>
                ) : menuPublished ? (
                  'Despublicar cardápio'
                ) : (
                  'Publicar cardápio'
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  const baseUrl = `/menu/${companySlug}`;
                  const url = menuPublished ? baseUrl : `${baseUrl}?preview=1`;
                  window.open(url, '_blank');
                }}
              >
                {menuPublished ? 'Ver cardápio publicado' : 'Pré-visualizar cardápio'}
              </Button>
              {menuPublished && (
                <Button
                  variant="outline"
                  onClick={async () => {
                    const origin = window.location.origin;

                    // Subdomínio dedicado para share (Cloudflare Worker → edge function com OG tags)
                    const shareUrl = `https://s.cardpondelivery.com/${companySlug}`;



                    try {
                      await navigator.clipboard.writeText(shareUrl);
                      toast({
                        title: 'Link copiado!',
                        description: 'O link do cardápio foi copiado para a área de transferência. Ao compartilhar em redes sociais, será exibido com a logo e nome da sua loja.',
                      });
                    } catch (err) {
                      toast({
                        variant: 'destructive',
                        title: 'Erro',
                        description: 'Não foi possível copiar o link.',
                      });
                    }
                  }}
                >
                  <Link2 className="h-4 w-4 mr-1" />
                  Copiar link
                </Button>
              )}
            </div>
          )}
        </div>
 
        <div className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="max-w-md w-full sm:w-auto">
              <Input
                placeholder="Buscar produtos..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline">
                    <ArrowUpDown className="h-4 w-4 mr-1" />
                    Ordenar
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={async () => {
                    // Sort by sales (popularity)
                    const sorted = [...products].sort((a, b) => ((b as any).sales_count || 0) - ((a as any).sales_count || 0));
                    
                    // Group by category and update sort_order
                    const categoryGroups: Record<string, typeof products> = {};
                    sorted.forEach(p => {
                      if (p.category_id) {
                        if (!categoryGroups[p.category_id]) categoryGroups[p.category_id] = [];
                        categoryGroups[p.category_id].push(p);
                      }
                    });
                    
                    try {
                      for (const catId of Object.keys(categoryGroups)) {
                        await Promise.all(
                          categoryGroups[catId].map((prod, index) =>
                            supabase.from('products').update({ sort_order: index }).eq('id', prod.id)
                          )
                        );
                      }
                      toast({ title: 'Produtos ordenados por popularidade' });
                      await loadData();
                    } catch (error: any) {
                      toast({ title: 'Erro ao ordenar', description: error.message, variant: 'destructive' });
                    }
                  }}>
                    <TrendingUp className="h-4 w-4 mr-2" />
                    Por mais vendidos
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={async () => {
                    // Sort alphabetically
                    const sorted = [...products].sort((a, b) => a.name.localeCompare(b.name));
                    
                    const categoryGroups: Record<string, typeof products> = {};
                    sorted.forEach(p => {
                      if (p.category_id) {
                        if (!categoryGroups[p.category_id]) categoryGroups[p.category_id] = [];
                        categoryGroups[p.category_id].push(p);
                      }
                    });
                    
                    try {
                      for (const catId of Object.keys(categoryGroups)) {
                        await Promise.all(
                          categoryGroups[catId].map((prod, index) =>
                            supabase.from('products').update({ sort_order: index }).eq('id', prod.id)
                          )
                        );
                      }
                      toast({ title: 'Produtos ordenados alfabeticamente' });
                      await loadData();
                    } catch (error: any) {
                      toast({ title: 'Erro ao ordenar', description: error.message, variant: 'destructive' });
                    }
                  }}>
                    <ArrowUpDown className="h-4 w-4 mr-2" />
                    Alfabética (A-Z)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                variant="outline"
                onClick={() => setBulkImportOpen(true)}
                title="Importe produtos de uma planilha Excel/CSV"
              >
                <Upload className="h-4 w-4 mr-1" />
                Importar
              </Button>
              {companySlug && (
                <Button
                  variant="outline"
                  onClick={() => setMenuPreviewOpen(true)}
                >
                  <Eye className="h-4 w-4 mr-1" />
                  Preview
                </Button>
              )}
              {pizzaCategoryIds.length > 0 && (
                <Button
                  variant="outline"
                  onClick={() => setPizzaPanelOpen(true)}
                  title="Gerencie tamanhos, massas, bordas e regras de pizza"
                >
                  <Pizza className="h-4 w-4 mr-1" />
                  Pizzas
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => setShowDayPeriodsEditor(!showDayPeriodsEditor)}
                title="Configure horários para exibir categorias específicas (ex: café da manhã, almoço)"
              >
                <Clock className="h-4 w-4 mr-1" />
                Períodos
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setCategoryType('normal');
                  setCategoryDialog({ open: true, category: null });
                }}
              >
                <Plus className="h-4 w-4 mr-1" />
                Nova categoria
              </Button>
            </div>
          </div>

          {showDayPeriodsEditor && companyId && (
            <Card className="p-4">
              <CategoryPeriodLinker
                companyId={companyId}
                categories={categories}
              />
            </Card>
          )}

          {categories.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-12 flex flex-col items-center gap-4">
                <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <Plus className="h-8 w-8 text-primary" />
                </div>
                <div className="text-center space-y-2 max-w-md">
                  <h3 className="font-semibold text-lg">Monte seu cardápio digital</h3>
                  <p className="text-sm text-muted-foreground">
                    Comece criando suas <strong>categorias</strong> (ex: Lanches, Bebidas, Sobremesas).
                    Depois, adicione os <strong>produtos</strong> dentro de cada categoria.
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 mt-2">
                  <Button
                    onClick={() => {
                      setCategoryType('normal');
                      setCategoryDialog({ open: true, category: null });
                    }}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Criar primeira categoria
                  </Button>
                  <Button variant="outline" onClick={() => setBulkImportOpen(true)}>
                    <Upload className="h-4 w-4 mr-1" />
                    Importar de planilha
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-4">
                  💡 <strong>Dica:</strong> Você pode arrastar categorias e produtos para reorganizar a ordem no cardápio do cliente.
                </p>
              </CardContent>
            </Card>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleCategoryDragEnd}
            >
              <SortableContext
                items={categories.map((c) => c.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-6">
                  {categories.map((category) => {
                    const categoryProducts = filteredProducts(category.id).sort(
                      (a, b) => a.sort_order - b.sort_order,
                    );

                    const isCollapsed = collapsedCategories[category.id] ?? true;

                    return (
                      <SortableCategoryCard key={category.id} id={category.id}>
                        <Card className="shadow-sm">
                          <CardHeader className="flex flex-row items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <div data-drag-handle="true" className="cursor-grab active:cursor-grabbing">
                                <GripVertical className="h-4 w-4 text-muted-foreground" />
                              </div>
                              <button
                                type="button"
                                className="flex items-center gap-2 text-left hover:opacity-80 transition-opacity"
                                onClick={() =>
                                  setCollapsedCategories((prev) => ({
                                    ...prev,
                                    [category.id]: !isCollapsed,
                                  }))
                                }
                              >
                                <div>
                                  <CardTitle className="text-base flex items-center gap-2">
                                    {category.name}
                                    {category.category_type === 'combos' && (
                                      <Badge variant="secondary" className="text-[10px]">
                                        Combos
                                      </Badge>
                                    )}
                                    {!category.is_active && (
                                      <Badge variant="outline" className="text-[10px]">
                                        Inativa
                                      </Badge>
                                    )}
                                  </CardTitle>
                                  {category.description && (
                                    <p className="text-xs text-muted-foreground">
                                      {category.description}
                                    </p>
                                  )}
                                </div>
                                <ChevronDown
                                  className={cn(
                                    'h-4 w-4 text-muted-foreground transition-transform',
                                    !isCollapsed && 'rotate-180',
                                  )}
                                />
                              </button>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => {
                                  // Determine category type for editing
                                  let type: 'normal' | 'pizza' | 'acai' | 'combos' = 'normal';
                                  if (pizzaCategoryIds.includes(category.id)) type = 'pizza';
                                  else if (acaiCategoryIds.includes(category.id)) type = 'acai';
                                  else if (category.category_type === 'combos') type = 'combos';
                                  
                                  setCategoryType(type);
                                  setCategoryDialog({ open: true, category });
                                }}
                                title="Editar categoria"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              {acaiCategoryIds.includes(category.id) && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="gap-1"
                                  onClick={() =>
                                    setAcaiEditorSheet({ open: true, categoryId: category.id, categoryName: category.name })
                                  }
                                >
                                  <Settings2 className="h-4 w-4" />
                                  Tamanhos
                                </Button>
                              )}
                              {categoryProducts.length === 0 && (
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-8 w-8 text-destructive border-destructive/30"
                                  onClick={() =>
                                    setDeleteCategoryDialog({ open: true, category })
                                  }
                                  title="Excluir categoria vazia"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                              <Button
                                size="sm"
                                className="gap-1"
                                onClick={() => {
                                  if (category.category_type === 'combos') {
                                    openNewCombo(category.id);
                                  } else {
                                    openNewProduct(category.id);
                                  }
                                }}
                              >
                                <Plus className="h-4 w-4" />
                                {category.category_type === 'combos' ? 'Novo combo' : 'Adicionar item'}
                              </Button>
                            </div>
                          </CardHeader>
                          {!isCollapsed && (
                            <CardContent className="space-y-3">
                              {categoryProducts.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                  {category.category_type === 'combos'
                                    ? 'Nenhum combo nesta categoria ainda. Clique em "Novo combo" para criar.'
                                    : 'Nenhum item nesta categoria ainda. Clique em "Adicionar item".'
                                  }
                                </p>
                              ) : (
                                <DndContext
                                  sensors={sensors}
                                  collisionDetection={closestCenter}
                                  onDragEnd={(event) => handleProductDragEnd(event, category.id)}
                                >
                                  <SortableContext
                                    items={categoryProducts.map((p) => p.id)}
                                    strategy={verticalListSortingStrategy}
                                  >
                                    <div className="grid gap-3">
                                      {categoryProducts.map((product) => {
                                        const isCombo = combos.some((c) => c.product_id === product.id);
                                        const isPizzaCategory = product.category_id
                                          ? pizzaCategoryIds.includes(product.category_id)
                                          : false;

                                        const categoryPrice =
                                          isPizzaCategory && product.category_id && pizzaCategoryBasePrices[product.category_id]
                                            ? pizzaCategoryBasePrices[product.category_id]
                                            : 0;

                                        const displayPrice =
                                          Number(product.price) > 0 ? Number(product.price) : categoryPrice;

                                        return (
                                          <SortableProductCard
                                            key={product.id}
                                            product={{
                                              ...(product as any),
                                              price: displayPrice,
                                              product_type: isCombo
                                                ? 'combo'
                                                : isPizzaCategory
                                                  ? 'pizza'
                                                  : 'principal',
                                            }}
                                            onEdit={(p) => {
                                              const combo = combos.find((c) => c.product_id === p.id);
                                              if (combo) {
                                                openEditCombo(p as any);
                                              } else {
                                                openEditProduct(p as any);
                                              }
                                            }}
                                            onToggleActive={(p) => toggleProductActive(p as any)}
                                            onToggleFeatured={() => {}}
                                            onDelete={(p) =>
                                              setDeleteDialog({ open: true, product: p as any })
                                            }
                                          />
                                        );
                                      })}
                                    </div>
                                  </SortableContext>
                                </DndContext>
                              )}
                            </CardContent>
                          )}
                        </Card>
                      </SortableCategoryCard>
                    );
                  })}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>

        {/* Sheet de criação/edição de produto */}
        <ProductFormSheet
          open={productSheet.open}
          product={productSheet.product}
          categoryId={productSheet.categoryId}
          companyId={companyId || ''}
          isPizzaCategory={productSheet.categoryId ? pizzaCategoryIds.includes(productSheet.categoryId) : false}
          onClose={() => setProductSheet({ open: false, product: null, categoryId: null })}
          onSaved={loadData}
        />

        {/* Diálogo de criação/edição de categoria */}
        <Dialog
          open={categoryDialog.open}
          onOpenChange={(open) => {
            if (!open) {
              setCategoryDialog({ open: false, category: null });
              setCategoryType('normal');
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {categoryDialog.category ? 'Editar categoria' : 'Nova categoria'}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 mt-2">
              {/* Only show type selector for new categories */}
              {!categoryDialog.category?.id && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Tipo de categoria</p>
                  <p className="text-xs text-muted-foreground">
                    Escolha se esta categoria será usada para itens comuns ou para pizzas
                    com configurações especiais.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                    <button
                      type="button"
                      className={cn(
                        "text-left p-3 rounded-lg border-2 transition-all",
                        categoryType === 'normal' 
                          ? "border-primary bg-primary/5" 
                          : "border-border hover:border-primary/50"
                      )}
                      onClick={() => setCategoryType('normal')}
                    >
                      <p className="font-medium text-sm">🍔 Item padrão</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Lanches, bebidas, sobremesas e itens comuns
                      </p>
                    </button>
                    <button
                      type="button"
                      className={cn(
                        "text-left p-3 rounded-lg border-2 transition-all",
                        categoryType === 'pizza' 
                          ? "border-primary bg-primary/5" 
                          : "border-border hover:border-primary/50"
                      )}
                      onClick={() => setCategoryType('pizza')}
                    >
                      <p className="font-medium text-sm">🍕 Pizza</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Tamanhos, bordas, sabores e meia/meia
                      </p>
                    </button>
                    <button
                      type="button"
                      className={cn(
                        "text-left p-3 rounded-lg border-2 transition-all",
                        categoryType === 'acai' 
                          ? "border-primary bg-primary/5" 
                          : "border-border hover:border-primary/50"
                      )}
                      onClick={() => setCategoryType('acai')}
                    >
                      <p className="font-medium text-sm">🍇 Açaí</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Tamanhos, complementos e adicionais
                      </p>
                    </button>
                    <button
                      type="button"
                      className={cn(
                        "text-left p-3 rounded-lg border-2 transition-all",
                        categoryType === 'combos' 
                          ? "border-primary bg-primary/5" 
                          : "border-border hover:border-primary/50"
                      )}
                      onClick={() => setCategoryType('combos')}
                    >
                      <p className="font-medium text-sm">📦 Combos</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Monte promoções com múltiplos itens
                      </p>
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="categoryName">
                  Nome da categoria *
                </label>
                <Input
                  id="categoryName"
                  value={categoryDialog.category?.name || ''}
                  onChange={(e) =>
                    setCategoryDialog((prev) => ({
                      ...prev,
                      category: {
                        id: prev.category?.id || '',
                        name: e.target.value,
                        description: prev.category?.description || '',
                        image_url: prev.category?.image_url || null,
                        sort_order: prev.category?.sort_order || 0,
                        is_active: prev.category?.is_active ?? true,
                      },
                    }))
                  }
                  placeholder="Ex: Pizzas, Bebidas, Sobremesas"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="categoryDescription">
                  Descrição (opcional)
                </label>
                <Textarea
                  id="categoryDescription"
                  value={categoryDialog.category?.description || ''}
                  onChange={(e) =>
                    setCategoryDialog((prev) => ({
                      ...prev,
                      category: {
                        id: prev.category?.id || '',
                        name: prev.category?.name || '',
                        description: e.target.value,
                        image_url: prev.category?.image_url || null,
                        sort_order: prev.category?.sort_order || 0,
                        is_active: prev.category?.is_active ?? true,
                      },
                    }))
                  }
                  placeholder="Texto que aparece abaixo do nome da categoria"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setCategoryDialog({ open: false, category: null });
                  setCategoryType('normal');
                }}
              >
                Cancelar
              </Button>
              <Button
                onClick={() =>
                  saveCategory({
                    id: categoryDialog.category?.id || undefined,
                    name: categoryDialog.category?.name || '',
                    description: categoryDialog.category?.description || '',
                    type: categoryType,
                  })
                }
                disabled={savingCategory || !categoryDialog.category?.name?.trim()}
              >
                {savingCategory && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Salvar categoria
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
 
        {/* Diálogo de confirmação de exclusão de produto */}
        <Dialog
          open={deleteDialog.open}
          onOpenChange={(open) =>
            !open && setDeleteDialog({ open: false, product: null })
          }
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Excluir produto</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Tem certeza que deseja excluir o produto "{deleteDialog.product?.name}"?
            </p>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDeleteDialog({ open: false, product: null })}
              >
                Cancelar
              </Button>
              <Button
                variant="destructive"
                onClick={confirmDeleteProduct}
                disabled={deleting}
              >
                {deleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Excluir
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Diálogo de confirmação de exclusão de categoria */}
        <Dialog
          open={deleteCategoryDialog.open}
          onOpenChange={(open) =>
            !open && setDeleteCategoryDialog({ open: false, category: null })
          }
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Excluir categoria</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Tem certeza que deseja excluir a categoria "
              {deleteCategoryDialog.category?.name}"?
            </p>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() =>
                  setDeleteCategoryDialog({ open: false, category: null })
                }
              >
                Cancelar
              </Button>
              <Button
                variant="destructive"
                disabled={deletingCategory || !deleteCategoryDialog.category}
                onClick={async () => {
                  if (!deleteCategoryDialog.category) return;

                  try {
                    setDeletingCategory(true);
                    const { error } = await supabase
                      .from('categories')
                      .delete()
                      .eq('id', deleteCategoryDialog.category.id);

                    if (error) throw error;

                    toast({
                      title: 'Categoria excluída',
                      description: `A categoria "${deleteCategoryDialog.category.name}" foi removida.`,
                    });

                    setDeleteCategoryDialog({ open: false, category: null });
                    await loadData();
                  } catch (error: any) {
                    console.error(error);
                    toast({
                      title: 'Erro ao excluir categoria',
                      description: error.message,
                      variant: 'destructive',
                    });
                  } finally {
                    setDeletingCategory(false);
                  }
                }}
              >
                {deletingCategory && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Excluir categoria
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Sheet de edição de combo */}
        <Sheet
          open={comboSheet.open}
          onOpenChange={(open) =>
            !open && setComboSheet({ open: false, comboId: null, productId: null, categoryId: null })
          }
        >
          <SheetContent
            side="right"
            className="w-full sm:max-w-4xl max-h-[100vh] overflow-y-auto"
          >
            <SheetHeader>
              <SheetTitle>
                {comboSheet.comboId ? 'Editar Combo' : 'Novo Combo'}
              </SheetTitle>
              <SheetDescription>
                Configure os slots e produtos do combo.
              </SheetDescription>
            </SheetHeader>

            {(comboSheet.productId || comboSheet.categoryId) && companyId && (
              <ComboEditor
                comboId={comboSheet.comboId}
                productId={comboSheet.productId}
                categoryId={comboSheet.categoryId}
                companyId={companyId}
                onClose={() => {
                  setComboSheet({ open: false, comboId: null, productId: null, categoryId: null });
                  loadData();
                }}
              />
            )}
          </SheetContent>
        </Sheet>

        {publishingMenu && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-background/70 backdrop-blur-sm">
            <div className="relative max-w-sm w-full mx-4 rounded-2xl border bg-background/90 shadow-lg p-6 overflow-hidden animate-scale-in">
              <div className="absolute -top-6 left-6 h-24 w-24 rounded-full bg-primary/15 blur-2xl" />
              <div className="absolute -bottom-10 right-0 h-28 w-28 rounded-full bg-accent/20 blur-2xl" />

              <div className="relative space-y-4 text-center">
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  {publishingMode === 'publish' ? 'Publicando' : 'Atualizando'}
                </p>
                <h2 className="text-xl font-display font-semibold">
                  {publishingMode === 'publish'
                    ? 'Publicando seu cardápio'
                    : 'Deixando seu cardápio em modo rascunho'}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {publishingMode === 'publish'
                    ? 'Estamos deixando tudo pronto para os seus clientes.'
                    : 'Seu cardápio não ficará mais visível para os clientes.'}
                </p>

                <div className="mt-4 flex items-center justify-center">
                  <div className="relative h-20 w-20 rounded-full border-2 border-dashed border-primary/60 flex items-center justify-center animate-spin">
                    <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="block h-8 w-8 rounded-full border-2 border-primary border-t-transparent border-l-transparent" />
                    </div>
                    <span className="absolute -bottom-3 left-1/2 h-1 w-8 -translate-x-1/2 rounded-full bg-muted/70 blur-[1px]" />
                  </div>
                </div>

                <p className="mt-3 text-xs text-muted-foreground">
                  Não feche esta tela, é rapidinho.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Açaí Size Options Editor */}
        <AcaiSizeOptionsEditor
          categoryId={acaiEditorSheet.categoryId}
          categoryName={acaiEditorSheet.categoryName}
          open={acaiEditorSheet.open}
          onClose={() => setAcaiEditorSheet({ open: false, categoryId: '', categoryName: '' })}
        />

        {/* Pizza Management Panel */}
        {companyId && (
          <PizzaManagementPanel
            open={pizzaPanelOpen}
            onClose={() => setPizzaPanelOpen(false)}
            companyId={companyId}
          />
        )}

        {/* Bulk Import Modal */}
        {companyId && (
          <BulkImportModal
            open={bulkImportOpen}
            onClose={() => setBulkImportOpen(false)}
            companyId={companyId}
            categories={categories}
            onImported={loadData}
          />
        )}

        {/* Menu Preview Modal */}
        {companySlug && (
          <MenuPreviewModal
            open={menuPreviewOpen}
            onClose={() => setMenuPreviewOpen(false)}
            menuUrl={`/menu/${companySlug}`}
          />
        )}
      </div>
    </DashboardLayout>
  );
}

interface SortableCategoryCardProps {
  id: string;
  children: React.ReactNode;
}

function SortableCategoryCard({ id, children }: SortableCategoryCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const { onPointerDown, ...restListeners } = listeners as any;

  const handleAwareListeners = {
    ...restListeners,
    onPointerDown: (event: React.PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest('[data-drag-handle="true"]')) {
        return;
      }
      if (onPointerDown) {
        onPointerDown(event);
      }
    },
  };

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...handleAwareListeners}
      className="relative"
    >
      {children}
      {isDragging && (
        <div className="pointer-events-none absolute -top-3 right-6 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground shadow-sm animate-fade-in">
          Esta ordem define a posição no cardápio do cliente.
        </div>
      )}
    </div>
  );
}



