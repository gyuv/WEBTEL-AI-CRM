#!/usr/bin/env sh
# Vercel build. Only production deploys migrate and seed the database: preview builds
# share the production DATABASE_URL, and concurrent `migrate deploy` runs time out on
# Prisma's advisory lock (P1002).
set -e
npx prisma generate
if [ "$VERCEL_ENV" = "production" ]; then
  npx prisma migrate deploy
  npx tsx prisma/seed.ts --reference-only
else
  echo "VERCEL_ENV=${VERCEL_ENV:-unset}: skipping migrations and seed"
fi
npx next build
