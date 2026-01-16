-- Create promotion_events table for tracking analytics
CREATE TABLE IF NOT EXISTS promotion_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id UUID NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('view', 'click', 'conversion')),
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  revenue DECIMAL(10,2) DEFAULT 0,
  session_id TEXT, -- Browser session ID to avoid duplicate views
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_promotion_events_promotion_id ON promotion_events(promotion_id);
CREATE INDEX IF NOT EXISTS idx_promotion_events_company_id ON promotion_events(company_id);
CREATE INDEX IF NOT EXISTS idx_promotion_events_created_at ON promotion_events(created_at);
CREATE INDEX IF NOT EXISTS idx_promotion_events_event_type ON promotion_events(event_type);

-- Enable RLS
ALTER TABLE promotion_events ENABLE ROW LEVEL SECURITY;

-- Policy for owners to view their promotion analytics
CREATE POLICY "Company owners can view promotion events"
  ON promotion_events FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT id FROM companies WHERE owner_id = auth.uid()
    )
  );

-- Policy for inserting events (public, no auth required for tracking)
CREATE POLICY "Anyone can insert promotion events"
  ON promotion_events FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Create a view for aggregated analytics
CREATE OR REPLACE VIEW promotion_analytics AS
SELECT 
  p.id AS promotion_id,
  p.name AS promotion_name,
  p.company_id,
  p.discount_type,
  p.discount_value,
  p.is_active,
  p.created_at AS promotion_created_at,
  COALESCE(views.count, 0) AS view_count,
  COALESCE(clicks.count, 0) AS click_count,
  COALESCE(conversions.count, 0) AS conversion_count,
  COALESCE(conversions.revenue, 0) AS total_revenue,
  CASE 
    WHEN COALESCE(views.count, 0) > 0 
    THEN ROUND((COALESCE(clicks.count, 0)::DECIMAL / views.count) * 100, 2)
    ELSE 0 
  END AS click_rate,
  CASE 
    WHEN COALESCE(clicks.count, 0) > 0 
    THEN ROUND((COALESCE(conversions.count, 0)::DECIMAL / clicks.count) * 100, 2)
    ELSE 0 
  END AS conversion_rate
FROM promotions p
LEFT JOIN (
  SELECT promotion_id, COUNT(*) AS count
  FROM promotion_events
  WHERE event_type = 'view'
  GROUP BY promotion_id
) views ON views.promotion_id = p.id
LEFT JOIN (
  SELECT promotion_id, COUNT(*) AS count
  FROM promotion_events
  WHERE event_type = 'click'
  GROUP BY promotion_id
) clicks ON clicks.promotion_id = p.id
LEFT JOIN (
  SELECT promotion_id, COUNT(*) AS count, SUM(revenue) AS revenue
  FROM promotion_events
  WHERE event_type = 'conversion'
  GROUP BY promotion_id
) conversions ON conversions.promotion_id = p.id;

-- Grant access to the view
GRANT SELECT ON promotion_analytics TO authenticated;
