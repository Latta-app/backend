import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests',
    message: 'Máximo 5 requisições por segundo. Aguarde um momento.',
    retryAfter: '1 second',
  },
});

export default limiter;
