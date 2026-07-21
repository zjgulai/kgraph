ARG NODE_IMAGE=node:22-bookworm-slim@sha256:53ada149d435c38b14476cb57e4a7da73c15595aba79bd6971b547ceb6d018bf
ARG RUNTIME_IMAGE=gcr.io/distroless/nodejs22-debian13@sha256:773a62fbe24a3f8c8b24b16fd59154627f8b406737bc906f83bf1732bc8907dd

FROM ${NODE_IMAGE} AS builder
WORKDIR /workspace/doccanvas

COPY doccanvas/package.json doccanvas/package-lock.json ./
RUN npm ci --include=dev --no-audit --no-fund

COPY doccanvas/tsconfig.json doccanvas/next.config.ts doccanvas/postcss.config.mjs doccanvas/playwright.config.ts ./
COPY doccanvas/ecosystem.config.cjs doccanvas/nginx.conf doccanvas/.dockerignore doccanvas/Dockerfile ./
COPY doccanvas/app ./app
COPY doccanvas/components ./components
COPY doccanvas/lib ./lib
COPY doccanvas/opendesign ./opendesign
COPY doccanvas/public ./public
COPY doccanvas/documents ./documents
COPY product/knowledge-object-fixtures/shared-knowledge-v1-candidate-pack.json ./knowledge/shared-knowledge-v1-candidate-pack.json
COPY product/knowledge-object-fixtures/shared-knowledge-v1-candidate-pack.json /workspace/product/knowledge-object-fixtures/shared-knowledge-v1-candidate-pack.json
COPY product/blueprint-fixtures/valid-approved-blueprint.yaml /workspace/product/blueprint-fixtures/valid-approved-blueprint.yaml
COPY scripts/lib/knowledge-object-contract.ts /workspace/scripts/lib/knowledge-object-contract.ts
COPY scripts/lib/knowledge-object-store.ts /workspace/scripts/lib/knowledge-object-store.ts
COPY scripts/lib/blueprint-contract.ts /workspace/scripts/lib/blueprint-contract.ts
COPY scripts/lib/blueprint-store.ts /workspace/scripts/lib/blueprint-store.ts
COPY scripts/validate-genome.ts /workspace/scripts/validate-genome.ts
COPY doccanvas/scripts ./scripts
COPY doccanvas/tests ./tests
COPY doccanvas/deploy ./deploy

RUN npm run verify:local

FROM ${RUNTIME_IMAGE} AS runtime
ARG SOURCE_SHA
ARG RELEASE_ID
ARG BUILD_TIMESTAMP
LABEL org.opencontainers.image.title="DocCanvas" \
      org.opencontainers.image.vendor="ai_software" \
      org.opencontainers.image.revision="${SOURCE_SHA}" \
      org.opencontainers.image.version="${RELEASE_ID}" \
      org.opencontainers.image.created="${BUILD_TIMESTAMP}"

ENV NODE_ENV=production \
    DOCUMENT_PATH_MODE=prod \
    DOCCANVAS_ROOT=/data \
    DOCCANVAS_WRITE_MODE=readonly \
    PORT=3200 \
    HOSTNAME=0.0.0.0

WORKDIR /app
COPY --from=builder --chown=10001:10001 /workspace/doccanvas/.next/standalone ./
COPY --from=builder --chown=10001:10001 /workspace/doccanvas/.next/static ./.next/static
COPY --from=builder --chown=10001:10001 /workspace/doccanvas/public ./public
COPY --from=builder --chown=10001:10001 /workspace/doccanvas/knowledge ./knowledge
COPY --from=builder --chown=10001:10001 /workspace/doccanvas/.next/standalone/.next/BUILD_ID ./public/__doccanvas_build_id.txt

USER 10001:10001
EXPOSE 3200
HEALTHCHECK NONE
CMD ["server.js"]
