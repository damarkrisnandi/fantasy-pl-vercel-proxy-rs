# API Reference

## Fantasy Premier League Proxy API

This API provides access to Fantasy Premier League data through a high-performance Rust proxy server.

### Base URL
- **Local Development**: `http://localhost:3000`
- **Production**: `https://your-vercel-app.vercel.app`

### Authentication
No authentication required. This is a public proxy API.

### Response Format
All responses are in JSON format. Successful requests return a 200 status code.

### Error Handling
- `500 Internal Server Error`: When the upstream API is unavailable or returns invalid data
- `404 Not Found`: When the requested endpoint doesn't exist

---

## Endpoints

### Health Check
**GET** `/health`

Returns the health status of the API service.

**Response:**
```json
{
  "status": "OK",
  "service": "Fantasy PL Vercel Proxy (Rust)",
  "timestamp": "2024-08-26T10:00:00Z"
}
```

---

### Bootstrap Static Data
**GET** `/bootstrap-static`

Returns the main Fantasy Premier League static data including teams, players, and gameweeks.

**Cache:** 10 minutes

**Response:** Large JSON object containing:
- `events`: Array of gameweek information
- `teams`: Array of Premier League teams
- `elements`: Array of all players
- `element_types`: Player positions
- And more...

---

### Fixtures
**GET** `/fixtures`

Returns all Premier League fixtures.

**Cache:** None (real-time data)

**Response:** Array of fixture objects

---

### Player Summary
**GET** `/element-summary/{player_id}`

Returns detailed information about a specific player.

**Parameters:**
- `player_id` (integer): The unique ID of the player

**Cache:** None

**Example:**
```bash
GET /element-summary/302
```

---

### Live Gameweek Data
**GET** `/live-event/{gameweek}`

Returns live data for a specific gameweek.

**Parameters:**
- `gameweek` (integer): The gameweek number (1-38)

**Cache:** 1 minute

**Example:**
```bash
GET /live-event/15
```

---

### Manager Picks
**GET** `/picks/{manager_id}/{gameweek}`

Returns the team picks for a specific manager in a specific gameweek.

**Parameters:**
- `manager_id` (integer): The Fantasy Premier League manager ID
- `gameweek` (integer): The gameweek number

**Cache:** 10 minutes

**Example:**
```bash
GET /picks/123456/15
```

---

### Manager Information
**GET** `/manager/{manager_id}`

Returns basic information about a Fantasy Premier League manager.

**Parameters:**
- `manager_id` (integer): The Fantasy Premier League manager ID

**Cache:** None

---

### Manager Transfers
**GET** `/manager/{manager_id}/transfers`

Returns the transfer history for a specific manager.

**Parameters:**
- `manager_id` (integer): The Fantasy Premier League manager ID

**Cache:** None

---

### Manager History
**GET** `/manager/{manager_id}/history`

Returns the performance history for a specific manager.

**Parameters:**
- `manager_id` (integer): The Fantasy Premier League manager ID

**Cache:** None

---

### League Standings
**GET** `/league/{league_id}/{page}`

Returns standings for a specific league.

**Parameters:**
- `league_id` (integer): The league ID
- `page` (integer): Page number for pagination

**Cache:** None

---

### League Standings by Phase
**GET** `/league/mon/{league_id}/{phase}`

Returns league standings filtered by a specific phase.

**Parameters:**
- `league_id` (integer): The league ID
- `phase` (integer): The phase number

**Cache:** None

---

## Rate Limiting

This proxy includes built-in caching to reduce load on the upstream Fantasy Premier League API. Different endpoints have different cache durations as noted above.

## Error Responses

When an error occurs, the API returns a JSON object with error information:

```json
{
  "error": "Error message describing what went wrong"
}
```

## Examples

### JavaScript/Node.js
```javascript
const axios = require('axios');

// Get bootstrap data
const bootstrap = await axios.get('http://localhost:3000/bootstrap-static');
console.log(bootstrap.data.events); // Gameweeks

// Get manager picks
const picks = await axios.get('http://localhost:3000/picks/123456/15');
console.log(picks.data.picks); // Player picks
```

### Python
```python
import requests

# Get bootstrap data
response = requests.get('http://localhost:3000/bootstrap-static')
bootstrap = response.json()
print(bootstrap['events'])  # Gameweeks

# Get manager picks
response = requests.get('http://localhost:3000/picks/123456/15')
picks = response.json()
print(picks['picks'])  # Player picks
```

### Rust
```rust
use reqwest;
use serde_json::Value;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = reqwest::Client::new();

    // Get bootstrap data
    let bootstrap: Value = client
        .get("http://localhost:3000/bootstrap-static")
        .send()
        .await?
        .json()
        .await?;

    println!("Gameweeks: {}", bootstrap["events"]);

    Ok(())
}
```
