FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production

COPY --chmod=444 swagger-output.json ./
COPY --chmod=444 package.json package-lock.json ./

RUN npm ci --omit=dev \
    && npm cache clean --force

COPY --chmod=555 index.js ./
COPY --chmod=555 config ./config
COPY --chmod=555 controllers ./controllers
COPY --chmod=555 middlewares ./middlewares
COPY --chmod=555 migrations ./migrations
COPY --chmod=555 models ./models
COPY --chmod=555 routes ./routes
COPY --chmod=555 seeders ./seeders
COPY --chmod=555 services ./services
COPY --chmod=555 utils ./utils


RUN mkdir -p uploads log \
    && chown -R node:node uploads log \
    && chmod -R 750 uploads log

USER node

EXPOSE 3000

CMD ["npm", "start"]