# Phase 14: Docker Deployment & Production Build

## Overview

This document covers the Docker deployment configuration for ACARS Hub's React frontend migration.

## Changes Summary

### 1. Vite Configuration (`acarshub-react/vite.config.ts`)

**Problem**: `react-map-gl` v8.x has module resolution issues with Vite's optimization system.

**Solution**:

```typescript
export default defineConfig({
  resolve: {
    alias: {
      "@": "/src",
    },
  },
  ssr: {
    noExternal: ["react-map-gl", "maplibre-gl"],
  },
  // ... rest of config
});
```

**Impact**:

- ✅ Dev server works correctly
- ✅ Production build succeeds
- ✅ MapLibre GL JS loads properly in browser

### 2. Dockerfile Updates

**Build Stage Changes**:

```dockerfile
FROM node:25.5.0-slim AS acarshub-react-builder

# Accept version from CI
ARG VERSION=0.0.0
ARG BUILD_NUMBER=0

# ... install dependencies ...

RUN set -xe && \
    pushd /acarshub-react && \
    npm run build && \
    # Copy entire React build output to /webapp/dist
    mkdir -p /webapp/dist && \
    cp -r ./dist/* /webapp/dist/
```

**Runtime Stage Changes**:

```dockerfile
FROM ghcr.io/sdr-enthusiasts/docker-baseimage:base

# Accept version from CI
ARG VERSION=0.0.0
ARG BUILD_NUMBER=0

# ... Python dependencies ...

COPY --from=acarshub-react-builder /webapp/dist/ /webapp/dist/

# ... data downloads ...

RUN set -x && \
    # Use version and build number from build args
    ACARS_VERSION="${VERSION}" && \
    ACARS_BUILD="${BUILD_NUMBER}" && \
    echo "ACARS Hub: v${ACARS_VERSION} Build ${ACARS_BUILD}" && \
    # Write version files for runtime display
    printf "v%sBuild%s" "$ACARS_VERSION" "$ACARS_BUILD" > /acarshub_version && \
    printf "v%s Build %s\nv%sBuild%s" "$ACARS_VERSION" "$ACARS_BUILD" "$ACARS_VERSION" "$ACARS_BUILD" > /version
```

**Key Changes**:

- ✅ Build stage renamed: `acarshub-typescript-builder` → `acarshub-react-builder`
- ✅ Simplified asset copying (entire `dist/` directory copied)
- ✅ Version extraction now uses build args instead of parsing legacy JS files
- ✅ Assets placed at `/webapp/dist/` in container

### 3. nginx Configuration (`rootfs/etc/nginx.acarshub/sites-enabled/acarshub`)

**Root Directory**:

```nginx
server {
  listen 80 default_server;
  root /webapp/dist;  # Changed from /webapp
  server_name _;
  # ...
}
```

**Index Page** (must not be cached):

```nginx
location = / {
  add_header Cache-Control 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0';
  add_header Pragma 'no-cache';
  add_header Expires '0';
  try_files /index.html =404;  # Changed from /templates/index.html
}
```

**SPA Routing** (React Router paths):

```nginx
# SPA routing - all React Router paths serve index.html - must not be cached
location ~ ^/(live-messages|live-map|search|alerts|stats|about|status)$ {
  add_header Cache-Control 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0';
  add_header Pragma 'no-cache';
  add_header Expires '0';
  try_files /index.html =404;  # Changed from /templates/index.html
}

# Fallback for any other routes (SPA routing)
location / {
  try_files $uri $uri/ /index.html;
}
```

**Asset Caching** (unchanged):

```nginx
# cache hashed assets immutably (they have content hashes in filenames)
location ~ \.(css|js|png|jpg|jpeg|gif|ico|woff|woff2|ttf|svg|eot|otf|map|mjs|mp3)$ {
  expires 1y;
  add_header Cache-Control "public, immutable";
  root /webapp;  # Falls back to /webapp/dist due to server root
}
```

**Backend Proxying** (unchanged):

```nginx
# proxy pass the web socket to gunicorn
location /socket.io {
  proxy_pass http://127.0.0.1:8888/socket.io;
}

# proxy pass the metrics endpoint to gunicorn
location /metrics {
  proxy_pass http://127.0.0.1:8888/metrics;
  add_header Cache-Control 'no-cache';
}
```

**Removed Routes**:

- ❌ `/aboutmd` (legacy help page - now part of React About page)

### 4. React Build Output Structure

```text
/webapp/dist/
├── index.html                          # Main HTML entry point (0.69 KB)
├── acarshub.svg                        # App icon
├── assets/                             # Hashed assets for cache busting
│   ├── index-[hash].js                 # Main bundle (588 KB / 187 KB gzipped)
│   ├── index-[hash].css                # Main styles (201 KB / 30 KB gzipped)
│   ├── react-[hash].js                 # React vendor chunk (48 KB / 17 KB gzipped)
│   ├── charts-[hash].js                # Chart.js chunk (227 KB / 74 KB gzipped)
│   ├── decoder-[hash].js               # ACARS decoder chunk (455 KB / 137 KB gzipped)
│   ├── map-[hash].js                   # MapLibre GL chunk (1,021 KB / 275 KB gzipped)
│   ├── maplibre-gl-[hash].js           # MapLibre GL (0.5 KB)
│   ├── acarshub-[hash].svg             # Logo
│   └── safari-[hash].png               # Alert config example image
├── static/
│   └── sounds/
│       └── alert.mp3                   # Alert notification sound
└── stats.html                          # Bundle analyzer report (dev only)
```

**Total Bundle Size**:

- **Uncompressed**: ~2.6 MB
- **Gzipped**: ~730 KB
- **Largest chunk**: Map (1,021 KB / 275 KB gzipped)

## Build Process

### Local Development Build

```bash
cd acarshub-react
npm install
npm run build
```

Output: `acarshub-react/dist/`

### Docker Build (Local)

```bash
docker build -t acarshub:local .
```

This uses default version `0.0.0` and build `0`.

### Docker Build (CI with version)

```bash
docker build \
  --build-arg VERSION=2.1.0 \
  --build-arg BUILD_NUMBER=123 \
  -t acarshub:2.1.0 \
  .
```

This embeds the version into the container's `/acarshub_version` and `/version` files.

## Testing Checklist

### Pre-Deployment Tests

- [ ] **Dev server works**: `npm run dev` in `acarshub-react/`
- [ ] **Production build succeeds**: `npm run build` with no errors
- [ ] **All pages load**: Test all routes in dev mode
- [ ] **Socket.IO connects**: Backend must be running on port 8080
- [ ] **Map loads**: Live Map page renders without errors
- [ ] **Assets load**: Alert sounds, images, icons all accessible

### Docker Container Tests

- [ ] **Container builds**: `docker build` completes successfully
- [ ] **Container starts**: `docker run` starts without errors
- [ ] **nginx serves index.html**: `curl http://localhost/` returns HTML
- [ ] **SPA routing works**: All React Router paths serve `index.html`
- [ ] **Assets accessible**: `/static/sounds/alert.mp3` returns audio file
- [ ] **Socket.IO proxies**: WebSocket connections work through nginx
- [ ] **Metrics endpoint**: `/metrics` returns Prometheus metrics
- [ ] **Version display**: `/acarshub_version` file contains correct version

### Production Tests

- [ ] **All features work**: Live Messages, Map, Search, Alerts, Stats, Status, About
- [ ] **Real-time updates**: Messages appear via Socket.IO
- [ ] **Map renders**: Aircraft markers, range rings, NEXRAD overlay
- [ ] **Search works**: Database queries return results
- [ ] **Alerts trigger**: Sound and desktop notifications
- [ ] **Settings persist**: localStorage saves user preferences
- [ ] **Theme switching**: Mocha/Latte themes work
- [ ] **Mobile responsive**: Test on phone/tablet viewports

## Troubleshooting

### Issue: nginx 404 on all routes

**Symptom**: All pages return 404, even `/`

**Cause**: React build not copied to `/webapp/dist/` in container

**Fix**: Verify Dockerfile `COPY --from=acarshub-react-builder /webapp/dist/ /webapp/dist/` line

### Issue: Socket.IO connection fails

**Symptom**: "WebSocket connection failed" in browser console

**Cause**: nginx not proxying `/socket.io/*` to backend

**Fix**: Verify nginx `location /socket.io` block proxies to `http://127.0.0.1:8888/socket.io`

### Issue: Assets return 404 (sounds, images)

**Symptom**: `/static/sounds/alert.mp3` returns 404

**Cause**: Static assets not in build output or wrong path

**Fix**:

1. Verify `public/static/sounds/alert.mp3` exists in source
2. Verify `dist/static/sounds/alert.mp3` exists after build
3. Check nginx root is `/webapp/dist`

### Issue: React Router paths return 404

**Symptom**: `/live-map` works on initial load but 404 on refresh

**Cause**: nginx not configured for SPA routing

**Fix**: Verify `location /` block has `try_files $uri $uri/ /index.html;`

### Issue: Map doesn't load

**Symptom**: "Cannot read properties of undefined (reading 'Map')" error

**Cause**: `react-map-gl` not properly configured in Vite

**Fix**: Ensure `vite.config.ts` has `ssr: { noExternal: ["react-map-gl", "maplibre-gl"] }`

### Issue: Version shows 0.0.0

**Symptom**: About page or logs show version "0.0.0 Build 0"

**Cause**: Build args not passed to Docker build

**Fix**: Add `--build-arg VERSION=x.x.x --build-arg BUILD_NUMBER=xxx` to `docker build` command

## Performance Optimization

### Current Bundle Sizes (Gzipped)

- Main bundle: 187 KB
- Map chunk: 275 KB ⚠️ (largest)
- Decoder chunk: 137 KB
- Charts chunk: 74 KB
- React vendor: 17 KB

### Optimization Opportunities

1. **Map chunk is large** (275 KB gzipped):
   - Consider lazy loading map with `React.lazy()` on Live Map page
   - Only users who visit `/live-map` would download this chunk

2. **Code splitting working**:
   - ✅ React, Charts, Map, Decoder are separate chunks
   - ✅ Browser caches chunks independently

3. **nginx compression**:
   - Consider enabling Brotli compression (better than gzip)
   - Already using `expires 1y` for hashed assets (good)

## Next Steps

1. **Build Docker image** with version args
2. **Test in container** (all features, all pages)
3. **Performance testing** (load time, bundle size analysis)
4. **Update CI/CD** to build and push Docker images
5. **Document deployment** for end users

## References

- Vite build configuration: `acarshub-react/vite.config.ts`
- Dockerfile: `Dockerfile`
- nginx config: `rootfs/etc/nginx.acarshub/sites-enabled/acarshub`
- AGENTS.md Phase 14: Complete task list and status
