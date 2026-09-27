// O número do público: qual número da Latta fala com cada público, e qual
// público cada número atende.
//
// 🚨 GÊMEA de `supabase/functions/_shared/numero-do-publico.ts` no repo
// principal (Matheus-MCA/Latta, ADR 0023). As regras são as mesmas; mexeu lá,
// confira aqui. A Latta tem dois números na mesma WABA:
//
//   · tutor           → 587778224419344 (+55 11 5198-5512)
//   · estabelecimento → 714853578383901 (+55 11 5196-5232)
//
// O problema: o painel mandava tudo por um phone_number_id cravado. Com dois
// números, a resposta da operadora numa conversa de clínica sairia pelo número
// do tutor, onde a janela de 24h da clínica não está aberta, e a clínica veria
// a resposta chegar noutra conversa (ou não chegar).
//
// Envs (as mesmas das EFs):
//   WHATSAPP_PHONE_NUMBER_ID       o número do tutor (já existia).
//   WHATSAPP_B2B_PHONE_NUMBER_ID   QUAL é o número do estabelecimento. Sem valor
//                                  padrão: ausente, tudo se comporta como antes.
//   WHATSAPP_B2B_ENVIO_LIGADO      o interruptor do envio INICIADO pela Latta.
//
// A identidade não depende do interruptor, e a RESPOSTA a quem escreveu sai
// pelo número em que a conversa aconteceu.

export const PHONE_NUMBER_ID_DO_TUTOR = '587778224419344';

const interruptorLigado = (raw) => {
  const v = String(raw ?? '').trim().toLowerCase();
  return v === 'on' || v === 'true';
};

/** A única função que lê env. `env` injetável nos testes. */
export const lerNumerosDaLatta = (env = process.env) => {
  const tutor = String(env.WHATSAPP_PHONE_NUMBER_ID ?? '').trim() || PHONE_NUMBER_ID_DO_TUTOR;
  const b2b = String(env.WHATSAPP_B2B_PHONE_NUMBER_ID ?? '').trim();
  return {
    tutor,
    estabelecimento: b2b && b2b !== tutor ? b2b : null,
    envioDoEstabelecimentoLigado: interruptorLigado(env.WHATSAPP_B2B_ENVIO_LIGADO),
  };
};

/** 'tutor' | 'estabelecimento' | 'desconhecido'. Não depende do interruptor. */
export const publicoDoNumero = (phoneNumberId, n) => {
  const id = String(phoneNumberId ?? '').trim();
  if (!id) return 'desconhecido';
  if (n.estabelecimento && id === n.estabelecimento) return 'estabelecimento';
  if (id === n.tutor) return 'tutor';
  return 'desconhecido';
};

/** O número do envio INICIADO pela Latta (campanha, aviso). */
export const numeroQueEnvia = (publico, n) => {
  if (publico === 'estabelecimento' && n.envioDoEstabelecimentoLigado && n.estabelecimento) {
    return n.estabelecimento;
  }
  return n.tutor;
};

/** O número da RESPOSTA a quem escreveu: o da conversa. Ausente ou estranho lê como o do tutor. */
export const numeroDaResposta = (numeroQueRecebeu, n) =>
  publicoDoNumero(numeroQueRecebeu, n) === 'estabelecimento' ? n.estabelecimento : n.tutor;

/**
 * O número da conversa, como o histórico o guarda: `business_phone_number_id`
 * NULL é o número do tutor (as linhas anteriores ao segundo número), e
 * qualquer id que não é o do estabelecimento também, que é como
 * `numeroDaResposta` o lê.
 */
export const numeroDaConversa = (businessPhoneNumberId, n) => numeroDaResposta(businessPhoneNumberId, n);

export default {
  PHONE_NUMBER_ID_DO_TUTOR,
  lerNumerosDaLatta,
  publicoDoNumero,
  numeroQueEnvia,
  numeroDaResposta,
  numeroDaConversa,
};
