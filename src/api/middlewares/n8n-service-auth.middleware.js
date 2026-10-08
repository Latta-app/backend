// n8n-service-auth.middleware.js
// Porta das rotas /n8n (decrypt/encrypt de Flow e de mídia). Antes não tinha
// credencial nenhuma: qualquer um decifrava envelope de Flow e levava a chave
// AES na resposta. O n8n manda o segredo compartilhado no header x-n8n-secret.
//
// N8N_ROUTE_AUTH controla o modo, pra medir antes de recusar:
//   log     (padrão) deixa passar e loga quem veio sem credencial válida
//   enforce recusa com 401
//   off     não olha
// Só vira `enforce` depois que os workflows do n8n estiverem mandando o header.

import crypto from 'node:crypto';

const iguais = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

export const requireN8nServiceSecret = (req, res, next) => {
  const modo = (process.env.N8N_ROUTE_AUTH || 'log').toLowerCase();
  if (modo === 'off') return next();

  const esperado = process.env.N8N_SERVICE_SECRET || '';
  const recebido = req.get('x-n8n-secret') || '';
  const valido = esperado !== '' && recebido !== '' && iguais(recebido, esperado);
  if (valido) return next();

  const motivo = !esperado ? 'secret_nao_configurado' : !recebido ? 'sem_header' : 'header_errado';
  if (modo === 'enforce') {
    console.warn(`[n8n-auth] recusado ${req.method} ${req.originalUrl} (${motivo}) ip=${req.ip}`);
    return res.status(401).json({ error: 'Não autorizado' });
  }

  console.warn(`[n8n-auth] SEM CREDENCIAL ${req.method} ${req.originalUrl} (${motivo}) ip=${req.ip}`);
  return next();
};
