/* ============================================================================
 * ESTÚDIO DE FLOWS — as decisões puras
 * ============================================================================
 *
 * O painel mostra as telas dos WhatsApp Flows renderizadas a partir de um
 * SNAPSHOT (o Flow JSON inteiro, com as imagens já resolvidas em base64), e o
 * operador grava PEDIDOS DE MUDANÇA em cima delas. Quem aplica é uma sessão do
 * Claude depois, lendo os pendentes. Esta API não publica Flow nenhum: ela só lê
 * snapshot e grava/lista pedido.
 *
 * Tudo que decide alguma coisa mora aqui, sem banco, pra ser testado sem mock:
 * a validação do lote, o filtro de status, a ordem da lista e a montagem do
 * INSERT. O controller só costura isto com o `sequelize.query`.
 * ============================================================================ */

export const TIPOS = ['texto', 'imagem', 'tipo_componente', 'comentario'];
export const ORIGENS = ['flow', 'servidor'];
export const STATUS = ['pendente', 'em_andamento', 'aplicada', 'descartada'];

export const LIMITES = {
  pedidosPorLote: 100,
  chave: 120, // flowKey e screenId
  rotulo: 300,
  nota: 2000,
  texto: 4000,
  // ~3 MB de TEXTO base64 (≈ 2,25 MB de imagem decodificada). O corpo inteiro
  // passa pelo parser JSON global, então este teto é por pedido, não por lote.
  imagem: 3 * 1024 * 1024,
};

/** O Flow que abre a lista: é o e-commerce, onde mora quase todo pedido. */
export const FLOW_PRINCIPAL = 'flow-features';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATA_URI_RE = /^data:image\/[a-z0-9.+-]+;base64,/i;
// Base64 padrão, sem quebra de linha. Classe de caractere simples: a regex é
// linear no tamanho, e a imagem pode ter 3 MB.
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

export const ehUuid = (valor) => typeof valor === 'string' && UUID_RE.test(valor);

const ehTextoPreenchido = (valor) => typeof valor === 'string' && valor.trim() !== '';

/** `null` e ausente são o mesmo "não veio". Qualquer outra coisa é um valor. */
const veio = (valor) => valor !== undefined && valor !== null;

const falha = (indice, campo, mensagem) => ({ ok: false, indice, campo, mensagem });

/**
 * A imagem chega como base64 puro ou como data URI de imagem. Devolve o motivo
 * da recusa, ou null quando ela serve.
 */
const motivoDaImagemInvalida = (valor) => {
  if (typeof valor !== 'string' || valor === '') {
    return 'a imagem precisa vir como texto base64 ou data URI (data:image/...;base64,...)';
  }
  if (valor.length > LIMITES.imagem) {
    return `a imagem passa do limite de ${LIMITES.imagem} caracteres de base64 (~3 MB)`;
  }
  const corpo = DATA_URI_RE.test(valor) ? valor.slice(valor.indexOf(',') + 1) : valor;
  if (!BASE64_RE.test(corpo)) {
    return 'a imagem precisa ser base64 válido ou data URI (data:image/...;base64,...)';
  }
  return null;
};

/** TextBody aceita string OU array de strings. O teto vale pro texto inteiro. */
const motivoDoTextoInvalido = (valor) => {
  if (typeof valor === 'string') {
    return valor.length > LIMITES.texto
      ? `o texto passa do limite de ${LIMITES.texto} caracteres`
      : null;
  }
  if (Array.isArray(valor)) {
    if (!valor.every((linha) => typeof linha === 'string')) {
      return 'quando vem como lista, todo item do texto precisa ser string';
    }
    const total = valor.reduce((soma, linha) => soma + linha.length, 0);
    return total > LIMITES.texto
      ? `o texto passa do limite de ${LIMITES.texto} caracteres (somando as linhas)`
      : null;
  }
  return 'o texto precisa ser string ou lista de strings';
};

/** Campos de texto livre e opcionais: se vierem, têm que ser string. */
const OPCIONAIS_TEXTO = ['componentPath', 'componentType', 'propriedade', 'campoServidor'];

const validarPedido = (pedido, i) => {
  if (!pedido || typeof pedido !== 'object' || Array.isArray(pedido)) {
    return falha(i, null, `edits[${i}]: o pedido precisa ser um objeto`);
  }
  const campo = (nome, mensagem) => falha(i, nome, `edits[${i}].${nome}: ${mensagem}`);

  if (!ehTextoPreenchido(pedido.screenId)) {
    return campo('screenId', 'obrigatório, texto não vazio');
  }
  if (pedido.screenId.length > LIMITES.chave) {
    return campo('screenId', `passa do limite de ${LIMITES.chave} caracteres`);
  }
  if (!TIPOS.includes(pedido.tipo)) {
    return campo('tipo', `precisa ser um de: ${TIPOS.join(', ')}`);
  }
  if (!ORIGENS.includes(pedido.origem)) {
    return campo('origem', `precisa ser um de: ${ORIGENS.join(', ')}`);
  }
  const opcionalTorto = OPCIONAIS_TEXTO.find(
    (nome) => veio(pedido[nome]) && typeof pedido[nome] !== 'string',
  );
  if (opcionalTorto) return campo(opcionalTorto, 'quando vem, precisa ser texto');
  if (veio(pedido.rotulo)) {
    if (typeof pedido.rotulo !== 'string') return campo('rotulo', 'quando vem, precisa ser texto');
    if (pedido.rotulo.length > LIMITES.rotulo) {
      return campo('rotulo', `passa do limite de ${LIMITES.rotulo} caracteres`);
    }
  }
  if (veio(pedido.nota)) {
    if (typeof pedido.nota !== 'string') return campo('nota', 'quando vem, precisa ser texto');
    if (pedido.nota.length > LIMITES.nota) {
      return campo('nota', `passa do limite de ${LIMITES.nota} caracteres`);
    }
  }

  if (pedido.tipo === 'imagem') {
    const motivo = motivoDaImagemInvalida(pedido.valorNovo);
    if (motivo) return campo('valorNovo', motivo);
  }
  if (pedido.tipo === 'texto') {
    const motivo = motivoDoTextoInvalido(pedido.valorNovo);
    if (motivo) return campo('valorNovo', motivo);
  }
  // Um comentário SEM nota não pede nada: é uma linha vazia na fila da sessão
  // que vai aplicar.
  if (pedido.tipo === 'comentario' && !ehTextoPreenchido(pedido.nota)) {
    return campo('nota', 'obrigatória quando o tipo é comentario');
  }
  // 🚨 Pedido de origem SERVIDOR muda o que a EF manda, não o JSON do Flow. Sem
  // dizer QUAL campo do payload, quem for aplicar não tem por onde começar.
  if (pedido.origem === 'servidor' && !ehTextoPreenchido(pedido.campoServidor)) {
    return campo('campoServidor', 'obrigatório quando a origem é servidor');
  }
  return { ok: true };
};

/**
 * Valida o corpo inteiro do POST. A primeira falha vence, e ela diz QUAL pedido
 * (o índice em `edits`) e QUAL campo, porque o operador manda o lote de uma vez
 * e precisa achar a linha errada na tela.
 *
 * Devolve `{ ok: true }` ou `{ ok: false, indice, campo, mensagem }` — `indice`
 * é null quando o erro é do corpo, não de um pedido.
 */
export const validarLote = (corpo) => {
  if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) {
    return falha(null, null, 'o corpo precisa ser um objeto com flowKey e edits');
  }
  if (!ehTextoPreenchido(corpo.flowKey)) {
    return falha(null, 'flowKey', 'flowKey: obrigatório, texto não vazio');
  }
  if (corpo.flowKey.length > LIMITES.chave) {
    return falha(null, 'flowKey', `flowKey: passa do limite de ${LIMITES.chave} caracteres`);
  }
  // O snapshot pode faltar (pedido feito sem tela carregada), mas quando vem é
  // uuid: um valor torto aqui derrubaria o INSERT inteiro com erro de tipo.
  if (veio(corpo.snapshotId) && !ehUuid(corpo.snapshotId)) {
    return falha(null, 'snapshotId', 'snapshotId: quando vem, precisa ser um uuid');
  }
  if (!Array.isArray(corpo.edits) || corpo.edits.length === 0) {
    return falha(null, 'edits', 'edits: precisa ser uma lista com pelo menos 1 pedido');
  }
  if (corpo.edits.length > LIMITES.pedidosPorLote) {
    return falha(
      null,
      'edits',
      `edits: no máximo ${LIMITES.pedidosPorLote} pedidos por envio (vieram ${corpo.edits.length})`,
    );
  }
  for (let i = 0; i < corpo.edits.length; i += 1) {
    const r = validarPedido(corpo.edits[i], i);
    if (!r.ok) return r;
  }
  return { ok: true };
};

/**
 * O filtro `?status=`. Aceita `pendente`, `pendente,em_andamento` e também o
 * parâmetro repetido (`?status=a&status=b`, que o Express entrega como lista).
 *
 * Devolve `{ status: null }` (sem filtro), `{ status: [...] }` ou `{ erro }`.
 * Status desconhecido é ERRO, não filtro vazio: um erro de digitação devolveria
 * uma lista vazia que lê como "não há pedidos".
 */
export const lerFiltroDeStatus = (bruto) => {
  if (!veio(bruto) || bruto === '') return { status: null };
  const partes = (Array.isArray(bruto) ? bruto : [bruto])
    .flatMap((p) => String(p).split(','))
    .map((p) => p.trim())
    .filter(Boolean);
  if (!partes.length) return { status: null };
  const desconhecidos = partes.filter((p) => !STATUS.includes(p));
  if (desconhecidos.length) {
    return {
      erro: `status desconhecido: ${desconhecidos.join(', ')}. Use: ${STATUS.join(', ')}`,
    };
  }
  return { status: [...new Set(partes)] };
};

/** Linha de `flow_studio_snapshots` → resposta. O `flow_json` só vai quando pedido. */
export const snapshotParaApi = (row, { comJson = false } = {}) => {
  const base = {
    snapshotId: row.id,
    flowKey: row.flow_key,
    nome: row.nome,
    gitSha: row.git_sha,
    telas: row.telas,
    createdAt: row.created_at,
  };
  return comJson ? { ...base, flowJson: row.flow_json } : base;
};

/** O e-commerce primeiro; o resto por nome (e pela chave, se o nome empatar). */
export const ordenarFlows = (flows) =>
  [...flows].sort((a, b) => {
    const pa = a.flowKey === FLOW_PRINCIPAL ? 0 : 1;
    const pb = b.flowKey === FLOW_PRINCIPAL ? 0 : 1;
    if (pa !== pb) return pa - pb;
    const porNome = String(a.nome ?? '').localeCompare(String(b.nome ?? ''), 'pt-BR');
    return porNome || String(a.flowKey).localeCompare(String(b.flowKey));
  });

/** As colunas de `flow_studio_edits`, na ordem em que a API as devolve. */
export const COLUNAS_DO_PEDIDO = [
  'id',
  'lote_id',
  'flow_key',
  'snapshot_id',
  'screen_id',
  'component_path',
  'component_type',
  'rotulo',
  'tipo',
  'propriedade',
  'origem',
  'campo_servidor',
  'valor_antes',
  'valor_novo',
  'nota',
  'status',
  'resposta',
  'pr_url',
  'autor_id',
  'autor_nome',
  'created_at',
  'updated_at',
];

const camelCase = (s) => s.replace(/_([a-z])/g, (_m, c) => c.toUpperCase());

/** Linha de `flow_studio_edits` → resposta, com TODOS os campos em camelCase. */
export const pedidoParaApi = (row) =>
  Object.fromEntries(COLUNAS_DO_PEDIDO.map((col) => [camelCase(col), row[col] ?? null]));

/**
 * jsonb: `null`/ausente vira NULL de SQL, e não o `null` de JSON — "o pedido não
 * tem valor antes" e "o valor antes era null" não são a mesma coisa.
 */
const comoJsonb = (valor) => (veio(valor) ? JSON.stringify(valor) : null);
const textoOuNulo = (valor) => (veio(valor) ? valor : null);

/**
 * O INSERT do lote, num statement só. Cada pedido vira uma tupla de VALUES com
 * replacements indexados (`:screenId0`, `:screenId1`…); lote, flow, snapshot e
 * autor são comuns ao lote e entram uma vez.
 */
export const montarInsertDePedidos = ({
  loteId,
  flowKey,
  snapshotId,
  edits,
  autorId,
  autorNome,
}) => {
  const replacements = {
    loteId,
    flowKey,
    snapshotId: textoOuNulo(snapshotId),
    autorId: textoOuNulo(autorId),
    autorNome: textoOuNulo(autorNome),
  };
  const tuplas = edits.map((e, i) => {
    replacements[`screenId${i}`] = e.screenId;
    replacements[`componentPath${i}`] = textoOuNulo(e.componentPath);
    replacements[`componentType${i}`] = textoOuNulo(e.componentType);
    replacements[`rotulo${i}`] = textoOuNulo(e.rotulo);
    replacements[`tipo${i}`] = e.tipo;
    replacements[`propriedade${i}`] = textoOuNulo(e.propriedade);
    replacements[`origem${i}`] = e.origem;
    replacements[`campoServidor${i}`] = textoOuNulo(e.campoServidor);
    replacements[`valorAntes${i}`] = comoJsonb(e.valorAntes);
    replacements[`valorNovo${i}`] = comoJsonb(e.valorNovo);
    replacements[`nota${i}`] = textoOuNulo(e.nota);
    return `(:loteId, :flowKey, :snapshotId, :screenId${i}, :componentPath${i}, :componentType${i},
       :rotulo${i}, :tipo${i}, :propriedade${i}, :origem${i}, :campoServidor${i},
       :valorAntes${i}::jsonb, :valorNovo${i}::jsonb, :nota${i}, :autorId, :autorNome)`;
  });
  const sql = `INSERT INTO flow_studio_edits
      (lote_id, flow_key, snapshot_id, screen_id, component_path, component_type,
       rotulo, tipo, propriedade, origem, campo_servidor,
       valor_antes, valor_novo, nota, autor_id, autor_nome)
    VALUES ${tuplas.join(',\n           ')}
    RETURNING id`;
  return { sql, replacements };
};
