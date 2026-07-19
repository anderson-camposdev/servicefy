# Build stage
FROM node:24-alpine AS builder

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
FROM nginx:1.27-alpine

# Copy built app and the reviewed production server policy.
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port
EXPOSE 5173

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:5173/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
