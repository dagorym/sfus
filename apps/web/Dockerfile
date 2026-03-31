# syntax=docker/dockerfile:1.7

FROM node:20-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /workspace

FROM base AS deps
COPY pnpm-lock.yaml package.json pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY packages/config/package.json packages/config/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY tsconfig.json .
COPY .eslintrc.cjs .prettierrc.cjs ./
COPY packages/config packages/config
COPY apps/web apps/web
RUN pnpm --filter @sfus/web run build

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /workspace/apps/web/dist ./dist
EXPOSE 3000
CMD ["node", "-e", "const http = require('node:http'); const { webBootstrap } = require('./dist/index.js'); const service = typeof webBootstrap === 'function' ? webBootstrap() : 'web'; const port = Number(process.env.PORT || 3000); http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ service, path: req.url })); }).listen(port, '0.0.0.0');"]
