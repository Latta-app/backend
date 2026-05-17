-- Aplicada em prod (kusqorpjtadcuooprpqb) em 2026-05-17 via MCP apply_migration.
-- Fatia 06 do clinic-portal: activity log de engajamento das clinicas.

CREATE TABLE IF NOT EXISTS public.clinic_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid REFERENCES public.clinics(id) ON DELETE CASCADE,
  user_id uuid,
  user_email text,
  event_type text NOT NULL,
  event_data jsonb DEFAULT '{}'::jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clinic_activity_clinic_created
  ON public.clinic_activity_log (clinic_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_clinic_activity_event_created
  ON public.clinic_activity_log (event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_clinic_activity_user_created
  ON public.clinic_activity_log (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

ALTER TABLE public.clinic_activity_log ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.clinic_activity_log IS
  'Activity log de engajamento das clinicas no painel (fatia 06 do clinic-portal).';
