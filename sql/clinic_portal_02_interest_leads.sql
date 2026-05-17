-- Aplicada em prod (kusqorpjtadcuooprpqb) em 2026-05-17 via MCP apply_migration.
-- Fatia 02 do clinic-portal: capturar leads de clínicas que clicam em seções "locked"
-- Tabela isolada: não depende de clinic_users (fatia 01) nem clinic_activity_log (fatia 06).
-- O backend Express insere aqui e (opcionalmente) dispara email pra comercial@latta.app.br.

CREATE TABLE IF NOT EXISTS public.clinic_interest_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid REFERENCES public.clinics(id) ON DELETE SET NULL,
  user_id uuid,
  section text NOT NULL,
  name text NOT NULL,
  email text NOT NULL,
  message text,
  email_sent boolean NOT NULL DEFAULT false,
  email_error text,
  user_agent text,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS clinic_interest_leads_clinic_idx
  ON public.clinic_interest_leads (clinic_id, created_at DESC);

CREATE INDEX IF NOT EXISTS clinic_interest_leads_created_idx
  ON public.clinic_interest_leads (created_at DESC);

COMMENT ON TABLE public.clinic_interest_leads IS
  'Leads de clínicas que clicaram em seções locked no portal (fatia 02 do clinic-portal). Disparam email pra comercial@latta.app.br.';

ALTER TABLE public.clinic_interest_leads ENABLE ROW LEVEL SECURITY;
-- Só service_role lê/escreve (backend Express usa service_role). Sem políticas pra anon/authenticated.
