/* ============================================================================
 * O LOTE — a direção aprovada, replicada pro público inteiro
 * ============================================================================
 *
 * A amostra prova a direção. O lote a repete pra cada casa, e é onde o custo do
 * erro muda de escala: errar aqui custa uma peça por tutor e um disparo.
 *
 * 🚨 O LOTE SÓ RODA A PARTIR DE UMA DIREÇÃO APROVADA, e usa a RECEITA
 * CONGELADA no momento da aprovação — nunca os campos vivos do formulário.
 *
 * Sem isso a etapa inteira é teatro: o operador aprova uma amostra, mexe numa
 * palavra da descrição sem pensar, e o lote sai com uma direção que ninguém
 * olhou. A aprovação tem que congelar o que foi aprovado, senão ela não aprova
 * coisa nenhuma.
 *
 * 🚨 O LOTE RODA EM SEGUNDO PLANO, e o cliente pergunta pelo progresso.
 *
 * São ~69 peças a ~20s cada, com concorrência 3: perto de oito minutos. Isso não
 * cabe num request HTTP — o nginx, o navegador e a paciência do operador
 * derrubariam a conexão antes do fim, e derrubar a conexão mataria o lote pela
 * metade sem ninguém saber quais peças saíram. Então o endpoint dispara e volta;
 * o estado mora na tabela, que é o que sobrevive a tudo.
 *
 * 🚨 UM PROCESSO SÓ. O backend roda como uma instância única no pm2
 * (`pm2 start npm --name latta_platform`, sem cluster). É isso que autoriza a
 * trava em memória daqui e a recuperação de peça presa lá embaixo. Se um dia o
 * backend virar cluster, as duas coisas passam a estar erradas ao mesmo tempo, e
 * o sintoma vai ser peça gerada duas vezes.
 * ============================================================================ */

import { sequelize } from '../../config/database.js';
import { QueryTypes } from 'sequelize';
import { gerarPeca, nomeDoArquivo, modoDaPeca } from './campaign-piece.service.js';

/**
 * 🚨 A ESPERA ENTRE TENTATIVAS, e por que ela não é zero.
 *
 * Na primeira passada das 71 peças do Dia do Cachorro, 5 caíram com o fetch
 * abortado. Elas estavam espalhadas pelo lote e não tinham relação nenhuma com o
 * tutor: as mesmas casas passaram na segunda tentativa. É falha de transporte,
 * não de dado, e retentar na hora esbarra na mesma condição que derrubou.
 *
 * Três esperas crescentes, começando em 4s. O comprimento deste array É o número
 * de retentativas: quatro tentativas no total por peça.
 */
export const ESPERAS = [4000, 8000, 12000];

/**
 * Três de cada vez. É o que o script de 26/08 usou pra gerar as 71 peças, e é o
 * número que o modelo aguentou sem estrangular. Subir daqui troca oito minutos
 * de espera por uma fila de 429 que custa mais.
 */
const CONCORRENCIA = 3;

/** Peça em `gerando` há mais que isto é sobra de restart, não trabalho vivo. */
const MINUTOS_ATE_ABANDONO = 15;

const dormir = (ms) => new Promise((ok) => setTimeout(ok, ms));

// A trava por campanha. Existe pra o operador não disparar o mesmo lote duas
// vezes clicando duas vezes — o que não corromperia nada (o reserva-e-marca lá
// embaixo é atômico), mas dobraria a conta da inferência.
const emAndamento = new Map();

/**
 * A direção aprovada, ou o erro que diz o que falta.
 *
 * Ela é lida do banco e nunca do corpo do request: quem manda no lote é o que
 * foi aprovado, não o que está aberto na tela de quem clicou.
 */
export const lerDirecaoAprovada = async (campaignId) => {
  const rows = await sequelize.query('SELECT producao FROM campaigns WHERE id = :id', {
    type: QueryTypes.SELECT,
    replacements: { id: campaignId },
  });
  if (!rows.length) return { erro: 'CAMPAIGN_NOT_FOUND' };
  const producao = rows[0].producao || {};
  const aprovada = producao.direcaoAprovada;
  if (!aprovada?.receita?.fundo) {
    return {
      erro: 'DIRECAO_NAO_APROVADA',
      mensagem:
        'O lote replica uma direção aprovada. Gere uma peça, olhe se o pet é o da casa e se a palavra na parede está certa, e aprove.',
    };
  }
  return { producao, receita: aprovada.receita, aprovadaEm: aprovada.em };
};

/**
 * Congela a direção: qual amostra foi aprovada, quando, e a receita que a
 * produziu.
 *
 * 🚨 A RECEITA É COPIADA, não referenciada. Guardar só a URL da amostra deixaria
 * a replicação lendo os campos vivos do formulário, e uma edição depois da
 * aprovação mudaria o lote sem passar por aprovação nenhuma.
 */
export const aprovarDirecao = async ({ campaignId, url, alvo }) => {
  const rows = await sequelize.query('SELECT producao FROM campaigns WHERE id = :id', {
    type: QueryTypes.SELECT,
    replacements: { id: campaignId },
  });
  if (!rows.length) return null;
  const producao = rows[0].producao || {};

  const amostras = Array.isArray(producao.amostras) ? producao.amostras : [];
  const escolhida = url ? amostras.find((a) => a.url === url) : amostras[amostras.length - 1];
  if (!escolhida) return { erro: 'AMOSTRA_NAO_ENCONTRADA' };

  const direcaoAprovada = {
    url: escolhida.url,
    alvo: alvo || escolhida.alvo || null,
    em: new Date().toISOString(),
    receita: {
      fundo: producao.fundo,
      fundoUrl: producao.fundoUrl,
      descricaoFotos: producao.descricaoFotos || '',
      textoDaArte: producao.textoDaArte || '',
      escopo: producao.escopo === 'pet' ? 'pet' : 'tutor',
    },
  };

  const salvo = await sequelize.query(
    `UPDATE campaigns SET producao = :producao::jsonb, updated_at = NOW()
      WHERE id = :id RETURNING producao`,
    {
      type: QueryTypes.SELECT,
      replacements: {
        id: campaignId,
        producao: JSON.stringify({ ...producao, direcaoAprovada }),
      },
    },
  );
  return salvo[0]?.producao ?? null;
};

/**
 * Cria uma linha por peça a partir do público congelado.
 *
 * `ON CONFLICT DO NOTHING` no índice `(campaign_id, arquivo)`: semear duas vezes
 * não duplica nem apaga o que já foi gerado. E é o mesmo índice que impede duas
 * casas de gravarem no mesmo arquivo — a semeadura passa pela mesma porta que a
 * geração.
 */
export const semear = async (campaignId, { escopo }) => {
  const tutores = await sequelize.query(
    `SELECT pet_owner_id, cell_phone, pets FROM campaign_audience
      WHERE campaign_id = :id ORDER BY cell_phone`,
    { type: QueryTypes.SELECT, replacements: { id: campaignId } },
  );

  const pecas = [];
  for (const t of tutores) {
    const pets = Array.isArray(t.pets) ? t.pets : [];
    if (escopo === 'pet') {
      for (const pet of pets) {
        pecas.push({
          cell_phone: t.cell_phone,
          pet_owner_id: t.pet_owner_id,
          pet_id: pet.id ?? null,
          pets: [pet],
          arquivo: nomeDoArquivo({ telefone: t.cell_phone, petId: pet.id }),
          modo: modoDaPeca(1),
        });
      }
    } else {
      pecas.push({
        cell_phone: t.cell_phone,
        pet_owner_id: t.pet_owner_id,
        pet_id: null,
        pets,
        arquivo: nomeDoArquivo({ telefone: t.cell_phone }),
        modo: modoDaPeca(pets.filter((p) => p.foto).length),
      });
    }
  }
  if (!pecas.length) return 0;

  // Um INSERT só, com a lista desmontada no banco. Uma ida por peça manteria a
  // transação aberta por 69 viagens sem ganhar nada.
  await sequelize.query(
    `INSERT INTO campaign_pieces (campaign_id, cell_phone, pet_owner_id, pet_id, pets, arquivo, modo)
     SELECT :id,
            p->>'cell_phone',
            NULLIF(p->>'pet_owner_id','')::uuid,
            NULLIF(p->>'pet_id','')::uuid,
            p->'pets',
            p->>'arquivo',
            p->>'modo'
       FROM jsonb_array_elements(:pecas::jsonb) AS p
     ON CONFLICT (campaign_id, arquivo) DO NOTHING`,
    {
      type: QueryTypes.INSERT,
      replacements: { id: campaignId, pecas: JSON.stringify(pecas) },
    },
  );
  return pecas.length;
};

/**
 * Devolve pra fila as peças que ficaram presas em `gerando`.
 *
 * 🚨 Sem isto, um restart do backend no meio do lote deixa até três peças em
 * `gerando` PARA SEMPRE. Elas não são geradas (o worker morreu) e não aparecem
 * como falha (o status não é `erro`), então o lote fica eternamente em "faltam
 * 3" e o operador não tem botão nenhum que as alcance. É a família do guard que
 * nunca reprova: um estado que não é sucesso nem fracasso não é lido por
 * ninguém.
 */
const recuperarPresas = async (campaignId) =>
  sequelize.query(
    `UPDATE campaign_pieces
        SET status = 'pendente', updated_at = NOW(),
            erro = 'a geração foi interrompida (o backend reiniciou). Devolvida pra fila.'
      WHERE campaign_id = :id
        AND status = 'gerando'
        AND iniciada_em < NOW() - INTERVAL '${MINUTOS_ATE_ABANDONO} minutes'`,
    { type: QueryTypes.UPDATE, replacements: { id: campaignId } },
  );

/**
 * Reserva a próxima peça pendente, de forma atômica.
 *
 * `FOR UPDATE SKIP LOCKED` é o que deixa os três trabalhadores puxarem da mesma
 * fila sem sincronizar nada em memória: cada um leva uma linha diferente, e
 * duas peças nunca são geradas em paralelo pro mesmo destinatário.
 */
const reservarProxima = async (campaignId) => {
  const rows = await sequelize.query(
    `UPDATE campaign_pieces
        SET status = 'gerando', iniciada_em = NOW(), updated_at = NOW()
      WHERE id = (
        SELECT id FROM campaign_pieces
         WHERE campaign_id = :id AND status = 'pendente'
         ORDER BY created_at
         LIMIT 1
         FOR UPDATE SKIP LOCKED
      )
      RETURNING id, cell_phone, pet_owner_id, pet_id, pets, arquivo, tentativas`,
    { type: QueryTypes.SELECT, replacements: { id: campaignId } },
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

/**
 * Produz UMA peça, com as retentativas.
 *
 * 🚨 A retentativa mexe no CONTADOR a cada volta, não só no fim. É isso que faz
 * a tela dizer "esta aqui já tentou três vezes" enquanto o lote ainda roda, em
 * vez de a peça ficar muda até desistir.
 *
 * `esperas` e `aguardar` entram por parâmetro pro guard poder provar a espera
 * sem esperar 24 segundos de verdade. O padrão é o que roda em produção.
 */
export const produzirPeca = async ({
  peca,
  campaignId,
  receita,
  esperas = ESPERAS,
  aguardar = dormir,
}) => {
  const alvo = {
    telefone: peca.cell_phone,
    ownerId: peca.pet_owner_id,
    pets: Array.isArray(peca.pets) ? peca.pets : [],
  };

  for (let volta = 0; volta <= esperas.length; volta += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await marcar(peca.id, { tentativas: peca.tentativas + volta + 1 });
      // eslint-disable-next-line no-await-in-loop
      const feita = await gerarPeca({
        campaignId,
        producao: receita,
        alvo,
        arquivo: peca.arquivo,
      });
      // eslint-disable-next-line no-await-in-loop
      await marcar(peca.id, {
        status: 'pronta',
        url: feita.url,
        modo: feita.modo,
        erro: null,
        concluida_em: new Date(),
      });
      return { ok: true };
    } catch (e) {
      const motivo = String(e?.message || e).slice(0, 400);
      if (volta < esperas.length) {
        // eslint-disable-next-line no-await-in-loop
        await marcar(peca.id, { erro: `tentativa ${volta + 1}: ${motivo}` });
        // eslint-disable-next-line no-await-in-loop
        await aguardar(esperas[volta]);
      } else {
        // eslint-disable-next-line no-await-in-loop
        await marcar(peca.id, {
          status: 'erro',
          erro: motivo,
          concluida_em: new Date(),
        });
        return { ok: false, motivo };
      }
    }
  }
  return { ok: false };
};

const executar = async ({ campaignId, receita }) => {
  const trabalhador = async () => {
    for (;;) {
      // eslint-disable-next-line no-await-in-loop
      const peca = await reservarProxima(campaignId);
      if (!peca) return;
      // eslint-disable-next-line no-await-in-loop
      await produzirPeca({ peca, campaignId, receita });
    }
  };
  await Promise.all(Array.from({ length: CONCORRENCIA }, trabalhador));
};

/**
 * Devolve pra fila o que o operador pediu pra refazer.
 *
 * `falhas` pega o que deu erro. `reprovadas` pega o que o olho humano recusou no
 * canvas de revisão — e limpa a revisão junto, porque uma peça refeita não
 * carrega o veredito da peça anterior.
 */
const REQUEUE = {
  falhas: `status = 'erro'`,
  reprovadas: `revisao = 'reprovada'`,
};

const devolverPraFila = async (campaignId, alvo) => {
  const filtro = REQUEUE[alvo];
  if (!filtro) return 0;
  const limpaRevisao = alvo === 'reprovadas';
  await sequelize.query(
    `UPDATE campaign_pieces
        SET status = 'pendente', erro = NULL, tentativas = 0, updated_at = NOW()
            ${limpaRevisao ? `, revisao = NULL, revisao_motivo = NULL, revisada_em = NULL` : ''}
      WHERE campaign_id = :id AND ${filtro}`,
    { type: QueryTypes.UPDATE, replacements: { id: campaignId } },
  );
  return 1;
};

/**
 * Dispara o lote e VOLTA. Quem acompanha é o `estadoDoLote`.
 *
 * `alvo`: 'pendentes' (só o que falta), 'falhas' (refazer o que deu erro),
 * 'reprovadas' (refazer o que o olho recusou).
 */
export const iniciarLote = async (campaignId, { alvo = 'pendentes' } = {}) => {
  if (emAndamento.has(campaignId)) {
    return { jaRodando: true, desde: emAndamento.get(campaignId) };
  }

  const direcao = await lerDirecaoAprovada(campaignId);
  if (direcao.erro) return direcao;

  await recuperarPresas(campaignId);
  await semear(campaignId, { escopo: direcao.receita.escopo });
  await devolverPraFila(campaignId, alvo);

  const [{ pendentes }] = await sequelize.query(
    `SELECT COUNT(*)::int AS pendentes FROM campaign_pieces
      WHERE campaign_id = :id AND status = 'pendente'`,
    { type: QueryTypes.SELECT, replacements: { id: campaignId } },
  );
  if (!pendentes) return { nadaAFazer: true, ...(await estadoDoLote(campaignId)) };

  emAndamento.set(campaignId, new Date().toISOString());
  // 🚨 Sem `await` de propósito: o request volta agora e o lote segue no
  // processo. O `finally` é o que garante que a trava sai mesmo quando o lote
  // morre no meio — trava que não sai é um lote que nunca mais pode ser
  // disparado sem reiniciar o backend.
  executar({ campaignId, receita: direcao.receita })
    .catch((e) => console.error('[campanhas] lote falhou:', e?.message))
    .finally(() => emAndamento.delete(campaignId));

  return { iniciado: true, pendentes, ...(await estadoDoLote(campaignId)) };
};

/** O progresso do lote, peça por peça. É o que a tela pergunta de tempos em tempos. */
export const estadoDoLote = async (campaignId) => {
  const pecas = await sequelize.query(
    `SELECT id, cell_phone, pet_owner_id, pet_id, pets, status, arquivo, url, modo,
            erro, tentativas, revisao, revisao_motivo, revisada_em, concluida_em
       FROM campaign_pieces
      WHERE campaign_id = :id
      ORDER BY cell_phone, arquivo`,
    { type: QueryTypes.SELECT, replacements: { id: campaignId } },
  );

  const conta = (fn) => pecas.filter(fn).length;
  return {
    rodando: emAndamento.has(campaignId),
    desde: emAndamento.get(campaignId) ?? null,
    total: pecas.length,
    pendentes: conta((p) => p.status === 'pendente'),
    gerando: conta((p) => p.status === 'gerando'),
    prontas: conta((p) => p.status === 'pronta'),
    erros: conta((p) => p.status === 'erro'),
    // 🚨 A revisão é contada SEPARADO do status, porque são perguntas
    // diferentes: `pronta` diz que a máquina entregou um arquivo, `aprovada`
    // diz que um humano olhou e reconheceu o cachorro da casa. Misturar as duas
    // é como o Dia do Cachorro mandou peça errada com tudo verde.
    aprovadas: conta((p) => p.revisao === 'aprovada'),
    reprovadas: conta((p) => p.revisao === 'reprovada'),
    semRevisao: conta((p) => p.status === 'pronta' && !p.revisao),
    pecas,
  };
};

/** O veredito humano sobre uma peça. */
export const revisarPeca = async ({ campaignId, pieceId, revisao, motivo }) => {
  if (!['aprovada', 'reprovada', null].includes(revisao)) {
    return { erro: 'REVISAO_INVALIDA' };
  }
  const rows = await sequelize.query(
    `UPDATE campaign_pieces
        SET revisao = :revisao, revisao_motivo = :motivo,
            revisada_em = CASE WHEN :revisao IS NULL THEN NULL ELSE NOW() END,
            updated_at = NOW()
      WHERE id = :pieceId AND campaign_id = :campaignId
      RETURNING id, revisao, revisao_motivo, revisada_em`,
    {
      type: QueryTypes.SELECT,
      replacements: { pieceId, campaignId, revisao, motivo: motivo || null },
    },
  );
  return rows[0] || { erro: 'PECA_NAO_ENCONTRADA' };
};

export default {
  aprovarDirecao,
  lerDirecaoAprovada,
  semear,
  iniciarLote,
  estadoDoLote,
  revisarPeca,
};
