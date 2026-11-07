FROM node:24.21.0-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates python3 build-essential git pkg-config && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY enterprise ./enterprise
COPY workbench ./workbench
COPY scripts ./scripts
COPY upstream/deepseek-harness-master ./upstream/deepseek-harness-master
RUN npm install --global pnpm@11.28.5
RUN cd upstream/deepseek-harness-master && pnpm install --frozen-lockfile && DSH_CLIENT_COMMIT_HASH=ce7073d51254c26cd63b22a60835b8f948deb447 pnpm run build:artifacts
RUN npm run build:enterprise && mkdir -p /data && chown -R node:node /data
ENV NODE_ENV=production NODE_USE_SYSTEM_CA=1 PORT=8080 ENTERPRISE_DATA_ROOT=/data DSH_SOURCE_ROOT=/app/upstream/deepseek-harness-master
USER node
EXPOSE 8080
CMD ["node","enterprise/lib/main.js"]
