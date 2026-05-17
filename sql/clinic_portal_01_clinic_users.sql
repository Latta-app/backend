-- Aplicada em prod (kusqorpjtadcuooprpqb) em 2026-05-17 via MCP apply_migration.
-- Fatia 01 do clinic-portal (MVP enxuto): clinic_users + colunas em clinics.
-- Magic link + nudge inteligente ficam pra fatia futura (esse PR habilita
-- so o schema e endpoints basicos de ativacao/login pra role clinic).

ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS activation_status text NOT NULL DEFAULT 'pending'
    CHECK (activation_status IN ('pending', 'activated', 'inactive')),
  ADD COLUMN IF NOT EXISTS activation_nudge_state jsonb NOT NULL
    DEFAULT '{"count": 0, "last_variant": null, "last_sent_at": null}'::jsonb,
  ADD COLUMN IF NOT EXISTS notification_settings jsonb NOT NULL
    DEFAULT '{"in_app": true, "email": false, "email_address": null}'::jsonb;

CREATE TABLE IF NOT EXISTS public.clinic_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  password_hash text,
  activation_token text UNIQUE,
  activation_token_expires_at timestamptz,
  password_reset_token text UNIQUE,
  password_reset_expires_at timestamptz,
  activated_at timestamptz,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clinic_users_clinic_id ON public.clinic_users(clinic_id);
CREATE INDEX IF NOT EXISTS idx_clinic_users_activation_token
  ON public.clinic_users(activation_token)
  WHERE activation_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clinic_users_reset_token
  ON public.clinic_users(password_reset_token)
  WHERE password_reset_token IS NOT NULL;

ALTER TABLE public.clinic_users ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER set_clinic_users_updated_at
  BEFORE UPDATE ON public.clinic_users
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

COMMENT ON TABLE public.clinic_users IS
  'Users de clinica (login no portal clinic-portal). Fatia 01.';
