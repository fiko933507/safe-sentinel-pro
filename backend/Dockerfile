FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --include=dev

COPY . .
RUN npm run prisma:generate

EXPOSE 3000
CMD ["npm", "run", "railway:start"]
