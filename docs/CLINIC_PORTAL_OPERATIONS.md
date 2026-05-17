# Clinic Portal — Operações

Doc de operação rápida pro Latta-app/backend lidar com o portal de clínicas
(rodada `clinic-portal`, fatias 00b/01/02/03/05/06/07 deste repo + fatias
correspondentes em `Latta-app/frontend`).

## Resumo da arquitetura

| Camada | Onde |
|---|---|
| Schema (clínica, agendamentos, leads, notifs, log) | Supabase prod `kusqorpjtadcuooprpqb` |
| Trigger postgres (notification automatica em mudança de state) | função `notify_clinic_on_scheduling_state_change()` em `scheduling_sessions` |
| Endpoints backend | `Latta-app/backend` — `src/api/routes/private/clinic*.routes.js` + `clinic-auth.routes.js` |
| Páginas frontend | `Latta-app/frontend` — `src/pages/public/clinic/*` + `src/pages/private/AdminClinicActivity/*` |
| Feature flag | `feature_flags(feature_name='clinic_portal_v0', user_phone=<clinic_id ou '*'>, enabled)` |

---

## Adicionar clínica ao beta

```sql
INSERT INTO feature_flags (feature_name, user_phone, enabled)
VALUES ('clinic_portal_v0', '<clinic_id_uuid>', true);
```

Após isso a clínica:
- consegue `POST /api/clinic-auth/login`
- recebe `enabled: true` em `GET /api/clinic/feature-check`
- acessa `/api/clinic/notifications`, `/api/clinic/external-pets`, etc.

## Release geral (remover gate)

```sql
UPDATE feature_flags SET enabled = true
WHERE feature_name = 'clinic_portal_v0' AND user_phone = '*';
```

A row com `user_phone='*' AND enabled=true` libera para todas as clínicas.
Quando ela existe, o gate `requireClinicPortalFlag` passa pra qualquer
`clinic_id`.

## Reverter feature flag (rollback)

```sql
UPDATE feature_flags SET enabled = false
WHERE feature_name = 'clinic_portal_v0' AND user_phone = '*';

-- e/ou desabilitar clínica especifica:
UPDATE feature_flags SET enabled = false
WHERE feature_name = 'clinic_portal_v0' AND user_phone = '<clinic_id>';
```

Frontend automaticamente cai em "Acesso em beta" no próximo `feature-check`
(polling no `useEffect` da rota, ou no próximo login).

## Gerar link de ativação manualmente (sem template B2B)

```bash
curl -X POST https://api.latta.app.br/api/clinic-auth/request-activation \
  -H "Authorization: Bearer <ADMIN_JWT>" \
  -H "Content-Type: application/json" \
  -d '{"clinic_id":"<uuid>","email":"contato@clinica.com"}'
```

Response:
```json
{
  "code": "CLINIC_ACTIVATION_LINK_GENERATED",
  "data": {
    "user_id": "...",
    "url": "https://latta.app.br/clinica/ativar?token=...",
    "email_dispatched": true,
    "email_error": null
  }
}
```

- Se `RESEND_API_KEY` setada: email vai automaticamente
- Senão: copia `url` e manda manualmente pra clínica

Token expira em 7 dias. Invalidado após uso (`activation_token` vira NULL).

## Magic link não chegou

1. Verifica que `clinic_users` existe pra esse email:
   ```sql
   SELECT id, clinic_id, activation_token, activation_token_expires_at, activated_at
   FROM clinic_users WHERE email = '<email>';
   ```

2. Se `activated_at` está set: clínica já ativou. Manda direto pra `/clinica/login`.

3. Se `activation_token` é null mas `activated_at` é null: token foi consumido sem ativar.
   Re-gerar via `POST /api/clinic-auth/request-activation`.

4. Se `RESEND_API_KEY` não está setada em prod:
   ```bash
   echo $RESEND_API_KEY   # vazio
   ```
   Email não foi enviado. Copia URL do response da API ou pega do log.

## Clínica diz que o calendário está vazio

1. Confere agendamentos da clínica:
   ```sql
   SELECT id, state, source, scheduled_date, service_requested
   FROM scheduling_sessions WHERE clinic_id = '<clinic_id>'
   ORDER BY created_at DESC LIMIT 10;
   ```
2. Se vazio: a clínica nunca recebeu agendamento via EF merchant-scheduling-agent
   e ainda não criou agendamentos externos. Esperado.

## Notification não aparece no sino

1. Confere que o trigger criou:
   ```sql
   SELECT * FROM clinic_notifications
   WHERE clinic_id = '<clinic_id>' ORDER BY created_at DESC LIMIT 5;
   ```
2. Se vazio mas tem agendamentos em `CONFIRMED`: o trigger só dispara em
   INSERT ou UPDATE OF state. Agendamentos antigos não retroativam. Pra
   forçar uma notif de teste:
   ```sql
   UPDATE scheduling_sessions SET state = 'CONFIRMED'
   WHERE id = '<appointment_id>' AND state = 'CONFIRMED';
   -- update no-op mas dispara trigger
   ```
3. O frontend faz polling a cada 60s — espera ou refresh.

## Lead via "Quer conhecer o sistema completo?"

Consulta:
```sql
SELECT id, section, name, email, message, email_sent, email_error, created_at
FROM clinic_interest_leads ORDER BY created_at DESC LIMIT 20;
```

- `email_sent = true` → enviado pra `comercial@latta.app.br`
- `email_error = 'resend_not_configured'` → time comercial deve consultar
  esta query semanalmente pra ver leads pendentes

## Activity log — investigar comportamento de clínica

```sql
SELECT event_type, event_data, ip_address, created_at
FROM clinic_activity_log
WHERE clinic_id = '<clinic_id>'
ORDER BY created_at DESC LIMIT 50;
```

Ou via API admin: `GET /api/admin/clinics/<id>/activity-timeline?limit=200`.

---

# Smoke test integrado — Clinic Portal v0

Pré-requisitos:
- 1 clínica de teste no DB
- Email controlável (conta gmail/test)
- Tutor de teste 5531999300962 (Matheus) ou persona

**Pré-flight**: adiciona clínica ao beta (ver "Adicionar clínica ao beta" acima).

## Roteiro (15 min)

1. [ ] **Admin gera link de ativação** via `POST /api/clinic-auth/request-activation`
2. [ ] **Copia URL retornado** (ou abre email se Resend setado)
3. [ ] **Clica no link** → cai em `/clinica/ativar?token=...` → form aparece
4. [ ] **Define senha** → "Pronto! 💜" → redirect pra `/clinica/login`
5. [ ] **Faz login** → vai pra `/scheduling` (calendário filtrado por clinic_id do JWT)
6. [ ] **Confirma sidebar**: Agendamento no topo + outras com cadeado
7. [ ] **Clica em Pets** (locked) → modal "Quer conhecer..." abre
8. [ ] **Submete o lead** → toast "Recebemos! 💜" → conferir `SELECT * FROM clinic_interest_leads ORDER BY created_at DESC LIMIT 1`
9. [ ] **Agenda agendamento pelo WhatsApp** via tutor de teste → confirma com clínica via chat agent
10. [ ] **Em <60s, clínica vê notif no sino** (badge pink)
11. [ ] **Click no agendamento** no calendário → modal/painel abre → confere ausência de `user_phone`/`petOwner.email` (campos `null` no response)
12. [ ] **Cria pet externo** "Rex" via `+ Agendamento externo` → preenche form → salva
13. [ ] **Agendamento externo aparece** com **borda cinza** + selo "E"
14. [ ] **Admin loga em** `/admin/clinics-activity` → vê clinic-piloto com counts > 0
15. [ ] **Click na clinic-piloto** → drilldown abre com timeline de events

Se todos passarem → release geral via `UPDATE feature_flags ... user_phone='*' enabled=true`.

## Out of scope deste smoke (fatias futuras)

- **Cancelar/no-show/remarcar Latta** com template Meta automático: fatia 04 não foi implementada (só os JSONs dos 2 templates submetidos a Meta — aprovação pendente)
- **Magic link injetado automaticamente no template B2B Latta → clínica**: fora do MVP, admin chama `request-activation` manualmente
- **5 variantes de nudge**: fora do MVP

---

# Roadmap pós-MVP

- v2.1: Multi-staff por clínica (users individuais com permissões)
- v2.2: Realtime (Supabase Realtime) em vez de polling no NotificationBell
- v2.3: Calendário visual rico (week/month, drag-drop)
- v2.4: Matching automático pets/contacts externos ↔ Latta
- v2.5: Retention automático de activity log (drop > 6m via cron)
- v2.6: Dashboard admin com filtros temporais + export CSV + alertas
- v2.7: API pública pra integração com sistemas da clínica
- v3.0: Agenda da clínica usada pela Latta pra propor horários ao tutor

---

# Reverter rodada inteira (emergência)

```sql
-- 1. Desativar feature flag (clinic perde acesso)
UPDATE feature_flags SET enabled = false WHERE feature_name = 'clinic_portal_v0';

-- 2. Se precisar deletar dados (LGPD ou ambiente quebrado):
-- ATENÇÃO: irreversível
TRUNCATE TABLE clinic_users CASCADE;
TRUNCATE TABLE clinic_notifications CASCADE;
TRUNCATE TABLE clinic_external_pets CASCADE;
TRUNCATE TABLE clinic_external_contacts CASCADE;
TRUNCATE TABLE clinic_interest_leads CASCADE;
TRUNCATE TABLE clinic_activity_log CASCADE;

-- 3. Schema continua de pé. Pra reverter de verdade, fazer migration drop:
-- DROP TABLE clinic_users CASCADE;  -- etc.
```

Trigger postgres pode ser desativado sem dropar:
```sql
ALTER TABLE scheduling_sessions DISABLE TRIGGER trg_notify_clinic_on_scheduling_state_change;
```
