FROM node:23-bookworm

ENV DEBIAN_FRONTEND=noninteractive
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV COREPACK_ENABLE_STRICT=0

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY agent/package.json agent/
COPY app/package.json app/
COPY chat/package.json chat/
COPY db/package.json db/
COPY .npmrc ./

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

COPY config/ config/
COPY prompt/ prompt/
COPY agent/ agent/
COPY app/ app/
COPY chat/ chat/
COPY db/ db/
COPY src/ src/
COPY tsconfig.json .

ENV NODE_ENV=production
EXPOSE 8000

CMD ["pnpm", "start"]
