FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --production
ARG CACHEBUST=1
COPY . .
EXPOSE 3001
CMD ["node", "index.js"]
