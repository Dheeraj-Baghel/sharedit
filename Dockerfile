 FROM node:24-bookworm-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/scripts/prepare-runtimes.mjs ./scripts/
RUN node scripts/prepare-runtimes.mjs
COPY frontend/ ./
RUN npm run build

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev
COPY --chmod=0644 backend/server.js ./
COPY --chmod=0644 backend/ai.js backend/ai-quota.js backend/presence.js ./
COPY --from=frontend-build /app/frontend/dist /app/frontend/dist
RUN mkdir -p /app/backend/data && chown node:node /app/backend/data
VOLUME /app/backend/data
USER node
EXPOSE 3001
CMD ["node", "server.js"]