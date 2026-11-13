FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core espeak-ng poppler-utils \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run sample-manual && npm run build

ENV NODE_ENV=production
# glibc gives each thread its own heap arena; with sharp's worker threads that
# fragments a 512 MB instance until it runs out of memory.
ENV MALLOC_ARENA_MAX=2
ENV PORT=10000
EXPOSE 10000
ENV HOSTNAME=0.0.0.0
CMD ["npm", "run", "start"]
