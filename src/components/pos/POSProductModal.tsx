import { useState, useEffect } from 'react';
import { Minus, Plus, X, Loader2, Check, Pizza, ChevronRight } from 'lucide-react';
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
import { cn } from '@/lib/utils';

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
  _acaiSizeId?: string;
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
  const [isPizzaProduct, setIsPizzaProduct] = useState(false);
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

      // Fetch all data in parallel
      const [
        groupsResult,
        optionsResult,
        acaiCategoryResult,
        acaiSizesResult,
        pizzaCategoryResult,
        pizzaCategorySettingsResult,
        pizzaProductSettingsResult,
      ] = await Promise.all([
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
          ? supabase.from('acai_categories').select('category_id').eq('category_id', categoryId).maybeSingle()
          : Promise.resolve({ data: null, error: null } as any),
        categoryId
          ? supabase.from('acai_category_sizes').select('id, name, base_price, sort_order').eq('category_id', categoryId).order('sort_order')
          : Promise.resolve({ data: null, error: null } as any),
        categoryId
          ? supabase.from('pizza_categories').select('category_id').eq('category_id', categoryId).maybeSingle()
          : Promise.resolve({ data: null, error: null } as any),
        categoryId
          ? supabase.from('pizza_category_settings').select('*').eq('category_id', categoryId).maybeSingle()
          : Promise.resolve({ data: null, error: null } as any),
        supabase.from('pizza_product_settings').select('*').eq('product_id', product.id).maybeSingle(),
      ]);

      const { data: groupsData, error: groupsError } = groupsResult;
      const { data: optionsData, error: optionsError } = optionsResult;
      const { data: acaiCategoryData } = acaiCategoryResult as any;
      const { data: acaiSizesData } = acaiSizesResult as any;
      const { data: pizzaCategoryData } = pizzaCategoryResult as any;
      const { data: pizzaCategorySettingsData } = pizzaCategorySettingsResult as any;
      const { data: pizzaProductSettingsData } = pizzaProductSettingsResult as any;

      if (groupsError) throw groupsError;
      if (optionsError) throw optionsError;

      const isAcaiCategory = !!acaiCategoryData;
      const isPizzaCategory = !!pizzaCategoryData;
      const hasAcaiSizes = isAcaiCategory && acaiSizesData && Array.isArray(acaiSizesData) && acaiSizesData.length > 0;

      setIsAcaiProduct(hasAcaiSizes);
      setIsPizzaProduct(isPizzaCategory);

      // Pizza settings: product settings take priority over category settings
      const productSettings = pizzaProductSettingsData || {};
      const categorySettings = pizzaCategorySettingsData || {};
      const doughMaxSelections = productSettings.dough_max_selections ?? categorySettings.dough_max_selections ?? 1;
      const doughIsRequired = productSettings.dough_is_required ?? categorySettings.dough_is_required ?? true;
      const crustMaxSelections = productSettings.crust_max_selections ?? categorySettings.crust_max_selections ?? 1;
      const crustIsRequired = productSettings.crust_is_required ?? categorySettings.crust_is_required ?? false;

      // Identify pizza-specific groups by name
      const allProductGroups = groupsData || [];
      const allProductOptions = optionsData || [];

      const productSizeGroup = allProductGroups.find((g: any) => {
        const name = (g.name || '').toLowerCase().trim();
        return name === 'tamanho' || name === 'tamanhos' || name.includes('tamanho');
      });
      const productDoughGroup = allProductGroups.find((g: any) => {
        const name = (g.name || '').toLowerCase().trim();
        return name.includes('massa') || name === 'massas' || name === 'tipo de massa';
      });
      const productCrustGroup = allProductGroups.find((g: any) => {
        const name = (g.name || '').toLowerCase().trim();
        return name.includes('borda') || name === 'bordas';
      });

      const productSizeOptions = productSizeGroup
        ? allProductOptions.filter((o: any) => o.group_id === productSizeGroup.id)
        : [];
      const productDoughOptions = productDoughGroup
        ? allProductOptions.filter((o: any) => o.group_id === productDoughGroup.id)
        : [];
      const productCrustOptions = productCrustGroup
        ? allProductOptions.filter((o: any) => o.group_id === productCrustGroup.id)
        : [];

      const hasProductSizes = isPizzaCategory && productSizeOptions.length > 0;

      // Filter out pizza system groups from generic add-ons
      const pizzaSystemGroupIds = [productSizeGroup?.id, productDoughGroup?.id, productCrustGroup?.id].filter(Boolean);
      const filteredGroupsData = isPizzaCategory
        ? (groupsData || []).filter((group: any) => !pizzaSystemGroupIds.includes(group.id))
        : (groupsData || []);

      const groups: OptionGroup[] = filteredGroupsData.map((group: any) => ({
        ...group,
        free_quantity_limit: group.free_quantity_limit ?? 0,
        extra_unit_price: group.extra_price ?? 0,
        options: allProductOptions
          .filter((opt: any) => opt.group_id === group.id)
          .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
      }));

      // Add ungrouped options
      const ungroupedOptions = allProductOptions.filter((opt: any) => !opt.group_id);
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

      // Pizza size group
      if (hasProductSizes) {
        const sizeGroup: OptionGroup = {
          id: 'pizza-size',
          name: 'Tamanho',
          description: 'Selecione o tamanho da pizza',
          is_required: true,
          min_selections: 1,
          max_selections: 1,
          selection_type: 'single',
          sort_order: -30,
          free_quantity_limit: 0,
          extra_unit_price: 0,
          options: productSizeOptions.map((size: any) => ({
            id: size.id,
            name: size.name,
            description: null,
            price_modifier: Number(size.price_modifier ?? 0),
            is_required: true,
            is_available: true,
            sort_order: size.sort_order ?? 0,
            group_id: 'pizza-size',
          })),
        };
        groups.push(sizeGroup);
      }

      // Açaí size group
      if (hasAcaiSizes) {
        const acaiSizeIds = (acaiSizesData as any[]).map((s) => s.id);

        const { data: acaiOptionGroupsData } = await supabase
          .from('acai_size_option_groups')
          .select('*')
          .in('size_id', acaiSizeIds)
          .order('sort_order');

        let acaiOptionsData: any[] = [];
        if (acaiOptionGroupsData && acaiOptionGroupsData.length > 0) {
          const groupIds = acaiOptionGroupsData.map((g: any) => g.id);
          const { data: optData } = await supabase
            .from('acai_size_options')
            .select('*')
            .in('group_id', groupIds)
            .eq('is_available', true)
            .order('sort_order');
          acaiOptionsData = optData || [];
        }

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
        groups.push(acaiSizeGroup);

        (acaiOptionGroupsData || []).forEach((acaiGroup: any) => {
          const groupOptions = acaiOptionsData.filter((o: any) => o.group_id === acaiGroup.id);
          const enhancedGroup: OptionGroup = {
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

      // Pizza dough group
      const hasProductDoughs = productDoughOptions.length > 0;
      if (isPizzaCategory && hasProductDoughs) {
        const doughGroup: OptionGroup = {
          id: 'pizza-dough',
          name: productDoughGroup?.name || 'Massa',
          description: null,
          is_required: productDoughGroup?.is_required ?? doughIsRequired,
          min_selections: (productDoughGroup?.is_required ?? doughIsRequired) ? 1 : 0,
          max_selections: productDoughGroup?.max_selections ?? doughMaxSelections,
          selection_type: (productDoughGroup?.max_selections ?? doughMaxSelections) === 1 ? 'single' : 'multiple',
          sort_order: -20,
          free_quantity_limit: 0,
          extra_unit_price: 0,
          options: productDoughOptions.map((dough: any) => ({
            id: dough.id,
            name: dough.name,
            price_modifier: Number(dough.price_modifier ?? 0),
            is_required: false,
            is_available: true,
            sort_order: dough.sort_order ?? 0,
            group_id: 'pizza-dough',
          })),
        };
        groups.push(doughGroup);
      }

      // Pizza crust group
      const hasProductCrusts = productCrustOptions.length > 0;
      if (isPizzaCategory && hasProductCrusts) {
        const crustGroup: OptionGroup = {
          id: 'pizza-crust',
          name: productCrustGroup?.name || 'Borda',
          description: null,
          is_required: productCrustGroup?.is_required ?? crustIsRequired,
          min_selections: (productCrustGroup?.is_required ?? crustIsRequired) ? 1 : 0,
          max_selections: productCrustGroup?.max_selections ?? crustMaxSelections,
          selection_type: (productCrustGroup?.max_selections ?? crustMaxSelections) === 1 ? 'single' : 'multiple',
          sort_order: -10,
          free_quantity_limit: 0,
          extra_unit_price: 0,
          options: productCrustOptions.map((crust: any) => ({
            id: crust.id,
            name: crust.name,
            price_modifier: Number(crust.price_modifier ?? 0),
            is_required: false,
            is_available: true,
            sort_order: crust.sort_order ?? 0,
            group_id: 'pizza-crust',
          })),
        };
        groups.push(crustGroup);
      }

      // Sort groups by sort_order
      groups.sort((a, b) => a.sort_order - b.sort_order);

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
    if (group.id === 'acai-size') {
      setSelectedAcaiSizeId(option.id);
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

  const visibleOptionGroups = optionGroups.filter((group) => {
    if (!group.id.startsWith('acai-group-')) return true;
    if (!selectedAcaiSizeId) return false;
    return group._acaiSizeId === selectedAcaiSizeId;
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

  // Calculate options total (excluding size which is the base price for pizza/açaí)
  const optionsTotal = visibleOptionGroups.reduce((groupSum, group) => {
    // Skip size groups - they define the base price
    if (group.selection_type === 'single' && group.name.toLowerCase() === 'tamanho') {
      return groupSum;
    }

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

  // Get base price: for pizza/açaí, use selected size price; otherwise use product price
  const getBasePriceForDisplay = (): number => {
    const sizeGroup = optionGroups.find(
      (group) => group.selection_type === 'single' && group.name.toLowerCase() === 'tamanho'
    );

    if (!sizeGroup) {
      return product.price;
    }

    const selectedSize = selectedOptions.find((o) => o.groupId === sizeGroup.id);
    if (!selectedSize) {
      return product.price;
    }

    const isAcaiSizeGroup = sizeGroup.id === 'acai-size';
    const isPizzaSizeGroup = sizeGroup.id === 'pizza-size';

    if (isAcaiSizeGroup || isPizzaSizeGroup) {
      return selectedSize.priceModifier;
    }

    return product.price + selectedSize.priceModifier;
  };

  const basePrice = getBasePriceForDisplay();
  const itemTotal = (basePrice + optionsTotal) * quantity;

  const handleAddToCart = () => {
    if (!validateRequiredGroups()) return;

    const sizeGroup = optionGroups.find(
      (group) => group.selection_type === 'single' && group.name.toLowerCase() === 'tamanho'
    );
    const sizeGroupId = sizeGroup?.id;

    // Pass base price + options (excluding size from options since it's in base price)
    const calculatedPrice = basePrice + optionsTotal;
    const optionsForCart = selectedOptions.map((o) => ({
      ...o,
      priceModifier: o.groupId === sizeGroupId ? 0 : o.priceModifier,
    }));

    onAddToCart(product, quantity, optionsForCart, notes, calculatedPrice);
    handleClose();
  };

  const handleClose = () => {
    setQuantity(1);
    setNotes('');
    setSelectedOptions([]);
    setOptionGroups([]);
    setIsPizzaProduct(false);
    setIsAcaiProduct(false);
    onClose();
  };

  const canAddToCart = validateRequiredGroups();
  const hasVisibleOptions = visibleOptionGroups.length > 0;

  const formatCurrency = (value: number) =>
    value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  // Check if size is selected (for pizza/açaí)
  const sizeGroup = optionGroups.find(
    (group) => group.selection_type === 'single' && group.name.toLowerCase() === 'tamanho'
  );
  const selectedSizeOption = sizeGroup ? selectedOptions.find((o) => o.groupId === sizeGroup.id) : null;
  const hasSizeGroup = !!sizeGroup;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="sm:max-w-lg w-[95vw] max-h-[90vh] overflow-hidden flex flex-col p-0 gap-0"
        aria-describedby={undefined}
      >
        {/* Header with product info */}
        <div className="relative bg-gradient-to-br from-primary/5 to-primary/10 border-b">
          <div className="flex gap-4 p-4">
            {product.image_url && (
              <div className="relative w-24 h-24 rounded-xl overflow-hidden bg-muted flex-shrink-0 shadow-md">
                <img
                  src={product.image_url}
                  alt={product.name}
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            <div className="flex-1 min-w-0 flex flex-col justify-center pr-8">
              <h2 className="font-bold text-lg leading-tight line-clamp-2">{product.name}</h2>
              {isPizzaProduct && (
                <Badge variant="secondary" className="mt-1 gap-1">
                  <Pizza className="h-3 w-3" />
                  Pizza
                </Badge>
              )}
              {/* Price display */}
              <div className="mt-2">
                {hasSizeGroup ? (
                  selectedSizeOption ? (
                    <div className="flex items-baseline gap-2">
                      <span className="text-xl font-bold text-primary">
                        {formatCurrency(basePrice)}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {selectedSizeOption.name}
                      </span>
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      Selecione um tamanho
                    </span>
                  )
                ) : (
                  <span className="text-xl font-bold text-primary">
                    {formatCurrency(product.price)}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Scrollable content */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="p-4 space-y-4">
            {product.description && (
              <p className="text-sm text-muted-foreground">{product.description}</p>
            )}

            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : hasVisibleOptions ? (
              <div className="space-y-4">
                {visibleOptionGroups.map((group) => (
                  <div
                    key={group.id}
                    className={cn(
                      'rounded-xl border bg-card overflow-hidden',
                      group.is_required && getGroupSelectionCount(group.id) === 0 && 'border-destructive/50'
                    )}
                  >
                    {/* Group header */}
                    <div className="flex items-center justify-between gap-2 px-4 py-3 bg-muted/50 border-b">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold text-sm">{group.name}</h4>
                          {group.is_required && (
                            <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                              Obrigatório
                            </Badge>
                          )}
                        </div>
                        {group.description && (
                          <p className="text-xs text-muted-foreground mt-0.5">{group.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
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

                    {/* Options */}
                    <div className="divide-y">
                      {group.selection_type === 'single' ? (
                        <RadioGroup
                          value={selectedOptions.find((o) => o.groupId === group.id)?.optionId || ''}
                          onValueChange={(value) => {
                            const option = group.options.find((o) => o.id === value);
                            if (option) handleSingleSelect(group, option);
                          }}
                        >
                          {group.options.map((option) => {
                            const isSelected = selectedOptions.some((o) => o.optionId === option.id);
                            return (
                              <div
                                key={option.id}
                                onClick={() => handleSingleSelect(group, option)}
                                className={cn(
                                  'flex items-center justify-between px-4 py-3 cursor-pointer transition-colors',
                                  isSelected ? 'bg-primary/5' : 'hover:bg-muted/50'
                                )}
                              >
                                <div className="flex items-center gap-3 min-w-0">
                                  <RadioGroupItem value={option.id} id={`pos-${option.id}`} />
                                  <Label
                                    htmlFor={`pos-${option.id}`}
                                    className="cursor-pointer text-sm font-medium"
                                  >
                                    {option.name}
                                  </Label>
                                </div>
                                {option.price_modifier !== 0 && (
                                  <span
                                    className={cn(
                                      'text-sm font-semibold flex-shrink-0',
                                      option.price_modifier > 0 ? 'text-primary' : 'text-green-600'
                                    )}
                                  >
                                    {group.name.toLowerCase() === 'tamanho'
                                      ? formatCurrency(option.price_modifier)
                                      : `${option.price_modifier > 0 ? '+' : ''}${formatCurrency(option.price_modifier)}`}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </RadioGroup>
                      ) : (
                        group.options.map((option) => {
                          const isSelected = selectedOptions.some((o) => o.optionId === option.id);
                          const currentCount = getGroupSelectionCount(group.id);
                          const maxReached = currentCount >= group.max_selections && !isSelected;

                          return (
                            <div
                              key={option.id}
                              onClick={() => !maxReached && handleMultipleToggle(group, option)}
                              className={cn(
                                'flex items-center justify-between px-4 py-3 cursor-pointer transition-colors',
                                isSelected
                                  ? 'bg-primary/5'
                                  : maxReached
                                  ? 'opacity-50 cursor-not-allowed'
                                  : 'hover:bg-muted/50'
                              )}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <Checkbox
                                  checked={isSelected}
                                  disabled={maxReached}
                                  onCheckedChange={() => handleMultipleToggle(group, option)}
                                />
                                <span className="text-sm font-medium">{option.name}</span>
                              </div>
                              {option.price_modifier !== 0 && (
                                <span
                                  className={cn(
                                    'text-sm font-semibold flex-shrink-0',
                                    option.price_modifier > 0 ? 'text-primary' : 'text-green-600'
                                  )}
                                >
                                  {option.price_modifier > 0 ? '+' : ''}
                                  {formatCurrency(option.price_modifier)}
                                </span>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground">
                <p className="text-sm">Este produto não possui adicionais</p>
              </div>
            )}

            {/* Notes */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Observações</Label>
              <Textarea
                placeholder="Ex: sem cebola, bem passado..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="resize-none text-sm"
              />
            </div>
          </div>
        </ScrollArea>

        {/* Footer with quantity and add button */}
        <div className="border-t bg-background p-4 space-y-3">
          {/* Price summary */}
          {optionsTotal > 0 && (
            <div className="flex items-center justify-between text-sm px-1">
              <span className="text-muted-foreground">Adicionais:</span>
              <span className="font-medium text-primary">+{formatCurrency(optionsTotal)}</span>
            </div>
          )}

          {/* Quantity controls */}
          <div className="flex items-center justify-center gap-4">
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10 rounded-full"
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
            >
              <Minus className="h-4 w-4" />
            </Button>
            <span className="text-xl font-bold w-12 text-center">{quantity}</span>
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10 rounded-full"
              onClick={() => setQuantity(quantity + 1)}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {/* Add to cart button */}
          <Button
            className="w-full h-12 text-base font-semibold gap-2"
            onClick={handleAddToCart}
            disabled={!canAddToCart}
          >
            <Check className="h-5 w-5" />
            Adicionar • {formatCurrency(itemTotal)}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
