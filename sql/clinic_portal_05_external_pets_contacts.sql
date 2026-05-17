-- Aplicada em prod (kusqorpjtadcuooprpqb) em 2026-05-17 via MCP apply_migration.
-- Fatia 05 do clinic-portal: tabelas isoladas pra agendamentos externos da clinica
-- (pets e tutores cadastrados pela propria clinica, fora da base Latta).

CREATE TABLE IF NOT EXISTS public.clinic_external_pets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  name text NOT NULL,
  species text,
  breed text,
  birthdate date,
  weight_kg numeric,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clinic_ext_pets_clinic ON public.clinic_external_pets(clinic_id);

ALTER TABLE public.clinic_external_pets ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER set_clinic_external_pets_updated_at
  BEFORE UPDATE ON public.clinic_external_pets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TABLE IF NOT EXISTS public.clinic_external_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text,
  email text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clinic_ext_contacts_clinic ON public.clinic_external_contacts(clinic_id);

ALTER TABLE public.clinic_external_contacts ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER set_clinic_external_contacts_updated_at
  BEFORE UPDATE ON public.clinic_external_contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Ativar FKs em scheduling_sessions (colunas criadas na fatia 00a, soltas ate agora)
ALTER TABLE public.scheduling_sessions
  ADD CONSTRAINT scheduling_sessions_external_pet_fk
    FOREIGN KEY (external_pet_id) REFERENCES public.clinic_external_pets(id) ON DELETE SET NULL;

ALTER TABLE public.scheduling_sessions
  ADD CONSTRAINT scheduling_sessions_external_contact_fk
    FOREIGN KEY (external_contact_id) REFERENCES public.clinic_external_contacts(id) ON DELETE SET NULL;

COMMENT ON TABLE public.clinic_external_pets IS
  'Pets cadastrados pela propria clinica, fora da base Latta (fatia 05 do clinic-portal). Isolado por clinic_id.';
COMMENT ON TABLE public.clinic_external_contacts IS
  'Tutores cadastrados pela propria clinica, fora da base Latta (fatia 05 do clinic-portal). Isolado por clinic_id.';
