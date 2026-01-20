FROM node:18-alpine

# build tools (for native deps)
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY . .

EXPOSE 5001

CMD ["node", "index.js"]
