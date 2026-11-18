# SashaFit — образ для будь-якого сервера (VPS, Coolify, Railway тощо).
# Збірка:  docker build -t sashafit \
#            --build-arg NEXT_PUBLIC_SUPABASE_URL=... \
#            --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=... .
# Запуск:  docker run -p 3000:3000 --env-file .env sashafit
# Секретні ключі (SUPABASE_SERVICE_ROLE_KEY, TELEGRAM_BOT_TOKEN тощо)
# передаються лише під час запуску (--env-file), у образ вони не потрапляють.

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Публічні змінні Next вшиває в код під час збірки, тому їх треба передати сюди.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_VAPID_PUBLIC_KEY=$NEXT_PUBLIC_VAPID_PUBLIC_KEY \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
COPY --from=builder /app/public ./public
COPY --from=builder --chown=app:app /app/.next/standalone ./
COPY --from=builder --chown=app:app /app/.next/static ./.next/static
USER app
EXPOSE 3000
CMD ["node", "server.js"]
