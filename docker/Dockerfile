# Image de production du CRM Big M — build multi-étapes, sortie standalone.
# Aucun téléchargement hors npm : fonctionne derrière un proxy d'entreprise.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    TZ=Europe/Paris \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup -S app && adduser -S app -G app \
  && apk add --no-cache wget postgresql16-client

# Serveur Next standalone (node_modules tracés inclus)
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Migrations Drizzle appliquées au démarrage (scripts/db.mjs migrate) :
# le dossier drizzle/ + drizzle-orm + pg sont nécessaires au runtime.
# pg et @node-rs/argon2 sont tracés dans le standalone, mais drizzle-orm est
# bundlé dans le build Next (absent de node_modules) : on le copie depuis
# l'étape deps (aucune dépendance transitive — vérifié, deps: {}).
COPY --from=deps /app/node_modules/drizzle-orm ./node_modules/drizzle-orm
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/scripts/db.mjs ./scripts/db.mjs
COPY --from=builder /app/scripts/create-admin.mjs ./scripts/create-admin.mjs
COPY docker/entrypoint.sh ./entrypoint.sh

RUN chmod +x entrypoint.sh \
  && mkdir -p /data/uploads /data/backups \
  && chown -R app:app /data /app

USER app
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

ENTRYPOINT ["./entrypoint.sh"]
