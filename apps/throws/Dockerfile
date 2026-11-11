FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
ENV NODE_ENV=production PORT=4242 DB_PATH=/data/orders.db
USER node
EXPOSE 4242
CMD ["npm", "start"]
