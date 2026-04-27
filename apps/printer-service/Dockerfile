FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages ./packages
COPY apps/printer-service/package.json ./apps/printer-service/package.json
RUN npm install --workspace @qypos/printer-service --include-workspace-root
COPY apps/printer-service ./apps/printer-service
WORKDIR /app/apps/printer-service
CMD ["npm", "start"]
