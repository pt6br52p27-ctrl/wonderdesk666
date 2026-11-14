# WanderDesk - runs the site and API on port 3000.
FROM node:20-alpine

WORKDIR /app
# No dependencies to install: the server uses only Node's built-in modules.
COPY package.json ./
COPY server ./server
COPY public ./public

# Records are stored in /app/data/bookings.json. Mount a volume here to keep data between runs.
RUN mkdir -p /app/data && chown -R node:node /app
USER node
VOLUME ["/app/data"]

ENV PORT=3000 HOST=0.0.0.0 DELAY_MS=350
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server/server.js"]
