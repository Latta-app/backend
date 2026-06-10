// Controller do fluxo Petz OTP quick-access (caminho B). A sessão Browserbase
// fica viva no worker entre `start` (access+send) e `verify` (submit do código),
// guardada em `otpSessions` por sessionId. Espelha o padrão de web-scarpping.controller.

import path from 'path';
import { fork } from 'child_process';
import crypto from 'crypto';

const otpSessions = new Map(); // sessionId -> { worker, createdAt }
const SESSION_TTL_MS = 5 * 60 * 1000;

const sidFor = (cpf) => crypto.createHash('md5').update(String(cpf)).digest('hex');

function reapExpired() {
  const now = Date.now();
  for (const [sid, s] of otpSessions.entries()) {
    if (now - s.createdAt > SESSION_TTL_MS) {
      try { s.worker.kill('SIGKILL'); } catch { /* ok */ }
      otpSessions.delete(sid);
    }
  }
}

// POST /web-scrapping/petz/otp/start  { cpf, channel?: 'SMS'|'WPP' }
// -> { success, sessionId, exists, maskedPhone, hasWppRetry, sendStatus }
const petzOtpStart = async (req, res) => {
  reapExpired();
  const { cpf, channel = 'SMS' } = req.body || {};
  if (!cpf) return res.status(400).json({ code: 'INVALID_DATA', message: 'cpf é obrigatório' });

  const sessionId = sidFor(cpf);
  // se já existe sessão viva pra esse cpf, encerra antes de abrir nova
  const prev = otpSessions.get(sessionId);
  if (prev) { try { prev.worker.kill('SIGKILL'); } catch { /* ok */ } otpSessions.delete(sessionId); }

  const workerPath = path.resolve('src/api/workers/petz-otp-runner.js');
  const child = fork(workerPath, [JSON.stringify({ cpf, channel, sessionId })], {
    silent: true, stdio: ['pipe', 'pipe', 'pipe', 'ipc'], execArgv: [],
  });
  child.stdout.on('data', (d) => process.stdout.write(`[otp-worker] ${d}`));
  child.stderr.on('data', (d) => process.stderr.write(`[otp-worker-err] ${d}`));

  try {
    const startResult = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* ok */ } reject(new Error('TIMEOUT')); }, 90 * 1000);
      child.once('message', (msg) => {
        clearTimeout(timeout);
        if (msg?.status === 'awaiting_code') resolve(msg);
        else reject(new Error(msg?.message || 'falha no start'));
      });
      child.on('exit', (code) => { if (code !== 0) reject(new Error(`worker saiu (${code})`)); });
    });

    otpSessions.set(sessionId, { worker: child, createdAt: Date.now() });
    return res.status(200).json({
      success: true,
      sessionId,
      exists: startResult.exists,
      maskedPhone: startResult.maskedPhone,
      hasWppRetry: startResult.hasWppRetry,
      sendStatus: startResult.sendStatus,
    });
  } catch (err) {
    try { child.kill('SIGKILL'); } catch { /* ok */ }
    const code = err.message === 'TIMEOUT' ? 504 : 500;
    return res.status(code).json({ code: 'OTP_START_ERROR', message: err.message });
  }
};

// POST /web-scrapping/petz/otp/verify  { sessionId | cpf, code }
// -> { success, cookies } | { success:false, code:'INVALID_CODE' }
const petzOtpVerify = async (req, res) => {
  reapExpired();
  const { code } = req.body || {};
  const sessionId = req.body?.sessionId || (req.body?.cpf ? sidFor(req.body.cpf) : null);
  if (!sessionId || !code) return res.status(400).json({ code: 'INVALID_DATA', message: 'sessionId (ou cpf) e code são obrigatórios' });

  const session = otpSessions.get(sessionId);
  if (!session) return res.status(410).json({ code: 'SESSION_EXPIRED', message: 'sessão OTP expirou — reenvie o código' });

  try {
    const result = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('VERIFY_TIMEOUT')), 60 * 1000);
      session.worker.once('message', (msg) => { clearTimeout(timeout); resolve(msg); });
      session.worker.on('exit', (c) => { if (c !== 0) reject(new Error(`worker saiu (${c})`)); });
      session.worker.send({ action: 'submit_code', code });
    });

    otpSessions.delete(sessionId); // worker se encerra após o verify
    if (result?.status === 'success') {
      return res.status(200).json({
        success: true,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresIn: result.expiresIn,
        petzClientId: result.petzClientId,
        deviceId: result.deviceId,
      });
    }
    if (result?.status === 'invalid_code') return res.status(401).json({ success: false, code: 'INVALID_CODE', message: 'código inválido ou expirado' });
    return res.status(500).json({ success: false, code: 'OTP_VERIFY_ERROR', message: result?.message || 'falha no verify' });
  } catch (err) {
    otpSessions.delete(sessionId);
    return res.status(500).json({ success: false, code: 'OTP_VERIFY_ERROR', message: err.message });
  }
};

export default { petzOtpStart, petzOtpVerify };
