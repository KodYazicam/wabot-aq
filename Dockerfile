FROM node:22-alpine

# ffmpeg for sticker/video conversions
RUN apk add --no-cache ffmpeg tzdata

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

COPY . .

# Persist session and database across container restarts
VOLUME ["/app/sessions", "/app/data"]

ENV NODE_ENV=production

CMD ["node", "src/index.js"]
