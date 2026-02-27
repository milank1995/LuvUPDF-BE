FROM node:20-alpine

RUN apk add --no-cache qpdf

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 8001

CMD ["node", "src/index.js"]
