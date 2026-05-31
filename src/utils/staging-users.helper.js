// ADR-0007 Fatia 7: cache in-memory da whitelist staging_users.
//
// Por que cache:
//   getStagingPhones() roda em CADA request de mensageria (listing, search,
//   counts). Sem cache, cada request faz 1 SELECT extra na tabela
//   staging_users. Cache 30s reduz pra ~1 query/30s sem perder responsividade
//   pra mudancas na whitelist (operador adiciona phone, ve resultado em <30s).
//
// Por que NAO Redis:
//   Esta lista e pequena (poucas dezenas de phones), muda raramente, e o
//   custo de coordenar invalidacao via Redis nao vale a pena pra escala
//   atual do admin web. Re-avaliar se o backend escalar pra multiplas
//   instancias EC2 (hoje e 1 so).
//
// Fallback de erro:
//   Se a query falhar, retorna o cache stale ou [] como ultimo recurso.
//   Pra admin prod, [] preserva comportamento atual (sem filtro). Pra admin
//   homolog, [] retorna lista vazia temporariamente — recupera no proximo
//   request bem-sucedido.

import { Sequelize } from 'sequelize';
import { sequelize } from '../config/database.js';

const CACHE_TTL_MS = 30 * 1000;

let cachedPhones = null;
let cacheExpiresAt = 0;

export async function getStagingPhones() {
  if (cachedPhones !== null && Date.now() < cacheExpiresAt) {
    return cachedPhones;
  }
  try {
    const rows = await sequelize.query('SELECT phone FROM staging_users', {
      type: Sequelize.QueryTypes.SELECT,
    });
    cachedPhones = rows.map((r) => r.phone);
    cacheExpiresAt = Date.now() + CACHE_TTL_MS;
    return cachedPhones;
  } catch (err) {
    console.error('[staging-users] getStagingPhones query failed:', err.message);
    return cachedPhones ?? [];
  }
}

export function invalidateStagingPhonesCache() {
  cacheExpiresAt = 0;
  cachedPhones = null;
}

// Helper pra usar em endpoints de DETAIL (getContactByContactId, etc).
// Retorna true se o phone esta na whitelist staging.
export async function isStagingPhone(phone) {
  if (!phone) return false;
  const list = await getStagingPhones();
  return list.includes(phone);
}

// Retorna 'in' (mostra so staging) quando env=homolog, null (sem filtro)
// quando env=prod. Centralizar aqui evita branching duplicado nos
// repositories e mantem o contrato consistente.
export function buildEnvironmentFilter(environment) {
  if (environment === 'homolog') return { op: 'in' };
  return null;
}
