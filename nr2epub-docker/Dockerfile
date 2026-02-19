FROM node:20-slim

WORKDIR /app

COPY package.json package.json
RUN npm install

COPY tsconfig.json tsconfig.json
COPY src src
COPY public public
COPY web web
COPY presets presets
COPY template template

RUN npm run build

# キャッシュディレクトリの作成
# RUN mkdir -p /app/.cache/

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["node", "dist/index.js"]
