FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm install --include=dev --legacy-peer-deps --no-audit --no-fund

COPY . .
RUN npm run prisma:generate

EXPOSE 3000
CMD ["npm", "run", "railway:start"]
