# Build stage
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
# Prisma removed - no longer needed
RUN npm run build

# Production stage
FROM node:20-alpine AS runtime

WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
# Skip the public folder if it doesn't exist
# COPY --from=builder /app/public ./public
COPY --from=builder /app/package*.json ./
# Prisma removed - no longer needed

EXPOSE 3001

ENV PORT=3001

CMD ["npm", "start"]
