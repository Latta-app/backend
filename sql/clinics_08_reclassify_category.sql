-- Aplicada em prod (kusqorpjtadcuooprpqb) em 2026-08-14 via Management API
-- (/v1/projects/:ref/database/query), com este arquivo como fonte.
--
-- PROBLEMA
-- `clinics.category` nasceu com DEFAULT 'veterinaria' NOT NULL na migration
-- 20260515110000_scheduling_b2b_foundations. Toda a base raspada ANTES disso
-- (565 das 575 linhas) caiu em veterinária sem ninguém ter classificado nada,
-- e todo INSERT que não informa categoria continua caindo lá. O painel B2B
-- lia isso como "575 veterinárias cadastradas", quando só 84 declaram
-- veterinária no nome.
--
-- Não é só um número torto na tela. `chat-engine/lib/clinic-search.ts` busca
-- por `category=eq.<X> AND whatsapp_verified=true`: o tutor que pede banho &
-- tosa alcançava 3 estabelecimentos enquanto ~50 estavam sentados no balde de
-- veterinária, invisíveis pra própria busca.
--
-- CRITÉRIO — só o que o NOME DECLARA
-- Reclassifica exclusivamente quem se anuncia. "Puro Afeto Banho e Tosa" é
-- banho & tosa; "Salão Pet Pink" não declara nada e NÃO é tocado. Inferir
-- categoria de nome que não declara é o mesmo erro de inferir atributo do
-- nome: manda o tutor pra um lugar que não faz o que ele pediu, e expectativa
-- quebrada no balcão é churn.
--
-- A ordem das cláusulas é a prioridade, e veterinária vem primeiro de
-- propósito: "Pet Shop e Clínica Veterinária Pimp My Pet" continua
-- veterinária, porque a capacidade clínica é a mais forte que o nome promete.
--
-- Os 291 sem sinal e os 84 declarados ficam em veterinária. Tirar os 291
-- exigiria valor novo no CHECK `clinics_category_valid` e removeria 77
-- estabelecimentos com WhatsApp da busca de veterinária — decisão à parte,
-- adiada de propósito (Lucas, 14/08/2026).
--
-- REVERSÃO
--   UPDATE public.clinics c
--      SET category = b.category_antes
--     FROM public.clinics_category_backup_20260814 b
--    WHERE c.id = b.clinic_id AND c.category = b.category_depois;

CREATE TABLE IF NOT EXISTS public.clinics_category_backup_20260814 (
  clinic_id       uuid PRIMARY KEY,
  category_antes  text NOT NULL,
  category_depois text NOT NULL,
  aplicado_em     timestamptz NOT NULL DEFAULT now()
);

WITH base AS (
  SELECT id,
         lower(translate(name,
           'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç',
           'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc')) AS n
    FROM public.clinics
   WHERE category = 'veterinaria'
     -- Clínica sintética de QA fica fora de qualquer varredura.
     AND coalesce(phone_normalized, '') NOT LIKE '5500000%'
), classificado AS (
  SELECT id,
    CASE
      WHEN n ~ 'veterinari|clinica vet|hospital vet|policlinic|(^| |&|/)vet($| |&|/|s)' THEN 'veterinaria'
      -- Farmácia exige contexto pet: sem isso, drogaria humana entra na base
      -- de busca e o tutor recebe uma farmácia que não vende o que ele quer.
      WHEN n ~ '(farmac|drogaria)' AND n ~ '(pet|animal|veterinari)'                    THEN 'farmacia'
      WHEN n ~ 'funerari|cremator|crematori'                                            THEN 'funeraria'
      WHEN n ~ 'hotel|hospedag|creche|day ?care|daycare'                                THEN 'hotel'
      WHEN n ~ 'adestra'                                                                THEN 'adestramento'
      WHEN n ~ 'dog ?walk|passead'                                                      THEN 'dog_walker'
      WHEN n ~ 'banho|tosa|groom|spa |estetic'                                          THEN 'banho_tosa'
      WHEN n ~ 'pet ?shop|agropecuari|racao|casa de racao'                               THEN 'petshop'
      ELSE 'sem_sinal'
    END AS destino
    FROM base
), alvo AS (
  SELECT id, destino FROM classificado WHERE destino NOT IN ('veterinaria', 'sem_sinal')
), atualizado AS (
  UPDATE public.clinics c
     SET category = a.destino,
         updated_at = now()
    FROM alvo a
   WHERE c.id = a.id
  RETURNING c.id, 'veterinaria'::text AS antes, a.destino AS depois
)
INSERT INTO public.clinics_category_backup_20260814 (clinic_id, category_antes, category_depois)
SELECT id, antes, depois FROM atualizado
ON CONFLICT (clinic_id) DO NOTHING;
