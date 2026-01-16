import { useState, useEffect } from 'react';
import { Eye, MousePointer, ShoppingCart, DollarSign, TrendingUp, BarChart3, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface PromotionAnalytics {
  promotion_id: string;
  promotion_name: string;
  discount_type: string;
  discount_value: number;
  is_active: boolean;
  view_count: number;
  click_count: number;
  conversion_count: number;
  total_revenue: number;
  click_rate: number;
  conversion_rate: number;
}

interface PromotionAnalyticsDashboardProps {
  companyId: string;
}

export function PromotionAnalyticsDashboard({ companyId }: PromotionAnalyticsDashboardProps) {
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState<PromotionAnalytics[]>([]);
  const [totals, setTotals] = useState({
    views: 0,
    clicks: 0,
    conversions: 0,
    revenue: 0,
  });

  useEffect(() => {
    loadAnalytics();
  }, [companyId]);

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      // First get all promotions for this company
      const { data: promotions, error: promoError } = await supabase
        .from('promotions')
        .select('id, name, discount_type, discount_value, is_active')
        .eq('company_id', companyId);

      if (promoError) throw promoError;

      // Get all events for this company using raw query (table may not exist in types yet)
      const { data: events, error: eventsError } = await supabase
        .from('promotion_events' as any)
        .select('promotion_id, event_type, revenue')
        .eq('company_id', companyId) as { data: Array<{ promotion_id: string; event_type: string; revenue: number }> | null; error: any };

      if (eventsError) {
        // Table might not exist yet, show empty state
        console.log('promotion_events table may not exist:', eventsError);
        // Still show promotions with zero stats
        const analyticsData = (promotions || []).map((promo) => ({
          promotion_id: promo.id,
          promotion_name: promo.name,
          discount_type: promo.discount_type,
          discount_value: promo.discount_value,
          is_active: promo.is_active,
          view_count: 0,
          click_count: 0,
          conversion_count: 0,
          total_revenue: 0,
          click_rate: 0,
          conversion_rate: 0,
        }));
        setAnalytics(analyticsData);
        setLoading(false);
        return;
      }

      // Aggregate events by promotion
      const promotionMap = new Map<string, PromotionAnalytics>();

      (promotions || []).forEach((promo) => {
        promotionMap.set(promo.id, {
          promotion_id: promo.id,
          promotion_name: promo.name,
          discount_type: promo.discount_type,
          discount_value: promo.discount_value,
          is_active: promo.is_active,
          view_count: 0,
          click_count: 0,
          conversion_count: 0,
          total_revenue: 0,
          click_rate: 0,
          conversion_rate: 0,
        });
      });

      // Aggregate events
      (events || []).forEach((event) => {
        const promo = promotionMap.get(event.promotion_id);
        if (promo) {
          if (event.event_type === 'view') promo.view_count++;
          if (event.event_type === 'click') promo.click_count++;
          if (event.event_type === 'conversion') {
            promo.conversion_count++;
            promo.total_revenue += event.revenue || 0;
          }
        }
      });

      // Calculate rates
      promotionMap.forEach((promo) => {
        promo.click_rate = promo.view_count > 0 
          ? Math.round((promo.click_count / promo.view_count) * 10000) / 100 
          : 0;
        promo.conversion_rate = promo.click_count > 0 
          ? Math.round((promo.conversion_count / promo.click_count) * 10000) / 100 
          : 0;
      });

      const analyticsData = Array.from(promotionMap.values());
      setAnalytics(analyticsData);

      // Calculate totals
      const totalViews = analyticsData.reduce((sum, a) => sum + a.view_count, 0);
      const totalClicks = analyticsData.reduce((sum, a) => sum + a.click_count, 0);
      const totalConversions = analyticsData.reduce((sum, a) => sum + a.conversion_count, 0);
      const totalRevenue = analyticsData.reduce((sum, a) => sum + a.total_revenue, 0);

      setTotals({
        views: totalViews,
        clicks: totalClicks,
        conversions: totalConversions,
        revenue: totalRevenue,
      });
    } catch (error) {
      console.error('Error loading analytics:', error);
    } finally {
      setLoading(false);
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
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const overallClickRate = totals.views > 0 
    ? ((totals.clicks / totals.views) * 100).toFixed(1) 
    : '0';
  const overallConversionRate = totals.clicks > 0 
    ? ((totals.conversions / totals.clicks) * 100).toFixed(1) 
    : '0';

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-blue-500/20">
                <Eye className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Visualizações</p>
                <p className="text-2xl font-bold">{totals.views.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 border-amber-500/20">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/20">
                <MousePointer className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Cliques</p>
                <p className="text-2xl font-bold">{totals.clicks.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">
                  Taxa: {overallClickRate}%
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-green-500/20">
                <ShoppingCart className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Conversões</p>
                <p className="text-2xl font-bold">{totals.conversions.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">
                  Taxa: {overallConversionRate}%
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-primary/20">
                <DollarSign className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Receita</p>
                <p className="text-2xl font-bold">
                  R$ {totals.revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Per-Promotion Analytics */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <BarChart3 className="h-5 w-5" />
            Desempenho por Promoção
          </CardTitle>
        </CardHeader>
        <CardContent>
          {analytics.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <TrendingUp className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p>Nenhuma métrica registrada ainda</p>
              <p className="text-sm">
                Os dados aparecerão quando clientes visualizarem e interagirem com suas promoções
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {analytics.map((promo) => (
                <div
                  key={promo.promotion_id}
                  className="p-4 rounded-xl border bg-card hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{promo.promotion_name}</h3>
                      <Badge variant={promo.is_active ? 'default' : 'secondary'}>
                        {promo.is_active ? 'Ativa' : 'Inativa'}
                      </Badge>
                      <Badge variant="outline">
                        {formatDiscount(promo.discount_type, promo.discount_value)} OFF
                      </Badge>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <Eye className="h-4 w-4 text-blue-500" />
                      <div>
                        <p className="text-muted-foreground text-xs">Visualizações</p>
                        <p className="font-semibold">{promo.view_count?.toLocaleString() || 0}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <MousePointer className="h-4 w-4 text-amber-500" />
                      <div>
                        <p className="text-muted-foreground text-xs">Cliques</p>
                        <p className="font-semibold">{promo.click_count?.toLocaleString() || 0}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-purple-500" />
                      <div>
                        <p className="text-muted-foreground text-xs">Taxa de Clique</p>
                        <p className="font-semibold">{promo.click_rate || 0}%</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <ShoppingCart className="h-4 w-4 text-green-500" />
                      <div>
                        <p className="text-muted-foreground text-xs">Conversões</p>
                        <p className="font-semibold">
                          {promo.conversion_count?.toLocaleString() || 0}
                          {promo.conversion_rate > 0 && (
                            <span className="text-xs text-muted-foreground ml-1">
                              ({promo.conversion_rate}%)
                            </span>
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-primary" />
                      <div>
                        <p className="text-muted-foreground text-xs">Receita</p>
                        <p className="font-semibold text-primary">
                          R$ {(promo.total_revenue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Visual Progress Bar */}
                  <div className="mt-4 space-y-2">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-muted-foreground w-16">Conversão</span>
                      <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-green-500 to-green-400 rounded-full transition-all"
                          style={{ width: `${Math.min(promo.conversion_rate || 0, 100)}%` }}
                        />
                      </div>
                      <span className="font-medium w-12 text-right">{promo.conversion_rate || 0}%</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
