FROM node:24-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3030
WORKDIR /app
COPY --chown=node:node package.json server.mjs lib.mjs style-profile.md ./
COPY --chown=node:node public ./public
USER node
EXPOSE 3030
CMD ["npm", "start"]
