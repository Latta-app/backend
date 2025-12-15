import path from 'path';
import { fork } from 'child_process';
import crypto from 'crypto';

const activeSessions = new Map();

let pendingSmsCode = null;
let pendingSmsTs = 0;
const PENDING_SMS_TTL_MS = 2 * 60 * 1000;

const clearPendingIfExpired = () => {
  if (!pendingSmsCode) return;
  if (Date.now() - pendingSmsTs > PENDING_SMS_TTL_MS) {
    pendingSmsCode = null;
    pendingSmsTs = 0;
  }
};

const formatDuration = (ms) => {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (n) => String(n).padStart(2, '0');

  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
};

const loginPetz = async (req, res) => {
  const t0 = Date.now(); // ⏱️ início da requisição
  const getDurationMs = () => Date.now() - t0;
  console.log('🔐 [LOGIN] Iniciando login Petz');

  const loginData = req.body;

  if (!loginData?.email || !loginData?.password) {
    return res.status(400).json({
      code: 'INVALID_DATA',
      message: 'Email e senha são obrigatórios',
      duration: formatDuration(getDurationMs()),
      duration_ms: getDurationMs(),
    });
  }

  try {
    const sessionId = crypto
      .createHash('md5')
      .update(loginData.email)
      .digest('hex');

    const workerPath = path.resolve('src/api/workers/login-petz-runner.js');

    const child = fork(workerPath, [JSON.stringify({ ...loginData, sessionId })], {
      silent: true,
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      execArgv: [],
    });

    child.stdout.on('data', (d) => process.stdout.write(`[worker] ${d}`));
    child.stderr.on('data', (d) => process.stderr.write(`[worker-err] ${d}`));

    const loginPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        activeSessions.delete(sessionId);
        clearPendingIfExpired();
        try {
          child.kill('SIGKILL');
        } catch {}
        reject(new Error('TIMEOUT'));
      }, 5 * 60 * 1000);

      child.on('message', (msg) => {
        if (msg?.status === 'awaiting_sms') {
          console.log(`📱 [LOGIN] Aguardando SMS - Sessão ${sessionId}`);

          activeSessions.set(sessionId, {
            worker: child,
            timestamp: Date.now(),
            resolver: resolve,
            timeout,
          });

          clearPendingIfExpired();
          if (pendingSmsCode) {
            const code = pendingSmsCode;
            pendingSmsCode = null;
            pendingSmsTs = 0;

            console.log(
              `📱 [LOGIN] Consumindo SMS pendente e enviando para sessão ${sessionId}: ${code}`,
            );
            child.send({ action: 'submit_sms', code });
          }
          return;
        }

        if (msg?.status === 'success') {
          console.log('✅ [LOGIN] Concluído - Cookies recebidos');
          clearTimeout(timeout);
          activeSessions.delete(sessionId);
          pendingSmsCode = null;
          pendingSmsTs = 0;
          resolve({ cookies: msg.cookies });
          return;
        }

        if (msg?.status === 'error') {
          console.error('❌ [LOGIN] Erro:', msg.message);
          clearTimeout(timeout);
          activeSessions.delete(sessionId);
          pendingSmsCode = null;
          pendingSmsTs = 0;
          reject(new Error(msg.message));
        }
      });

      child.on('exit', (code) => {
        if (code !== 0) {
          clearTimeout(timeout);
          activeSessions.delete(sessionId);
          reject(new Error(`Worker encerrou com código ${code}`));
        }
      });
    });

    const result = await loginPromise;

    if (!result.cookies) {
      return res.status(500).json({
        code: 'NO_COOKIES',
        message: 'Cookies não foram obtidos',
        duration: formatDuration(getDurationMs()),
        duration_ms: getDurationMs(), // ⏱️ fim (sucesso)
      });
    }

    res.status(200).json({
      success: true,
      cookies: result.cookies,
      duration: formatDuration(getDurationMs()),
      duration_ms: getDurationMs(), // ⏱️ fim (sucesso)
    });

    // fecha worker após resposta
    try {
      child.send('close');
    } catch {}
  } catch (err) {
    console.error('❌ [LOGIN] Erro:', err.message);

    if (err.message === 'TIMEOUT') {
      return res.status(504).json({
        code: 'TIMEOUT',
        message: 'Login não foi completado dentro do tempo limite (5 minutos)',
        duration: formatDuration(getDurationMs()),
        duration_ms: getDurationMs(), // ⏱️ fim (sucesso)
      });
    }

    return res.status(500).json({
      code: 'LOGIN_ERROR',
      message: 'Erro ao executar login',
      error: err.message,

      duration: formatDuration(getDurationMs()),
      duration_ms: getDurationMs(),
    });
  }
};

const submitSmsCode = async (req, res) => {
  const { message } = req.body;

  if (!message) {
    return res.status(400).json({
      code: 'INVALID_DATA',
      message: 'message é obrigatório (mensagem completa do SMS)',
    });
  }

  const codeMatch = message.match(/\b(\d{6})\b/);
  if (!codeMatch) {
    return res.status(400).json({
      code: 'INVALID_SMS_FORMAT',
      message: 'Não foi possível extrair código de 6 dígitos da mensagem SMS',
    });
  }

  const code = codeMatch[1];
  console.log(`📱 [SMS] Código recebido: ${code}`);

  clearPendingIfExpired();

  let sessions = Array.from(activeSessions.entries());
  let attempts = 0;
  const maxAttempts = 20; // 10s

  while (sessions.length === 0 && attempts < maxAttempts) {
    attempts += 1;
    await new Promise((r) => setTimeout(r, 500));
    sessions = Array.from(activeSessions.entries());
  }

  if (sessions.length === 0) {
    pendingSmsCode = code;
    pendingSmsTs = Date.now();

    console.warn('⚠️ [SMS] Sessão ainda não registrada. Código guardado (pendente).');
    return res.status(202).json({
      success: true,
      status: 'queued',
      message: 'SMS chegou antes da sessão ficar pronta; código armazenado temporariamente',
    });
  }

  const [sessionId, session] = sessions[0];

  try {
    session.worker.send({ action: 'submit_sms', code });
    console.log(`✅ [SMS] Código enviado para sessão ${sessionId}`);

    return res.status(200).json({
      success: true,
      status: 'sent',
      sessionId,
    });
  } catch (err) {
    console.error('❌ [SMS] Erro:', err.message);
    return res.status(500).json({
      code: 'SMS_SEND_ERROR',
      message: 'Erro ao enviar código SMS',
      error: err.message,
    });
  }
};

const loginCobasi = async (req, res) => {
  const t0 = Date.now();
  const getDurationMs = () => Date.now() - t0;
  console.log('🔐 [LOGIN:COBASI] Iniciando login Cobasi');

  const loginData = req.body;

  if (!loginData?.email || !loginData?.password) {
    return res.status(400).json({
      code: 'INVALID_DATA',
      message: 'Email e senha são obrigatórios',
      duration: formatDuration(getDurationMs()),
      duration_ms: getDurationMs(),
    });
  }

  try {
    const sessionId = crypto
      .createHash('md5')
      .update(loginData.email)
      .digest('hex');

    const workerPath = path.resolve('src/api/workers/login-cobasi-runner.js');

    const child = fork(workerPath, [JSON.stringify({ ...loginData, sessionId })], {
      silent: true,
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      execArgv: [],
    });

    child.stdout.on('data', (d) => process.stdout.write(`[worker:cobasi] ${d}`));
    child.stderr.on('data', (d) => process.stderr.write(`[worker:cobasi-err] ${d}`));

    const loginPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch {}
        reject(new Error('TIMEOUT'));
      }, 2 * 60 * 1000); // 2 minutos

      child.on('message', (msg) => {
        if (msg?.status === 'success') {
          console.log('✅ [LOGIN:COBASI] Concluído - Cookies recebidos');
          clearTimeout(timeout);
          resolve({ cookies: msg.cookies });
          return;
        }

        if (msg?.status === 'error') {
          console.error('❌ [LOGIN:COBASI] Erro:', msg.message);
          clearTimeout(timeout);
          reject(new Error(msg.message));
        }
      });

      child.on('exit', (code) => {
        if (code !== 0) {
          clearTimeout(timeout);
          reject(new Error(`Worker encerrou com código ${code}`));
        }
      });
    });

    const result = await loginPromise;

    if (!result.cookies) {
      return res.status(500).json({
        code: 'NO_COOKIES',
        message: 'Cookies não foram obtidos',
        duration: formatDuration(getDurationMs()),
        duration_ms: getDurationMs(),
      });
    }

    res.status(200).json({
      success: true,
      cookies: result.cookies,
      duration: formatDuration(getDurationMs()),
      duration_ms: getDurationMs(),
    });

    // fecha worker após resposta
    try {
      child.send('close');
    } catch {}
  } catch (err) {
    console.error('❌ [LOGIN:COBASI] Erro:', err.message);

    if (err.message === 'TIMEOUT') {
      return res.status(504).json({
        code: 'TIMEOUT',
        message: 'Login não foi completado dentro do tempo limite (2 minutos)',
        duration: formatDuration(getDurationMs()),
        duration_ms: getDurationMs(),
      });
    }

    return res.status(500).json({
      code: 'LOGIN_ERROR',
      message: 'Erro ao executar login',
      error: err.message,
      duration: formatDuration(getDurationMs()),
      duration_ms: getDurationMs(),
    });
  }
};

export default { loginPetz, submitSmsCode, loginCobasi };
