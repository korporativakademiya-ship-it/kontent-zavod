# Chromium tayyor o'rnatilgan rasmiy Playwright image (versiya package.json dagi playwright bilan bir xil bo'lishi shart)
FROM mcr.microsoft.com/playwright:v1.56.1-noble
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
# node to'g'ridan-to'g'ri: SIGTERM npm emas, botning o'ziga yetib borsin (toza to'xtash)
CMD ["node", "src/index.js"]
