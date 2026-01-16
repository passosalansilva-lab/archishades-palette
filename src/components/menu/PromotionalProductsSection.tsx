import { Tag, Sparkles, Percent, ArrowRight, ShoppingBag } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { OptimizedImage } from '@/components/ui/optimized-image';
import { cn } from '@/lib/utils';
import { usePromotionTracking } from '@/hooks/usePromotionTracking';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

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
  apply_to_all_sizes?: boolean | null;
  /** IDs dos tamanhos (product_options) selecionados para a promoção */
  selected_size_ids?: string[];
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
}

interface PromotionalProductsSectionProps {
  promotions: Promotion[];
  products: Product[];
  companyId?: string;
  onProductClick: (product: Product, promotionId?: string) => void;
}

// Cache para produtos com tamanhos
const productsWithSizesCache = new Map<string, boolean>();

export function PromotionalProductsSection({ 
  promotions, 
  products,
  companyId,
  onProductClick 
}: PromotionalProductsSectionProps) {
  const { trackClick } = usePromotionTracking();
  const activePromotions = promotions.filter(p => p.is_active);
  const [productsWithSizes, setProductsWithSizes] = useState<Set<string>>(new Set());
  
  // Get products that are in promotion (either by product_id or category_id)
  const promotionalProducts = products.filter(product => {
    return activePromotions.some(promo => 
      promo.product_id === product.id || 
      (promo.category_id && promo.category_id === product.category_id)
    );
  });

  // Also include products with promotional_price set
  const productsWithPromoPrice = products.filter(
    p => p.promotional_price && Number(p.promotional_price) > 0 && Number(p.promotional_price) < Number(p.price)
  );

  // Combine and deduplicate
  const allPromotionalProducts = [...new Map(
    [...promotionalProducts, ...productsWithPromoPrice].map(p => [p.id, p])
  ).values()];

  // Check which products have size options
  useEffect(() => {
    const checkProductSizes = async () => {
      if (allPromotionalProducts.length === 0) return;
      
      const productIds = allPromotionalProducts.map(p => p.id);
      const uncachedIds = productIds.filter(id => !productsWithSizesCache.has(id));
      
      if (uncachedIds.length > 0) {
        // Query product_option_groups for "tamanho" type options
        const { data } = await supabase
          .from('product_option_groups')
          .select('product_id')
          .in('product_id', uncachedIds)
          .ilike('name', '%tamanho%');
        
        const productsWithSizeOptions = new Set(data?.map(d => d.product_id) || []);
        
        // Update cache
        uncachedIds.forEach(id => {
          productsWithSizesCache.set(id, productsWithSizeOptions.has(id));
        });
      }
      
      // Build set from cache
      const result = new Set<string>();
      productIds.forEach(id => {
        if (productsWithSizesCache.get(id)) {
          result.add(id);
        }
      });
      
      setProductsWithSizes(result);
    };
    
    checkProductSizes();
  }, [allPromotionalProducts.length]);

  if (allPromotionalProducts.length === 0) return null;

  const getProductPromotion = (productId: string, categoryId: string | null) => {
    return activePromotions.find(promo => 
      promo.product_id === productId || 
      (promo.category_id && promo.category_id === categoryId)
    );
  };

  const calculateDiscountedPrice = (product: Product, promotion?: Promotion) => {
    // If product has promotional_price, use that
    if (product.promotional_price && Number(product.promotional_price) > 0) {
      return Number(product.promotional_price);
    }
    
    // Otherwise, calculate from promotion
    if (!promotion) return Number(product.price);
    
    if (promotion.discount_type === 'percentage') {
      return Number(product.price) * (1 - promotion.discount_value / 100);
    }
    return Math.max(0, Number(product.price) - promotion.discount_value);
  };

  const getDiscountBadge = (product: Product, promotion?: Promotion) => {
    if (product.promotional_price && Number(product.promotional_price) > 0) {
      const discount = Math.round((1 - Number(product.promotional_price) / Number(product.price)) * 100);
      return `${discount}% OFF`;
    }
    if (!promotion) return null;
    if (promotion.discount_type === 'percentage') {
      return `${promotion.discount_value}% OFF`;
    }
    return `R$ ${Number(promotion.discount_value).toFixed(2)} OFF`;
  };

  return (
    <div className="mt-6">
      {/* Section Header */}
      <div className="flex items-center gap-2 px-4 mb-4">
        <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-gradient-to-br from-primary to-primary/80 shadow-lg">
          <Tag className="h-4 w-4 text-primary-foreground" />
        </div>
        <div>
          <h2 className="text-base font-display font-bold flex items-center gap-1.5">
            Ofertas Especiais
            <Sparkles className="h-4 w-4 text-primary animate-pulse" />
          </h2>
          <p className="text-xs text-muted-foreground">Aproveite os descontos!</p>
        </div>
      </div>

      {/* Products Grid */}
      <div className="px-4 grid grid-cols-2 gap-3">
        {allPromotionalProducts.slice(0, 6).map((product) => {
          const promotion = getProductPromotion(product.id, product.category_id);
          const discountedPrice = calculateDiscountedPrice(product, promotion);
          const discountBadge = getDiscountBadge(product, promotion);

          return (
            <button
              key={product.id}
              onClick={() => {
                // Track click on the promotion if exists
                if (promotion && companyId) {
                  trackClick(promotion.id, companyId);
                }
                onProductClick(product, promotion?.id);
              }}
              className="relative group text-left rounded-2xl bg-card border border-border/60 overflow-hidden shadow-sm hover:shadow-lg hover:border-primary/30 transition-all active:scale-[0.98]"
            >
              {/* Discount Badge */}
              {discountBadge && (
                <Badge className="absolute top-2 left-2 z-10 bg-destructive text-destructive-foreground font-bold text-xs px-2 py-0.5 shadow-lg">
                  <Percent className="h-3 w-3 mr-1" />
                  {discountBadge}
                </Badge>
              )}

              {/* Image */}
              <div className="relative aspect-square overflow-hidden bg-secondary">
                {product.image_url ? (
                  <OptimizedImage
                    src={product.image_url}
                    alt={product.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    containerClassName="w-full h-full"
                    fallback={
                      <div className="w-full h-full flex items-center justify-center">
                        <Tag className="h-8 w-8 text-muted-foreground/30" />
                      </div>
                    }
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Tag className="h-8 w-8 text-muted-foreground/30" />
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="p-3">
                <h3 className="font-semibold text-sm leading-tight line-clamp-2 group-hover:text-primary transition-colors">
                  {product.name}
                </h3>
                {productsWithSizes.has(product.id) ? (
                  // Product has sizes - show CTA instead of price
                  <div className="mt-2 flex items-center gap-1.5">
                    <ShoppingBag className="h-3.5 w-3.5 text-primary" />
                    <span className="text-sm font-semibold text-primary">
                      Confira
                    </span>
                  </div>
                ) : (
                  // Product has single price - show from/to pricing
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-muted-foreground line-through">
                      R$ {Number(product.price).toFixed(2)}
                    </span>
                    <span className="text-base font-bold text-primary">
                      R$ {discountedPrice.toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* View All Link */}
      {allPromotionalProducts.length > 6 && (
        <div className="px-4 mt-3">
          <button className="w-full py-2.5 text-sm font-medium text-primary flex items-center justify-center gap-1 hover:underline">
            Ver todas as {allPromotionalProducts.length} ofertas
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

// Helper function to check if a product is in promotion
export function getProductPromotionDiscount(
  product: { id: string; category_id: string | null; price: number; promotional_price?: number | null },
  promotions: Promotion[]
): { hasDiscount: boolean; discountText: string | null; discountedPrice: number; promotion?: Promotion } {
  // Check promotional_price first
  if (product.promotional_price && Number(product.promotional_price) > 0 && Number(product.promotional_price) < Number(product.price)) {
    const discount = Math.round((1 - Number(product.promotional_price) / Number(product.price)) * 100);
    return {
      hasDiscount: true,
      discountText: `${discount}%`,
      discountedPrice: Number(product.promotional_price)
    };
  }

  // Check active promotions
  const activePromotion = promotions.find(promo => 
    promo.is_active && (
      promo.product_id === product.id || 
      (promo.category_id && promo.category_id === product.category_id)
    )
  );

  if (!activePromotion) {
    return { hasDiscount: false, discountText: null, discountedPrice: Number(product.price) };
  }

  if (activePromotion.discount_type === 'percentage') {
    const discountedPrice = Number(product.price) * (1 - activePromotion.discount_value / 100);
    return {
      hasDiscount: true,
      discountText: `${activePromotion.discount_value}%`,
      discountedPrice,
      promotion: activePromotion
    };
  }

  const discountedPrice = Math.max(0, Number(product.price) - activePromotion.discount_value);
  return {
    hasDiscount: true,
    discountText: `R$ ${activePromotion.discount_value.toFixed(0)}`,
    discountedPrice,
    promotion: activePromotion
  };
}

/**
 * Check if a specific size (product_option) is eligible for the promotion discount.
 * Returns true if:
 * - The promotion applies to all sizes (apply_to_all_sizes is true or null)
 * - OR the size is in the selected_size_ids array
 */
export function isSizeInPromotion(
  sizeOptionId: string,
  promotion: Promotion | undefined
): boolean {
  if (!promotion) return false;
  
  // If apply_to_all_sizes is true or not set, all sizes are in promotion
  if (promotion.apply_to_all_sizes !== false) {
    return true;
  }
  
  // Otherwise, check if this size is in the selected sizes
  if (!promotion.selected_size_ids || promotion.selected_size_ids.length === 0) {
    // No sizes selected but apply_to_all_sizes is false - no discount applies
    return false;
  }
  
  return promotion.selected_size_ids.includes(sizeOptionId);
}

/**
 * Calculate discounted price for a specific size based on promotion rules.
 */
export function calculateSizeDiscountedPrice(
  sizePrice: number,
  promotion: Promotion | undefined,
  sizeOptionId?: string
): number {
  if (!promotion) return sizePrice;
  
  // Check if this size is eligible for the discount
  if (sizeOptionId && !isSizeInPromotion(sizeOptionId, promotion)) {
    return sizePrice;
  }
  
  if (promotion.discount_type === 'percentage') {
    return sizePrice * (1 - promotion.discount_value / 100);
  }
  
  return Math.max(0, sizePrice - promotion.discount_value);
}
