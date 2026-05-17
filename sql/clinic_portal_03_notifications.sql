-- Aplicada em prod (kusqorpjtadcuooprpqb) em 2026-05-17 via MCP apply_migration.
-- Fatia 03 do clinic-portal: notificacoes in-app pra clinica + trigger postgres
-- que gera notification quando agendamento Latta muda de state (CONFIRMED,
-- CANCELLED_BY_USER, NO_SHOW). Substitui necessidade de mexer no EF
-- merchant-scheduling-agent — qualquer caminho que mude state vira notif
-- automaticamente.

CREATE TABLE IF NOT EXISTS public.clinic_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  appointment_id uuid REFERENCES public.scheduling_sessions(id) ON DELETE CASCADE,
  metadata jsonb DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clinic_notif_clinic_unread
  ON public.clinic_notifications (clinic_id, created_at DESC)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_clinic_notif_clinic_created
  ON public.clinic_notifications (clinic_id, created_at DESC);

ALTER TABLE public.clinic_notifications ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.notify_clinic_on_scheduling_state_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_title text;
  v_body text;
  v_type text;
  v_should_notify boolean := false;
BEGIN
  IF NEW.source <> 'latta' OR NEW.clinic_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' AND NEW.state = 'CONFIRMED' THEN
    v_should_notify := true;
    v_type := 'new_appointment';
    v_title := 'Novo agendamento confirmado';
  ELSIF TG_OP = 'UPDATE' AND OLD.state IS DISTINCT FROM NEW.state THEN
    IF NEW.state = 'CONFIRMED' THEN
      v_should_notify := true;
      v_type := 'new_appointment';
      v_title := 'Novo agendamento confirmado';
    ELSIF NEW.state = 'CANCELLED_BY_USER' THEN
      v_should_notify := true;
      v_type := 'appointment_cancelled_by_user';
      v_title := 'Agendamento cancelado pelo tutor';
    ELSIF NEW.state = 'NO_SHOW' THEN
      v_should_notify := true;
      v_type := 'appointment_no_show';
      v_title := 'Tutor nao compareceu';
    END IF;
  END IF;

  IF v_should_notify THEN
    v_body := coalesce(NEW.scheduled_service, NEW.service_requested, 'Servico nao informado')
              || CASE WHEN NEW.scheduled_date IS NOT NULL
                      THEN ' · ' || to_char(NEW.scheduled_date AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI')
                      ELSE '' END;

    INSERT INTO public.clinic_notifications (clinic_id, type, title, body, appointment_id, metadata)
    VALUES (
      NEW.clinic_id,
      v_type,
      v_title,
      v_body,
      NEW.id,
      jsonb_build_object('state', NEW.state, 'source', NEW.source)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_clinic_on_scheduling_state_change ON public.scheduling_sessions;
CREATE TRIGGER trg_notify_clinic_on_scheduling_state_change
  AFTER INSERT OR UPDATE OF state ON public.scheduling_sessions
  FOR EACH ROW EXECUTE FUNCTION public.notify_clinic_on_scheduling_state_change();

COMMENT ON TABLE public.clinic_notifications IS
  'Notificacoes in-app pra clinica (fatia 03 do clinic-portal). Inserido pelo trigger trg_notify_clinic_on_scheduling_state_change quando agendamento Latta vira CONFIRMED/CANCELLED_BY_USER/NO_SHOW.';
