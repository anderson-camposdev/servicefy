# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig*.json ./
COPY vite*.config.ts ./
COPY eslint.config.js ./

# Install dependencies
RUN npm ci

# Copy source code
COPY index.html ./
COPY src ./src
COPY public ./public

# Build application
RUN npm run build

# Production stage
FROM node:22-alpine

WORKDIR /app

# Install simple HTTP server for static files
RUN npm install -g http-server

# Copy built app from builder
COPY --from=builder /app/dist ./dist

# Expose port
EXPOSE 5173

# Health check
RUN apk add --no-cache curl
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:5173/ || exit 1

# Start server
CMD ["http-server", "dist", "-p", "5173", "--cors"]
