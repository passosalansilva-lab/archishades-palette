import { useState, useEffect } from 'react';
import { Minus, Plus, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';

interface ProductOption {
  id: string;
  name: string;
  description?: string | null;
  price_modifier: number;
  is_required: boolean;
  is_available?: boolean;
  sort_order?: number;
  group_id?: string | null;
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
  options: ProductOption[];
}

interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  category_id: string | null;
}

export interface SelectedOption {
  groupId: string;
  groupName: string;
  optionId: string;
  name: string;
  priceModifier: number;
}

interface POSProductModalProps {
  product: Product | null;
  open: boolean;
  onClose: () => void;
  onAddToCart: (product: Product, quantity: number, options: SelectedOption[], notes: string, calculatedPrice: number) => void;
}

export function POSProductModal({ product, open, onClose, onAddToCart }: POSProductModalProps) {
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');
  const [selectedOptions, setSelectedOptions] = useState<SelectedOption[]>([]);
  const [optionGroups, setOptionGroups] = useState<OptionGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [isAcaiProduct, setIsAcaiProduct] = useState(false);
  const [selectedAcaiSizeId, setSelectedAcaiSizeId] = useState<string | null>(null);

  useEffect(() => {
    if (open && product) {
      setQuantity(1);
      setNotes('');
      setSelectedOptions([]);
      setSelectedAcaiSizeId(null);
      loadOptionGroups();
    }
  }, [open, product?.id]);

  const loadOptionGroups = async () => {
    if (!product) return;

    setLoading(true);
    try {
      const categoryId = product.category_id;

      // Carregar grupos e opções normais + verificar se é açaí
      const [groupsResult, optionsResult, acaiCategoryResult, acaiSizesResult] = await Promise.all([
        supabase
          .from('product_option_groups')
          .select('*')
          .eq('product_id', product.id)
          .order('sort_order'),
        supabase
          .from('product_options')
          .select('*')
          .eq('product_id', product.id)
          .eq('is_available', true)
          .order('sort_order'),
        categoryId
          ? supabase
              .from('acai_categories')
              .select('category_id')
              .eq('category_id', categoryId)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null } as any),
        categoryId
          ? supabase
              .from('acai_category_sizes')
              .select('id, name, base_price, sort_order')
              .eq('category_id', categoryId)
              .order('sort_order')
          : Promise.resolve({ data: null, error: null } as any),
      ]);

      const { data: groupsData, error: groupsError } = groupsResult;
      const { data: optionsData, error: optionsError } = optionsResult;
      const { data: acaiCategoryData } = acaiCategoryResult as any;
      const { data: acaiSizesData } = acaiSizesResult as any;

      if (groupsError) throw groupsError;
      if (optionsError) throw optionsError;

      // Verificar se é categoria de açaí com tamanhos configurados
      const isAcai = !!acaiCategoryData;
      const hasAcaiSizes = isAcai && acaiSizesData && Array.isArray(acaiSizesData) && acaiSizesData.length > 0;
      setIsAcaiProduct(hasAcaiSizes);

      // Group options by group
      const groups: OptionGroup[] = (groupsData || []).map((group: any) => ({
        ...group,
        free_quantity_limit: group.free_quantity_limit ?? 0,
        extra_unit_price: group.extra_unit_price ?? 0,
        options: (optionsData || [])
          .filter((opt: any) => opt.group_id === group.id)
          .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
      }));

      // Add ungrouped options
      const ungroupedOptions = (optionsData || []).filter((opt: any) => !opt.group_id);
      if (ungroupedOptions.length > 0) {
        groups.push({
          id: 'ungrouped',
          name: 'Adicionais',
          description: null,
          is_required: false,
          min_selections: 0,
          max_selections: ungroupedOptions.length,
          selection_type: 'multiple',
          sort_order: 999,
          free_quantity_limit: 0,
          extra_unit_price: 0,
          options: ungroupedOptions,
        });
      }

      // Se for açaí com tamanhos, adicionar grupo de tamanhos e carregar opções por tamanho
      if (hasAcaiSizes) {
        const acaiSizeIds = (acaiSizesData as any[]).map((s) => s.id);

        // Buscar grupos de opções para todos os tamanhos de açaí
        const { data: acaiOptionGroupsData, error: acaiGroupsError } = await supabase
          .from('acai_size_option_groups')
          .select('*')
          .in('size_id', acaiSizeIds)
          .order('sort_order');

        if (acaiGroupsError) throw acaiGroupsError;

        // Buscar opções para todos os grupos
        let acaiOptionsData: any[] = [];
        if (acaiOptionGroupsData && acaiOptionGroupsData.length > 0) {
          const groupIds = acaiOptionGroupsData.map((g: any) => g.id);
          const { data: optData, error: optError } = await supabase
            .from('acai_size_options')
            .select('*')
            .in('group_id', groupIds)
            .eq('is_available', true)
            .order('sort_order');

          if (optError) throw optError;
          acaiOptionsData = optData || [];
        }

        // Criar grupo de seleção de tamanho
        const acaiSizeGroup: OptionGroup = {
          id: 'acai-size',
          name: 'Tamanho',
          description: 'Selecione o tamanho do açaí',
          is_required: true,
          min_selections: 1,
          max_selections: 1,
          selection_type: 'single',
          sort_order: -2,
          free_quantity_limit: 0,
          extra_unit_price: 0,
          options: (acaiSizesData as any[]).map((size) => ({
            id: size.id,
            name: size.name,
            price_modifier: Number(size.base_price ?? 0),
            is_required: true,
            is_available: true,
            sort_order: size.sort_order ?? 0,
            group_id: 'acai-size',
          })),
        };

        groups.unshift(acaiSizeGroup);

        // Adicionar grupos de opções de açaí (por tamanho)
        (acaiOptionGroupsData || []).forEach((acaiGroup: any) => {
          const groupOptions = acaiOptionsData.filter((o: any) => o.group_id === acaiGroup.id);
          const enhancedGroup: OptionGroup & { _acaiSizeId?: string } = {
            id: `acai-group-${acaiGroup.id}`,
            name: acaiGroup.name,
            description: acaiGroup.description,
            is_required: acaiGroup.min_selections > 0,
            min_selections: acaiGroup.min_selections,
            max_selections: acaiGroup.max_selections,
            selection_type: acaiGroup.max_selections === 1 ? 'single' : 'multiple',
            sort_order: acaiGroup.sort_order,
            free_quantity_limit: acaiGroup.free_quantity ?? 0,
            extra_unit_price: acaiGroup.extra_price_per_item ?? 0,
            options: groupOptions.map((opt: any) => ({
              id: opt.id,
              name: opt.name,
              description: opt.description,
              price_modifier: Number(opt.price_modifier ?? 0),
              is_required: false,
              is_available: true,
              sort_order: opt.sort_order ?? 0,
              group_id: `acai-group-${acaiGroup.id}`,
            })),
            _acaiSizeId: acaiGroup.size_id,
          };
          groups.push(enhancedGroup);
        });
      }

      setOptionGroups(groups);
    } catch (error) {
      console.error('Error loading options:', error);
      setOptionGroups([]);
    } finally {
      setLoading(false);
    }
  };

  if (!product) return null;

  const handleSingleSelect = (group: OptionGroup, option: ProductOption) => {
    // Se selecionou um tamanho de açaí, atualiza o estado e limpa TODAS as opções anteriores
    if (group.id === 'acai-size') {
      setSelectedAcaiSizeId(option.id);
      // Limpar todas as opções de açaí (tamanho anterior + grupos de opções)
      // Manter apenas opções que não são de açaí
      const nonAcaiOptions = selectedOptions.filter(
        (o) => o.groupId !== 'acai-size' && !o.groupId.startsWith('acai-group-')
      );
      setSelectedOptions([
        ...nonAcaiOptions,
        {
          groupId: group.id,
          groupName: group.name,
          optionId: option.id,
          name: option.name,
          priceModifier: option.price_modifier,
        },
      ]);
      return;
    }
    
    // Para outros grupos single-select, apenas substituir a opção do mesmo grupo
    const filtered = selectedOptions.filter((o) => o.groupId !== group.id);
    setSelectedOptions([
      ...filtered,
      {
        groupId: group.id,
        groupName: group.name,
        optionId: option.id,
        name: option.name,
        priceModifier: option.price_modifier,
      },
    ]);
  };

  // Filtrar grupos visíveis (açaí mostra apenas grupos do tamanho selecionado)
  const visibleOptionGroups = optionGroups.filter((group) => {
    if (!group.id.startsWith('acai-group-')) return true;
    if (!selectedAcaiSizeId) return false;
    const groupWithMeta = group as OptionGroup & { _acaiSizeId?: string };
    return groupWithMeta._acaiSizeId === selectedAcaiSizeId;
  });

  const handleMultipleToggle = (group: OptionGroup, option: ProductOption) => {
    const isSelected = selectedOptions.some((o) => o.optionId === option.id);
    
    if (isSelected) {
      setSelectedOptions(selectedOptions.filter((o) => o.optionId !== option.id));
    } else {
      const currentCount = selectedOptions.filter((o) => o.groupId === group.id).length;
      if (currentCount >= group.max_selections) return;
      
      setSelectedOptions([
        ...selectedOptions,
        {
          groupId: group.id,
          groupName: group.name,
          optionId: option.id,
          name: option.name,
          priceModifier: option.price_modifier,
        },
      ]);
    }
  };

  const getGroupSelectionCount = (groupId: string) => {
    return selectedOptions.filter((o) => o.groupId === groupId).length;
  };

  const validateRequiredGroups = () => {
    // Validar apenas grupos visíveis (considerando tamanho de açaí selecionado)
    for (const group of visibleOptionGroups) {
      if (group.is_required) {
        const count = getGroupSelectionCount(group.id);
        if (count < (group.min_selections || 1)) {
          return false;
        }
      }
    }
    return true;
  };

  const optionsTotal = visibleOptionGroups.reduce((groupSum, group) => {
    const groupSelections = selectedOptions.filter((opt) => opt.groupId === group.id);

    if (group.selection_type === 'multiple' && group.free_quantity_limit > 0) {
      if (groupSelections.length === 0) return groupSum;
      const sortedByPrice = [...groupSelections].sort((a, b) => a.priceModifier - b.priceModifier);
      const paidSelections = sortedByPrice.slice(group.free_quantity_limit);
      const extrasValue = paidSelections.reduce((sum, opt) => sum + opt.priceModifier, 0);
      return groupSum + extrasValue;
    }

    return groupSum + groupSelections.reduce((sum, opt) => sum + opt.priceModifier, 0);
  }, 0);
  
  // Para açaí, incluir o preço do tamanho selecionado
  const acaiSizePrice = selectedOptions.find((o) => o.groupId === 'acai-size')?.priceModifier || 0;

  // Para açaí, usar preço do tamanho; para outros, preço do produto
  const basePrice = isAcaiProduct ? acaiSizePrice : product.price;
  const itemTotal = (basePrice + optionsTotal) * quantity;

  const handleAddToCart = () => {
    if (!validateRequiredGroups()) return;
    
    const calculatedPrice = basePrice + optionsTotal;
    onAddToCart(product, quantity, selectedOptions, notes, calculatedPrice);
    handleClose();
  };

  const handleClose = () => {
    setQuantity(1);
    setNotes('');
    setSelectedOptions([]);
    setOptionGroups([]);
    onClose();
  };

  const canAddToCart = validateRequiredGroups();
  const hasOptions = optionGroups.length > 0;

  const formatCurrency = (value: number) =>
    value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  // Verificar se há opções visíveis (considerando filtro de tamanho açaí)
  const hasVisibleOptions = visibleOptionGroups.length > 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent 
        className="sm:max-w-lg w-[95vw] max-h-[85vh] overflow-hidden flex flex-col p-0 gap-0" 
        aria-describedby={undefined}
      >
        {/* Header compacto */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
          <div className="flex-1 min-w-0 pr-4">
            <h2 className="font-semibold text-base truncate">{product.name}</h2>
            {!isAcaiProduct && (
              <p className="text-primary font-bold text-sm">{formatCurrency(product.price)}</p>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full flex-shrink-0"
            onClick={handleClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Conteúdo scrollável */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="p-4 space-y-4">
            {/* Imagem do produto - mais compacta */}
            {product.image_url && (
              <div className="relative w-full h-28 rounded-lg overflow-hidden bg-muted">
                <img
                  src={product.image_url}
                  alt={product.name}
                  className="w-full h-full object-cover"
                />
              </div>
            )}

            {product.description && (
              <p className="text-sm text-muted-foreground">{product.description}</p>
            )}

            {loading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : hasVisibleOptions ? (
              <div className="space-y-4">
                {visibleOptionGroups.map((group) => (
                  <div key={group.id} className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <h4 className="font-medium text-sm truncate">{group.name}</h4>
                        {group.description && (
                          <p className="text-xs text-muted-foreground truncate">{group.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {group.is_required && (
                          <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Obrigatório</Badge>
                        )}
                        {group.selection_type === 'multiple' && group.max_selections > 1 && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {getGroupSelectionCount(group.id)}/{group.max_selections}
                          </Badge>
                        )}
                        {group.free_quantity_limit > 0 && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            {group.free_quantity_limit} grátis
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Single Selection - mais compacto */}
                    {group.selection_type === 'single' && (
                      <RadioGroup
                        value={selectedOptions.find((o) => o.groupId === group.id)?.optionId || ''}
                        onValueChange={(value) => {
                          const option = group.options.find((o) => o.id === value);
                          if (option) handleSingleSelect(group, option);
                        }}
                        className="space-y-1.5"
                      >
                        {group.options.map((option) => (
                          <div
                            key={option.id}
                            onClick={() => handleSingleSelect(group, option)}
                            className="flex items-center justify-between px-3 py-2 rounded-lg border border-border hover:border-primary/30 cursor-pointer transition-colors"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <RadioGroupItem value={option.id} id={`pos-${option.id}`} className="flex-shrink-0" />
                              <Label htmlFor={`pos-${option.id}`} className="cursor-pointer text-sm truncate">
                                {option.name}
                              </Label>
                            </div>
                            {option.price_modifier !== 0 && (
                              <span className={`text-xs font-medium flex-shrink-0 ${option.price_modifier > 0 ? 'text-primary' : 'text-green-600'}`}>
                                {option.price_modifier > 0 ? '+' : ''}{formatCurrency(option.price_modifier)}
                              </span>
                            )}
                          </div>
                        ))}
                      </RadioGroup>
                    )}

                    {/* Multiple Selection - mais compacto */}
                    {group.selection_type === 'multiple' && (
                      <div className="space-y-1.5">
                        {group.options.map((option) => {
                          const isSelected = selectedOptions.some((o) => o.optionId === option.id);
                          const currentCount = getGroupSelectionCount(group.id);
                          const maxReached = currentCount >= group.max_selections && !isSelected;

                          return (
                            <div
                              key={option.id}
                              onClick={() => !maxReached && handleMultipleToggle(group, option)}
                              className={`flex items-center justify-between px-3 py-2 rounded-lg border transition-colors cursor-pointer ${
                                isSelected
                                  ? 'border-primary bg-primary/5'
                                  : maxReached
                                  ? 'border-border opacity-50 cursor-not-allowed'
                                  : 'border-border hover:border-primary/30'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <Checkbox
                                  checked={isSelected}
                                  disabled={maxReached}
                                  onCheckedChange={() => handleMultipleToggle(group, option)}
                                  className="flex-shrink-0"
                                />
                                <span className="text-sm truncate">{option.name}</span>
                              </div>
                              {option.price_modifier !== 0 && (
                                <span className={`text-xs font-medium flex-shrink-0 ${option.price_modifier > 0 ? 'text-primary' : 'text-green-600'}`}>
                                  {option.price_modifier > 0 ? '+' : ''}{formatCurrency(option.price_modifier)}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-3">
                Este produto não possui adicionais
              </p>
            )}

            {/* Notes - mais compacto */}
            <div className="space-y-1.5">
              <Label className="text-xs">Observações</Label>
              <Textarea
                placeholder="Ex: sem cebola, bem passado..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="resize-none text-sm min-h-[56px]"
              />
            </div>
          </div>
        </ScrollArea>

        {/* Footer fixo e compacto */}
        <div className="border-t bg-background p-3 space-y-3">
          {/* Quantity */}
          <div className="flex items-center justify-center gap-3">
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9"
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
            >
              <Minus className="h-4 w-4" />
            </Button>
            <span className="text-lg font-bold w-10 text-center">{quantity}</span>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9"
              onClick={() => setQuantity(quantity + 1)}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {/* Add button */}
          <Button
            className="w-full h-11 text-sm font-semibold"
            onClick={handleAddToCart}
            disabled={!canAddToCart}
          >
            Adicionar • {formatCurrency(itemTotal)}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
