-- =============================================================================
-- Feature Toggle Cascade
-- Automatically deactivates/reactivates related data when a feature is toggled
-- =============================================================================

-- 1. Create a table to store the previous state of deactivated items
-- This allows us to restore them when the feature is reactivated
CREATE TABLE IF NOT EXISTS public.feature_deactivated_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  feature_key text NOT NULL,
  table_name text NOT NULL,
  item_id uuid NOT NULL,
  deactivated_at timestamp with time zone DEFAULT now(),
  UNIQUE(company_id, feature_key, table_name, item_id)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_feature_deactivated_items_lookup 
ON public.feature_deactivated_items(company_id, feature_key);

-- Enable RLS
ALTER TABLE public.feature_deactivated_items ENABLE ROW LEVEL SECURITY;

-- Only system can access this table (via SECURITY DEFINER functions)
CREATE POLICY "service_role_only" ON public.feature_deactivated_items
  FOR ALL USING (false);

-- 2. Create the cascade function that handles feature toggle
CREATE OR REPLACE FUNCTION public.handle_feature_toggle_cascade()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_feature_key text;
  v_company_id uuid;
BEGIN
  -- Get the feature key
  SELECT key INTO v_feature_key
  FROM system_features
  WHERE id = COALESCE(NEW.feature_id, OLD.feature_id);

  -- Get the company_id
  v_company_id := COALESCE(NEW.company_id, OLD.company_id);

  IF v_feature_key IS NULL OR v_company_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Feature is being DEACTIVATED (is_active changed from true to false)
  IF (TG_OP = 'UPDATE' AND OLD.is_active = true AND NEW.is_active = false) THEN
    
    -- Handle each feature type
    CASE v_feature_key
      WHEN 'coupons' THEN
        -- Save currently active coupons and deactivate them
        INSERT INTO feature_deactivated_items (company_id, feature_key, table_name, item_id)
        SELECT v_company_id, v_feature_key, 'coupons', id
        FROM coupons
        WHERE company_id = v_company_id AND is_active = true
        ON CONFLICT (company_id, feature_key, table_name, item_id) DO NOTHING;
        
        UPDATE coupons SET is_active = false
        WHERE company_id = v_company_id AND is_active = true;
        
      WHEN 'promotions' THEN
        INSERT INTO feature_deactivated_items (company_id, feature_key, table_name, item_id)
        SELECT v_company_id, v_feature_key, 'promotions', id
        FROM promotions
        WHERE company_id = v_company_id AND is_active = true
        ON CONFLICT (company_id, feature_key, table_name, item_id) DO NOTHING;
        
        UPDATE promotions SET is_active = false
        WHERE company_id = v_company_id AND is_active = true;
        
      WHEN 'drivers' THEN
        INSERT INTO feature_deactivated_items (company_id, feature_key, table_name, item_id)
        SELECT v_company_id, v_feature_key, 'delivery_drivers', id
        FROM delivery_drivers
        WHERE company_id = v_company_id AND is_active = true
        ON CONFLICT (company_id, feature_key, table_name, item_id) DO NOTHING;
        
        UPDATE delivery_drivers SET is_active = false, is_available = false
        WHERE company_id = v_company_id AND is_active = true;
        
      WHEN 'tables' THEN
        INSERT INTO feature_deactivated_items (company_id, feature_key, table_name, item_id)
        SELECT v_company_id, v_feature_key, 'tables', id
        FROM tables
        WHERE company_id = v_company_id AND is_active = true
        ON CONFLICT (company_id, feature_key, table_name, item_id) DO NOTHING;
        
        UPDATE tables SET is_active = false
        WHERE company_id = v_company_id AND is_active = true;
        
      ELSE
        -- No cascade action for other features
        NULL;
    END CASE;
    
  -- Feature is being REACTIVATED (is_active changed from false to true)
  ELSIF (TG_OP = 'UPDATE' AND OLD.is_active = false AND NEW.is_active = true) THEN
    
    CASE v_feature_key
      WHEN 'coupons' THEN
        -- Restore previously active coupons
        UPDATE coupons SET is_active = true
        WHERE id IN (
          SELECT item_id FROM feature_deactivated_items
          WHERE company_id = v_company_id 
            AND feature_key = v_feature_key 
            AND table_name = 'coupons'
        );
        
        -- Clean up the saved state
        DELETE FROM feature_deactivated_items
        WHERE company_id = v_company_id 
          AND feature_key = v_feature_key 
          AND table_name = 'coupons';
        
      WHEN 'promotions' THEN
        UPDATE promotions SET is_active = true
        WHERE id IN (
          SELECT item_id FROM feature_deactivated_items
          WHERE company_id = v_company_id 
            AND feature_key = v_feature_key 
            AND table_name = 'promotions'
        );
        
        DELETE FROM feature_deactivated_items
        WHERE company_id = v_company_id 
          AND feature_key = v_feature_key 
          AND table_name = 'promotions';
        
      WHEN 'drivers' THEN
        UPDATE delivery_drivers SET is_active = true
        WHERE id IN (
          SELECT item_id FROM feature_deactivated_items
          WHERE company_id = v_company_id 
            AND feature_key = v_feature_key 
            AND table_name = 'delivery_drivers'
        );
        
        DELETE FROM feature_deactivated_items
        WHERE company_id = v_company_id 
          AND feature_key = v_feature_key 
          AND table_name = 'delivery_drivers';
        
      WHEN 'tables' THEN
        UPDATE tables SET is_active = true
        WHERE id IN (
          SELECT item_id FROM feature_deactivated_items
          WHERE company_id = v_company_id 
            AND feature_key = v_feature_key 
            AND table_name = 'tables'
        );
        
        DELETE FROM feature_deactivated_items
        WHERE company_id = v_company_id 
          AND feature_key = v_feature_key 
          AND table_name = 'tables';
        
      ELSE
        NULL;
    END CASE;
    
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- 3. Create the trigger on company_features table
DROP TRIGGER IF EXISTS trigger_feature_toggle_cascade ON public.company_features;
CREATE TRIGGER trigger_feature_toggle_cascade
  AFTER UPDATE ON public.company_features
  FOR EACH ROW
  WHEN (OLD.is_active IS DISTINCT FROM NEW.is_active)
  EXECUTE FUNCTION public.handle_feature_toggle_cascade();

-- 4. Add comments for documentation
COMMENT ON TABLE public.feature_deactivated_items IS 
  'Stores the previous state of items that were deactivated when a feature was turned off. Used to restore them when the feature is reactivated.';

COMMENT ON FUNCTION public.handle_feature_toggle_cascade() IS 
  'Automatically deactivates related data (coupons, promotions, drivers, tables) when a feature is disabled, and restores them when reactivated.';
