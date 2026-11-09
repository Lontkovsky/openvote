FROM --platform=linux/amd64 node:24.20.0-trixie-slim@sha256:a747ad80c8a161b650d79a6da9c422005b91148b18b8d2c669eb5a0b7c07e600 AS demand-build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/domain/package.json packages/domain/package.json
RUN pnpm install --frozen-lockfile
COPY apps/web apps/web
COPY packages/domain packages/domain
RUN pnpm --filter @openvote/web build:demand
RUN CI=true pnpm prune --prod

FROM --platform=linux/amd64 node:24.20.0-trixie-slim@sha256:a747ad80c8a161b650d79a6da9c422005b91148b18b8d2c669eb5a0b7c07e600 AS demand-runtime
WORKDIR /app
RUN apt-get update -qq && apt-get upgrade -y && rm -rf /var/lib/apt/lists/* /usr/local/lib/node_modules/npm && rm -f /usr/local/bin/npm /usr/local/bin/npx
COPY --from=demand-build /app/node_modules node_modules
COPY --from=demand-build /app/apps/web/dist-demand apps/web/dist-demand
COPY apps/web/src/public-info-content.ts apps/web/src/public-info-content.ts
COPY apps/api apps/api
COPY packages/domain packages/domain
COPY scripts/demand-start.ts scripts/demand-start.ts
COPY scripts/migrate.ts scripts/migrate.ts
COPY migrations/demand migrations/demand
COPY docs/PUBLIC_KNOWLEDGE.md docs/PUBLIC_KNOWLEDGE.md
COPY package.json LICENSE ./
ENV NODE_ENV=production
USER node
EXPOSE 10000
CMD ["node", "scripts/demand-start.ts"]
