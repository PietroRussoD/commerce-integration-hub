FROM node:24-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20 AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src

RUN pnpm build && pnpm prune --prod

# Debian's security update is not yet included in the distroless base.
# Copy the real package files and status together until the base catches up.
FROM debian:13-slim@sha256:a72b4433de1cf7d6bae0c4cee74d0547f58601a643b3375f070c51600d63b6b2 AS zlib-security-update
RUN apt-get update \
    && apt-get install -y --no-install-recommends 'zlib1g=1:1.3.dfsg+really1.3.1-1+deb13u1' \
    && arch="$(dpkg-query -W -f='${Architecture}' zlib1g)" \
    && mkdir -p /overlay/var/lib/dpkg/status.d \
    && dpkg-query -s zlib1g > /overlay/var/lib/dpkg/status.d/zlib1g \
    && dpkg -L zlib1g | grep -E '/libz\.so\.1(\.3\.1)?$' | while read -r path; do \
      mkdir -p "/overlay$(dirname "$path")"; cp -a "$path" "/overlay$path"; \
    done \
    && test "$(find /overlay/usr/lib -type f -name 'libz.so.1.3.1' | wc -l)" -eq 1 \
    && cp "/var/lib/dpkg/info/zlib1g:${arch}.md5sums" /overlay/var/lib/dpkg/status.d/zlib1g.md5sums

FROM gcr.io/distroless/nodejs24-debian13:nonroot@sha256:b8cec4b2f2126ff7bd034ec9ac207ffb3272667dfdc48376e3b035d3270549ba AS runtime

COPY --from=zlib-security-update /overlay/ /

ENV NODE_ENV=production

WORKDIR /app

COPY --from=build --chown=65532:65532 /app/package.json ./
COPY --from=build --chown=65532:65532 /app/node_modules ./node_modules
COPY --from=build --chown=65532:65532 /app/dist ./dist

EXPOSE 8081

USER nonroot:nonroot

CMD ["dist/main.js"]
