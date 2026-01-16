import { Tag, Sparkles, Percent, ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { OptimizedImage } from '@/components/ui/optimized-image';
import { cn } from '@/lib/utils';
import { usePromotionTracking } from '@/hooks/usePromotionTracking';

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
  onProductClick: (product: Product) => void;
}

export function PromotionalProductsSection({ 
  promotions, 
  products,
  companyId,
  onProductClick 
}: PromotionalProductsSectionProps) {
  const { trackClick } = usePromotionTracking();
  const activePromotions = promotions.filter(p => p.is_active);
  
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
                onProductClick(product);
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
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground line-through">
                    R$ {Number(product.price).toFixed(2)}
                  </span>
                  <span className="text-base font-bold text-primary">
                    R$ {discountedPrice.toFixed(2)}
                  </span>
                </div>
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
): { hasDiscount: boolean; discountText: string | null; discountedPrice: number } {
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
      discountedPrice
    };
  }

  const discountedPrice = Math.max(0, Number(product.price) - activePromotion.discount_value);
  return {
    hasDiscount: true,
    discountText: `R$ ${activePromotion.discount_value.toFixed(0)}`,
    discountedPrice
  };
}
