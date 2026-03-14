FROM node:20-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    openssl \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm install --include=dev --no-audit --no-fund
COPY prisma ./prisma
RUN npx prisma generate

FROM node:20-bookworm-slim AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    openssl \
    && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    openssl \
    && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app ./
RUN mkdir -p /app/data
EXPOSE 3000
CMD ["sh", "-c", "npx prisma db push && npm run start"]
