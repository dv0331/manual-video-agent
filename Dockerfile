FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core espeak-ng \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run sample-manual && npm run build

ENV NODE_ENV=production
ENV PORT=43127
EXPOSE 43127

CMD ["npm", "run", "start"]
