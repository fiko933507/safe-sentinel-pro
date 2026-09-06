FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production

COPY backend/package*.json ./

# Prisma CLI generate asamasinda gerekli oldugu icin
# once tum dependency'ler kurulur.
RUN npm ci

COPY backend ./

# package.json ile ayni Prisma surumu kullanilir.
RUN npx prisma generate

# Generate tamamlandiktan sonra dev dependency'ler
# production image'dan kaldirilir.
RUN npm prune --omit=dev

EXPOSE 3000

CMD ["node","src/server.js"]