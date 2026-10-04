// Estúdio de Flows: as decisões PURAS (validação do lote, filtro de status,
// ordem da lista, forma da resposta).
//
// ── O ALCANCE ──────────────────────────────────────────────────────────────
// PEGA:
//   · pedido torto entrando na fila que a sessão do Claude lê depois: imagem
//     que não é base64, texto que não é string, comentário sem nota, pedido de
//     SERVIDOR sem dizer qual campo do payload;
//   · a mensagem de erro deixando de dizer QUAL pedido e QUAL campo — o
//     operador manda o lote de uma vez e precisa achar a linha na tela;
//   · status desconhecido no filtro virando lista VAZIA (que lê como "não há
//     pedidos") em vez de erro;
//   · o e-commerce saindo do topo da lista de Flows.
// NÃO PEGA:
//   · se o banco aceita o INSERT montado. É o flow-studio-pedidos.test.js
//     (a forma dos replacements) e o CHECK constraint da tabela;
//   · o gate de role. É o flow-studio-rotas.test.js.
import { describe, it, expect } from 'vitest';
import {
  LIMITES,
  validarLote,
  lerFiltroDeStatus,
  ordenarFlows,
  pedidoParaApi,
  snapshotParaApi,
  COLUNAS_DO_PEDIDO,
} from '../services/flow-studio.service.js';

const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const SNAPSHOT = '11111111-2222-4333-8444-555555555555';

const pedido = (over = {}) => ({
  screenId: 'WELCOME',
  componentPath: 'layout.children[0]',
  componentType: 'TextBody',
  rotulo: 'Boas-vindas',
  tipo: 'texto',
  propriedade: 'text',
  origem: 'flow',
  valorAntes: 'Oi',
  valorNovo: 'Olá',
  ...over,
});

const lote = (edits, over = {}) => ({
  flowKey: 'flow-features',
  snapshotId: SNAPSHOT,
  edits,
  ...over,
});

/** Valida um lote com UM pedido torto na posição 2, depois de dois bons. */
const comTortoNaPosicao2 = (torto) => validarLote(lote([pedido(), pedido(), torto]));

describe('lotes válidos passam', () => {
  it.each([
    ['texto como string', pedido()],
    [
      'texto como lista de strings (TextBody aceita array)',
      pedido({ valorNovo: ['linha 1', 'linha 2'] }),
    ],
    ['texto vazio (pedido de apagar o texto)', pedido({ valorNovo: '' })],
    ['imagem em base64 puro', pedido({ tipo: 'imagem', valorNovo: PNG_B64 })],
    [
      'imagem em data URI',
      pedido({ tipo: 'imagem', valorNovo: `data:image/png;base64,${PNG_B64}` }),
    ],
    [
      'tipo_componente com valor livre',
      pedido({ tipo: 'tipo_componente', valorNovo: 'TextCaption' }),
    ],
    [
      'comentario com nota',
      pedido({ tipo: 'comentario', valorNovo: undefined, nota: 'tá apertado' }),
    ],
    [
      'origem servidor com campoServidor',
      pedido({ origem: 'servidor', campoServidor: 'welcome_title' }),
    ],
    [
      'campos opcionais nulos',
      pedido({ componentPath: null, componentType: null, rotulo: null, nota: null }),
    ],
  ])('%s', (_nome, p) => {
    expect(validarLote(lote([p]))).toEqual({ ok: true });
  });

  it('sem snapshotId (opcional)', () => {
    expect(validarLote(lote([pedido()], { snapshotId: undefined }))).toEqual({ ok: true });
    expect(validarLote(lote([pedido()], { snapshotId: null }))).toEqual({ ok: true });
  });

  it('exatamente 100 pedidos', () => {
    expect(validarLote(lote(Array.from({ length: 100 }, () => pedido())))).toEqual({ ok: true });
  });

  it('imagem no limite exato de tamanho', () => {
    const noLimite = 'A'.repeat(LIMITES.imagem);
    expect(validarLote(lote([pedido({ tipo: 'imagem', valorNovo: noLimite })]))).toEqual({
      ok: true,
    });
  });

  it('texto no limite exato (string e lista)', () => {
    expect(validarLote(lote([pedido({ valorNovo: 'x'.repeat(4000) })]))).toEqual({ ok: true });
    expect(
      validarLote(lote([pedido({ valorNovo: ['x'.repeat(2000), 'y'.repeat(2000)] })])),
    ).toEqual({ ok: true });
  });
});

describe('o corpo: flowKey, snapshotId e edits', () => {
  it.each([
    ['corpo ausente', undefined, null, /corpo/],
    ['corpo lista', [], null, /corpo/],
    [
      'flowKey ausente',
      lote([pedido()], { flowKey: undefined }),
      'flowKey',
      /^flowKey: obrigatório/,
    ],
    ['flowKey só espaço', lote([pedido()], { flowKey: '   ' }), 'flowKey', /^flowKey: obrigatório/],
    ['flowKey número', lote([pedido()], { flowKey: 7 }), 'flowKey', /^flowKey: obrigatório/],
    [
      'flowKey com 121',
      lote([pedido()], { flowKey: 'f'.repeat(121) }),
      'flowKey',
      /120 caracteres/,
    ],
    ['snapshotId torto', lote([pedido()], { snapshotId: 'abc' }), 'snapshotId', /uuid/],
    ['edits ausente', lote(undefined), 'edits', /pelo menos 1/],
    ['edits vazio', lote([]), 'edits', /pelo menos 1/],
    ['edits objeto', lote({ 0: pedido() }), 'edits', /pelo menos 1/],
    [
      '101 pedidos',
      lote(Array.from({ length: 101 }, () => pedido())),
      'edits',
      /no máximo 100.*vieram 101/,
    ],
  ])('%s', (_nome, corpo, campo, mensagem) => {
    const r = validarLote(corpo);
    expect(r).toMatchObject({ ok: false, indice: null, campo });
    expect(r.mensagem).toMatch(mensagem);
  });
});

describe('cada pedido diz QUAL item (índice) e QUAL campo', () => {
  it.each([
    ['pedido que não é objeto', 'texto solto', null, /^edits\[2\]: o pedido precisa ser um objeto/],
    [
      'screenId ausente',
      pedido({ screenId: undefined }),
      'screenId',
      /^edits\[2\]\.screenId: obrigatório/,
    ],
    ['screenId vazio', pedido({ screenId: '' }), 'screenId', /^edits\[2\]\.screenId: obrigatório/],
    [
      'screenId com 121',
      pedido({ screenId: 'S'.repeat(121) }),
      'screenId',
      /^edits\[2\]\.screenId: .*120/,
    ],
    [
      'tipo fora do enum',
      pedido({ tipo: 'cor' }),
      'tipo',
      /^edits\[2\]\.tipo: precisa ser um de: texto, imagem/,
    ],
    ['tipo ausente', pedido({ tipo: undefined }), 'tipo', /^edits\[2\]\.tipo:/],
    [
      'origem fora do enum',
      pedido({ origem: 'ef' }),
      'origem',
      /^edits\[2\]\.origem: precisa ser um de: flow, servidor/,
    ],
    [
      'componentPath objeto',
      pedido({ componentPath: { a: 1 } }),
      'componentPath',
      /^edits\[2\]\.componentPath: .*texto/,
    ],
    ['rotulo com 301', pedido({ rotulo: 'r'.repeat(301) }), 'rotulo', /^edits\[2\]\.rotulo: .*300/],
    ['rotulo número', pedido({ rotulo: 3 }), 'rotulo', /^edits\[2\]\.rotulo: .*texto/],
    ['nota com 2001', pedido({ nota: 'n'.repeat(2001) }), 'nota', /^edits\[2\]\.nota: .*2000/],
    // imagem
    [
      'imagem ausente',
      pedido({ tipo: 'imagem', valorNovo: undefined }),
      'valorNovo',
      /^edits\[2\]\.valorNovo: a imagem precisa vir/,
    ],
    [
      'imagem como objeto',
      pedido({ tipo: 'imagem', valorNovo: { src: 'x' } }),
      'valorNovo',
      /^edits\[2\]\.valorNovo: a imagem precisa vir/,
    ],
    [
      'imagem como URL',
      pedido({ tipo: 'imagem', valorNovo: 'https://x.com/a.png' }),
      'valorNovo',
      /^edits\[2\]\.valorNovo: a imagem precisa ser base64/,
    ],
    [
      'imagem data URI que não é imagem',
      pedido({ tipo: 'imagem', valorNovo: `data:text/plain;base64,${PNG_B64}` }),
      'valorNovo',
      /^edits\[2\]\.valorNovo: a imagem precisa ser base64/,
    ],
    [
      'imagem acima de ~3 MB',
      pedido({ tipo: 'imagem', valorNovo: 'A'.repeat(LIMITES.imagem + 4) }),
      'valorNovo',
      /^edits\[2\]\.valorNovo: a imagem passa do limite/,
    ],
    // texto
    [
      'texto com 4001',
      pedido({ valorNovo: 'x'.repeat(4001) }),
      'valorNovo',
      /^edits\[2\]\.valorNovo: o texto passa do limite de 4000/,
    ],
    [
      'texto lista com número',
      pedido({ valorNovo: ['ok', 3] }),
      'valorNovo',
      /^edits\[2\]\.valorNovo: .*todo item do texto precisa ser string/,
    ],
    [
      'texto lista somando 4001',
      pedido({ valorNovo: ['x'.repeat(4000), 'y'] }),
      'valorNovo',
      /^edits\[2\]\.valorNovo: .*somando as linhas/,
    ],
    [
      'texto objeto',
      pedido({ valorNovo: { t: 'x' } }),
      'valorNovo',
      /^edits\[2\]\.valorNovo: o texto precisa ser string ou lista/,
    ],
    [
      'texto ausente',
      pedido({ valorNovo: undefined }),
      'valorNovo',
      /^edits\[2\]\.valorNovo: o texto precisa ser string ou lista/,
    ],
    // comentario
    [
      'comentario sem nota',
      pedido({ tipo: 'comentario', nota: undefined }),
      'nota',
      /^edits\[2\]\.nota: obrigatória quando o tipo é comentario/,
    ],
    [
      'comentario com nota em branco',
      pedido({ tipo: 'comentario', nota: '   ' }),
      'nota',
      /^edits\[2\]\.nota: obrigatória/,
    ],
    // servidor
    [
      'servidor sem campoServidor',
      pedido({ origem: 'servidor' }),
      'campoServidor',
      /^edits\[2\]\.campoServidor: obrigatório quando a origem é servidor/,
    ],
    [
      'servidor com campoServidor vazio',
      pedido({ origem: 'servidor', campoServidor: '' }),
      'campoServidor',
      /^edits\[2\]\.campoServidor: obrigatório/,
    ],
  ])('%s', (_nome, torto, campo, mensagem) => {
    const r = comTortoNaPosicao2(torto);
    expect(r).toMatchObject({ ok: false, indice: 2, campo });
    expect(r.mensagem).toMatch(mensagem);
  });

  it('a primeira falha vence (índice 0 antes do 1)', () => {
    const r = validarLote(lote([pedido({ tipo: 'x' }), pedido({ origem: 'y' })]));
    expect(r).toMatchObject({ indice: 0, campo: 'tipo' });
  });
});

describe('🚨 o filtro de status', () => {
  it('ausente ou vazio = sem filtro', () => {
    expect(lerFiltroDeStatus(undefined)).toEqual({ status: null });
    expect(lerFiltroDeStatus('')).toEqual({ status: null });
    expect(lerFiltroDeStatus(' , ')).toEqual({ status: null });
  });

  it('um status, lista por vírgula e parâmetro repetido', () => {
    expect(lerFiltroDeStatus('pendente')).toEqual({ status: ['pendente'] });
    expect(lerFiltroDeStatus('pendente, em_andamento')).toEqual({
      status: ['pendente', 'em_andamento'],
    });
    expect(lerFiltroDeStatus(['aplicada', 'descartada,pendente'])).toEqual({
      status: ['aplicada', 'descartada', 'pendente'],
    });
  });

  it('repetido não duplica', () => {
    expect(lerFiltroDeStatus('pendente,pendente')).toEqual({ status: ['pendente'] });
  });

  it('🚨 status desconhecido é ERRO, não lista vazia', () => {
    const r = lerFiltroDeStatus('pendente,aprovada');
    expect(r.erro).toMatch(/status desconhecido: aprovada/);
    expect(r.status).toBeUndefined();
  });
});

describe('a lista de Flows', () => {
  it('flow-features primeiro, o resto por nome', () => {
    const flows = [
      { flowKey: 'flow-onboarding-v2', nome: 'Onboarding' },
      { flowKey: 'flow-zeta', nome: 'Assinatura' },
      { flowKey: 'flow-features', nome: 'Zz e-commerce' },
    ];
    expect(ordenarFlows(flows).map((f) => f.flowKey)).toEqual([
      'flow-features',
      'flow-zeta',
      'flow-onboarding-v2',
    ]);
  });

  it('não muta a lista recebida', () => {
    const flows = [
      { flowKey: 'b', nome: 'B' },
      { flowKey: 'flow-features', nome: 'A' },
    ];
    ordenarFlows(flows);
    expect(flows[0].flowKey).toBe('b');
  });
});

describe('a forma da resposta (camelCase)', () => {
  const linha = {
    id: 's1',
    flow_key: 'flow-features',
    nome: 'E-commerce',
    git_sha: 'abc',
    conteudo_sha: 'def',
    telas: 88,
    created_at: '2026-10-03T00:00:00Z',
    flow_json: { screens: [] },
  };

  it('🚨 o snapshot da LISTA não carrega o flow_json', () => {
    expect(snapshotParaApi(linha)).toEqual({
      snapshotId: 's1',
      flowKey: 'flow-features',
      nome: 'E-commerce',
      gitSha: 'abc',
      telas: 88,
      createdAt: '2026-10-03T00:00:00Z',
    });
  });

  it('o snapshot de UM flow carrega', () => {
    expect(snapshotParaApi(linha, { comJson: true }).flowJson).toEqual({ screens: [] });
  });

  it('o pedido sai com TODOS os campos da tabela, em camelCase', () => {
    const row = Object.fromEntries(COLUNAS_DO_PEDIDO.map((c) => [c, `v_${c}`]));
    const api = pedidoParaApi(row);
    expect(Object.keys(api)).toEqual([
      'id',
      'loteId',
      'flowKey',
      'snapshotId',
      'screenId',
      'componentPath',
      'componentType',
      'rotulo',
      'tipo',
      'propriedade',
      'origem',
      'campoServidor',
      'valorAntes',
      'valorNovo',
      'nota',
      'status',
      'resposta',
      'prUrl',
      'autorId',
      'autorNome',
      'createdAt',
      'updatedAt',
    ]);
    expect(api.campoServidor).toBe('v_campo_servidor');
    expect(api.prUrl).toBe('v_pr_url');
  });
});
