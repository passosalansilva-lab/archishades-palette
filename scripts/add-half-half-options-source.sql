-- Add column to define which flavor's options to use for half-half pizza
-- Options: 'highest' (most expensive), 'lowest' (cheapest), 'first' (first selected)
ALTER TABLE pizza_category_settings 
ADD COLUMN IF NOT EXISTS half_half_options_source VARCHAR(20) DEFAULT 'highest';

ALTER TABLE pizza_product_settings 
ADD COLUMN IF NOT EXISTS half_half_options_source VARCHAR(20) DEFAULT 'highest';

-- Add comment explaining the column
COMMENT ON COLUMN pizza_category_settings.half_half_options_source IS 
  'Defines which flavor product options (dough, crust) to use: highest (most expensive), lowest (cheapest), first (first selected)';

COMMENT ON COLUMN pizza_product_settings.half_half_options_source IS 
  'Defines which flavor product options (dough, crust) to use: highest (most expensive), lowest (cheapest), first (first selected)';
