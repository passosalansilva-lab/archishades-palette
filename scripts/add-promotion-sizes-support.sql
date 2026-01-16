-- Add column to promotions table for size handling
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS apply_to_all_sizes BOOLEAN DEFAULT true;

-- Create junction table for promotions <-> product_options (sizes)
CREATE TABLE IF NOT EXISTS promotion_sizes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id UUID NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  product_option_id UUID NOT NULL REFERENCES product_options(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(promotion_id, product_option_id)
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_promotion_sizes_promotion_id ON promotion_sizes(promotion_id);
CREATE INDEX IF NOT EXISTS idx_promotion_sizes_option_id ON promotion_sizes(product_option_id);

-- Enable RLS
ALTER TABLE promotion_sizes ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Company owners can manage promotion sizes" ON promotion_sizes;
DROP POLICY IF EXISTS "Anyone can read promotion sizes" ON promotion_sizes;

-- Policy for company owners to manage their promotion sizes
CREATE POLICY "Company owners can manage promotion sizes"
  ON promotion_sizes FOR ALL
  TO authenticated
  USING (
    promotion_id IN (
      SELECT id FROM promotions WHERE company_id IN (
        SELECT id FROM companies WHERE owner_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    promotion_id IN (
      SELECT id FROM promotions WHERE company_id IN (
        SELECT id FROM companies WHERE owner_id = auth.uid()
      )
    )
  );

-- Policy for public read access (needed for menu display)
CREATE POLICY "Anyone can read promotion sizes"
  ON promotion_sizes FOR SELECT
  TO anon, authenticated
  USING (true);
