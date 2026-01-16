import { useState, useEffect } from 'react';
import { Minus, Plus, X, Trash2, ArrowLeft, Coffee, Info, Check, ShoppingBag, Package, ChevronRight, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { useCart } from '@/hooks/useCart';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
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
import { GroupedOptionsDisplay } from '@/components/ui/grouped-options-display';

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
}

interface ProductModalProps {
  product: Product | null;
  open: boolean;
  onClose: () => void;
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

// Compact Option Card Component for better visual display
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
        "relative w-full text-left rounded-lg border transition-all duration-150 overflow-hidden",
        "focus:outline-none focus:ring-2 focus:ring-primary/30",
        isSelected
          ? "border-primary bg-primary/5 shadow-sm"
          : "border-border hover:border-primary/40 hover:bg-muted/20",
        disabled && "opacity-50 cursor-not-allowed",
        hasImage ? "p-0" : "px-3 py-2"
      )}
    >
      {hasImage ? (
        // Card with image - more compact
        <div className="flex items-center">
          <div className="w-12 h-12 flex-shrink-0 bg-muted">
            <img
              src={option.image_url!}
              alt={option.name}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </div>
          <div className="flex-1 px-2.5 py-1.5 flex items-center justify-between gap-2 min-w-0">
            <div className="flex-1 min-w-0">
              <span className="font-medium text-xs block truncate">{option.name}</span>
              {option.description && (
                <span className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5">
                  {option.description}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {priceDisplay !== 0 && (
                <span className={cn(
                  "text-xs font-semibold whitespace-nowrap",
                  priceDisplay > 0 ? "text-primary" : "text-green-600"
                )}>
                  {priceDisplay > 0 ? '+' : ''}R$ {priceDisplay.toFixed(2)}
                  {showHalfPrice && ' (½)'}
                </span>
              )}
              <div className={cn(
                "w-4 h-4 border-2 flex items-center justify-center flex-shrink-0 transition-colors",
                selectionType === 'single' ? "rounded-full" : "rounded",
                isSelected 
                  ? "bg-primary border-primary" 
                  : "border-muted-foreground/40"
              )}>
                {isSelected && (
                  <Check className="h-2.5 w-2.5 text-primary-foreground" strokeWidth={3} />
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        // Card without image - compact
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className={cn(
              "w-4 h-4 border-2 flex items-center justify-center flex-shrink-0 transition-colors",
              selectionType === 'single' ? "rounded-full" : "rounded",
              isSelected 
                ? "bg-primary border-primary" 
                : "border-muted-foreground/40"
            )}>
              {isSelected && (
                <Check className="h-2.5 w-2.5 text-primary-foreground" strokeWidth={3} />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <span className="font-medium text-xs block truncate">{option.name}</span>
              {option.description && (
                <span className="text-[10px] text-muted-foreground line-clamp-1">
                  {option.description}
                </span>
              )}
            </div>
          </div>
          {priceDisplay !== 0 && (
            <span className={cn(
              "text-xs font-semibold whitespace-nowrap flex-shrink-0",
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

export function ProductModal({ product, open, onClose }: ProductModalProps) {
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
        // Fetch product-specific pizza settings (takes priority over category settings)
        supabase
          .from('pizza_product_settings')
          .select('*')
          .eq('product_id', product.id)
          .maybeSingle(),
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
      const { data: pizzaCategorySettingsData, error: pizzaCategorySettingsError } = pizzaCategorySettingsResult as any;
      const { data: pizzaProductSettingsData, error: pizzaProductSettingsError } = pizzaProductSettingsResult as any;

      if (groupsError) throw groupsError;
      if (optionsError) throw optionsError;
      if (sizesError) throw sizesError;
      if (doughTypesError) throw doughTypesError;
      if (crustLinksError) throw crustLinksError;
      if (globalCrustFlavorsError) throw globalCrustFlavorsError;
      if (acaiCategoryError) throw acaiCategoryError;
      if (acaiSizesError) throw acaiSizesError;
      if (pizzaCategoryError) throw pizzaCategoryError;
      // Don't throw for settings error - just use defaults

      const isAcaiCategory = !!acaiCategoryData;
      const isPizzaCategory = !!pizzaCategoryData;
      const hasAcaiSizes = isAcaiCategory && acaiSizesData && Array.isArray(acaiSizesData) && acaiSizesData.length > 0;
      const hasCategorySizes = isPizzaCategory && sizesData && Array.isArray(sizesData) && sizesData.length > 0;
      
      // Pizza settings: product settings take priority over category settings
      const productSettings = pizzaProductSettingsData || {};
      const categorySettings = pizzaCategorySettingsData || {};
      
      // Use product settings if available, otherwise fall back to category settings
      const doughMaxSelections = productSettings.dough_max_selections ?? categorySettings.dough_max_selections ?? 1;
      const doughIsRequired = productSettings.dough_is_required ?? categorySettings.dough_is_required ?? true;
      const crustMaxSelections = productSettings.crust_max_selections ?? categorySettings.crust_max_selections ?? 1;
      const crustIsRequired = productSettings.crust_is_required ?? categorySettings.crust_is_required ?? false;

      // Check for product-specific sizes/doughs/crusts from product_options
      const allProductGroups = groupsData || [];
      const allProductOptions = optionsData || [];
      
      // Find product-specific pizza groups
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
      
      // Use product sizes if available, otherwise use category sizes
      const hasProductSizes = isPizzaCategory && productSizeOptions.length > 0;
      const hasPizzaSizes = hasCategorySizes || hasProductSizes;

      // Filter out groups that are managed by pizza configuration system
      // These will be added back with proper settings
      const pizzaSystemGroupIds = [productSizeGroup?.id, productDoughGroup?.id, productCrustGroup?.id].filter(Boolean);
      const filteredGroupsData = isPizzaCategory 
        ? (groupsData || []).filter((group: any) => !pizzaSystemGroupIds.includes(group.id))
        : (groupsData || []);

      const groups: OptionGroup[] = filteredGroupsData.map((group: any) => ({
        ...group,
        free_quantity_limit: group.free_quantity_limit ?? 0,
        extra_unit_price: group.extra_price ?? 0,
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

      const maxUserSortOrder = groups.reduce((max, g) => Math.max(max, g.sort_order ?? 0), 0);

      if (hasPizzaSizes) {
        // Prefer product-specific sizes over category sizes
        const sizesToUse = hasProductSizes ? productSizeOptions : (sizesData as any[]);
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
          options: sizesToUse.map((size: any) => ({
            id: size.id,
            name: size.name,
            description: hasProductSizes 
              ? null 
              : (size.slices ? `${size.slices} pedaços` : (size.max_flavors ? `Até ${size.max_flavors} sabores` : null)),
            price_modifier: Number(hasProductSizes ? (size.price_modifier ?? 0) : (size.base_price ?? 0)),
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

      // Dough group: prefer product-specific doughs, then global doughs
      const hasProductDoughs = productDoughOptions.length > 0;
      const hasGlobalDoughs = doughTypes && Array.isArray(doughTypes) && doughTypes.length > 0;
      
      if (isPizzaCategory && (hasProductDoughs || hasGlobalDoughs)) {
        const doughsToUse = hasProductDoughs ? productDoughOptions : (doughTypes as any[]);
        const effectiveDoughRequired = hasProductDoughs 
          ? (productDoughGroup?.is_required ?? doughIsRequired)
          : doughIsRequired;
        const effectiveDoughMax = hasProductDoughs
          ? (productDoughGroup?.max_selections ?? doughMaxSelections)
          : doughMaxSelections;
        
        const doughGroup: OptionGroup = {
          id: 'pizza-dough',
          name: hasProductDoughs ? (productDoughGroup?.name || 'Massa') : 'Tipo de massa',
          description: null,
          is_required: effectiveDoughRequired,
          min_selections: effectiveDoughRequired ? 1 : 0,
          max_selections: effectiveDoughMax,
          selection_type: effectiveDoughMax === 1 ? 'single' : 'multiple',
          sort_order: -1,
          free_quantity_limit: 0,
          extra_unit_price: 0,
          options: doughsToUse.map((dough: any) => ({
            id: dough.id,
            name: dough.name,
            price_modifier: Number(hasProductDoughs ? (dough.price_modifier ?? 0) : (dough.extra_price ?? 0)),
            is_required: false,
            is_available: true,
            sort_order: dough.sort_order ?? 0,
            group_id: 'pizza-dough',
          })),
        };
        groups.push(doughGroup);
      }

      // Crust group: prefer product-specific crusts, then crust links
      const hasProductCrusts = productCrustOptions.length > 0;
      const hasProductCrustLinks = crustLinks && Array.isArray(crustLinks) && crustLinks.length > 0;

      if (isPizzaCategory && (hasProductCrusts || hasProductCrustLinks)) {
        let crustsToUse: any[] = [];
        
        if (hasProductCrusts) {
          crustsToUse = productCrustOptions;
        } else if (hasProductCrustLinks) {
          const flavorsSource = (crustLinks as any[]).map((link) => link.pizza_crust_flavors);
          crustsToUse = flavorsSource.filter((flavor: any) => flavor && flavor.active);
        }
        
        if (crustsToUse.length > 0) {
          const effectiveCrustRequired = hasProductCrusts
            ? (productCrustGroup?.is_required ?? crustIsRequired)
            : crustIsRequired;
          const effectiveCrustMax = hasProductCrusts
            ? (productCrustGroup?.max_selections ?? crustMaxSelections)
            : crustMaxSelections;
          
          const crustGroup: OptionGroup = {
            id: 'pizza-crust',
            name: hasProductCrusts ? (productCrustGroup?.name || 'Borda') : 'Borda',
            description: null,
            is_required: effectiveCrustRequired,
            min_selections: effectiveCrustRequired ? 1 : 0,
            max_selections: effectiveCrustMax,
            selection_type: effectiveCrustMax === 1 ? 'single' : 'multiple',
            sort_order: maxUserSortOrder + 100,
            free_quantity_limit: 0,
            extra_unit_price: 0,
            options: crustsToUse.map((crust: any) => ({
              id: crust.id,
              name: crust.name,
              price_modifier: Number(hasProductCrusts ? (crust.price_modifier ?? 0) : (crust.extra_price ?? 0)),
              is_required: false,
              is_available: true,
              sort_order: crust.sort_order ?? 0,
              group_id: 'pizza-crust',
            })),
          };
          groups.push(crustGroup);
        }
      }

      const sortedGroups = groups.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      setOptionGroups(sortedGroups);
    } catch (error) {
      console.error('Error loading options:', error);
      if (product.product_options && product.product_options.length > 0) {
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
    const isCurrentlySelected = selectedOptions.some(
      (o) => o.groupId === group.id && o.optionId === option.id
    );

    const effectiveMinSelections =
      typeof group.min_selections === 'number'
        ? group.min_selections
        : group.is_required
          ? 1
          : 0;

    // If the group allows 0 selections (optional) and the option is already selected, allow deselection
    if (effectiveMinSelections === 0 && isCurrentlySelected) {
      let filtered = selectedOptions.filter(
        (o) => !(o.groupId === group.id && o.optionId === option.id)
      );

      if (group.id === 'acai-size') {
        filtered = filtered.filter((o) => !o.groupId.startsWith('acai-group-'));
      }

      setSelectedOptions(filtered);
      return;
    }

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
    const currentlySelected = selectedOptions.some(
      (o) => o.groupId === group.id && o.optionId === option.id
    );

    if (currentlySelected) {
      setSelectedOptions((prev) =>
        prev.filter((o) => !(o.groupId === group.id && o.optionId === option.id))
      );
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

  // Check if any group has options with images
  const hasOptionsWithImages = visibleOptionGroups.some(group => 
    group.options.some(opt => opt.image_url && opt.image_url.trim() !== '')
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md min-h-[400px] max-h-[90vh] md:max-h-[85vh] overflow-hidden flex flex-col p-0 gap-0">
        {/* Product Image - Compact */}
        {product.image_url && (
          <div className="relative h-32 sm:h-36 w-full flex-shrink-0 bg-muted">
            <img
              src={product.image_url}
              alt={product.name}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-3">
              <h2 className="font-bold text-base sm:text-lg text-white leading-tight">{product.name}</h2>
              <div className="flex items-center gap-2 mt-0.5">
                {product.promotional_price && Number(product.promotional_price) > 0 ? (
                  <>
                    <span className="text-xs line-through text-white/60">R$ {Number(product.price).toFixed(2)}</span>
                    <span className="text-lg sm:text-xl font-bold text-white">R$ {getBasePriceForDisplay().toFixed(2)}</span>
                  </>
                ) : (
                  <span className="text-lg sm:text-xl font-bold text-white">R$ {getBasePriceForDisplay().toFixed(2)}</span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          <div className="px-3 sm:px-4 py-3 space-y-4">
            {/* Header without image */}
            {!product.image_url && (
              <div className="pb-3 border-b border-border">
                <h2 className="font-bold text-lg">{product.name}</h2>
                <div className="flex items-center gap-2 mt-0.5">
                  {product.promotional_price && Number(product.promotional_price) > 0 ? (
                    <>
                      <span className="text-sm line-through text-muted-foreground">R$ {Number(product.price).toFixed(2)}</span>
                      <span className="text-xl font-bold text-primary">R$ {getBasePriceForDisplay().toFixed(2)}</span>
                    </>
                  ) : (
                    <span className="text-xl font-bold text-primary">R$ {getBasePriceForDisplay().toFixed(2)}</span>
                  )}
                </div>
              </div>
            )}

            {product.description && (
              <p className="text-muted-foreground text-xs">{product.description}</p>
            )}

            {/* Option Groups */}
            {visibleOptionGroups.length > 0 && (
              <div className="space-y-4">
                {visibleOptionGroups.map((group) => {
                  const groupHasImages = group.options.some(opt => opt.image_url && opt.image_url.trim() !== '');
                  
                  return (
                    <div key={group.id} className="space-y-2">
                      {/* Group Header - Compact */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <h4 className="font-semibold text-sm truncate">{group.name}</h4>
                          {group.id === 'acai-size' && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help flex-shrink-0" />
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-[220px]">
                                  <p className="text-xs">Cada tamanho possui seus próprios adicionais.</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {group.is_required && (
                            <Badge variant="destructive" className="text-[9px] px-1.5 py-0 h-4">
                              Obrigatório
                            </Badge>
                          )}
                          {group.selection_type === 'multiple' && group.max_selections > 1 && (
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4">
                              {getGroupSelectionCount(group.id)}/{group.max_selections}
                            </Badge>
                          )}
                          {group.selection_type === 'multiple' && group.free_quantity_limit > 0 && (
                            <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4">
                              {group.free_quantity_limit} grátis
                            </Badge>
                          )}
                          {group.selection_type === 'half_half' && (
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4">
                              {getGroupSelectionCount(group.id)}/2
                            </Badge>
                          )}
                        </div>
                      </div>

                      {group.description && group.id !== 'acai-size' && (
                        <p className="text-[10px] text-muted-foreground -mt-1">{group.description}</p>
                      )}

                      {/* Options Grid/List - Compact */}
                      <div className={cn(
                        "space-y-1.5",
                        // Use grid for groups with many options
                        group.options.length > 4 && !groupHasImages && "sm:grid sm:grid-cols-2 sm:gap-1.5 sm:space-y-0"
                      )}>
                        {group.options.map((option) => {
                          const isSelected = selectedOptions.some(
                            (o) => o.groupId === group.id && o.optionId === option.id
                          );
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
                              selectionType={group.selection_type === 'single' && group.is_required ? 'single' : 'multiple'}
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
            )}

            {/* Removable Ingredients - Compact */}
            {ingredients.length > 0 && (
              <div className="space-y-2 pt-1">
                <div>
                  <h4 className="font-semibold text-sm">Remover ingredientes</h4>
                  <p className="text-[10px] text-muted-foreground">Marque os que deseja remover</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
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
                          "px-2 py-1 rounded-full text-xs border transition-all",
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

            {/* Notes - Compact */}
            <div className="space-y-1.5 pt-1">
              <Label htmlFor="notes" className="text-xs font-medium">Observações</Label>
              <Textarea
                id="notes"
                placeholder="Ex: Bem passado, pouco sal..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="resize-none text-sm min-h-[60px]"
                autoFocus={false}
                onFocus={(e) => e.target.scrollIntoView({ behavior: 'smooth', block: 'center' })}
              />
            </div>
          </div>
        </div>

        {/* Sticky Footer - Compact */}
        <div className="flex-shrink-0 border-t border-border p-3 sm:px-4 bg-background">
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-secondary rounded-lg p-0.5">
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-md"
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
              >
                <Minus className="h-3.5 w-3.5" />
              </Button>
              <span className="font-bold w-7 text-center text-base">{quantity}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-md"
                onClick={() => setQuantity(quantity + 1)}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>

            <Button
              className="flex-1 h-10 rounded-lg text-sm font-semibold gradient-primary text-primary-foreground"
              onClick={handleAddToCart}
              disabled={!canAddToCart}
            >
              Adicionar • R$ {itemTotal.toFixed(2)}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Suggested Products Component
interface SuggestedProduct {
  id: string;
  name: string;
  price: number;
  image_url: string | null;
}

interface SuggestedProductsProps {
  products: SuggestedProduct[];
  onAdd: (product: SuggestedProduct) => void;
}

export function SuggestedProducts({ products, onAdd }: SuggestedProductsProps) {
  if (products.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Coffee className="h-4 w-4" />
        <span>Sugestões para você</span>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
        {products.map((product) => (
          <button
            key={product.id}
            onClick={() => onAdd(product)}
            className="flex-shrink-0 flex flex-col items-center gap-2 p-3 rounded-xl border border-border hover:border-primary/50 hover:shadow-md transition-all bg-card min-w-[100px]"
          >
            {product.image_url ? (
              <img
                src={product.image_url}
                alt={product.name}
                className="w-12 h-12 rounded-lg object-cover"
              />
            ) : (
              <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center">
                <Coffee className="h-6 w-6 text-muted-foreground" />
              </div>
            )}
            <span className="text-xs font-medium text-center line-clamp-2">{product.name}</span>
            <span className="text-xs text-primary font-bold">+R$ {product.price.toFixed(2)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// Cart Drawer Component
interface CartDrawerProps {
  open: boolean;
  onClose: () => void;
  onCheckout: () => void;
  onContinueShopping: () => void;
  deliveryFee: number;
  suggestedProducts?: SuggestedProduct[];
  isStoreOpen: boolean;
}

export function CartDrawer({
  open,
  onClose,
  onCheckout,
  onContinueShopping,
  deliveryFee,
  suggestedProducts = [],
  isStoreOpen,
}: CartDrawerProps) {
  const { items, removeItem, updateQuantity, subtotal, clearCart, addItem } = useCart();

  const total = subtotal + deliveryFee;

  const handleAddSuggested = (product: SuggestedProduct) => {
    addItem({
      productId: product.id,
      productName: product.name,
      price: product.price,
      quantity: 1,
      options: [],
      imageUrl: product.image_url || undefined,
      requiresPreparation: true,
    });
    toast.success(`${product.name} adicionado à sacola!`);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md max-h-[90vh] flex flex-col p-0 overflow-hidden">
        {/* Header com gradiente */}
        <div className="relative bg-gradient-to-r from-primary to-primary/80 px-5 py-4 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <ShoppingBag className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h2 className="font-bold text-lg text-primary-foreground">Seu Pedido</h2>
              {items.length > 0 && (
                <p className="text-xs text-primary-foreground/80">
                  {items.length} {items.length === 1 ? 'item' : 'itens'} • R$ {subtotal.toFixed(2)}
                </p>
              )}
            </div>
          </div>
        </div>

        {items.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-16 text-center px-6">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-5">
              <ShoppingBag className="h-10 w-10 text-primary/50" />
            </div>
            <p className="text-lg font-medium text-foreground mb-1">Sua sacola está vazia</p>
            <p className="text-sm text-muted-foreground">Adicione itens do cardápio para continuar</p>
          </div>
        ) : (
          <>
            {/* Scrollable area - contains items AND suggestions */}
            <div className="flex-1 overflow-y-auto min-h-0">
              <div className="p-4 space-y-2">
                {items.map((item, index) => (
                  <div
                    key={item.id}
                    className="relative flex gap-2.5 p-2.5 rounded-xl border border-border/70 bg-card shadow-sm"
                  >
                    {/* Número do item */}
                    <div className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center shadow-sm">
                      {index + 1}
                    </div>
                    
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={item.productName}
                        className="w-14 h-14 rounded-lg object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-lg bg-gradient-to-br from-primary/10 to-secondary/10 flex items-center justify-center flex-shrink-0">
                        <Package className="h-6 w-6 text-primary/40" />
                      </div>
                    )}
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-1">
                        <h4 className="font-medium text-sm leading-tight line-clamp-2">{item.productName}</h4>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 text-muted-foreground hover:text-destructive flex-shrink-0"
                          onClick={() => removeItem(item.id)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                      
                      {item.options.length > 0 && (
                        <GroupedOptionsDisplay 
                          options={item.options} 
                          className="mt-0.5"
                          variant="compact"
                        />
                      )}
                      
                      {item.notes && (
                        <p className="text-[10px] text-muted-foreground italic mt-0.5 line-clamp-1">
                          💬 {item.notes}
                        </p>
                      )}
                      
                      <div className="flex items-center justify-between mt-1.5">
                        <div className="flex items-center gap-0.5 bg-muted/50 rounded-full p-0.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 rounded-full hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => updateQuantity(item.id, item.quantity - 1)}
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span className="text-xs w-5 text-center font-bold">{item.quantity}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 rounded-full hover:bg-primary/10 hover:text-primary"
                            onClick={() => updateQuantity(item.id, item.quantity + 1)}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                        <span className="font-bold text-primary text-sm">
                          R$ {(item.price * item.quantity).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {suggestedProducts.length > 0 && (
                <div className="px-4 pb-3 border-t border-border/50 pt-3">
                  <SuggestedProducts products={suggestedProducts} onAdd={handleAddSuggested} />
                </div>
              )}
            </div>

            {/* Footer com resumo e ações - sempre visível */}
            <div className="border-t border-border bg-gradient-to-b from-card to-muted/30 p-4 space-y-4 flex-shrink-0">
              {/* Resumo de valores */}
              <div className="bg-card/80 backdrop-blur rounded-xl p-3 space-y-2 border border-border/50">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-medium">R$ {subtotal.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Taxa de entrega</span>
                  <span className="font-medium">R$ {deliveryFee.toFixed(2)}</span>
                </div>
                <div className="pt-2 border-t border-dashed border-border/70">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-base">Total</span>
                    <span className="font-bold text-xl text-primary">
                      R$ {total.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              {!isStoreOpen && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                  <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0" />
                  <p className="text-xs text-destructive">
                    A loja está fechada no momento.
                  </p>
                </div>
              )}

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10 text-xs"
                  onClick={clearCart}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  Limpar tudo
                </Button>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  variant="outline"
                  className="w-full sm:flex-1 rounded-xl"
                  onClick={onContinueShopping}
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Continuar
                </Button>
                <Button
                  className="w-full sm:flex-1 rounded-xl gradient-primary text-primary-foreground font-semibold shadow-lg hover:shadow-xl transition-shadow"
                  onClick={onCheckout}
                  disabled={!isStoreOpen || items.length === 0}
                >
                  Finalizar pedido
                  <ChevronRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
