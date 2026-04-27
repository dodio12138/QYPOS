FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages ./packages
COPY apps/api/package.json ./apps/api/package.json
RUN npm install --workspace @qypos/api --include-workspace-root
COPY apps/api ./apps/api
WORKDIR /app/apps/api
EXPOSE 4000
CMD ["npm", "start"]
