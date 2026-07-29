# syntax=docker/dockerfile:1

FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache libc6-compat openssl

COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./

# postinstall runs `prisma generate`; URL is only needed for config load at build time
ENV DATABASE_URL="postgresql://threads:threads@postgres:5432/threads?schema=public"

RUN npm ci

COPY . .

EXPOSE 3000

CMD ["sh", "./scripts/docker-entrypoint.sh"]
