FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies
FROM base AS install
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production

# Build stage
FROM base AS build
COPY --from=install /app/node_modules ./node_modules
COPY . .
RUN bun build index.ts --outdir=./dist --target=bun

# Production stage
FROM base AS release
COPY --from=install /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public
COPY --from=build /app/lib ./lib
COPY --from=build /app/index.ts ./index.ts

# Set environment
ENV NODE_ENV=production
ENV PORT=8080

# Expose port
EXPOSE 8080

# Run the app
CMD ["bun", "run", "index.ts"]
