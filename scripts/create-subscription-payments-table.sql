-- Tabela para histórico de pagamentos de assinatura (Lojista → Cardapeon)
-- Execute este script no SQL Editor do Supabase

CREATE TABLE IF NOT EXISTS public.subscription_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  plan_key text NOT NULL,
  plan_name text NOT NULL,
  amount numeric(10,2) NOT NULL,
  payment_method text NOT NULL CHECK (payment_method IN ('pix', 'card')),
  payment_status text NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')),
  payment_reference text, -- ID do pagamento no Mercado Pago
  paid_at timestamp with time zone,
  period_start timestamp with time zone,
  period_end timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_subscription_payments_company_id ON public.subscription_payments(company_id);
CREATE INDEX IF NOT EXISTS idx_subscription_payments_created_at ON public.subscription_payments(created_at DESC);

-- RLS
ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;

-- Lojista pode ver seus próprios pagamentos
CREATE POLICY "Company owners can view their subscription payments"
  ON public.subscription_payments
  FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT id FROM public.companies WHERE owner_id = auth.uid()
    )
  );

-- Super admin pode ver todos
CREATE POLICY "Super admins can view all subscription payments"
  ON public.subscription_payments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

-- Comentário para documentação
COMMENT ON TABLE public.subscription_payments IS 'Histórico de pagamentos de assinatura dos lojistas para a Cardapeon';
COMMENT ON COLUMN public.subscription_payments.payment_reference IS 'ID do pagamento no gateway (Mercado Pago)';
