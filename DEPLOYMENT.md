# Deployment Guide

## Fantasy Premier League Proxy API (Rust) - Deployment Instructions

This guide covers different deployment options for the Fantasy Premier League proxy API built with Rust and Axum.

## Prerequisites

- Rust 1.75+ installed
- Git
- For Vercel: Vercel CLI (`npm install -g vercel`)
- For Docker: Docker installed

---

## Local Development

### 1. Clone and Setup
```bash
git clone <your-repo>
cd fantasy-pl-vercel-proxy-rs
cargo build
```

### 2. Run Development Server
```bash
cargo run
```
or
```bash
cargo watch -x run  # With auto-reload (requires cargo-watch)
```

The server will start on `http://localhost:3000`

### 3. Test the API
```bash
# Test health endpoint
curl http://localhost:3000/health

# Test bootstrap data
curl http://localhost:3000/bootstrap-static
```

---

## Vercel Deployment (Recommended)

### 1. Install Vercel CLI
```bash
npm install -g vercel
```

### 2. Login to Vercel
```bash
vercel login
```

### 3. Deploy
```bash
vercel deploy
```

For production deployment:
```bash
vercel deploy --prod
```

### 4. Environment Variables (Optional)
Set environment variables in Vercel dashboard:
- `RUST_LOG`: `info` (or `debug` for verbose logging)
- `PORT`: `3000` (optional, defaults to 3000)

### Configuration Files
The project includes:
- `vercel.json`: Vercel configuration with Rust runtime
- Optimized for serverless deployment

---

## Docker Deployment

### 1. Build Docker Image
```bash
docker build -t fantasy-pl-proxy .
```

### 2. Run Container
```bash
docker run -p 3000:3000 fantasy-pl-proxy
```

### 3. With Environment Variables
```bash
docker run -p 3000:3000 -e RUST_LOG=info fantasy-pl-proxy
```

### Docker Compose
```yaml
version: '3.8'
services:
  fantasy-pl-proxy:
    build: .
    ports:
      - "3000:3000"
    environment:
      - RUST_LOG=info
      - PORT=3000
```

---

## Railway Deployment

### 1. Install Railway CLI
```bash
npm install -g @railway/cli
```

### 2. Login and Deploy
```bash
railway login
railway new
railway up
```

Railway will automatically detect the Rust project and deploy it.

---

## Fly.io Deployment

### 1. Install Fly CLI
```bash
curl -L https://fly.io/install.sh | sh
```

### 2. Initialize and Deploy
```bash
flyctl launch
flyctl deploy
```

Create `fly.toml`:
```toml
app = "fantasy-pl-proxy"
kill_signal = "SIGINT"
kill_timeout = 5
processes = []

[build]
  builder = "heroku/buildpacks:20"
  buildpacks = ["https://github.com/emk/heroku-buildpack-rust.git"]

[[services]]
  http_checks = []
  internal_port = 3000
  processes = ["app"]
  protocol = "tcp"
  script_checks = []

  [services.concurrency]
    hard_limit = 25
    soft_limit = 20
    type = "connections"

  [[services.ports]]
    force_https = true
    handlers = ["http"]
    port = 80

  [[services.ports]]
    handlers = ["tls", "http"]
    port = 443

  [[services.tcp_checks]]
    grace_period = "1s"
    interval = "15s"
    restart_limit = 0
    timeout = "2s"
```

---

## Performance Optimization

### Build Optimizations
The `Cargo.toml` includes release optimizations:
```toml
[profile.release]
opt-level = 3
lto = true
codegen-units = 1
```

### Memory Usage
- In-memory caching with Moka
- Configurable cache sizes
- Automatic cache expiration

### Monitoring
- Built-in health check endpoint: `/health`
- Structured logging with tracing
- Request/response logging

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `RUST_LOG` | `info` | Log level (trace, debug, info, warn, error) |

---

## Troubleshooting

### Common Issues

1. **Compilation Errors**
   ```bash
   cargo clean
   cargo build
   ```

2. **Port Already in Use**
   ```bash
   export PORT=3001
   cargo run
   ```

3. **API Timeouts**
   - Check network connectivity
   - Verify FPL API is accessible
   - Check server logs

### Debugging
```bash
RUST_LOG=debug cargo run
```

### Health Checks
Always test the health endpoint after deployment:
```bash
curl https://your-app.vercel.app/health
```

---

## Security Considerations

- No authentication required (public API proxy)
- CORS enabled for web applications
- Rate limiting via caching
- No sensitive data stored
- Automatic HTTPS on Vercel/Railway/Fly.io

---

## Scaling

The Rust implementation provides excellent performance characteristics:
- Low memory footprint
- High throughput
- Efficient async I/O
- Built-in connection pooling

For high-traffic scenarios, consider:
- Load balancing across multiple instances
- CDN for static responses
- Redis for distributed caching (future enhancement)

---

## Support

- Check logs: `RUST_LOG=debug cargo run`
- Test endpoints: See `API_REFERENCE.md`
- Performance monitoring: Built-in tracing
- Health monitoring: `/health` endpoint
