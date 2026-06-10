// Worker do fluxo Petz OTP quick-access (caminho B). Espelha login-petz-runner.js:
// start (access + send) -> awaiting_code -> submit_code (verify) -> success/erro.
// A sessão Browserbase fica viva entre o send e o verify (tutor manda o código no chat).

import { startPetzOtp, verifyPetzOtp, closePetzOtp } from '../services/petz-otp.service.js';

const data = JSON.parse(process.argv[2] || '{}');

let active = null; // { stagehand, page }

(async () => {
  try {
    const result = await startPetzOtp({ cpf: data.cpf, channel: data.channel });
    active = { stagehand: result.stagehand, page: result.page };

    process.send({
      status: 'awaiting_code',
      sessionId: data.sessionId,
      exists: result.exists,
      maskedPhone: result.maskedPhone,
      hasWppRetry: result.hasWppRetry,
      sendStatus: result.sendStatus,
    });

    process.on('message', async (msg) => {
      if (msg?.action === 'submit_code') {
        try {
          const res = await verifyPetzOtp({ page: active.page, cpf: data.cpf, code: msg.code });
          process.send(res.success
            ? {
                status: 'success',
                accessToken: res.accessToken,
                refreshToken: res.refreshToken,
                expiresIn: res.expiresIn,
                petzClientId: res.petzClientId,
                deviceId: res.deviceId,
              }
            : { status: 'invalid_code', httpStatus: res.status });
        } catch (err) {
          process.send({ status: 'error', message: err.message });
        } finally {
          await closePetzOtp(active.stagehand);
          process.exit(0);
        }
      }
    });

    // segurança: encerra a sessão se o código não vier (igual ao login runner)
    setTimeout(async () => {
      await closePetzOtp(active?.stagehand);
      process.exit(1);
    }, 5 * 60 * 1000);
  } catch (err) {
    process.send({ status: 'error', message: err.message });
    process.exit(1);
  }
})();
