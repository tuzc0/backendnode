FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production

COPY --chmod=444 package*.json ./

RUN npm ci --omit=dev \
    && npm cache clean --force

COPY --chmod=555 . .

RUN mkdir -p uploads log \
    && chown -R node:node uploads log \
    && chmod -R 750 uploads log

USER node

EXPOSE 3000

CMD ["npm", "start"]