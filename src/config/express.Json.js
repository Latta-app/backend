const jsonConfig = {
  limit: '50mb',
  verify: (req, _res, buf, encoding) => {
    const hasTypeformHeaders =
      req.headers['user-agent'] === 'Typeform Webhooks' && req.headers['typeform-signature'];
    const hasBuffer = buf && buf.length;

    if (hasTypeformHeaders && hasBuffer) {
      req.rawBody = buf.toString(encoding || 'utf-8');
    }
  },
};

export default jsonConfig;
