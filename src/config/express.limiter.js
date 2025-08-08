import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 1000,
  max: 7,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests',
    message: 'Máximo 7 requisições por segundo. Aguarde um momento.',
    retryAfter: '1 second',
  },
});

export default limiter;
