FROM node:22-alpine

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY index.html ./
COPY styles/ styles/
COPY src/ src/
COPY server/ server/

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8490
EXPOSE 8490
HEALTHCHECK --interval=20s --timeout=3s --start-period=5s \
  CMD wget -q -O /dev/null http://127.0.0.1:8490/health || exit 1

CMD ["node", "server/index.js"]
