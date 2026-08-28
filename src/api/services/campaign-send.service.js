/* ============================================================================
 * O DESTINO — o disparo, e o registro de quem recebeu
 * ============================================================================
 *
 * A última etapa, e a única cujo erro não tem desfazer. Peça torta se refaz,
 * público errado se recongela, direção ruim se reaprova. Uma mensagem que chegou
 * no aparelho de 69 pessoas, não.
 *
 * ── AS TRÊS COISAS QUE ESTE ARQUIVO EXISTE PRA GARANTIR ──────────────────────
 *
 * 🚨 1. NUNCA DUAS VEZES. A linha é reservada ANTES da ida à Meta, e linha com
 *    `enviado_em` nunca mais entra na fila. Reservar depois seria o jeito de
 *    mandar duas vezes na primeira queda de conexão.
 *
 * 🚨 2. SÓ SAI O QUE FOI APROVADO. `revisao = 'aprovada'`, sem exceção. Sem
 *    isso a aba de Aprovação grava um veredito que ninguém lê, e vira teatro —
 *    a mesma armadilha da direção aprovada que não congelava a receita.
 *
 * 🚨 3. O REGISTRO DE QUEM RECEBEU. `chat_history` com
 *    `path = 'campanha|<slug>|<id>'`. Foi assim, e só assim, que o "67 tutores
 *    receberam" do Dia do Cachorro foi provável depois. Sem o carimbo, o número
 *    do disparo vira memória de quem estava na frente da tela.
 *
 * 🚨 E O QUE ELE NÃO FAZ: mexer em `contacts.is_being_attended`. O sendTemplate
 * do painel liga esse flag, porque ali a Luma assumiu mesmo. Aqui seria
 * desastre: o chat-engine cala o bot inteiro enquanto ele estiver de pé, e
 * nenhum código de produção o volta pra false. Ver `whatsapp-outbound.service`.
 * ============================================================================ */

import { sequelize } from '../../config/database.js';
import { QueryTypes } from 'sequelize';
import { callMeta, logToHistory, classificarFalha, LUMA_NAME } from './whatsapp-outbound.service.js';
import { resolverTemplate } from './campaign-template.service.js';

const LANDING = 'https://latta.app.br';

/**
 * Uma de cada vez, com respiro.
 *
 * A geração aguenta três em paralelo porque o gargalo é o modelo. Aqui o
 * gargalo é a Meta, que responde rápido e limita por janela — e o custo de
 * apressar não é lentidão, é um 429 no meio do lote com metade das pessoas
 * avisadas. Uma por vez e devagar é o certo pra 69 mensagens.
 */
const PAUSA_MS = 900;

const emAndamento = new Map();
const dormir = (ms) => new Promise((ok) => setTimeout(ok, ms));

/**
 * O corpo do template, com a arte da pessoa no header e o link dela no botão.
 *
 * 🚨 O header vai por `link`, e não por `media_id`. É como o Dia do Cachorro
 * rodou: `media_id` exigiria subir cada peça pra Meta antes, e a peça já está
 * numa URL pública que o proxy da landing serve.
 *
 * 🚨 E o botão leva o TOKEN, nunca o telefone. O link é publicado pelo próprio
 * tutor quando ele compartilha; com o nome do arquivo ali, ele publicaria o
 * próprio número.
 */
export const montarPayload = ({ telefone, templateNome, idioma, arte, valores, token, slug }) => {
  const componentes = [];

  if (arte) {
    componentes.push({
      type: 'header',
      parameters: [{ type: 'image', image: { link: arte } }],
    });
  }

  const posicoes = Object.keys(valores || {}).sort((a, b) => Number(a) - Number(b));
  if (posicoes.length) {
    componentes.push({
      type: 'body',
      parameters: posicoes.map((n) => ({ type: 'text', text: String(valores[n] ?? '') })),
    });
  }

  if (token && slug) {
    componentes.push({
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [{ type: 'text', text: token }],
    });
  }

  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: telefone,
    type: 'template',
    template: {
      name: templateNome,
      language: { code: idioma || 'pt_BR' },
      ...(componentes.length ? { components: componentes } : {}),
    },
  };
};

/**
 * Reserva a próxima peça, de forma atômica.
 *
 * 🚨 As quatro condições juntas são a garantia inteira: aprovada, pronta, sem
 * `enviado_em`, sem reserva. Tirar qualquer uma abre um caminho pra mandar duas
 * vezes ou pra mandar o que ninguém olhou.
 */
const reservarProxima = async (campaignId, telefone) => {
  const rows = await sequelize.query(
    `UPDATE campaign_pieces
        SET envio_reservado_em = NOW(), updated_at = NOW()
      WHERE id = (
        SELECT id FROM campaign_pieces
         WHERE campaign_id = :id
           AND revisao = 'aprovada'
           AND status = 'pronta'
           AND enviado_em IS NULL
           AND envio_reservado_em IS NULL
           ${telefone ? 'AND cell_phone = :telefone' : ''}
         ORDER BY cell_phone
         LIMIT 1
         FOR UPDATE SKIP LOCKED
      )
      RETURNING id, cell_phone, pet_owner_id, pets, url, token`,
    {
      type: QueryTypes.SELECT,
      replacements: telefone ? { id: campaignId, telefone } : { id: campaignId },
    },
  );
  return rows[0] || null;
};

const marcar = async (id, campos) => {
  const sets = Object.keys(campos).map((k) => `${k} = :${k}`);
  await sequelize.query(
    `UPDATE campaign_pieces SET ${sets.join(', ')}, updated_at = NOW() WHERE id = :id`,
    { type: QueryTypes.UPDATE, replacements: { id, ...campos } },
  );
};

/** Manda UMA peça. Já chega reservada. */
export const enviarUma = async ({ peca, campanha, textoPorTelefone }) => {
  const linha = textoPorTelefone.get(peca.cell_phone);
  const payload = montarPayload({
    telefone: peca.cell_phone,
    templateNome: campanha.templateNome,
    idioma: campanha.idioma,
    arte: peca.url,
    valores: linha?.valores,
    token: peca.token,
    slug: campanha.slug,
  });

  try {
    const resp = await callMeta(payload);
    const wamid = resp?.messages?.[0]?.id || null;

    await marcar(peca.id, {
      enviado_em: new Date(),
      wamid,
      envio_erro: null,
      envio_incerto: false,
    });

    // 🚨 O carimbo que torna o disparo AUDITÁVEL depois. Sem ele, "quantos
    // receberam" só se responde pela memória de quem estava na frente da tela.
    await logToHistory({
      name: LUMA_NAME,
      cell_phone: peca.cell_phone,
      journey: 'enviada',
      message: linha?.texto || '',
      sent_by: 'petshop',
      message_type: 'template',
      message_id: wamid,
      path: `campanha|${campanha.slug || 'sem-slug'}|${campanha.id}`,
      pet_owner_id: peca.pet_owner_id || undefined,
    });

    return { ok: true, wamid };
  } catch (err) {
    const { incerto, motivo } = classificarFalha(err);
    await marcar(peca.id, {
      envio_erro: motivo,
      envio_incerto: incerto,
      // 🚨 A reserva SÓ é devolvida quando sabemos que não saiu. No incerto ela
      // fica de pé de propósito: soltar seria oferecer a linha pra um retry que
      // pode duplicar.
      ...(incerto ? {} : { envio_reservado_em: null }),
    });
    return { ok: false, incerto, motivo };
  }
};

const executar = async ({ campaignId, campanha, textoPorTelefone, telefone }) => {
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const peca = await reservarProxima(campaignId, telefone);
    if (!peca) return;
    // eslint-disable-next-line no-await-in-loop
    await enviarUma({ peca, campanha, textoPorTelefone });
    // eslint-disable-next-line no-await-in-loop
    await dormir(PAUSA_MS);
    if (telefone) return; // o disparo de prova manda UMA e para.
  }
};

/**
 * Reúne tudo que o envio precisa e diz o que ainda falta.
 *
 * 🚨 Ele RECUSA em vez de mandar pela metade. Um disparo sem template mandaria
 * mensagem sem texto; sem slug, um botão que leva pro nada. As duas coisas só
 * aparecem depois, no aparelho de quem recebeu.
 */
export const prepararEnvio = async (campaignId) => {
  const rows = await sequelize.query(
    'SELECT id, nome, template, pagina FROM campaigns WHERE id = :id',
    { type: QueryTypes.SELECT, replacements: { id: campaignId } },
  );
  if (!rows.length) return { erro: 'CAMPAIGN_NOT_FOUND' };

  const campanha = rows[0];
  const templateNome = campanha.template?.nome;
  const slug = campanha.pagina?.slug;
  const falta = [];
  if (!templateNome) falta.push('escolher o template, na aba Template');
  if (!slug) falta.push('dar um endereço à página, na aba Página de compartilhamento');
  if (falta.length) return { erro: 'FALTA_COISA', falta };

  const catalogo = await sequelize.query(
    `SELECT template_name, template_language, components_json, template_preview
       FROM templates
      WHERE template_name = :nome AND template_status = 'APPROVED'
      LIMIT 1`,
    { type: QueryTypes.SELECT, replacements: { nome: templateNome } },
  );
  if (!catalogo.length) {
    return {
      erro: 'TEMPLATE_NAO_APROVADO',
      falta: [`o template "${templateNome}" não está aprovado na Meta`],
    };
  }

  const componentes = (() => {
    const bruto = catalogo[0].components_json;
    if (Array.isArray(bruto)) return bruto;
    try {
      return JSON.parse(bruto || '[]');
    } catch {
      return [];
    }
  })();
  const corpo =
    componentes.find((c) => String(c?.type).toUpperCase() === 'BODY')?.text ||
    catalogo[0].template_preview ||
    '';

  const resolvido = await resolverTemplate(campaignId, {
    corpo,
    variaveis: campanha.template?.variaveis,
  });

  return {
    campanha: {
      id: campanha.id,
      nome: campanha.nome,
      templateNome,
      idioma: catalogo[0].template_language || 'pt_BR',
      slug,
    },
    corpo,
    textoPorTelefone: new Map(resolvido.linhas.map((l) => [l.telefone, l])),
  };
};

/** O estado do disparo. É o que a aba pergunta de tempos em tempos. */
export const estadoDoEnvio = async (campaignId) => {
  const pecas = await sequelize.query(
    `SELECT id, cell_phone, pets, status, revisao, url, token,
            envio_reservado_em, enviado_em, wamid, envio_erro, envio_incerto
       FROM campaign_pieces
      WHERE campaign_id = :id
      ORDER BY cell_phone`,
    { type: QueryTypes.SELECT, replacements: { id: campaignId } },
  );

  const conta = (fn) => pecas.filter(fn).length;
  const aprovadas = pecas.filter((p) => p.revisao === 'aprovada' && p.status === 'pronta');
  return {
    rodando: emAndamento.has(campaignId),
    total: pecas.length,
    aprovadas: aprovadas.length,
    // 🚨 "A enviar" conta SÓ o que passou pela Aprovação. O número que a aba
    // mostra é o número que vai sair, e não o tamanho do público.
    aEnviar: aprovadas.filter((p) => !p.enviado_em && !p.envio_reservado_em).length,
    enviadas: conta((p) => p.enviado_em),
    falharam: conta((p) => p.envio_erro && !p.enviado_em && !p.envio_incerto),
    incertas: conta((p) => p.envio_incerto && !p.enviado_em),
    semAprovacao: conta((p) => p.status === 'pronta' && p.revisao !== 'aprovada'),
    pecas,
  };
};

/**
 * Dispara e VOLTA.
 *
 * `telefone` manda pra UM número só, e é assim que o primeiro disparo de toda
 * campanha deve acontecer: no aparelho de quem está montando, antes de qualquer
 * coisa chegar em tutor. Uma peça de prova custa uma mensagem; o lote errado
 * custa 69 e não tem volta.
 */
export const dispararLote = async (campaignId, { telefone } = {}) => {
  if (emAndamento.has(campaignId)) return { jaRodando: true, ...(await estadoDoEnvio(campaignId)) };

  const pronto = await prepararEnvio(campaignId);
  if (pronto.erro) return pronto;

  const estado = await estadoDoEnvio(campaignId);
  if (!estado.aEnviar) return { nadaAFazer: true, ...estado };

  emAndamento.set(campaignId, new Date().toISOString());
  executar({
    campaignId,
    campanha: pronto.campanha,
    textoPorTelefone: pronto.textoPorTelefone,
    telefone,
  })
    .catch((e) => console.error('[campanhas] envio falhou:', e?.message))
    .finally(() => emAndamento.delete(campaignId));

  return { iniciado: true, ...(await estadoDoEnvio(campaignId)) };
};

/**
 * O veredito humano sobre uma peça incerta.
 *
 * 🚨 Só um humano decide isto, e é por isso que existe endpoint em vez de
 * automação: `saiu` marca como enviada e a linha some da fila pra sempre;
 * `nao_saiu` devolve pra fila. Quem sabe olhar o aparelho do tutor, ou o
 * relatório da Meta, é gente.
 */
export const resolverIncerta = async ({ campaignId, pieceId, decisao }) => {
  if (!['saiu', 'nao_saiu'].includes(decisao)) return { erro: 'DECISAO_INVALIDA' };
  const campos =
    decisao === 'saiu'
      ? { enviado_em: new Date(), envio_incerto: false, envio_erro: 'marcada como enviada à mão' }
      : { envio_reservado_em: null, envio_incerto: false, envio_erro: null };
  const rows = await sequelize.query(
    `UPDATE campaign_pieces
        SET ${Object.keys(campos).map((k) => `${k} = :${k}`).join(', ')}, updated_at = NOW()
      WHERE id = :pieceId AND campaign_id = :campaignId AND envio_incerto = true
      RETURNING id, enviado_em, envio_incerto`,
    { type: QueryTypes.SELECT, replacements: { pieceId, campaignId, ...campos } },
  );
  return rows[0] || { erro: 'PECA_NAO_ENCONTRADA' };
};

export default {
  montarPayload,
  prepararEnvio,
  estadoDoEnvio,
  dispararLote,
  resolverIncerta,
  enviarUma,
};
