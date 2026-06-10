// Controller do lookup do número mascarado Petz (diligência "final XXXX").
// Chamada única e stateless (não mantém sessão viva como o antigo OTP worker).
// Latência ~15-17s (Browserbase + /access in-browser) — por isso é chamado em
// BACKGROUND pela onboarding-service EF, nunca no caminho síncrono do Flow.

import { lookupMaskedPhone } from '../services/petz-access.service.js';

// POST /web-scrapping/petz/access  { cpf }
// -> { success, exists, maskedPhone, hasWppRetry }
const petzAccessLookup = async (req, res) => {
  const { cpf } = req.body || {};
  if (!cpf) return res.status(400).json({ code: 'INVALID_DATA', message: 'cpf é obrigatório' });

  const cleanCpf = String(cpf).replace(/\D/g, '');
  if (cleanCpf.length !== 11) return res.status(400).json({ code: 'INVALID_DATA', message: 'cpf inválido' });

  try {
    const result = await Promise.race([
      lookupMaskedPhone({ cpf: cleanCpf }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 60 * 1000)),
    ]);
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    const code = err.message === 'TIMEOUT' ? 504 : 500;
    return res.status(code).json({ success: false, code: 'ACCESS_LOOKUP_ERROR', message: err.message });
  }
};

export default { petzAccessLookup };
