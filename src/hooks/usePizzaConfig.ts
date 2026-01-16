import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface PizzaSettings {
  id: string;
  company_id: string;
  enable_half_half: boolean;
  enable_crust: boolean;
  enable_addons: boolean;
  max_flavors: number;
  allow_crust_extra_price: boolean;
}

interface PizzaCategorySettings {
  id: string;
  category_id: string;
  allow_half_half: boolean;
  max_flavors: number;
  half_half_pricing_rule: string;
  half_half_discount_percentage: number;
  allow_repeated_flavors: boolean;
  half_half_options_source?: string;
}

interface PizzaConfig {
  settings: PizzaSettings | null;
  categorySettings: Record<string, PizzaCategorySettings>;
  pizzaCategoryIds: string[];
  loading: boolean;
  error: Error | null;
}

export function usePizzaConfig(companyId: string | null): PizzaConfig {
  const [config, setConfig] = useState<PizzaConfig>({
    settings: null,
    categorySettings: {},
    pizzaCategoryIds: [],
    loading: true,
    error: null,
  });

  const loadPizzaConfig = useCallback(async () => {
    if (!companyId) {
      setConfig({ settings: null, categorySettings: {}, pizzaCategoryIds: [], loading: false, error: null });
      return;
    }

    try {
      setConfig((prev) => ({ ...prev, loading: true, error: null }));

      // Buscar configurações de pizza
      const { data: settings, error: settingsError } = await supabase
        .from('pizza_settings')
        .select('*')
        .eq('company_id', companyId)
        .maybeSingle();

      if (settingsError && settingsError.code !== 'PGRST116') {
        throw settingsError;
      }

      // Buscar categorias marcadas como pizza
      const { data: pizzaCategories, error: categoriesError } = await supabase
        .from('pizza_categories')
        .select('category_id')
        .eq('company_id', companyId);

      if (categoriesError) throw categoriesError;

      const categoryIds = pizzaCategories?.map((pc) => pc.category_id) || [];

      // Buscar configurações por categoria
      let categorySettingsMap: Record<string, PizzaCategorySettings> = {};
      
      if (categoryIds.length > 0) {
        const { data: catSettings } = await supabase
          .from('pizza_category_settings')
          .select('*')
          .in('category_id', categoryIds);
        
        if (catSettings) {
          catSettings.forEach((cs: any) => {
            categorySettingsMap[cs.category_id] = cs;
          });
        }
      }

      setConfig({
        settings: settings || null,
        categorySettings: categorySettingsMap,
        pizzaCategoryIds: categoryIds,
        loading: false,
        error: null,
      });
    } catch (error: any) {
      console.error('Error loading pizza config:', error);
      setConfig({
        settings: null,
        categorySettings: {},
        pizzaCategoryIds: [],
        loading: false,
        error: error,
      });
    }
  }, [companyId]);

  useEffect(() => {
    loadPizzaConfig();
  }, [loadPizzaConfig]);

  // Realtime subscription para pizza_category_settings
  useEffect(() => {
    if (!companyId) return;

    const channel = supabase
      .channel(`pizza-config-${companyId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pizza_category_settings',
        },
        () => {
          // Recarrega as configurações quando houver mudança
          loadPizzaConfig();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pizza_settings',
          filter: `company_id=eq.${companyId}`,
        },
        () => {
          loadPizzaConfig();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [companyId, loadPizzaConfig]);

  return config;
}
