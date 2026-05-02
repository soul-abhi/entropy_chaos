FROM node:20-alpine

RUN apk add --no-cache kubectl

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY index.js ./

EXPOSE 3002
CMD ["npm", "start"]
