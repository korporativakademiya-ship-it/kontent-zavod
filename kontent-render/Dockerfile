FROM mcr.microsoft.com/playwright:v1.56.1-noble
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg fonts-noto-color-emoji && rm -rf /var/lib/apt/lists/*
WORKDIR /app
# package-lock.json bilan — CI'dagi kabi aynan bir xil paketlar o'rnatiladi
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY . .
ENV NODE_ENV=production
CMD ["node", "server.js"]
