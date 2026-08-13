// template-catalog.service.js
// Catálogo de templates aprovados pra mensageria RE-HIDRATAR o corpo real da
// mensagem que o tutor recebeu.
//
// O problema que isto resolve: quem loga o outbound de template só tem os
// PARÂMETROS ({{1}}, {{2}}…), nunca o texto do template — o payload que vai
// pra Graph API não carrega o corpo. O writer então junta os parâmetros com
// " · " e grava isso como se fosse o corpo (marketplace-service
// lib/outbound-log.ts). Medido em 13/08/2026: de 737 linhas `📨` no
// chat_history, 530 estão nessa forma achatada — o operador lê
// "Valeria · 2x Purê Churu · · Entrega · PIX · amanhã · R$ 99,96" em vez da
// mensagem.
//
// O texto está no banco o tempo todo: `templates.components_json` guarda o
// BODY com os `{{n}}` no lugar, mais HEADER/FOOTER/BUTTONS. E a linha do
// chat_history carrega o nome cru do template no `path`
// (`marketplace-ef|graph|tpl:checkin_diario_v6`). Com os dois, o front
// remonta o card. Retroativo: vale pro histórico inteiro, não só pro futuro.
//
// Este serviço é READ-ONLY e devolve o catálogo inteiro de uma vez — são ~200
// templates, o front busca uma vez por sessão e casa em memória. Paginar aqui
// só criaria N idas pra montar uma tela que precisa de todas.

import { pgQuery } from '../../config/postgres.js';

// `components_json` chega ora como jsonb (objeto já parseado pelo driver), ora
// como text (writer antigo gravou string). Ler só um dos dois deixaria metade
// do catálogo sem corpo, e o sintoma seria idêntico ao bug que este serviço
// existe pra consertar: a mensagem continua achatada e ninguém sabe por quê.
const parseComponents = (raw) => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'object') return Array.isArray(raw) ? raw : [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const findComponent = (components, type) =>
  components.find((c) => String(c?.type || '').toUpperCase() === type) || null;

// Botão da Meta → a forma que o front já desenha (`normalizeButtons` do
// payloadParsers espera `title`). Botão sem texto é DESCARTADO: pílula branca
// vazia embaixo da bolha faz o operador achar que a mensagem saiu quebrada
// pro tutor.
const normalizeButtons = (components) => {
  const block = findComponent(components, 'BUTTONS');
  const buttons = Array.isArray(block?.buttons) ? block.buttons : [];
  return buttons
    .map((btn) => {
      const title = String(btn?.text ?? '').trim();
      if (!title) return null;
      const metaType = String(btn?.type ?? '').toUpperCase();
      return {
        title,
        // O tipo da Meta é o vocabulário do console, não o do front. `URL` e
        // `PHONE_NUMBER` viram ícone; o resto é pílula de resposta rápida.
        type: metaType === 'URL' ? 'url' : metaType === 'PHONE_NUMBER' ? 'phone' : 'reply',
        ...(btn?.url ? { url: btn.url } : {}),
        ...(btn?.phone_number ? { phone: btn.phone_number } : {}),
      };
    })
    .filter(Boolean);
};

/**
 * Catálogo `{ [template_name]: { body, header_format, footer, buttons, category } }`.
 *
 * Só APPROVED: template reprovado ou pendente nunca foi enviado, então
 * carregá-lo aqui só aumenta o payload sem casar com linha nenhuma.
 *
 * `body` sai do `components_json` (a fonte que a Meta devolve) com fallback
 * pro `template_preview`, que é o mesmo texto denormalizado numa coluna. Os
 * dois existem e divergem em alguns registros antigos; o components é o mais
 * novo.
 */
export const getTemplateCatalog = async () => {
  const { rows } = await pgQuery(
    `
    SELECT template_name,
           template_category,
           template_label,
           template_preview,
           components_json
    FROM templates
    WHERE template_status = 'APPROVED'
      AND template_name IS NOT NULL
    `,
  );

  const catalog = {};
  for (const row of rows) {
    const components = parseComponents(row.components_json);
    const bodyBlock = findComponent(components, 'BODY');
    const headerBlock = findComponent(components, 'HEADER');
    const footerBlock = findComponent(components, 'FOOTER');

    const body = String(bodyBlock?.text ?? row.template_preview ?? '').trim();
    // Template sem corpo não reidrata nada — entra no catálogo só engordando
    // a resposta. Fora.
    if (!body) continue;

    catalog[row.template_name] = {
      body,
      category: row.template_category || null,
      label: row.template_label || null,
      header_format: headerBlock ? String(headerBlock.format || '').toUpperCase() || null : null,
      footer: footerBlock?.text ? String(footerBlock.text) : null,
      buttons: normalizeButtons(components),
    };
  }

  return catalog;
};

export default { getTemplateCatalog };
