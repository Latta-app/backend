# Claude Code — Latta Backend

API da plataforma: `https://api.latta.app.br`

## Stack
- **Runtime**: Node.js (ES Modules)
- **Framework**: Express.js 4 + HTTP nativo
- **ORM**: Sequelize 6 (PostgreSQL com SSL)
- **Auth**: JWT (jsonwebtoken)
- **WebSocket**: Socket.io
- **Security**: Helmet, CORS, express-rate-limit
- **Validação**: Joi
- **Dev**: Nodemon + Sucrase (transpiler)

## Estrutura
```
src/
├── app.js                  # Entry point (dotenv, Express setup, porta 8000)
├── api/
│   ├── controllers/        # Request handlers
│   ├── routes/
│   │   ├── privateRoutes.js  # Router principal (18 módulos)
│   │   └── socket/           # WebSocket routes
│   ├── services/           # Business logic (auth, pet, order, n8n, web-scrapping)
│   ├── models/             # Sequelize models (14 tabelas)
│   ├── repositories/       # Data access layer
│   ├── validators/         # Joi schemas
│   ├── middlewares/        # Auth, error handling
│   └── workers/            # Async job handlers
├── config/
│   ├── database.js         # Sequelize (DATABASE_URL)
│   ├── cors.js             # CORS whitelist (ACCESS_LIST)
│   ├── socket.js           # Socket.io setup
│   └── firebase.js         # Firebase (comentado)
├── constants/              # App constants
└── utils/                  # Helpers (S3, JWT, validation)
```

## Models (14 tabelas)
Pets, PetBreed, PetColor, PetOwner, PetOwnerClinic, Users, Chat, Templates, Orders, Payments, Protocols, Scheduling, Services, Plans

## Comandos
- `npm start` — Produção (`node src/app.js`)
- `npm run dev` — Dev com hot reload + debugger (nodemon + sucrase)
- `npm run eslint:check` / `npm run eslint:fix` — Linting
- `npm run prettier:format` — Formatação

## Env Vars (ver .env.example)
**Críticas**: `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `ACCESS_LIST`
**AWS**: `AWS_BUCKET_ACCESS_KEY_ID`, `AWS_BUCKET_SECRET_ACCESS_KEY`
**WhatsApp**: `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PRIVATE_KEY`
**AI**: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`

## Deploy
- **EC2**: `54.207.77.45` (t2.micro, sa-east-1) — IP pode mudar em stop/start, conferir via `aws ec2 describe-instances` se falhar
- **Auto-deploy**: GitHub Actions `.github/workflows/deploy.yml` dispara em push pra `main`. SSH com `ubuntu@$HOST` + `git pull` + `npm install` + `pm2 restart all`. Requer secret `EC2_SSH_KEY` configurado no repo (Settings → Secrets and variables → Actions).
- **Fallback manual** (quando Actions falha por secret ausente/expirado): SSH com a key local em `~/.ssh/latta-ec2`:
  ```bash
  ssh -i ~/.ssh/latta-ec2 ubuntu@54.207.77.45 \
    "export PATH=/home/ubuntu/.nvm/versions/node/v20.19.0/bin:\$PATH && \
     cd ~/backend && git pull origin main && npm install --production=false && \
     pm2 restart all && sleep 5 && curl -sf http://localhost:8000/"
  ```
- **Acesso de emergência**: AWS CloudShell + ec2-instance-connect

## Database
- PostgreSQL via Supabase pooler (porta 6543)
- SSL habilitado (rejectUnauthorized: false)
- Schema snapshot em `schema.sql`
- Migrations NÃO estão no repo

## Regras
- NUNCA push direto na main — sempre branch + PR
- Commits: `feat(backend): ...`, `fix(backend): ...`
- Health check: `GET /` retorna status
- Graceful shutdown: SIGTERM/SIGINT handlers
