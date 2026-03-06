FROM node:22-alpine

RUN apk add --no-cache qpdf ghostscript

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 8002

CMD ["node", "src/index.js"]
