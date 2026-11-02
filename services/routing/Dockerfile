# Build from the repository root: docker build -f services/routing/Dockerfile .
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY services/routing/package.json services/routing/
COPY packages/sdk/package.json packages/sdk/
COPY examples/compare-routes/package.json examples/compare-routes/
COPY services/routing/prisma services/routing/prisma
COPY services/routing/prisma.config.ts services/routing/
RUN npm ci --workspace services/routing --include-workspace-root=false
COPY services/routing services/routing
RUN npm run build --workspace services/routing

FROM node:24-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/package.json package.json
COPY --from=build /app/services/routing services/routing
WORKDIR /app/services/routing
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s CMD node -e "fetch('http://127.0.0.1:4000/v1/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
