FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci --ignore-scripts
COPY . .
RUN ./node_modules/.bin/nuxt prepare
RUN ./node_modules/.bin/prisma generate
RUN npm run build

FROM build AS operations
RUN apk add --no-cache postgresql-client
ENV NODE_ENV=production
CMD ["node", "--import", "tsx", "scripts/release.ts"]

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production NITRO_HOST=0.0.0.0 NITRO_PORT=3000 NUXT_DEPLOYMENT_MODE=production NUXT_PUBLIC_DEMO=false NUXT_PUBLIC_TESTING_CALENDAR=false NUXT_UPLOAD_STORAGE=r2 NUXT_UPLOAD_DIR=/app/data/uploads
COPY --from=build --chown=node:node /app/.output ./.output
COPY --from=build --chown=node:node /app/scripts/start.mjs ./scripts/start.mjs
COPY --from=build --chown=node:node /app/server/deployment/config.ts ./server/deployment/config.ts
RUN mkdir -p /app/data/uploads && chown -R node:node /app/data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:3000/api/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "scripts/start.mjs"]
