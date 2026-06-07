FROM oven/bun:1-alpine

WORKDIR /app

# Copy package files
COPY package.json bun.lock ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code (excluding .env)
COPY server ./server
COPY lib ./lib
COPY frontend ./frontend
COPY db ./db
COPY sessions ./sessions
COPY skills ./skills
COPY prompts ./prompts
COPY tools ./tools
COPY types ./types
COPY .env.example .env

# Expose port
EXPOSE 3333

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-redirect --tries=1 --spider http://localhost:3333/health || exit 1

# Start server - bun will load .env file for environment variables
CMD ["bun", "run", "start"]