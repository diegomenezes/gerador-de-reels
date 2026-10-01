# Gerador de Reels a partir do WhatsApp

Painel web (desktop + mobile) que lê mensagens dos grupos via **Evolution API**, agrupa dúvidas com **OpenAI** e gera roteiros de Reels ~90s no seu tom de voz.

## Fluxo do dia a dia

1. Cron (ou **Rodar agora**) busca as últimas 24h dos grupos ativos
2. Filtro local + IA gera as perguntas do dia
3. Em **Perguntas** → gere roteiro / ganchos / legenda → grave → marque **Gravado**

## Stack

- Next.js (App Router) + Tailwind
- Prisma + SQLite
- Evolution API + OpenAI (`gpt-4o-mini`)

## Setup local

```bash
npm install
cp .env.example .env
# edite .env
npx prisma migrate dev
npm run dev
```

Acesse `http://localhost:3000` com `APP_PASSWORD`.

## Variáveis de ambiente

| Variável | Descrição |
|---|---|
| `APP_PASSWORD` | Senha do painel |
| `CRON_SECRET` | Segredo do `/api/cron` |
| `PORT` | Porta (VPS default no PM2: `3010`) |
| `DATABASE_URL` | SQLite (`file:./dev.db` local; `file:../data/prod.db` na VPS) |
| `OPENAI_API_KEY` | Chave OpenAI |
| `OPENAI_MODEL` | Clustering/pesquisa/legendas — default `gpt-4o-mini` |
| `OPENAI_MODEL_QUALITY` | Roteiros e ganchos — default `gpt-4.1` |
| `EVOLUTION_BASE_URL` | URL Evolution |
| `EVOLUTION_API_KEY` | API key Evolution |
| `EVOLUTION_INSTANCE` | Nome da instância |

Arquivos editáveis pelo painel (precisam ser graváveis na VPS):

- `tomdevoz.md`
- `modelosganchos.md`

## Deploy na VPS (PM2)

Recomendado no mesmo servidor da Evolution (ex.: `LeilaoMagico`).

```bash
# 1) clone/copie o projeto
cd /opt/gerador-reels   # ou o path que preferir

# 2) Node 20+ LTS
node -v

# 3) env
cp .env.example .env
nano .env
# APP_PASSWORD, CRON_SECRET, OPENAI_*, EVOLUTION_*
# DATABASE_URL="file:../data/prod.db"

# 4) deploy
chmod +x scripts/deploy.sh
./scripts/deploy.sh
```

O script faz: `npm ci` → `prisma migrate deploy` → `build` → `pm2 start/reload`.

App sobe na **porta 3010** (não conflita com outros serviços). Proxy reverso (Traefik/Nginx) pode apontar um domínio para `127.0.0.1:3010`.

### PM2 manual

```bash
npm ci
mkdir -p data
npx prisma migrate deploy
npm run build
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

### Cron diário (06:00)

```bash
crontab -e
```

```cron
0 6 * * * curl -s -X POST -H "Authorization: Bearer SEU_CRON_SECRET" http://127.0.0.1:3010/api/cron >/dev/null 2>&1
```

### Checklist pós-deploy

- [ ] Login no painel com `APP_PASSWORD`
- [ ] **Config → Testar Evolution**
- [ ] Grupos ativos cadastrados
- [ ] `tomdevoz.md` e `modelosganchos.md` preenchidos
- [ ] Cron testado: `curl -X POST -H "Authorization: Bearer ..." http://127.0.0.1:3010/api/cron`
- [ ] Pasta `data/` persistente e com backup

## Custo OpenAI (ordem de grandeza)

Com `gpt-4o-mini`, uso típico fica bem abaixo de US$ 5/mês.

## Scripts npm

```bash
npm run dev
npm run build
npm run start
npm run db:deploy
npm run db:studio
```

## Fora do escopo (v1)

- Responder no WhatsApp automaticamente
- Análise de áudio/imagem
- Publicação automática no Instagram
