FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run prisma:generate

EXPOSE 3000
CMD ["npm", "run", "railway:start"]
