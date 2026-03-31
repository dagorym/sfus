# syntax=docker/dockerfile:1.7

FROM node:20-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /workspace

FROM base AS deps
COPY pnpm-lock.yaml package.json pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY packages/config/package.json packages/config/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY tsconfig.json .
COPY .eslintrc.cjs .prettierrc.cjs ./
COPY packages/config packages/config
COPY apps/api apps/api
RUN pnpm --filter @sfus/api run build

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /workspace/apps/api/dist ./dist
EXPOSE 3001
CMD ["node", "-e", "const http = require('node:http'); const { apiBootstrap } = require('./dist/index.js'); const service = typeof apiBootstrap === 'function' ? apiBootstrap() : 'api'; const port = Number(process.env.PORT || 3001); http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ service, path: req.url })); }).listen(port, '0.0.0.0');"]
