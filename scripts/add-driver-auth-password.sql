-- Adiciona coluna auth_password para login direto do entregador (sem OTP)
ALTER TABLE delivery_drivers 
ADD COLUMN IF NOT EXISTS auth_password TEXT;

-- Comentário para documentar
COMMENT ON COLUMN delivery_drivers.auth_password IS 'Senha gerada automaticamente para login direto do entregador sem OTP';
