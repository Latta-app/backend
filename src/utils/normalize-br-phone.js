// Normaliza phone BR pro formato canonico de 13 digitos: 55 + DDD(2) + 9 + 8 digitos.
//
// Casos de entrada que precisamos cobrir (Bug 2 de 2026-05-19):
//   - "5531999155797"   (13 digitos, canonico)            -> "5531999155797"
//   - "31999155797"     (11 digitos, DDD+9+8, sem DDI)    -> "5531999155797"
//   - "553199915797"    (12 digitos, DDI+DDD+8, sem 9)    -> "5531999155797"
//   - "3199915797"      (10 digitos, DDD+8, sem DDI+9)    -> "5531999155797"
//   - "+55 31 99915-5797" (mascarado)                     -> "5531999155797"
//
// Casos fora do escopo (devolve digits-only sem transformar):
//   - tudo que nao se enquadra (numeros internacionais, lixo, vazio)
//
// Inspirado em normalizeBrPhone do EF chat-history-logger mas mais completo
// pq aqui recebemos input do usuario via formulario (mais variabilidade).

export function normalizeBrPhone(raw) {
  const digits = String(raw || '').replace(/\D+/g, '');
  if (!digits) return '';

  // 13 digitos com 55: ja canonico
  if (digits.length === 13 && digits.startsWith('55')) {
    return digits;
  }

  // 12 digitos com 55: falta o "9" entre DDD e numero (celular antigo)
  if (digits.length === 12 && digits.startsWith('55')) {
    return digits.slice(0, 4) + '9' + digits.slice(4);
  }

  // 11 digitos: DDD + 9 + 8 digitos, falta DDI 55
  if (digits.length === 11) {
    return '55' + digits;
  }

  // 10 digitos: DDD + 8 digitos, falta DDI 55 e o "9"
  if (digits.length === 10) {
    return '55' + digits.slice(0, 2) + '9' + digits.slice(2);
  }

  // Outros tamanhos: retorna digits-only sem transformar.
  return digits;
}

export default normalizeBrPhone;
