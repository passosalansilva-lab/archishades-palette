import { useState, useEffect, useCallback } from 'react';
import { Tag, ChevronLeft, ChevronRight, Sparkles, Percent, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { OptimizedImage } from '@/components/ui/optimized-image';
import { cn } from '@/lib/utils';
import { usePromotionTracking, useTrackPromotionViews } from '@/hooks/usePromotionTracking';

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

interface PromotionsBannerProps {
  promotions: Promotion[];
  companyId?: string;
  onPromotionClick?: (promotion: Promotion) => void;
}

export function PromotionsBanner({ promotions, companyId, onPromotionClick }: PromotionsBannerProps) {
  const { trackClick } = usePromotionTracking();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);

  const activePromotions = promotions.filter(p => p.is_active);

  // Track views for all active promotions
  useTrackPromotionViews(activePromotions, companyId, activePromotions.length > 0);
  const nextSlide = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % activePromotions.length);
  }, [activePromotions.length]);

  const prevSlide = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + activePromotions.length) % activePromotions.length);
  }, [activePromotions.length]);

  useEffect(() => {
    if (!isAutoPlaying || activePromotions.length <= 1) return;

    const interval = setInterval(nextSlide, 5000);
    return () => clearInterval(interval);
  }, [isAutoPlaying, nextSlide, activePromotions.length]);

  if (activePromotions.length === 0) return null;

  const currentPromotion = activePromotions[currentIndex];

  const formatDiscount = (type: string, value: number) => {
    if (type === 'percentage') {
      return `${value}% OFF`;
    }
    return `R$ ${Number(value).toFixed(2)} OFF`;
  };

  const getTimeRemaining = (expiresAt: string | null) => {
    if (!expiresAt) return null;
    const now = new Date();
    const expires = new Date(expiresAt);
    const diff = expires.getTime() - now.getTime();
    
    if (diff <= 0) return null;
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d restantes`;
    if (hours > 0) return `${hours}h restantes`;
    return 'Últimas horas!';
  };

  return (
    <div className="px-4 mt-4">
      <div 
        className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-primary/90 to-primary/80 shadow-xl"
        onMouseEnter={() => setIsAutoPlaying(false)}
        onMouseLeave={() => setIsAutoPlaying(true)}
      >
        {/* Decorative elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-2xl" />
          <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-white/10 rounded-full blur-2xl" />
          <Sparkles className="absolute top-4 right-4 h-6 w-6 text-white/30 animate-pulse" />
        </div>

        <button
          onClick={() => {
            if (companyId) {
              trackClick(currentPromotion.id, companyId);
            }
            onPromotionClick?.(currentPromotion);
          }}
          className="relative w-full text-left p-5 min-h-[140px] flex items-center gap-4 transition-transform active:scale-[0.99]"
        >
          {/* Image */}
          {currentPromotion.image_url ? (
            <div className="flex-shrink-0 w-24 h-24 rounded-2xl overflow-hidden shadow-lg ring-2 ring-white/20">
              <OptimizedImage
                src={currentPromotion.image_url}
                alt={currentPromotion.name}
                className="w-full h-full object-cover"
                containerClassName="w-full h-full"
                fallback={
                  <div className="w-full h-full bg-white/20 flex items-center justify-center">
                    <Tag className="h-8 w-8 text-white/60" />
                  </div>
                }
              />
            </div>
          ) : (
            <div className="flex-shrink-0 w-24 h-24 rounded-2xl bg-white/20 flex items-center justify-center shadow-lg ring-2 ring-white/20">
              <Percent className="h-10 w-10 text-white" />
            </div>
          )}

          {/* Content */}
          <div className="flex-1 min-w-0 text-white">
            <div className="flex items-center gap-2 mb-2">
              <Badge className="bg-white text-primary font-bold px-3 py-1 text-sm shadow-md">
                <Zap className="h-3.5 w-3.5 mr-1" />
                {formatDiscount(currentPromotion.discount_type, currentPromotion.discount_value)}
              </Badge>
              {getTimeRemaining(currentPromotion.expires_at) && (
                <span className="text-xs text-white/80 bg-white/20 px-2 py-1 rounded-full">
                  ⏱️ {getTimeRemaining(currentPromotion.expires_at)}
                </span>
              )}
            </div>
            <h3 className="font-display font-bold text-lg leading-tight line-clamp-1">
              {currentPromotion.name}
            </h3>
            {currentPromotion.description && (
              <p className="text-sm text-white/80 mt-1 line-clamp-2 leading-relaxed">
                {currentPromotion.description}
              </p>
            )}
            <div className="flex items-center gap-1 mt-2 text-sm text-white/70">
              <Tag className="h-3.5 w-3.5" />
              <span>Toque para ver</span>
            </div>
          </div>
        </button>

        {/* Navigation arrows */}
        {activePromotions.length > 1 && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-white/20 hover:bg-white/30 text-white border-0"
              onClick={(e) => {
                e.stopPropagation();
                prevSlide();
              }}
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-white/20 hover:bg-white/30 text-white border-0"
              onClick={(e) => {
                e.stopPropagation();
                nextSlide();
              }}
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </>
        )}

        {/* Dots indicator */}
        {activePromotions.length > 1 && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
            {activePromotions.map((_, index) => (
              <button
                key={index}
                className={cn(
                  "w-2 h-2 rounded-full transition-all",
                  index === currentIndex 
                    ? "bg-white w-6" 
                    : "bg-white/40 hover:bg-white/60"
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  setCurrentIndex(index);
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
