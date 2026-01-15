import React, { useEffect, useState, useCallback } from 'react';
import { ArrowLeft, ArrowRight, Loader2, Plus, Trash2, GripVertical, ChevronDown, ChevronUp, Package, Check } from 'lucide-react';
import { DndContext, DragEndEvent, closestCenter } from '@dnd-kit/core';
import { ProductRecipeEditor } from '@/components/inventory/ProductRecipeEditor';
import { ProductIngredientsEditor } from '@/components/menu/ProductIngredientsEditor';
import { ProductTagsEditor } from '@/components/menu/ProductTagsEditor';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CurrencyInput } from '@/components/ui/currency-input';
import { ImageUpload } from '@/components/ui/image-upload';
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useFormDraft, isDraftMeaningful } from '@/hooks/useFormDraft';

interface ProductFormDraft {
  name: string;
  description: string;
  price: string;
  promotional_price: string;
  image_url: string | null;
  preparation_time_minutes: string;
  is_featured: boolean;
  is_prepared: boolean;
  allow_half_half_flavor: boolean;
  categoryId: string | null;
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

interface OptionItem {
  id: string;
  name: string;
  description: string | null;
  price_modifier: number;
  is_required: boolean;
  is_available: boolean;
  sort_order: number;
  group_id: string | null;
  image_url?: string | null;
}

interface OptionGroup {
  id: string;
  name: string;
  description: string | null;
  is_required: boolean;
  min_selections: number;
  max_selections: number;
  selection_type: string;
  sort_order: number;
  free_quantity_limit: number;
  extra_unit_price: number;
  options: OptionItem[];
}

interface ProductFormSheetProps {
  open: boolean;
  product: Product | null;
  categoryId: string | null;
  companyId: string;
  isPizzaCategory?: boolean;
  onClose: () => void;
  onSaved: () => void;
}

const SELECTION_TYPES = [
  { value: 'single', label: 'Escolha única', description: 'Cliente escolhe apenas uma opção' },
  { value: 'multiple', label: 'Múltipla escolha', description: 'Cliente pode escolher várias opções' },
];

// Inline option form state type
interface InlineOptionForm {
  name: string;
  description: string;
  price_modifier: string;
  image_url: string | null;
}

// Sortable Group Card Component with inline option adding
function SortableGroupCard({
  group,
  expanded,
  toggleExpanded,
  onEditGroup,
  onDeleteGroup,
  onSaveOption,
  onEditOption,
  onDeleteOption,
  companyId,
  savingOptionId,
}: {
  group: OptionGroup;
  expanded: boolean;
  toggleExpanded: (id: string) => void;
  onEditGroup: (group: OptionGroup) => void;
  onDeleteGroup: (id: string) => void;
  onSaveOption: (groupId: string, option: InlineOptionForm, existingId?: string) => Promise<void>;
  onEditOption: (groupId: string, option: OptionItem) => void;
  onDeleteOption: (optionId: string) => void;
  companyId: string;
  savingOptionId: string | null;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: group.id });
  const [showInlineForm, setShowInlineForm] = React.useState(false);
  const [inlineForm, setInlineForm] = React.useState<InlineOptionForm>({
    name: '',
    description: '',
    price_modifier: '',
    image_url: null,
  });
  const [editingOptionId, setEditingOptionId] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const style: React.CSSProperties = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    transition,
  };

  const handleAddClick = () => {
    setShowInlineForm(true);
    setEditingOptionId(null);
    setInlineForm({ name: '', description: '', price_modifier: '', image_url: null });
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleEditClick = (option: OptionItem) => {
    setShowInlineForm(true);
    setEditingOptionId(option.id);
    setInlineForm({
      name: option.name,
      description: option.description || '',
      price_modifier: String(option.price_modifier || 0),
      image_url: option.image_url || null,
    });
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleCancelInline = () => {
    setShowInlineForm(false);
    setEditingOptionId(null);
    setInlineForm({ name: '', description: '', price_modifier: '', image_url: null });
  };

  const handleSaveInline = async () => {
    if (!inlineForm.name.trim()) return;
    await onSaveOption(group.id, inlineForm, editingOptionId || undefined);
    // Reset form but keep it open for quick adding
    setInlineForm({ name: '', description: '', price_modifier: '', image_url: null });
    setEditingOptionId(null);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSaveInline();
    } else if (e.key === 'Escape') {
      handleCancelInline();
    }
  };

  const isSaving = savingOptionId === (editingOptionId || 'new-' + group.id);

  return (
    <Card ref={setNodeRef} style={style} className="overflow-hidden">
      <Collapsible open={expanded}>
        <CardHeader
          className="p-3 cursor-pointer hover:bg-accent/50 transition-colors"
          onClick={() => toggleExpanded(group.id)}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                {...listeners}
                {...attributes}
                onClick={(e) => e.stopPropagation()}
                className="cursor-grab active:cursor-grabbing"
              >
                <GripVertical className="h-4 w-4 text-muted-foreground" />
              </span>
              <div>
                <CardTitle className="text-sm">{group.name}</CardTitle>
                <div className="flex gap-1 mt-1 flex-wrap">
                  {group.is_required && (
                    <Badge variant="secondary" className="text-xs">Obrigatório</Badge>
                  )}
                  <Badge variant="outline" className="text-xs">
                    {SELECTION_TYPES.find((t) => t.value === group.selection_type)?.label || group.selection_type}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {group.options.length} {group.options.length === 1 ? 'opção' : 'opções'}
                  </Badge>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onEditGroup(group);
                }}
              >
                Editar
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteGroup(group.id);
                }}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </div>
          </div>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="p-3 pt-0 space-y-2">
            {group.options.length === 0 && !showInlineForm ? (
              <p className="text-sm text-muted-foreground py-2">Nenhuma opção ainda. Adicione abaixo.</p>
            ) : (
              group.options.map((option) => (
                <div
                  key={option.id}
                  className="flex items-center justify-between p-2 rounded-md border bg-background"
                >
                  <div className="flex items-center gap-2">
                    <GripVertical className="h-3 w-3 text-muted-foreground" />
                    {option.image_url && (
                      <img 
                        src={option.image_url} 
                        alt={option.name}
                        className="h-8 w-8 rounded object-cover"
                      />
                    )}
                    <div>
                      <p className="text-sm font-medium">{option.name}</p>
                      {option.description && (
                        <p className="text-xs text-muted-foreground">{option.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-sm font-medium ${
                        option.price_modifier > 0
                          ? 'text-green-600'
                          : option.price_modifier < 0
                            ? 'text-destructive'
                            : 'text-muted-foreground'
                      }`}
                    >
                      {option.price_modifier > 0 && '+'}
                      {option.price_modifier !== 0
                        ? `R$ ${Number(option.price_modifier).toFixed(2)}`
                        : 'Incluso'}
                    </span>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => handleEditClick(option)}
                    >
                      Editar
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => onDeleteOption(option.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))
            )}

            {/* Inline form for quick option adding/editing */}
            {showInlineForm && (
              <div className="p-3 rounded-md border-2 border-primary/20 bg-accent/30 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-[1fr,auto] gap-2">
                  <div className="space-y-2">
                    <Input
                      ref={inputRef}
                      value={inlineForm.name}
                      onChange={(e) => setInlineForm(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Nome da opção (ex: Bacon, Queijo extra)"
                      onKeyDown={handleKeyDown}
                      className="h-9"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        value={inlineForm.description}
                        onChange={(e) => setInlineForm(prev => ({ ...prev, description: e.target.value }))}
                        placeholder="Descrição (opcional)"
                        onKeyDown={handleKeyDown}
                        className="h-9"
                      />
                      <CurrencyInput
                        value={Number(inlineForm.price_modifier || 0)}
                        onChange={(value) => setInlineForm(prev => ({ ...prev, price_modifier: String(value || 0) }))}
                        placeholder="Preço adicional"
                      />
                    </div>
                  </div>
                  {/* Image upload for option - OPTIONAL */}
                  <div className="flex items-center gap-2">
                    {inlineForm.image_url ? (
                      <div className="relative">
                        <img 
                          src={inlineForm.image_url} 
                          alt="Preview"
                          className="h-16 w-16 rounded object-cover border"
                        />
                        <Button
                          type="button"
                          variant="destructive"
                          size="icon"
                          className="absolute -top-2 -right-2 h-5 w-5"
                          onClick={() => setInlineForm(prev => ({ ...prev, image_url: null }))}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center">
                        <ImageUpload
                          value={null}
                          onChange={(url) => setInlineForm(prev => ({ ...prev, image_url: url }))}
                          folder={companyId}
                          aspectRatio="square"
                          className="w-16 h-16"
                        />
                        <span className="text-[10px] text-muted-foreground mt-1">Opcional</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    Pressione Enter para salvar, Esc para cancelar
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleCancelInline}
                    >
                      Cancelar
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSaveInline}
                      disabled={!inlineForm.name.trim() || isSaving}
                    >
                      {isSaving && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                      {editingOptionId ? 'Atualizar' : 'Adicionar'}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {!showInlineForm && (
              <Button
                variant="outline"
                size="sm"
                className="w-full border-dashed mt-2"
                onClick={handleAddClick}
              >
                <Plus className="h-3 w-3 mr-1" />
                Adicionar opção
              </Button>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

export function ProductFormSheet({
  open,
  product,
  categoryId,
  companyId,
  isPizzaCategory = false,
  onClose,
  onSaved,
}: ProductFormSheetProps) {
  const { toast } = useToast();
  const { getDraft, saveDraft, clearDraft } = useFormDraft<ProductFormDraft>('product');

  // Step state (1 = product details, 2 = options)
  const [step, setStep] = useState<1 | 2>(1);
  const [saving, setSaving] = useState(false);
  const [currentProductId, setCurrentProductId] = useState<string | null>(product?.id || null);
  const [hasPendingDraft, setHasPendingDraft] = useState(false);

  // Product form state
  const [productForm, setProductForm] = useState({
    name: '',
    description: '',
    price: '',
    promotional_price: '',
    image_url: null as string | null,
    preparation_time_minutes: '30',
    is_featured: false,
    is_prepared: true,
    allow_half_half_flavor: true,
    tags: [] as string[],
  });

  // Options state
  const [groups, setGroups] = useState<OptionGroup[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [loadingOptions, setLoadingOptions] = useState(false);
  
  // Recipe editor state
  const [recipeEditorOpen, setRecipeEditorOpen] = useState(false);

  // Group modal
  const [groupModal, setGroupModal] = useState<{ open: boolean; group: OptionGroup | null }>({ open: false, group: null });
  const [groupForm, setGroupForm] = useState({
    name: '',
    description: '',
    is_required: false,
    min_selections: 0,
    max_selections: 1,
    selection_type: 'single',
    free_quantity_limit: 0,
    extra_unit_price: '0',
  });

  // Option modal (kept for backwards compatibility, but inline form is preferred)
  const [optionModal, setOptionModal] = useState<{ open: boolean; groupId: string; option: OptionItem | null }>({
    open: false,
    groupId: '',
    option: null,
  });
  const [optionForm, setOptionForm] = useState({
    name: '',
    description: '',
    price_modifier: '',
  });
  const [savingOptionId, setSavingOptionId] = useState<string | null>(null);

  // Save draft when form changes (only for new products)
  const saveDraftIfMeaningful = useCallback(() => {
    if (!product && !currentProductId) {
      const draftData: ProductFormDraft = {
        ...productForm,
        categoryId,
      };
      if (isDraftMeaningful(draftData, ['name', 'description', 'price'])) {
        saveDraft(draftData, productForm.name || 'Novo produto');
      }
    }
  }, [product, currentProductId, productForm, categoryId, saveDraft]);

  // Auto-save draft when form changes
  useEffect(() => {
    if (open && !product) {
      const timer = setTimeout(saveDraftIfMeaningful, 500);
      return () => clearTimeout(timer);
    }
  }, [open, product, productForm, saveDraftIfMeaningful]);

  // Check for pending draft on mount
  useEffect(() => {
    const draft = getDraft();
    if (draft && isDraftMeaningful(draft.data, ['name', 'description', 'price'])) {
      setHasPendingDraft(true);
    }
  }, [getDraft]);

  // Initialize form when product changes
  useEffect(() => {
    if (open) {
      if (product) {
        setProductForm({
          name: product.name,
          description: product.description || '',
          price: String(product.price),
          promotional_price: product.promotional_price ? String(product.promotional_price) : '',
          image_url: product.image_url,
          preparation_time_minutes: String(product.preparation_time_minutes ?? '30'),
          is_featured: product.is_featured,
          is_prepared: product.preparation_time_minutes !== null,
          allow_half_half_flavor: true,
          tags: (product as any).tags || [],
        });
        setCurrentProductId(product.id);
        setStep(1);
        loadProductOptions(product.id);

        // Load pizza settings if applicable
        if (isPizzaCategory) {
          loadPizzaSettings(product.id);
        }
      } else {
        // Check for draft to restore
        const draft = getDraft();
        if (draft && isDraftMeaningful(draft.data, ['name', 'description', 'price'])) {
          setProductForm({
            name: draft.data.name,
            description: draft.data.description,
            price: draft.data.price,
            promotional_price: draft.data.promotional_price || '',
            image_url: draft.data.image_url,
            preparation_time_minutes: draft.data.preparation_time_minutes,
            is_featured: draft.data.is_featured,
            is_prepared: draft.data.is_prepared,
            allow_half_half_flavor: draft.data.allow_half_half_flavor,
            tags: [],
          });
          // Clear draft immediately after restoring - user either completes or cancels
          clearDraft();
          toast({
            title: 'Rascunho restaurado',
            description: `Continuando a criar "${draft.data.name || 'produto'}"`,
          });
        } else {
          setProductForm({
            name: '',
            description: '',
            price: '',
            promotional_price: '',
            image_url: null,
            preparation_time_minutes: '30',
            is_featured: false,
            is_prepared: true,
            allow_half_half_flavor: true,
            tags: [],
          });
        }
        setCurrentProductId(null);
        setStep(1);
        setGroups([]);
      }
      setHasPendingDraft(false);
    }
  }, [open, product?.id]);

  // Clear draft on successful save
  const handleClearDraft = useCallback(() => {
    clearDraft();
    setHasPendingDraft(false);
  }, [clearDraft]);

  const loadPizzaSettings = async (productId: string) => {
    try {
      const { data } = await supabase
        .from('pizza_product_settings')
        .select('allow_half_half')
        .eq('product_id', productId)
        .maybeSingle();

      if (data) {
        setProductForm((prev) => ({
          ...prev,
          allow_half_half_flavor: data.allow_half_half ?? true,
        }));
      }
    } catch (error) {
      console.error('Error loading pizza settings:', error);
    }
  };

  const loadProductOptions = async (productId: string) => {
    setLoadingOptions(true);
    try {
      const [groupsRes, optionsRes] = await Promise.all([
        supabase
          .from('product_option_groups')
          .select('*')
          .eq('product_id', productId)
          .order('sort_order'),
        supabase
          .from('product_options')
          .select('*')
          .eq('product_id', productId)
          .eq('is_available', true)
          .order('sort_order'),
      ]);

      if (groupsRes.error) throw groupsRes.error;
      if (optionsRes.error) throw optionsRes.error;

      const groupsData: OptionGroup[] = (groupsRes.data || []).map((g: any) => ({
        ...g,
        free_quantity_limit: g.free_quantity_limit ?? 0,
        extra_unit_price: g.extra_unit_price ?? 0,
        options: (optionsRes.data || []).filter((o: any) => o.group_id === g.id),
      }));

      setGroups(groupsData);
      
      // Expand first group by default
      if (groupsData.length > 0) {
        setExpandedGroups(new Set([groupsData[0].id]));
      }
    } catch (error) {
      console.error('Error loading options:', error);
    } finally {
      setLoadingOptions(false);
    }
  };

  // Navigate directly to step 2 (for existing products)
  const goToStep2 = async () => {
    if (currentProductId) {
      setStep(2);
      loadProductOptions(currentProductId);
    }
  };

  const handleSaveProduct = async () => {
    // For existing products, categoryId from product is used; for new, prop is required
    const effectiveCategoryId = currentProductId ? (product?.category_id || categoryId) : categoryId;
    if (!companyId || !effectiveCategoryId || !productForm.name.trim()) return;

    setSaving(true);
    try {
      const promotionalPriceValue = productForm.promotional_price ? Number(productForm.promotional_price) : null;
      const payload = {
        company_id: companyId,
        name: productForm.name.trim(),
        description: productForm.description.trim() || null,
        image_url: productForm.image_url,
        price: Number(productForm.price || 0),
        promotional_price: promotionalPriceValue,
        category_id: effectiveCategoryId,
        preparation_time_minutes: productForm.is_prepared
          ? Number(productForm.preparation_time_minutes || 30)
          : null,
        is_featured: productForm.is_featured,
        is_active: true,
        requires_preparation: productForm.is_prepared,
        tags: productForm.tags,
      };

      let productId = currentProductId;

      if (currentProductId) {
        // Update existing product
        const { error } = await supabase.from('products').update(payload).eq('id', currentProductId);
        if (error) throw error;
        toast({ title: 'Produto atualizado' });
      } else {
        // Create new product
        const { data, error } = await supabase.from('products').insert(payload).select('*').single();
        if (error) throw error;
        toast({ title: 'Produto criado' });
        productId = data.id;
        setCurrentProductId(productId);
        handleClearDraft(); // Clear draft on successful creation
      }

      // Save pizza settings if applicable
      if (isPizzaCategory && productId) {
        await savePizzaSettings(productId);
      }

      // Advance to step 2
      setStep(2);
      if (productId) {
        loadProductOptions(productId);
      }
    } catch (error: any) {
      console.error(error);
      toast({
        title: 'Erro ao salvar produto',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const savePizzaSettings = async (productId: string) => {
    try {
      const { data: existing } = await supabase
        .from('pizza_product_settings')
        .select('id')
        .eq('product_id', productId)
        .maybeSingle();

      const payloadSettings = {
        product_id: productId,
        allow_half_half: productForm.allow_half_half_flavor,
      };

      if (existing) {
        await supabase.from('pizza_product_settings').update(payloadSettings).eq('id', existing.id);
      } else {
        await supabase.from('pizza_product_settings').insert(payloadSettings);
      }
    } catch (error) {
      console.error('Error saving pizza settings:', error);
    }
  };

  const handleFinish = () => {
    onSaved();
    onClose();
  };

  // Group operations
  const openNewGroupModal = () => {
    setGroupForm({
      name: '',
      description: '',
      is_required: false,
      min_selections: 0,
      max_selections: 1,
      selection_type: 'single',
      free_quantity_limit: 0,
      extra_unit_price: '0',
    });
    setGroupModal({ open: true, group: null });
  };

  const openEditGroupModal = (group: OptionGroup) => {
    setGroupForm({
      name: group.name,
      description: group.description || '',
      is_required: group.is_required,
      min_selections: group.min_selections,
      max_selections: group.max_selections,
      selection_type: group.selection_type,
      free_quantity_limit: group.free_quantity_limit,
      extra_unit_price: String(group.extra_unit_price),
    });
    setGroupModal({ open: true, group });
  };

  const handleSaveGroup = async () => {
    if (!currentProductId || !groupForm.name.trim()) return;

    setSaving(true);
    try {
      const payload = {
        product_id: currentProductId,
        name: groupForm.name.trim(),
        description: groupForm.description.trim() || null,
        is_required: groupForm.is_required,
        min_selections: groupForm.min_selections,
        max_selections: groupForm.max_selections,
        selection_type: groupForm.selection_type,
        free_quantity_limit: groupForm.free_quantity_limit,
        extra_unit_price: Number(groupForm.extra_unit_price || 0),
        sort_order: groups.length,
      };

      if (groupModal.group) {
        const { error } = await supabase.from('product_option_groups').update(payload).eq('id', groupModal.group.id);
        if (error) throw error;
        toast({ title: 'Grupo atualizado' });
      } else {
        const { error } = await supabase.from('product_option_groups').insert(payload);
        if (error) throw error;
        toast({ title: 'Grupo criado' });
      }

      setGroupModal({ open: false, group: null });
      loadProductOptions(currentProductId);
    } catch (error: any) {
      toast({
        title: 'Erro ao salvar grupo',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (!currentProductId) return;

    try {
      // Delete options first
      await supabase.from('product_options').delete().eq('group_id', groupId);
      // Delete group
      const { error } = await supabase.from('product_option_groups').delete().eq('id', groupId);
      if (error) throw error;
      toast({ title: 'Grupo excluído' });
      loadProductOptions(currentProductId);
    } catch (error: any) {
      toast({
        title: 'Erro ao excluir grupo',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  // Option operations
  const openNewOptionModal = (groupId: string) => {
    setOptionForm({ name: '', description: '', price_modifier: '' });
    setOptionModal({ open: true, groupId, option: null });
  };

  const openEditOptionModal = (groupId: string, option: OptionItem) => {
    setOptionForm({
      name: option.name,
      description: option.description || '',
      price_modifier: String(option.price_modifier),
    });
    setOptionModal({ open: true, groupId, option });
  };

  const handleSaveOption = async () => {
    if (!currentProductId || !optionForm.name.trim()) return;

    setSaving(true);
    try {
      const group = groups.find((g) => g.id === optionModal.groupId);
      const payload = {
        product_id: currentProductId,
        group_id: optionModal.groupId,
        name: optionForm.name.trim(),
        description: optionForm.description.trim() || null,
        price_modifier: Number(optionForm.price_modifier || 0),
        is_required: false,
        is_available: true,
        sort_order: group ? group.options.length : 0,
      };

      if (optionModal.option) {
        const { error } = await supabase.from('product_options').update(payload).eq('id', optionModal.option.id);
        if (error) throw error;
        toast({ title: 'Opção atualizada' });
      } else {
        const { error } = await supabase.from('product_options').insert(payload);
        if (error) throw error;
        toast({ title: 'Opção criada' });
      }

      setOptionModal({ open: false, groupId: '', option: null });
      loadProductOptions(currentProductId);
    } catch (error: any) {
      toast({
        title: 'Erro ao salvar opção',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteOption = async (optionId: string) => {
    if (!currentProductId) return;

    try {
      const { error } = await supabase.from('product_options').delete().eq('id', optionId);
      if (error) throw error;
      toast({ title: 'Opção excluída' });
      loadProductOptions(currentProductId);
    } catch (error: any) {
      toast({
        title: 'Erro ao excluir opção',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  // Inline option save handler (no sheet, no page refresh)
  const handleInlineSaveOption = async (
    groupId: string, 
    optionData: { name: string; description: string; price_modifier: string; image_url: string | null },
    existingId?: string
  ) => {
    if (!currentProductId || !optionData.name.trim()) return;

    const savingId = existingId || 'new-' + groupId;
    setSavingOptionId(savingId);
    
    try {
      const group = groups.find((g) => g.id === groupId);
      const payload = {
        product_id: currentProductId,
        group_id: groupId,
        name: optionData.name.trim(),
        description: optionData.description.trim() || null,
        price_modifier: Number(optionData.price_modifier || 0),
        is_required: false,
        is_available: true,
        sort_order: group ? group.options.length : 0,
        image_url: optionData.image_url,
      };

      if (existingId) {
        const { data, error } = await supabase
          .from('product_options')
          .update(payload)
          .eq('id', existingId)
          .select('*')
          .single();
        if (error) throw error;
        
        // Update local state without full reload
        setGroups(prev => prev.map(g => 
          g.id === groupId 
            ? { ...g, options: g.options.map(o => o.id === existingId ? { ...o, ...data } : o) }
            : g
        ));
        toast({ title: 'Opção atualizada' });
      } else {
        const { data, error } = await supabase
          .from('product_options')
          .insert(payload)
          .select('*')
          .single();
        if (error) throw error;
        
        // Update local state without full reload
        setGroups(prev => prev.map(g => 
          g.id === groupId 
            ? { ...g, options: [...g.options, data as OptionItem] }
            : g
        ));
        toast({ title: 'Opção adicionada' });
      }
    } catch (error: any) {
      toast({
        title: 'Erro ao salvar opção',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setSavingOptionId(null);
    }
  };

  const toggleExpanded = (id: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleGroupDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = groups.findIndex((g) => g.id === active.id);
    const newIndex = groups.findIndex((g) => g.id === over.id);

    const reordered = arrayMove(groups, oldIndex, newIndex);
    setGroups(reordered);

    // Update sort_order in database
    try {
      await Promise.all(
        reordered.map((g, index) =>
          supabase.from('product_option_groups').update({ sort_order: index }).eq('id', g.id)
        )
      );
    } catch (error) {
      console.error('Error reordering groups:', error);
    }
  };

  const handleClose = () => {
    setStep(1);
    setGroups([]);
    setCurrentProductId(null);
    onClose();
  };

  return (
    <>
      <Sheet open={open} onOpenChange={(o) => !o && handleClose()}>
        <SheetContent side="right" className="w-full sm:max-w-xl md:max-w-2xl lg:max-w-3xl overflow-y-auto">
          <SheetHeader className="pb-4 border-b">
            <SheetTitle className="flex items-center gap-3">
              {step === 2 && (
                <Button variant="ghost" size="icon" onClick={() => setStep(1)}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
              <span>
                {product ? 'Editar produto' : 'Novo produto'}
                {step === 2 && ' - Adicionais'}
              </span>
            </SheetTitle>
            {/* Step indicator - clickable tabs with progress */}
            <div className="flex items-center gap-2 mt-2">
              <button
                type="button"
                onClick={() => setStep(1)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs transition-colors cursor-pointer ${step === 1 ? 'bg-primary text-primary-foreground' : currentProductId ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
              >
                {currentProductId && step !== 1 ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <span className="font-semibold">1</span>
                )}
                <span>Dados do produto</span>
              </button>
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
              <button
                type="button"
                onClick={() => currentProductId && goToStep2()}
                disabled={!currentProductId}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs transition-colors ${step === 2 ? 'bg-primary text-primary-foreground' : groups.length > 0 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50 cursor-pointer' : currentProductId ? 'bg-muted text-muted-foreground cursor-pointer hover:bg-muted/80' : 'bg-muted text-muted-foreground opacity-50 cursor-not-allowed'}`}
                title={!currentProductId ? 'Salve os dados do produto primeiro' : 'Ir para Adicionais'}
              >
                {groups.length > 0 && step !== 2 ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <span className="font-semibold">2</span>
                )}
                <span>Adicionais</span>
              </button>
            </div>
          </SheetHeader>

          {/* Step 1: Product details */}
          {step === 1 && (
            <div className="py-4 space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-[1fr,200px] gap-4">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="productName">Nome do produto *</Label>
                    <Input
                      id="productName"
                      value={productForm.name}
                      onChange={(e) => setProductForm((prev) => ({ ...prev, name: e.target.value }))}
                      placeholder="Ex: X-Burger, Açaí 500ml"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="productDescription">Descrição</Label>
                    <Textarea
                      id="productDescription"
                      value={productForm.description}
                      onChange={(e) => setProductForm((prev) => ({ ...prev, description: e.target.value }))}
                      placeholder="Detalhes do produto para o cliente"
                      rows={3}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Preço original</Label>
                      <CurrencyInput
                        value={Number(productForm.price || 0)}
                        onChange={(value) => setProductForm((prev) => ({ ...prev, price: String(value || 0) }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Preço promocional</Label>
                      <CurrencyInput
                        value={Number(productForm.promotional_price || 0)}
                        onChange={(value) => setProductForm((prev) => ({ ...prev, promotional_price: value ? String(value) : '' }))}
                        placeholder="Opcional"
                      />
                      <p className="text-xs text-muted-foreground">Deixe em branco se não estiver em promoção</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Tipo de produto</Label>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant={productForm.is_prepared ? 'default' : 'outline'}
                          size="sm"
                          className="flex-1"
                          onClick={() => setProductForm((prev) => ({ ...prev, is_prepared: true }))}
                        >
                          Preparado
                        </Button>
                        <Button
                          type="button"
                          variant={!productForm.is_prepared ? 'default' : 'outline'}
                          size="sm"
                          className="flex-1"
                          onClick={() => setProductForm((prev) => ({ ...prev, is_prepared: false }))}
                        >
                          Industrializado
                        </Button>
                      </div>
                    </div>
                  </div>

                  {productForm.is_prepared && (
                    <div className="space-y-2">
                      <Label>Tempo de preparo (min)</Label>
                      <Input
                        type="number"
                        min={0}
                        value={productForm.preparation_time_minutes}
                        onChange={(e) => setProductForm((prev) => ({ ...prev, preparation_time_minutes: e.target.value }))}
                      />
                    </div>
                  )}

                  <div className="flex items-center justify-between rounded-md border px-3 py-2">
                    <div>
                      <p className="text-sm font-medium">Destaque</p>
                      <p className="text-xs text-muted-foreground">Exibe em posição de destaque</p>
                    </div>
                    <Switch
                      checked={productForm.is_featured}
                      onCheckedChange={(checked) => setProductForm((prev) => ({ ...prev, is_featured: checked }))}
                    />
                  </div>

                  {isPizzaCategory && (
                    <div className="flex items-center justify-between rounded-md border px-3 py-2">
                      <div>
                        <p className="text-sm font-medium">Usar em pizza meio a meio</p>
                        <p className="text-xs text-muted-foreground">Aparece como sabor na montagem meio a meio</p>
                      </div>
                      <Switch
                        checked={productForm.allow_half_half_flavor}
                        onCheckedChange={(checked) => setProductForm((prev) => ({ ...prev, allow_half_half_flavor: checked }))}
                      />
                    </div>
                  )}

                  {/* Product Tags */}
                  <ProductTagsEditor
                    selectedTags={productForm.tags}
                    onChange={(tags) => setProductForm((prev) => ({ ...prev, tags }))}
                  />

                  {/* Recipe / Technical sheet button */}
                  {currentProductId && (
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full gap-2"
                      onClick={() => setRecipeEditorOpen(true)}
                    >
                      <Package className="h-4 w-4" />
                      Ficha Técnica (Estoque)
                    </Button>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Imagem do produto</Label>
                  <ImageUpload
                    value={productForm.image_url}
                    onChange={(url) => setProductForm((prev) => ({ ...prev, image_url: url }))}
                    folder={companyId}
                    showGallery
                    companyId={companyId}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Options */}
          {step === 2 && (
            <div className="py-4 space-y-4">
              {loadingOptions ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium">Grupos de adicionais</h3>
                      <p className="text-sm text-muted-foreground">
                        Crie grupos para organizar as opções do produto
                      </p>
                    </div>
                    <Button onClick={openNewGroupModal} size="sm">
                      <Plus className="h-4 w-4 mr-1" />
                      Novo grupo
                    </Button>
                  </div>

                  {groups.length === 0 ? (
                    <Card className="border-dashed">
                      <CardContent className="py-8 text-center">
                        <p className="text-muted-foreground mb-4">
                          Nenhum grupo de adicionais ainda
                        </p>
                        <Button variant="outline" onClick={openNewGroupModal}>
                          <Plus className="h-4 w-4 mr-1" />
                          Criar primeiro grupo
                        </Button>
                      </CardContent>
                    </Card>
                  ) : (
                    <DndContext collisionDetection={closestCenter} onDragEnd={handleGroupDragEnd}>
                      <SortableContext items={groups.map((g) => g.id)} strategy={verticalListSortingStrategy}>
                        <div className="space-y-3">
                          {groups.map((group) => (
                            <SortableGroupCard
                              key={group.id}
                              group={group}
                              expanded={expandedGroups.has(group.id)}
                              toggleExpanded={toggleExpanded}
                              onEditGroup={openEditGroupModal}
                              onDeleteGroup={handleDeleteGroup}
                              onSaveOption={handleInlineSaveOption}
                              onEditOption={openEditOptionModal}
                              onDeleteOption={handleDeleteOption}
                              companyId={companyId}
                              savingOptionId={savingOptionId}
                            />
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                  )}

                  {/* Ingredients section */}
                  {currentProductId && (
                    <div className="mt-6 pt-6 border-t">
                      <div className="mb-3">
                        <h3 className="font-medium">Ingredientes removíveis</h3>
                        <p className="text-sm text-muted-foreground">
                          Cadastre ingredientes que o cliente pode pedir para remover
                        </p>
                      </div>
                      <ProductIngredientsEditor productId={currentProductId} />
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          <SheetFooter className="flex flex-row items-center justify-between gap-3 pt-4 border-t">
            <Button variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
            <div className="flex gap-2">
              {step === 1 && (
                <Button onClick={handleSaveProduct} disabled={saving || !productForm.name.trim()}>
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Avançar
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              )}
              {step === 2 && (
                <Button onClick={handleFinish}>
                  Concluir
                </Button>
              )}
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Group Modal */}
      {groupModal.open && (
        <Sheet open={groupModal.open} onOpenChange={(o) => !o && setGroupModal({ open: false, group: null })}>
          <SheetContent side="right" className="w-full sm:max-w-md">
            <SheetHeader>
              <SheetTitle>{groupModal.group ? 'Editar grupo' : 'Novo grupo de adicionais'}</SheetTitle>
            </SheetHeader>
            <div className="py-4 space-y-4">
              <div className="space-y-2">
                <Label>Nome do grupo *</Label>
                <Input
                  value={groupForm.name}
                  onChange={(e) => setGroupForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Ex: Adicionais, Escolha o tamanho"
                />
              </div>

              <div className="space-y-2">
                <Label>Descrição</Label>
                <Textarea
                  value={groupForm.description}
                  onChange={(e) => setGroupForm((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Instruções para o cliente (opcional)"
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label>Tipo de seleção</Label>
                <Select
                  value={groupForm.selection_type}
                  onValueChange={(value) => setGroupForm((prev) => ({ ...prev, selection_type: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SELECTION_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        <div>
                          <span>{type.label}</span>
                          <span className="text-xs text-muted-foreground ml-2">{type.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <div>
                  <p className="text-sm font-medium">Obrigatório</p>
                  <p className="text-xs text-muted-foreground">Cliente deve escolher pelo menos uma opção</p>
                </div>
                <Switch
                  checked={groupForm.is_required}
                  onCheckedChange={(checked) => setGroupForm((prev) => ({ ...prev, is_required: checked }))}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Mínimo de seleções</Label>
                  <Input
                    type="number"
                    min={0}
                    value={groupForm.min_selections}
                    onChange={(e) => setGroupForm((prev) => ({ ...prev, min_selections: Number(e.target.value) }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Máximo de seleções</Label>
                  <Input
                    type="number"
                    min={1}
                    value={groupForm.max_selections}
                    onChange={(e) => setGroupForm((prev) => ({ ...prev, max_selections: Number(e.target.value) }))}
                  />
                </div>
              </div>

              {groupForm.selection_type === 'multiple' && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Qtd. grátis</Label>
                    <Input
                      type="number"
                      min={0}
                      value={groupForm.free_quantity_limit}
                      onChange={(e) => setGroupForm((prev) => ({ ...prev, free_quantity_limit: Number(e.target.value) }))}
                    />
                    <p className="text-xs text-muted-foreground">Quantidade incluída no preço</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Preço por extra</Label>
                    <CurrencyInput
                      value={Number(groupForm.extra_unit_price || 0)}
                      onChange={(value) => setGroupForm((prev) => ({ ...prev, extra_unit_price: String(value || 0) }))}
                    />
                    <p className="text-xs text-muted-foreground">Valor por item adicional</p>
                  </div>
                </div>
              )}
            </div>
            <SheetFooter>
              <Button variant="outline" onClick={() => setGroupModal({ open: false, group: null })}>
                Cancelar
              </Button>
              <Button onClick={handleSaveGroup} disabled={saving || !groupForm.name.trim()}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Salvar
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      )}

      {/* Option Modal */}
      {optionModal.open && (
        <Sheet open={optionModal.open} onOpenChange={(o) => !o && setOptionModal({ open: false, groupId: '', option: null })}>
          <SheetContent side="right" className="w-full sm:max-w-md">
            <SheetHeader>
              <SheetTitle>{optionModal.option ? 'Editar opção' : 'Nova opção'}</SheetTitle>
            </SheetHeader>
            <div className="py-4 space-y-4">
              <div className="space-y-2">
                <Label>Nome da opção *</Label>
                <Input
                  value={optionForm.name}
                  onChange={(e) => setOptionForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Ex: Bacon, Queijo extra"
                />
              </div>

              <div className="space-y-2">
                <Label>Descrição</Label>
                <Textarea
                  value={optionForm.description}
                  onChange={(e) => setOptionForm((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Descrição opcional"
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label>Preço adicional</Label>
                <CurrencyInput
                  value={Number(optionForm.price_modifier || 0)}
                  onChange={(value) => setOptionForm((prev) => ({ ...prev, price_modifier: String(value || 0) }))}
                />
                <p className="text-xs text-muted-foreground">Deixe 0 para opções inclusas no preço</p>
              </div>
            </div>
            <SheetFooter>
              <Button variant="outline" onClick={() => setOptionModal({ open: false, groupId: '', option: null })}>
                Cancelar
              </Button>
              <Button onClick={handleSaveOption} disabled={saving || !optionForm.name.trim()}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Salvar
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      )}

      {/* Recipe Editor Modal */}
      {currentProductId && (
        <ProductRecipeEditor
          open={recipeEditorOpen}
          onClose={() => setRecipeEditorOpen(false)}
          productId={currentProductId}
          productName={productForm.name || product?.name || 'Produto'}
          companyId={companyId}
        />
      )}
    </>
  );
}
