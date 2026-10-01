#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_DIR"

echo "==> Instalando dependências"
npm ci

echo "==> Pasta de dados (SQLite)"
mkdir -p data
chmod 755 data

if [ ! -f .env ]; then
  echo "ERRO: crie o arquivo .env a partir de .env.example"
  exit 1
fi

echo "==> Migrando banco"
npx prisma migrate deploy

echo "==> Build"
npm run build

echo "==> PM2"
if command -v pm2 >/dev/null 2>&1; then
  if pm2 describe gerador-reels >/dev/null 2>&1; then
    pm2 reload ecosystem.config.cjs --update-env
  else
    pm2 start ecosystem.config.cjs
  fi
  pm2 save
  echo "OK: app no PM2 (porta 3010 por padrão)"
else
  echo "PM2 não encontrado. Suba com: npm run start"
fi

echo "==> Lembrete de cron (06:00):"
echo '0 6 * * * curl -s -X POST -H "Authorization: Bearer $CRON_SECRET" http://127.0.0.1:3010/api/cron >/dev/null 2>&1'
