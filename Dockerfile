FROM node:24-alpine

# ffmpeg for sticker/video conversions; fonts for text stickers
RUN apk add --no-cache ffmpeg tzdata fontconfig ttf-dejavu

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY . .

# Persist session and database across container restarts
VOLUME ["/app/sessions", "/app/data"]

ENV NODE_ENV=production

CMD ["node", "src/index.js"]
