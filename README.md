# Fantasy Premier League Proxy API (Rust)

A high-performance Rust implementation of the Fantasy Premier League API proxy using Axum, with built-in caching capabilities and Vercel deployment support.

## Features

- ✅ **High Performance**: Built with Rust and Axum for maximum speed and efficiency
- ✅ **Caching System**: Built-in memory caching using Moka to reduce API load and improve response times
- ✅ **Fallback Support**: Automatic fallback to backup data sources when primary API is unavailable
- ✅ **CORS Enabled**: Ready for cross-origin requests from web applications
- ✅ **Compression**: Built-in gzip compression for reduced bandwidth usage
- ✅ **Vercel Ready**: Pre-configured for Vercel serverless deployment
- ✅ **Error Handling**: Comprehensive error handling with proper HTTP status codes
- ✅ **Structured Logging**: Built-in logging with tracing for monitoring and debugging

## Installation

To install dependencies:

```bash
cargo build
```

## Running the Application

To run in development mode:

```bash
cargo run
```

The server will start on port 3000 by default. You can override this by setting the `PORT` environment variable.

## API Documentation

### Available Endpoints

| Endpoint | Description | Cache | Method |
|----------|-------------|--------|--------|
| `GET /health` | Health check endpoint | None | GET |
| `GET /bootstrap-static` | Main FPL static data | 10 min | GET |
| `GET /fixtures` | All fixtures | None | GET |
| `GET /element-summary/:id` | Player details | None | GET |
| `GET /live-event/:gw` | Live gameweek data | 1 min | GET |
| `GET /picks/:managerId/:gw` | Manager's picks | 10 min | GET |
| `GET /manager/:id` | Manager info | None | GET |
| `GET /manager/:id/transfers` | Transfer history | None | GET |
| `GET /manager/:id/history` | Manager history | None | GET |
| `GET /league/:leagueId/:page` | League standings | None | GET |
| `GET /league/mon/:leagueId/:phase` | League by phase | None | GET |

### Example Usage

```bash
# Get bootstrap data
curl http://localhost:3000/bootstrap-static

# Get manager's picks for gameweek 15
curl http://localhost:3000/picks/123456/15

# Health check
curl http://localhost:3000/health
```

## Deployment

### Vercel Deployment

This project is configured for Vercel deployment with Rust runtime:

1. Install the Vercel CLI:
   ```bash
   npm i -g vercel
   ```

2. Deploy to Vercel:
   ```bash
   vercel deploy
   ```

### Local Development

For local development with auto-reload:

```bash
cargo install cargo-watch
cargo watch -x run
```

## Configuration

### Environment Variables

- `PORT`: Server port (default: 3000)
- `RUST_LOG`: Log level (default: info)

### Cache Configuration

The application uses different cache durations for different endpoints:
- Bootstrap data: 10 minutes
- Manager picks: 10 minutes
- Live event data: 1 minute
- Other endpoints: No caching (real-time data)

## Architecture

- **Web Framework**: Axum (async, high-performance HTTP server)
- **HTTP Client**: Reqwest (async HTTP client)
- **Caching**: Moka (high-performance in-memory cache)
- **Serialization**: Serde (JSON serialization/deserialization)
- **Logging**: Tracing (structured logging)
- **Error Handling**: Anyhow (error handling and propagation)

## Data Sources

- **Primary**: Official Fantasy Premier League API (`https://fantasy.premierleague.com/api`)
- **Backup**: Static data backup service for reliability (`https://fpl-static-data.vercel.app`)

## Performance Benefits

Compared to the Node.js version, this Rust implementation offers:
- **Lower Memory Usage**: Rust's memory management without garbage collection
- **Higher Throughput**: Better concurrent request handling
- **Lower Latency**: Compiled native code performance
- **Better Resource Utilization**: More efficient CPU and memory usage

## License

This project is a Rust port of the original Fantasy Premier League Proxy API, optimized for performance and deployed on Vercel.
