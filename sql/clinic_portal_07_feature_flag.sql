-- Aplicada em prod (kusqorpjtadcuooprpqb) em 2026-05-17 via MCP apply_migration.
-- Fatia 07 do clinic-portal: registrar a feature flag clinic_portal_v0.

INSERT INTO public.feature_flags (feature_name, user_phone, enabled)
VALUES ('clinic_portal_v0', '*', false)
ON CONFLICT DO NOTHING;

-- Pra liberar pra clinica-piloto:
--   INSERT INTO feature_flags (feature_name, user_phone, enabled)
--   VALUES ('clinic_portal_v0', '<clinic_id_uuid>', true);
--
-- Pra release geral:
--   UPDATE feature_flags SET enabled=true
--   WHERE feature_name='clinic_portal_v0' AND user_phone='*';
--
-- Pra reverter:
--   UPDATE feature_flags SET enabled=false
--   WHERE feature_name='clinic_portal_v0' AND user_phone='*';
