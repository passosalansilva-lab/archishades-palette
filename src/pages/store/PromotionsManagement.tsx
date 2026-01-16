import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Loader2,
  Plus,
  Trash2,
  Tag,
  Calendar,
  Percent,
  DollarSign,
  Package,
  ToggleLeft,
  ToggleRight,
  Pencil,
  BarChart3,
  Layers,
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ImageUpload } from '@/components/ui/image-upload';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useActivityLog } from '@/hooks/useActivityLog';
import { supabase } from '@/integrations/supabase/client';
import { PromotionAnalyticsDashboard } from '@/components/promotions/PromotionAnalyticsDashboard';

const promotionSchema = z.object({
  name: z.string().min(2, 'Nome é obrigatório').max(100),
  description: z.string().max(500).optional(),
  discount_type: z.enum(['percentage', 'fixed']),
  discount_value: z.coerce.number().min(0.01, 'Valor deve ser maior que zero'),
  product_id: z.string().optional(),
  category_id: z.string().optional(),
  expires_at: z.string().optional(),
});

type PromotionFormData = z.infer<typeof promotionSchema>;

interface Promotion {
  id: string;
  name: string;
  description: string | null;
  discount_type: string;
  discount_value: number;
  product_id: string | null;
  category_id: string | null;
  image_url: string | null;
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
  apply_to_all_sizes?: boolean | null;
  products?: { name: string } | null;
  categories?: { name: string } | null;
}

interface Product {
  id: string;
  name: string;
}

interface Category {
  id: string;
  name: string;
}

interface ProductSize {
  id: string;
  name: string;
  price_modifier: number;
}

export default function PromotionsManagement() {
  const { user, staffCompany } = useAuth();
  const { toast } = useToast();
  const { logActivity } = useActivityLog();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [editingPromotion, setEditingPromotion] = useState<Promotion | null>(null);
  const [applyTo, setApplyTo] = useState<'product' | 'category'>('product');
  
  // Size-related states
  const [productSizes, setProductSizes] = useState<ProductSize[]>([]);
  const [loadingSizes, setLoadingSizes] = useState(false);
  const [applyToAllSizes, setApplyToAllSizes] = useState(true);
  const [selectedSizeIds, setSelectedSizeIds] = useState<string[]>([]);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    watch,
    setValue,
  } = useForm<PromotionFormData>({
    resolver: zodResolver(promotionSchema),
    defaultValues: {
      discount_type: 'percentage',
    },
  });

  const discountType = watch('discount_type');
  const watchedProductId = watch('product_id');

  // Load sizes when product changes
  useEffect(() => {
    if (applyTo === 'product' && watchedProductId) {
      loadProductSizes(watchedProductId);
      setApplyToAllSizes(true);
      setSelectedSizeIds([]);
    } else {
      setProductSizes([]);
    }
  }, [watchedProductId, applyTo]);

  useEffect(() => {
    loadData();
  }, [user]);

  const loadData = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const companyQuery = staffCompany?.companyId
        ? supabase.from('companies').select('id').eq('id', staffCompany.companyId).maybeSingle()
        : supabase.from('companies').select('id').eq('owner_id', user.id).maybeSingle();

      const { data: companyData, error: companyError } = await companyQuery;

      if (companyError) throw companyError;
      if (!companyData) {
        setLoading(false);
        return;
      }

      setCompanyId(companyData.id);

      const [promotionsRes, productsRes, categoriesRes] = await Promise.all([
        supabase
          .from('promotions')
          .select('*, products(name), categories(name)')
          .eq('company_id', companyData.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('products')
          .select('id, name')
          .eq('company_id', companyData.id)
          .eq('is_active', true),
        supabase
          .from('categories')
          .select('id, name')
          .eq('company_id', companyData.id)
          .eq('is_active', true),
      ]);

      if (promotionsRes.error) throw promotionsRes.error;
      if (productsRes.error) throw productsRes.error;
      if (categoriesRes.error) throw categoriesRes.error;

      setPromotions(promotionsRes.data || []);
      setProducts(productsRes.data || []);
      setCategories(categoriesRes.data || []);
    } catch (error: any) {
      console.error('Error loading promotions:', error);
      toast({
        title: 'Erro ao carregar',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Load sizes for a specific product
  const loadProductSizes = async (productId: string) => {
    if (!productId) {
      setProductSizes([]);
      return;
    }

    setLoadingSizes(true);
    try {
      // Find size group for this product
      const { data: groups } = await supabase
        .from('product_option_groups')
        .select('id, name')
        .eq('product_id', productId);

      const sizeGroup = groups?.find(g => {
        const name = (g.name || '').toLowerCase().trim();
        return name === 'tamanho' || name === 'tamanhos' || name.includes('tamanho');
      });

      if (!sizeGroup) {
        setProductSizes([]);
        setLoadingSizes(false);
        return;
      }

      // Get options for this size group
      const { data: options } = await supabase
        .from('product_options')
        .select('id, name, price_modifier')
        .eq('group_id', sizeGroup.id)
        .eq('is_available', true)
        .order('sort_order');

      setProductSizes(options || []);
    } catch (error) {
      console.error('Error loading product sizes:', error);
      setProductSizes([]);
    } finally {
      setLoadingSizes(false);
    }
  };

  // Load selected sizes for a promotion
  const loadPromotionSizes = async (promotionId: string) => {
    try {
      // Query the promotion_sizes table if it exists
      // This uses a raw query approach to handle the case where the table might not exist yet
      const { data, error } = await supabase
        .from('promotion_sizes' as any)
        .select('product_option_id')
        .eq('promotion_id', promotionId);

      if (error) {
        // Table might not exist yet, just use empty array
        console.log('promotion_sizes table not available yet:', error.message);
        setSelectedSizeIds([]);
        return;
      }

      setSelectedSizeIds((data || []).map((s: any) => s.product_option_id));
    } catch (error) {
      console.error('Error loading promotion sizes:', error);
      setSelectedSizeIds([]);
    }
  };

  const openCreateDialog = () => {
    setEditingPromotion(null);
    setImageUrl(null);
    setApplyTo('product');
    setProductSizes([]);
    setApplyToAllSizes(true);
    setSelectedSizeIds([]);
    reset({
      name: '',
      description: '',
      discount_type: 'percentage',
      discount_value: 0,
      product_id: '',
      category_id: '',
      expires_at: '',
    });
    setDialogOpen(true);
  };

  const openEditDialog = async (promotion: Promotion) => {
    setEditingPromotion(promotion);
    setImageUrl(promotion.image_url);
    
    // Determine applyTo based on existing data
    if (promotion.category_id) {
      setApplyTo('category');
      setProductSizes([]);
    } else {
      setApplyTo('product');
      if (promotion.product_id) {
        await loadProductSizes(promotion.product_id);
        await loadPromotionSizes(promotion.id);
      }
    }
    
    // Set size mode
    setApplyToAllSizes(promotion.apply_to_all_sizes !== false);
    
    // Format datetime for input
    let expiresAt = '';
    if (promotion.expires_at) {
      const date = new Date(promotion.expires_at);
      expiresAt = date.toISOString().slice(0, 16);
    }

    reset({
      name: promotion.name,
      description: promotion.description || '',
      discount_type: promotion.discount_type as 'percentage' | 'fixed',
      discount_value: promotion.discount_value,
      product_id: promotion.product_id || '',
      category_id: promotion.category_id || '',
      expires_at: expiresAt,
    });
    setDialogOpen(true);
  };

  const onSubmit = async (data: PromotionFormData) => {
    if (!companyId) return;

    setSaving(true);
    try {
      const promotionData = {
        company_id: companyId,
        name: data.name,
        description: data.description || null,
        discount_type: data.discount_type,
        discount_value: data.discount_value,
        product_id: applyTo === 'product' ? (data.product_id || null) : null,
        category_id: applyTo === 'category' ? (data.category_id || null) : null,
        image_url: imageUrl,
        expires_at: data.expires_at || null,
        apply_to_all_sizes: applyToAllSizes,
      };

      let promotionId: string;

      if (editingPromotion) {
        // Update existing promotion
        const { error } = await supabase
          .from('promotions')
          .update(promotionData)
          .eq('id', editingPromotion.id);

        if (error) throw error;
        promotionId = editingPromotion.id;

        await logActivity({
          actionType: 'update',
          entityType: 'promotion',
          entityId: editingPromotion.id,
          entityName: data.name,
          description: `Promoção "${data.name}" atualizada`,
          oldData: { name: editingPromotion.name, discount_value: editingPromotion.discount_value },
          newData: { name: data.name, discount_value: data.discount_value },
        });

        toast({
          title: 'Promoção atualizada!',
          description: 'As alterações foram salvas',
        });
      } else {
        // Create new promotion
        const { data: inserted, error } = await supabase
          .from('promotions')
          .insert(promotionData)
          .select('id')
          .single();

        if (error) throw error;
        promotionId = inserted.id;

        await logActivity({
          actionType: 'create',
          entityType: 'promotion',
          entityId: inserted.id,
          entityName: data.name,
          description: `Promoção "${data.name}" criada`,
        });

        toast({
          title: 'Promoção criada!',
          description: 'A promoção está ativa no seu cardápio',
        });
      }

      // Save selected sizes if product has sizes and specific sizes are selected
      if (applyTo === 'product' && productSizes.length > 0 && !applyToAllSizes && selectedSizeIds.length > 0) {
        try {
          // Delete existing size associations
          await supabase
            .from('promotion_sizes' as any)
            .delete()
            .eq('promotion_id', promotionId);

          // Insert new size associations
          const sizeInserts = selectedSizeIds.map(sizeId => ({
            promotion_id: promotionId,
            product_option_id: sizeId,
          }));

          await supabase
            .from('promotion_sizes' as any)
            .insert(sizeInserts);
        } catch (sizeError) {
          console.log('Could not save size associations (table may not exist yet):', sizeError);
        }
      }

      reset();
      setImageUrl(null);
      setEditingPromotion(null);
      setDialogOpen(false);
      setProductSizes([]);
      setApplyToAllSizes(true);
      setSelectedSizeIds([]);
      loadData();
    } catch (error: any) {
      console.error('Error saving promotion:', error);
      toast({
        title: 'Erro ao salvar promoção',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const togglePromotion = async (id: string, isActive: boolean, name: string) => {
    try {
      const newState = !isActive;
      const { error } = await supabase
        .from('promotions')
        .update({ is_active: newState })
        .eq('id', id);

      if (error) throw error;

      await logActivity({
        actionType: 'status_change',
        entityType: 'promotion',
        entityId: id,
        entityName: name,
        description: `Promoção "${name}" ${newState ? 'ativada' : 'desativada'}`,
        oldData: { is_active: isActive },
        newData: { is_active: newState },
      });

      setPromotions(promotions.map(p =>
        p.id === id ? { ...p, is_active: newState } : p
      ));

      toast({
        title: isActive ? 'Promoção desativada' : 'Promoção ativada',
      });
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const deletePromotion = async (id: string, name: string) => {
    if (!confirm('Tem certeza que deseja excluir esta promoção?')) return;

    try {
      const { error } = await supabase
        .from('promotions')
        .delete()
        .eq('id', id);

      if (error) throw error;

      await logActivity({
        actionType: 'delete',
        entityType: 'promotion',
        entityId: id,
        entityName: name,
        description: `Promoção "${name}" excluída`,
      });

      setPromotions(promotions.filter(p => p.id !== id));
      toast({
        title: 'Promoção excluída',
      });
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const formatDiscount = (type: string, value: number) => {
    if (type === 'percentage') {
      return `${value}%`;
    }
    return `R$ ${Number(value).toFixed(2)}`;
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  if (!companyId) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Tag className="h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-lg font-medium mb-2">Configure sua loja primeiro</h2>
          <p className="text-muted-foreground">
            Você precisa criar sua loja antes de adicionar promoções.
          </p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold font-display">Promoções</h1>
            <p className="text-muted-foreground">
              Crie promoções para atrair mais clientes
            </p>
          </div>
          <Button onClick={openCreateDialog} className="gradient-primary text-primary-foreground">
            <Plus className="h-4 w-4 mr-2" />
            Nova Promoção
          </Button>
        </div>

        {/* Tabs for Promotions and Analytics */}
        <Tabs defaultValue="promotions" className="w-full">
          <TabsList className="grid w-full grid-cols-2 max-w-md">
            <TabsTrigger value="promotions" className="flex items-center gap-2">
              <Tag className="h-4 w-4" />
              Promoções
            </TabsTrigger>
            <TabsTrigger value="analytics" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Analytics
            </TabsTrigger>
          </TabsList>

          <TabsContent value="analytics" className="mt-6">
            <PromotionAnalyticsDashboard companyId={companyId} />
          </TabsContent>

          <TabsContent value="promotions" className="mt-6 space-y-4">
            {/* Promotions List */}
            {promotions.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                    <Tag className="h-8 w-8 text-primary" />
                  </div>
                  <h3 className="text-lg font-medium mb-2">Nenhuma promoção</h3>
                  <p className="text-muted-foreground mb-4">
                    Crie sua primeira promoção para atrair mais clientes
                  </p>
                  <Button onClick={openCreateDialog} variant="outline">
                    <Plus className="h-4 w-4 mr-2" />
                    Criar Promoção
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {promotions.map((promotion) => (
                  <Card key={promotion.id} className={!promotion.is_active ? 'opacity-60' : ''}>
                    <CardContent className="p-4">
                      <div className="flex gap-4">
                        {/* Image */}
                        {promotion.image_url ? (
                          <div className="flex-shrink-0 w-24 h-24 rounded-lg overflow-hidden bg-secondary">
                            <img
                              src={promotion.image_url}
                              alt={promotion.name}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ) : (
                          <div className="flex-shrink-0 w-24 h-24 rounded-lg bg-primary/10 flex items-center justify-center">
                            <Tag className="h-8 w-8 text-primary" />
                          </div>
                        )}

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <h3 className="font-medium truncate">{promotion.name}</h3>
                              {promotion.description && (
                                <p className="text-sm text-muted-foreground line-clamp-1 mt-0.5">
                                  {promotion.description}
                                </p>
                              )}
                            </div>
                            <Badge
                              variant={promotion.discount_type === 'percentage' ? 'default' : 'secondary'}
                              className="flex-shrink-0"
                            >
                              {formatDiscount(promotion.discount_type, promotion.discount_value)} OFF
                            </Badge>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-muted-foreground">
                            {promotion.products && (
                              <span className="flex items-center gap-1">
                                <Package className="h-3 w-3" />
                                {promotion.products.name}
                              </span>
                            )}
                            {promotion.categories && (
                              <span className="flex items-center gap-1">
                                <Tag className="h-3 w-3" />
                                {promotion.categories.name}
                              </span>
                            )}
                            {promotion.expires_at && (
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                Expira: {new Date(promotion.expires_at).toLocaleDateString('pt-BR')}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 mt-3">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditDialog(promotion)}
                              className="h-8 px-2"
                            >
                              <Pencil className="h-4 w-4 mr-1" />
                              Editar
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => togglePromotion(promotion.id, promotion.is_active, promotion.name)}
                              className="h-8 px-2"
                            >
                              {promotion.is_active ? (
                                <>
                                  <ToggleRight className="h-4 w-4 mr-1 text-primary" />
                                  Ativa
                                </>
                              ) : (
                                <>
                                  <ToggleLeft className="h-4 w-4 mr-1" />
                                  Inativa
                                </>
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => deletePromotion(promotion.id, promotion.name)}
                              className="h-8 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Dialog for Create/Edit */}
        <Dialog open={dialogOpen} onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setEditingPromotion(null);
          }
        }}>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingPromotion ? 'Editar Promoção' : 'Criar Promoção'}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome da Promoção *</Label>
                <Input
                  id="name"
                  placeholder="Ex: Combo da Semana"
                  {...register('name')}
                />
                {errors.name && (
                  <p className="text-sm text-destructive">{errors.name.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Descrição</Label>
                <Textarea
                  id="description"
                  placeholder="Descreva a promoção..."
                  rows={2}
                  {...register('description')}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="discount_type">Tipo de Desconto *</Label>
                  <select
                    id="discount_type"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    {...register('discount_type')}
                  >
                    <option value="percentage">Porcentagem (%)</option>
                    <option value="fixed">Valor Fixo (R$)</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="discount_value">
                    Valor do Desconto *
                  </Label>
                  <div className="relative">
                    {discountType === 'percentage' ? (
                      <>
                        <Percent className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="discount_value"
                          type="number"
                          step="1"
                          min="1"
                          placeholder="10"
                          className="pl-9"
                          {...register('discount_value')}
                        />
                      </>
                    ) : (
                      <CurrencyInput
                        id="discount_value"
                        value={watch('discount_value') || ''}
                        onChange={(value) => setValue('discount_value', parseFloat(value) || 0)}
                        placeholder="0,00"
                      />
                    )}
                  </div>
                  {errors.discount_value && (
                    <p className="text-sm text-destructive">{errors.discount_value.message}</p>
                  )}
                </div>
              </div>

              {/* Apply To Selection */}
              <div className="space-y-3">
                <Label>Aplicar promoção em</Label>
                <RadioGroup
                  value={applyTo}
                  onValueChange={(value) => {
                    setApplyTo(value as 'product' | 'category');
                    // Clear the other field when switching
                    if (value === 'product') {
                      setValue('category_id', '');
                    } else {
                      setValue('product_id', '');
                    }
                  }}
                  className="flex gap-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="product" id="apply-product" />
                    <Label htmlFor="apply-product" className="cursor-pointer flex items-center gap-1.5">
                      <Package className="h-4 w-4" />
                      Produto específico
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="category" id="apply-category" />
                    <Label htmlFor="apply-category" className="cursor-pointer flex items-center gap-1.5">
                      <Layers className="h-4 w-4" />
                      Categoria
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              {/* Conditional Fields based on applyTo */}
              {applyTo === 'product' ? (
                <div className="space-y-2">
                  <Label htmlFor="product_id">Selecione o Produto</Label>
                  <select
                    id="product_id"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    {...register('product_id')}
                  >
                    <option value="">Selecione um produto...</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">
                    A promoção será aplicada apenas a este produto
                  </p>
                  
                  {/* Size Selection - Only show if product has sizes */}
                  {loadingSizes && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mt-3">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Carregando tamanhos...
                    </div>
                  )}
                  
                  {!loadingSizes && productSizes.length > 0 && (
                    <div className="mt-4 p-4 border rounded-lg bg-muted/30 space-y-3">
                      <Label className="font-medium">Aplicar desconto em quais tamanhos?</Label>
                      
                      <RadioGroup
                        value={applyToAllSizes ? 'all' : 'specific'}
                        onValueChange={(val) => {
                          const isAll = val === 'all';
                          setApplyToAllSizes(isAll);
                          if (isAll) {
                            setSelectedSizeIds([]);
                          }
                        }}
                        className="space-y-2"
                      >
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="all" id="sizes-all" />
                          <Label htmlFor="sizes-all" className="cursor-pointer">
                            Todos os tamanhos
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="specific" id="sizes-specific" />
                          <Label htmlFor="sizes-specific" className="cursor-pointer">
                            Apenas tamanhos selecionados
                          </Label>
                        </div>
                      </RadioGroup>
                      
                      {!applyToAllSizes && (
                        <div className="grid grid-cols-2 gap-2 mt-3">
                          {productSizes.map((size) => (
                            <label
                              key={size.id}
                              className={`
                                flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-all
                                ${selectedSizeIds.includes(size.id) 
                                  ? 'border-primary bg-primary/10' 
                                  : 'border-border hover:border-primary/50'}
                              `}
                            >
                              <input
                                type="checkbox"
                                checked={selectedSizeIds.includes(size.id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedSizeIds([...selectedSizeIds, size.id]);
                                  } else {
                                    setSelectedSizeIds(selectedSizeIds.filter(id => id !== size.id));
                                  }
                                }}
                                className="rounded border-input"
                              />
                              <span className="font-medium">{size.name}</span>
                              <span className="text-xs text-muted-foreground ml-auto">
                                R$ {Number(size.price_modifier).toFixed(2)}
                              </span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="category_id">Selecione a Categoria</Label>
                  <select
                    id="category_id"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    {...register('category_id')}
                  >
                    <option value="">Selecione uma categoria...</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">
                    A promoção será aplicada a todos os produtos desta categoria
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="expires_at">Data de Expiração (opcional)</Label>
                <Input
                  id="expires_at"
                  type="datetime-local"
                  {...register('expires_at')}
                />
              </div>

              <div className="space-y-2">
                <Label>Imagem da Promoção (opcional)</Label>
                <ImageUpload
                  value={imageUrl}
                  onChange={setImageUrl}
                  folder={user?.id || 'temp'}
                  aspectRatio="video"
                />
              </div>

              <Button
                type="submit"
                className="w-full gradient-primary text-primary-foreground"
                disabled={saving}
              >
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editingPromotion ? 'Salvar Alterações' : 'Criar Promoção'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
