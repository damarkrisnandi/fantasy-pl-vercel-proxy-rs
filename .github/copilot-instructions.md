<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

# Fantasy Premier League Proxy API - Rust Implementation

This is a Rust web server project using Axum framework to create a high-performance proxy for the Fantasy Premier League API.

## Project Context

- **Language**: Rust
- **Web Framework**: Axum (async HTTP server)
- **Purpose**: Proxy API for Fantasy Premier League with caching and CORS support
- **Deployment**: Vercel serverless functions
- **Original**: Ported from Express.js/Node.js implementation

## Key Dependencies

- `axum`: Web framework for building HTTP services
- `tokio`: Async runtime
- `reqwest`: HTTP client for making API requests
- `moka`: High-performance in-memory cache
- `serde`: JSON serialization/deserialization
- `tower-http`: Middleware for CORS and compression
- `tracing`: Structured logging

## Architecture Notes

- All routes are async and use proper error handling
- Caching is implemented using Moka with different TTLs per endpoint
- CORS is enabled for cross-origin requests
- Fallback URLs are used when primary API is unavailable
- Health check endpoint for monitoring

## Code Style Preferences

- Use `Result<T, E>` for error handling
- Prefer async/await for HTTP operations
- Use structured logging with tracing macros
- Keep route handlers simple and delegate to service functions
- Use proper HTTP status codes for different error types

## API Endpoints to Maintain

- `/bootstrap-static` - Main FPL data (cached 10min)
- `/fixtures` - Match fixtures
- `/element-summary/:id` - Player details
- `/live-event/:gw` - Live gameweek data (cached 1min)
- `/picks/:manager_id/:gw` - Manager picks (cached 10min)
- `/manager/:id` - Manager information
- `/manager/:id/transfers` - Transfer history
- `/manager/:id/history` - Manager history
- `/league/:league_id/:page` - League standings
- `/league/mon/:league_id/:phase` - League by phase
