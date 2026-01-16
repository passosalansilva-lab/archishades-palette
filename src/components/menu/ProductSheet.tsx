import { useState, useEffect } from 'react';
import { Minus, Plus, ArrowLeft, Info, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Sheet,
  SheetContent,
  SheetClose,
} from '@/components/ui/sheet';
import { useCart } from '@/hooks/useCart';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAcaiOptionsCache } from '@/hooks/useAcaiOptionsCache';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import { ProductTagsBadges } from './ProductTagsEditor';

interface ProductOption {
  id: string;
  name: string;
  description?: string | null;
  price_modifier: number;
  is_required: boolean;
  is_available?: boolean;
  sort_order?: number;
  group_id?: string | null;
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
  options: ProductOption[];
}

interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  promotional_price?: number | null;
  image_url: string | null;
  category_id: string | null;
  product_options?: ProductOption[];
  requires_preparation?: boolean;
  tags?: string[];
}

interface ProductSheetProps {
  product: Product | null;
  open: boolean;
  onClose: () => void;
  primaryColor?: string | null;
}

// Helper function to convert hex to HSL
function hexToHsl(hex: string): string | null {
  const cleanHex = hex.replace('#', '');
  if (cleanHex.length !== 6) return null;
  const r = parseInt(cleanHex.slice(0, 2), 16) / 255;
  const g = parseInt(cleanHex.slice(2, 4), 16) / 255;
  const b = parseInt(cleanHex.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }

  const hDeg = Math.round(h * 360);
  const sPercent = Math.round(s * 100);
  const lPercent = Math.round(l * 100);
  return `${hDeg} ${sPercent}% ${lPercent}%`;
}

interface SelectedOption {
  groupId: string;
  groupName: string;
  optionId: string;
  name: string;
  priceModifier: number;
}

interface ProductIngredient {
  id: string;
  name: string;
  is_removable: boolean;
}

// Compact Option Card Component
function OptionCard({ 
  option, 
  isSelected, 
  onSelect, 
  disabled,
  selectionType,
  priceDisplay,
  showHalfPrice
}: { 
  option: ProductOption; 
  isSelected: boolean; 
  onSelect: () => void;
  disabled?: boolean;
  selectionType: 'single' | 'multiple';
  priceDisplay: number;
  showHalfPrice?: boolean;
}) {
  const hasImage = option.image_url && option.image_url.trim() !== '';
  
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={cn(
        "relative w-full text-left rounded-xl border-2 transition-all duration-200 overflow-hidden",
        "focus:outline-none focus:ring-2 focus:ring-primary/30",
        isSelected
          ? "border-primary bg-primary/5 shadow-md"
          : "border-border hover:border-primary/40 hover:bg-muted/30",
        disabled && "opacity-50 cursor-not-allowed",
        hasImage ? "p-0" : "px-4 py-3"
      )}
    >
      {hasImage ? (
        <div className="flex items-center">
          <div className="w-16 h-16 flex-shrink-0 bg-muted">
            <img
              src={option.image_url!}
              alt={option.name}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </div>
          <div className="flex-1 px-3 py-2 flex items-center justify-between gap-2 min-w-0">
            <div className="flex-1 min-w-0">
              <span className="font-medium text-sm block truncate">{option.name}</span>
              {option.description && (
                <span className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                  {option.description}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {priceDisplay !== 0 && (
                <span className={cn(
                  "text-sm font-bold whitespace-nowrap",
                  priceDisplay > 0 ? "text-primary" : "text-green-600"
                )}>
                  {priceDisplay > 0 ? '+' : ''}R$ {priceDisplay.toFixed(2)}
                  {showHalfPrice && ' (½)'}
                </span>
              )}
              <div className={cn(
                "w-5 h-5 border-2 flex items-center justify-center flex-shrink-0 transition-colors",
                selectionType === 'single' ? "rounded-full" : "rounded-md",
                isSelected 
                  ? "bg-primary border-primary" 
                  : "border-muted-foreground/40"
              )}>
                {isSelected && (
                  <Check className="h-3 w-3 text-primary-foreground" strokeWidth={3} />
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className={cn(
              "w-5 h-5 border-2 flex items-center justify-center flex-shrink-0 transition-colors",
              selectionType === 'single' ? "rounded-full" : "rounded-md",
              isSelected 
                ? "bg-primary border-primary" 
                : "border-muted-foreground/40"
            )}>
              {isSelected && (
                <Check className="h-3 w-3 text-primary-foreground" strokeWidth={3} />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <span className="font-medium text-sm block truncate">{option.name}</span>
              {option.description && (
                <span className="text-xs text-muted-foreground line-clamp-1">
                  {option.description}
                </span>
              )}
            </div>
          </div>
          {priceDisplay !== 0 && (
            <span className={cn(
              "text-sm font-bold whitespace-nowrap flex-shrink-0",
              priceDisplay > 0 ? "text-primary" : "text-green-600"
            )}>
              {priceDisplay > 0 ? '+' : ''}R$ {priceDisplay.toFixed(2)}
              {showHalfPrice && ' (½)'}
            </span>
          )}
        </div>
      )}
    </button>
  );
}

export function ProductSheet({ product, open, onClose, primaryColor }: ProductSheetProps) {
  const { addItem } = useCart();
  const acaiCache = useAcaiOptionsCache();
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');
  const [selectedOptions, setSelectedOptions] = useState<SelectedOption[]>([]);
  const [optionGroups, setOptionGroups] = useState<OptionGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [ingredients, setIngredients] = useState<ProductIngredient[]>([]);
  const [removedIngredients, setRemovedIngredients] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open && product) {
      loadOptionGroups();
      loadIngredients();
    }
  }, [open, product?.id]);

  const loadIngredients = async () => {
    if (!product) return;
    try {
      const { data, error } = await supabase
        .from('product_ingredients')
        .select('id, name, is_removable')
        .eq('product_id', product.id)
        .eq('is_removable', true)
        .order('sort_order');

      if (error) throw error;
      setIngredients(data || []);
    } catch (error) {
      console.error('Error loading ingredients:', error);
    }
  };

  const loadOptionGroups = async () => {
    if (!product) return;

    setLoading(true);
    try {
      const categoryId = product.category_id;

      const [
        groupsResult,
        optionsResult,
        sizesResult,
        doughTypesResult,
        crustLinksResult,
        globalCrustFlavorsResult,
        acaiCategoryResult,
        acaiSizesResult,
        pizzaCategoryResult,
        pizzaCategorySettingsResult,
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
          ? supabase
              .from('pizza_category_sizes')
              .select('id, name, base_price, max_flavors, slices, sort_order')
              .eq('category_id', categoryId)
              .order('sort_order')
          : Promise.resolve({ data: null, error: null } as any),
        supabase
          .from('pizza_dough_types')
          .select('id, name, extra_price, active')
          .eq('active', true),
        supabase
          .from('pizza_product_crust_flavors')
          .select('id, product_id, crust_flavor_id, pizza_crust_flavors ( id, name, extra_price, active )')
          .eq('product_id', product.id),
        supabase
          .from('pizza_crust_flavors')
          .select('id, name, extra_price, active')
          .eq('active', true),
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
        categoryId
          ? supabase
              .from('pizza_categories')
              .select('category_id')
              .eq('category_id', categoryId)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null } as any),
        categoryId
          ? supabase
              .from('pizza_category_settings')
              .select('*')
              .eq('category_id', categoryId)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null } as any),
      ]);

      const { data: groupsData, error: groupsError } = groupsResult as any;
      const { data: optionsData, error: optionsError } = optionsResult as any;
      const { data: sizesData, error: sizesError } = sizesResult as any;
      const { data: doughTypes, error: doughTypesError } = doughTypesResult as any;
      const { data: crustLinks, error: crustLinksError } = crustLinksResult as any;
      const { data: globalCrustFlavors, error: globalCrustFlavorsError } = globalCrustFlavorsResult as any;
      const { data: acaiCategoryData, error: acaiCategoryError } = acaiCategoryResult as any;
      const { data: acaiSizesData, error: acaiSizesError } = acaiSizesResult as any;
      const { data: pizzaCategoryData, error: pizzaCategoryError } = pizzaCategoryResult as any;
      const { data: pizzaCategorySettingsData } = pizzaCategorySettingsResult as any;

      if (groupsError) throw groupsError;
      if (optionsError) throw optionsError;
      if (sizesError) throw sizesError;
      if (doughTypesError) throw doughTypesError;
      if (crustLinksError) throw crustLinksError;
      if (globalCrustFlavorsError) throw globalCrustFlavorsError;
      if (acaiCategoryError) throw acaiCategoryError;
      if (acaiSizesError) throw acaiSizesError;
      if (pizzaCategoryError) throw pizzaCategoryError;

      const isAcaiCategory = !!acaiCategoryData;
      const isPizzaCategory = !!pizzaCategoryData;
      const hasAcaiSizes = isAcaiCategory && acaiSizesData && Array.isArray(acaiSizesData) && acaiSizesData.length > 0;
      const hasPizzaSizes = isPizzaCategory && sizesData && Array.isArray(sizesData) && sizesData.length > 0;
      
      // Pizza category settings with defaults
      const pizzaSettings = pizzaCategorySettingsData || {};
      const doughMaxSelections = pizzaSettings.dough_max_selections ?? 1;
      const doughIsRequired = pizzaSettings.dough_is_required ?? true;
      const crustMaxSelections = pizzaSettings.crust_max_selections ?? 1;
      const crustIsRequired = pizzaSettings.crust_is_required ?? false;

      const groups: OptionGroup[] = (groupsData || []).map((group: any) => ({
        ...group,
        free_quantity_limit: group.free_quantity_limit ?? 0,
        extra_unit_price: group.extra_unit_price ?? 0,
        options: (optionsData || [])
          .filter((opt: any) => opt.group_id === group.id)
          .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
      }));

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

      if (hasPizzaSizes) {
        const sizeGroup: OptionGroup = {
          id: 'pizza-size',
          name: 'Tamanho',
          description: 'Selecione o tamanho da pizza',
          is_required: true,
          min_selections: 1,
          max_selections: 1,
          selection_type: 'single',
          sort_order: -2,
          free_quantity_limit: 0,
          extra_unit_price: 0,
          options: (sizesData as any[]).map((size) => ({
            id: size.id,
            name: size.name,
            description: size.slices ? `${size.slices} pedaços` : (size.max_flavors ? `Até ${size.max_flavors} sabores` : null),
            price_modifier: Number(size.base_price ?? 0),
            is_required: true,
            is_available: true,
            sort_order: size.sort_order ?? 0,
            group_id: 'pizza-size',
          })),
        };
        groups.push(sizeGroup);
      }

      if (hasAcaiSizes && categoryId) {
        const cachedData = acaiCache.getAcaiCache(categoryId);
        
        let acaiSizesForGroups: any[];
        let acaiOptionGroupsData: any[];
        let acaiOptionsData: any[];

        if (cachedData && cachedData.sizes.length > 0) {
          acaiSizesForGroups = cachedData.sizes;
          acaiOptionGroupsData = cachedData.optionGroups;
          acaiOptionsData = cachedData.options;
        } else {
          acaiSizesForGroups = acaiSizesData as any[];
          const acaiSizeIds = acaiSizesForGroups.map((s) => s.id);
          
          const { data: groupsFromDb, error: acaiGroupsError } = await supabase
            .from('acai_size_option_groups')
            .select('*')
            .in('size_id', acaiSizeIds)
            .order('sort_order');

          if (acaiGroupsError) throw acaiGroupsError;
          acaiOptionGroupsData = groupsFromDb || [];

          if (acaiOptionGroupsData.length > 0) {
            const groupIds = acaiOptionGroupsData.map((g: any) => g.id);
            const { data: optData, error: optError } = await supabase
              .from('acai_size_options')
              .select('*')
              .in('group_id', groupIds)
              .eq('is_available', true)
              .order('sort_order');

            if (optError) throw optError;
            acaiOptionsData = optData || [];
          } else {
            acaiOptionsData = [];
          }
        }

        const acaiSizeGroup: OptionGroup = {
          id: 'acai-size',
          name: 'Tamanho',
          description: 'Selecione o tamanho do açaí. Cada tamanho possui adicionais específicos.',
          is_required: true,
          min_selections: 1,
          max_selections: 1,
          selection_type: 'single',
          sort_order: -2,
          free_quantity_limit: 0,
          extra_unit_price: 0,
          options: acaiSizesForGroups.map((size) => ({
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

        const acaiGroupsBySize: Record<string, any[]> = {};
        acaiOptionGroupsData.forEach((g: any) => {
          const sizeId = g.size_id;
          if (!acaiGroupsBySize[sizeId]) acaiGroupsBySize[sizeId] = [];
          acaiGroupsBySize[sizeId].push(g);
        });

        acaiSizesForGroups.forEach((size, sizeIndex) => {
          const sizeGroups = acaiGroupsBySize[size.id] || [];
          
          sizeGroups.forEach((group, groupIndex) => {
            const groupOptions = acaiOptionsData.filter((opt: any) => opt.group_id === group.id);
            
            if (groupOptions.length > 0) {
              groups.push({
                id: `acai-group-${group.id}`,
                name: group.name,
                description: group.description,
                is_required: group.min_selections > 0,
                min_selections: group.min_selections || 0,
                max_selections: group.max_selections || groupOptions.length,
                selection_type: 'multiple',
                sort_order: sizeIndex * 100 + groupIndex + 1,
                free_quantity_limit: group.free_quantity || 0,
                extra_unit_price: group.extra_price_per_item || 0,
                options: groupOptions.map((opt: any) => ({
                  id: opt.id,
                  name: opt.name,
                  description: opt.description,
                  price_modifier: Number(opt.price_modifier ?? 0),
                  is_required: false,
                  is_available: opt.is_available !== false,
                  sort_order: opt.sort_order ?? 0,
                  group_id: `acai-group-${group.id}`,
                  image_url: opt.image_url,
                })),
                _acaiSizeId: size.id,
              } as OptionGroup & { _acaiSizeId?: string });
            }
          });
        });
      }

      if (isPizzaCategory && doughTypes && Array.isArray(doughTypes) && doughTypes.length > 0) {
        const doughGroup: OptionGroup = {
          id: 'pizza-dough',
          name: 'Tipo de massa',
          description: null,
          is_required: doughIsRequired,
          min_selections: doughIsRequired ? 1 : 0,
          max_selections: doughMaxSelections,
          selection_type: doughMaxSelections === 1 ? 'single' : 'multiple',
          sort_order: -1,
          free_quantity_limit: 0,
          extra_unit_price: 0,
          options: (doughTypes as any[]).map((dough) => ({
            id: dough.id,
            name: dough.name,
            price_modifier: Number(dough.extra_price ?? 0),
            is_required: false,
            is_available: true,
            sort_order: 0,
            group_id: 'pizza-dough',
          })),
        };
        groups.push(doughGroup);
      }

      if (isPizzaCategory) {
        let crustFlavorOptions: ProductOption[] = [];

        if (crustLinks && Array.isArray(crustLinks) && crustLinks.length > 0) {
          crustFlavorOptions = crustLinks
            .filter((link: any) => link.pizza_crust_flavors?.active)
            .map((link: any) => ({
              id: link.pizza_crust_flavors.id,
              name: link.pizza_crust_flavors.name,
              price_modifier: Number(link.pizza_crust_flavors.extra_price ?? 0),
              is_required: false,
              is_available: true,
              sort_order: 0,
              group_id: 'pizza-crust',
            }));
        } else if (globalCrustFlavors && Array.isArray(globalCrustFlavors) && globalCrustFlavors.length > 0) {
          crustFlavorOptions = globalCrustFlavors.map((crust: any) => ({
            id: crust.id,
            name: crust.name,
            price_modifier: Number(crust.extra_price ?? 0),
            is_required: false,
            is_available: true,
            sort_order: 0,
            group_id: 'pizza-crust',
          }));
        }

        if (crustFlavorOptions.length > 0) {
          const crustGroup: OptionGroup = {
            id: 'pizza-crust',
            name: 'Borda recheada',
            description: 'Opcional - escolha uma borda recheada',
            is_required: crustIsRequired,
            min_selections: crustIsRequired ? 1 : 0,
            max_selections: crustMaxSelections,
            selection_type: crustMaxSelections === 1 ? 'single' : 'multiple',
            sort_order: 0,
            free_quantity_limit: 0,
            extra_unit_price: 0,
            options: crustFlavorOptions,
          };
          groups.push(crustGroup);
        }
      }

      groups.sort((a, b) => a.sort_order - b.sort_order);
      setOptionGroups(groups);

      if (product.product_options && product.product_options.length > 0 && groups.length === 0) {
        setOptionGroups([
          {
            id: 'legacy',
            name: 'Adicionais',
            description: null,
            is_required: false,
            min_selections: 0,
            max_selections: product.product_options.length,
            selection_type: 'multiple',
            sort_order: 0,
            free_quantity_limit: 0,
            extra_unit_price: 0,
            options: product.product_options.map((opt) => ({
              ...opt,
              description: null,
              is_available: true,
              sort_order: 0,
              group_id: 'legacy',
            })),
          },
        ]);
      }
    } catch (error) {
      console.error('Error loading option groups:', error);
      toast.error('Erro ao carregar opções do produto');
    } finally {
      setLoading(false);
    }
  };

  if (!product) return null;

  const selectedAcaiSizeId = selectedOptions.find((o) => o.groupId === 'acai-size')?.optionId;

  const visibleOptionGroups = optionGroups.filter((group) => {
    if (!group.id.startsWith('acai-group-')) return true;
    if (!selectedAcaiSizeId) return false;
    const groupWithMeta = group as OptionGroup & { _acaiSizeId?: string };
    return groupWithMeta._acaiSizeId === selectedAcaiSizeId;
  });

  const handleSingleSelect = (group: OptionGroup, option: ProductOption) => {
    let filtered = selectedOptions.filter((o) => o.groupId !== group.id);
    
    if (group.id === 'acai-size') {
      filtered = filtered.filter((o) => !o.groupId.startsWith('acai-group-'));
    }
    
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

  const handleMultipleToggle = (group: OptionGroup, option: ProductOption) => {
    const currentlySelected = selectedOptions.some((o) => o.optionId === option.id);

    if (currentlySelected) {
      setSelectedOptions((prev) => prev.filter((o) => o.optionId !== option.id));
    } else {
      const groupCount = selectedOptions.filter((o) => o.groupId === group.id).length;
      const maxAllowed = group.selection_type === 'half_half' ? 2 : group.max_selections;

      if (groupCount >= maxAllowed) {
        return;
      }

      const priceModifier =
        group.selection_type === 'half_half'
          ? option.price_modifier / 2
          : option.price_modifier;

      setSelectedOptions((prev) => [
        ...prev,
        {
          groupId: group.id,
          groupName: group.name,
          optionId: option.id,
          name: option.name,
          priceModifier,
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

  const optionsTotal = visibleOptionGroups.reduce((groupSum, group) => {
    if (group.selection_type === "single" && group.name.toLowerCase() === "tamanho") {
      return groupSum;
    }

    const groupSelections = selectedOptions.filter((opt) => opt.groupId === group.id);

    if (group.selection_type === "multiple" && group.free_quantity_limit > 0) {
      if (groupSelections.length === 0) return groupSum;

      const sortedByPrice = [...groupSelections].sort((a, b) => a.priceModifier - b.priceModifier);
      const paidSelections = sortedByPrice.slice(group.free_quantity_limit);
      const extrasValue = paidSelections.reduce((sum, opt) => sum + opt.priceModifier, 0);
      return groupSum + extrasValue;
    }

    const baseSum = groupSelections.reduce((sum, opt) => sum + opt.priceModifier, 0);
    return groupSum + baseSum;
  }, 0);

  const getBasePriceForDisplay = () => {
    const baseProductPrice = (product.promotional_price && Number(product.promotional_price) > 0)
      ? Number(product.promotional_price)
      : product.price;

    const sizeGroup = optionGroups.find(
      (group) => group.selection_type === "single" && group.name.toLowerCase() === "tamanho"
    );

    if (!sizeGroup) {
      return baseProductPrice;
    }

    const selectedSize = selectedOptions.find((o) => o.groupId === sizeGroup.id);
    if (!selectedSize) {
      return baseProductPrice;
    }

    const isAcaiSizeGroup = sizeGroup.id === 'acai-size';
    const isPizzaSizeGroup = sizeGroup.id === 'pizza-size';

    if (isAcaiSizeGroup || isPizzaSizeGroup) {
      return selectedSize.priceModifier;
    }

    return baseProductPrice + selectedSize.priceModifier;
  };

  const itemTotal = (getBasePriceForDisplay() + optionsTotal) * quantity;

  const handleAddToCart = () => {
    if (!validateRequiredGroups()) {
      return;
    }

    const sizeGroup = optionGroups.find(
      (group) => group.selection_type === 'single' && group.name.toLowerCase() === 'tamanho'
    );

    const basePrice = getBasePriceForDisplay();
    const sizeGroupId = sizeGroup?.id;

    const removedList = ingredients
      .filter((i) => removedIngredients.has(i.id))
      .map((i) => i.name);
    const finalNotes = [
      ...(removedList.length > 0 ? [`Sem: ${removedList.join(', ')}`] : []),
      ...(notes ? [notes] : []),
    ].join(' | ');

    addItem({
      productId: product.id,
      productName: product.name,
      price: basePrice,
      quantity,
      options: selectedOptions.map((o) => ({
        name: o.name,
        groupName: o.groupName,
        priceModifier: o.groupId === sizeGroupId ? 0 : o.priceModifier,
      })),
      notes: finalNotes || undefined,
      imageUrl: product.image_url || undefined,
      requiresPreparation: product.requires_preparation !== false,
    });
    handleClose();
  };

  const handleClose = () => {
    setQuantity(1);
    setNotes('');
    setSelectedOptions([]);
    setOptionGroups([]);
    setIngredients([]);
    setRemovedIngredients(new Set());
    onClose();
  };

  const canAddToCart = validateRequiredGroups();

  // Calculate primary color style
  const primaryHsl = primaryColor ? hexToHsl(primaryColor) : null;
  const colorStyle = primaryHsl ? { '--primary': primaryHsl } as React.CSSProperties : {};

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent 
        side="right" 
        className="w-full sm:max-w-lg p-0 flex flex-col"
        style={colorStyle}
      >
        {/* Header with back button */}
        <div className="flex-shrink-0 sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b">
          <div className="flex items-center gap-3 p-4">
            <SheetClose asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </SheetClose>
            <div className="flex-1 min-w-0">
              <h2 className="font-bold text-lg truncate">{product.name}</h2>
            </div>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {/* Product Image */}
          {product.image_url && (
            <div className="relative w-full aspect-video bg-muted">
              <img
                src={product.image_url}
                alt={product.name}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
            </div>
          )}

          {/* Product Info & Options */}
          <div className="p-4 space-y-5">
            {/* Price */}
            <div className="flex items-center gap-3">
              {product.promotional_price && Number(product.promotional_price) > 0 ? (
                <>
                  <span className="text-lg line-through text-muted-foreground">
                    R$ {Number(product.price).toFixed(2)}
                  </span>
                  <span className="text-2xl font-bold text-primary">
                    R$ {getBasePriceForDisplay().toFixed(2)}
                  </span>
                </>
              ) : (
                <span className="text-2xl font-bold text-primary">
                  R$ {getBasePriceForDisplay().toFixed(2)}
                </span>
              )}
            </div>

            {/* Product Tags */}
            {product.tags && product.tags.length > 0 && (
              <ProductTagsBadges tags={product.tags} />
            )}

            {product.description && (
              <p className="text-muted-foreground text-sm leading-relaxed">
                {product.description}
              </p>
            )}

            {/* Option Groups */}
            {loading ? (
              <div className="space-y-4 py-8">
                <div className="h-4 w-24 bg-muted animate-pulse rounded" />
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-14 bg-muted animate-pulse rounded-xl" />
                  ))}
                </div>
              </div>
            ) : visibleOptionGroups.length > 0 ? (
              <div className="space-y-6">
                {visibleOptionGroups.map((group) => {
                  return (
                    <div key={group.id} className="space-y-3">
                      {/* Group Header */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <h4 className="font-semibold text-base">{group.name}</h4>
                          {group.id === 'acai-size' && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Info className="h-4 w-4 text-muted-foreground cursor-help flex-shrink-0" />
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-[220px]">
                                  <p className="text-xs">Cada tamanho possui seus próprios adicionais.</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {group.is_required && (
                            <Badge variant="destructive" className="text-xs px-2 py-0.5">
                              Obrigatório
                            </Badge>
                          )}
                          {group.selection_type === 'multiple' && group.max_selections > 1 && (
                            <Badge variant="outline" className="text-xs px-2 py-0.5">
                              {getGroupSelectionCount(group.id)}/{group.max_selections}
                            </Badge>
                          )}
                          {group.selection_type === 'multiple' && group.free_quantity_limit > 0 && (
                            <Badge variant="secondary" className="text-xs px-2 py-0.5">
                              {group.free_quantity_limit} grátis
                            </Badge>
                          )}
                          {group.selection_type === 'half_half' && (
                            <Badge variant="outline" className="text-xs px-2 py-0.5">
                              {getGroupSelectionCount(group.id)}/2
                            </Badge>
                          )}
                        </div>
                      </div>

                      {group.description && group.id !== 'acai-size' && (
                        <p className="text-xs text-muted-foreground -mt-1">{group.description}</p>
                      )}

                      {/* Options */}
                      <div className="space-y-2">
                        {group.options.map((option) => {
                          const isSelected = selectedOptions.some((o) => o.optionId === option.id);
                          const currentCount = selectedOptions.filter((o) => o.groupId === group.id).length;
                          const maxAllowed = group.selection_type === 'half_half' ? 2 : group.max_selections;
                          // For single selection, never disable - user can always change selection
                          const maxReached = group.selection_type === 'single' ? false : (currentCount >= maxAllowed && !isSelected);
                          const isHalfHalf = group.selection_type === 'half_half';
                          const priceDisplay = isHalfHalf ? option.price_modifier / 2 : option.price_modifier;

                          return (
                            <OptionCard
                              key={option.id}
                              option={option}
                              isSelected={isSelected}
                              onSelect={() => {
                                if (group.selection_type === 'single') {
                                  handleSingleSelect(group, option);
                                } else {
                                  handleMultipleToggle(group, option);
                                }
                              }}
                              disabled={maxReached}
                              selectionType={group.selection_type === 'single' ? 'single' : 'multiple'}
                              priceDisplay={priceDisplay}
                              showHalfPrice={isHalfHalf}
                            />
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}

            {/* Removable Ingredients */}
            {ingredients.length > 0 && (
              <div className="space-y-3 pt-2">
                <div>
                  <h4 className="font-semibold text-base">Remover ingredientes</h4>
                  <p className="text-xs text-muted-foreground">Marque os que deseja remover</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {ingredients.map((ingredient) => {
                    const isRemoved = removedIngredients.has(ingredient.id);
                    return (
                      <button
                        key={ingredient.id}
                        type="button"
                        onClick={() => {
                          const newSet = new Set(removedIngredients);
                          if (isRemoved) {
                            newSet.delete(ingredient.id);
                          } else {
                            newSet.add(ingredient.id);
                          }
                          setRemovedIngredients(newSet);
                        }}
                        className={cn(
                          "px-3 py-1.5 rounded-full text-sm border-2 transition-all",
                          isRemoved
                            ? "bg-destructive/10 border-destructive text-destructive line-through"
                            : "bg-background border-border hover:border-primary/50"
                        )}
                      >
                        {isRemoved ? `Sem ${ingredient.name}` : ingredient.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Notes */}
            <div className="space-y-2 pt-2">
              <Label htmlFor="notes" className="text-sm font-medium">Observações</Label>
              <Textarea
                id="notes"
                placeholder="Ex: Bem passado, pouco sal..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="resize-none text-sm"
                autoFocus={false}
              />
            </div>
          </div>
        </div>

        {/* Sticky Footer */}
        <div className="flex-shrink-0 border-t bg-background p-4 safe-area-inset-bottom">
          <div className="flex items-center gap-3">
            <div className="flex items-center bg-secondary rounded-xl p-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 rounded-lg"
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <span className="font-bold w-10 text-center text-lg">{quantity}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 rounded-lg"
                onClick={() => setQuantity(quantity + 1)}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            <Button
              className="flex-1 h-12 rounded-xl text-base font-bold bg-primary hover:bg-primary/90 text-primary-foreground"
              onClick={handleAddToCart}
              disabled={!canAddToCart}
            >
              Adicionar • R$ {itemTotal.toFixed(2)}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
