FROM node:22-alpine
WORKDIR /app
COPY backend/package*.json ./
RUN npm install --omit=dev
COPY backend .
RUN npx prisma generate
EXPOSE 3000
CMD ["node","src/server.js"]
