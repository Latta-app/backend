import { processSmsCode, runLoginFlow } from '../services/web-scrapping.service.js';

const data = JSON.parse(process.argv[2] || '{}');

let activeSession = null;

(async () => {
  try {
    const result = await runLoginFlow(data);

    if (result.status === 'success') {
      process.send({ status: 'success', cookies: result.cookies });
      await result.close();
      process.exit(0);
    }

    if (result.status === 'awaiting_sms') {
      activeSession = result;

      process.send({
        status: 'awaiting_sms',
        sessionId: data.sessionId,
      });
    }

    process.on('message', async (msg) => {
      if (msg?.action === 'submit_sms') {
        try {
          const res = await processSmsCode({
            page: activeSession.page,
            code: msg.code,
          });

          process.send({ status: 'success', cookies: res.cookies });
          await activeSession.stagehand.close();
          process.exit(0);
        } catch (err) {
          process.send({ status: 'error', message: err.message });
          process.exit(1);
        }
      }
    });

    // segurança
    setTimeout(async () => {
      if (activeSession?.stagehand) await activeSession.stagehand.close();
      process.exit(1);
    }, 5 * 60 * 1000);
  } catch (err) {
    process.send({ status: 'error', message: err.message });
    process.exit(1);
  }
})();
