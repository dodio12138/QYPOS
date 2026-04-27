FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages ./packages
COPY apps/web/package.json ./apps/web/package.json
RUN npm install --workspace @qypos/web --include-workspace-root
COPY apps/web ./apps/web
WORKDIR /app/apps/web
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
