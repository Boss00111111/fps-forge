FROM node:20-alpine
WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY server.mjs ./
COPY public ./public

ENV NODE_ENV=production
ENV DATA_DIR=/data
RUN mkdir -p /data

EXPOSE 3847
CMD ["node", "server.mjs"]
