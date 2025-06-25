FROM node:18-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install

COPY . .

# Ensure node is available
RUN which node || apk add --no-cache nodejs

CMD ["node", "server.js"]
