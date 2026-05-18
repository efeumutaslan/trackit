# --- Frontend build stage ---
FROM node:20-alpine AS frontend
WORKDIR /app
COPY frontend/package*.json ./
RUN npm install --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# --- Backend build / runtime ---
FROM node:20-alpine
WORKDIR /app

# better-sqlite3 needs build tools
RUN apk add --no-cache python3 make g++ \
 && ln -sf python3 /usr/bin/python

COPY backend/package*.json ./
RUN npm install --no-audit --no-fund --omit=dev

COPY backend/ ./

# Copy frontend build into backend's public/
COPY --from=frontend /app/dist ./public

RUN mkdir -p /app/data && chown -R node:node /app

ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/app/data/trackit.db
EXPOSE 3000

USER node
CMD ["node", "server.js"]
