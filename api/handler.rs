use moka::future::Cache;
use reqwest::Client;
use serde_json::{json, Value};
use std::{sync::OnceLock, time::Duration};
use tracing::{error, info, warn};
use vercel_runtime::{run, Body, Error, Request, Response};

// Configuration constants
const FPL_API_BASE: &str = "https://fantasy.premierleague.com/api";
const BACKUP_API_BASE: &str = "https://fpl-static-data.vercel.app";
const BACKUP_SEASON: &str = "2025-2026";

// Cache durations in seconds
const BOOTSTRAP_CACHE_DURATION: u64 = 600; // 10 minutes

// Global state using OnceLock for initialization
static HTTP_CLIENT: OnceLock<Client> = OnceLock::new();
static CACHE: OnceLock<Cache<String, Value>> = OnceLock::new();

fn get_http_client() -> &'static Client {
    HTTP_CLIENT.get_or_init(|| {
        Client::builder()
            .timeout(Duration::from_secs(30))
            .user_agent("Fantasy-PL-Proxy-Rust/1.0")
            .build()
            .expect("Failed to create HTTP client")
    })
}

fn get_cache() -> &'static Cache<String, Value> {
    CACHE.get_or_init(|| {
        Cache::builder()
            .max_capacity(1000)
            .time_to_live(Duration::from_secs(BOOTSTRAP_CACHE_DURATION))
            .build()
    })
}

// Load backup JSON data from embedded files
fn load_backup_data(endpoint: &str) -> Option<Value> {
    match endpoint {
        "bootstrap-static" => {
            let backup_json = include_str!("../backup-data/bootstrap-static.json");
            serde_json::from_str(backup_json).ok()
        },
        "fixtures" => {
            let backup_json = include_str!("../backup-data/fixtures.json");
            serde_json::from_str(backup_json).ok()
        },
        "live-event" => {
            let backup_json = include_str!("../backup-data/live-event.json");
            serde_json::from_str(backup_json).ok()
        },
        _ => None
    }
}

async fn fetch_with_fallback(primary_url: &str, backup_url: Option<&str>, local_backup: Option<&str>) -> Result<Value, String> {
    let client = get_http_client();
    let mut is_503_error = false;

    // Try primary URL first
    match client.get(primary_url).send().await {
        Ok(response) => {
            let status = response.status();
            if status.is_success() {
                match response.json::<Value>().await {
                    Ok(data) => return Ok(data),
                    Err(e) => error!("Failed to parse JSON from primary URL {}: {}", primary_url, e),
                }
            } else {
                if status.as_u16() == 503 {
                    is_503_error = true;
                    warn!("Received 503 Service Unavailable from primary URL: {}", primary_url);
                } else {
                    error!("Received non-success status {} from primary URL {}", status, primary_url);
                }
            }
        }
        Err(e) => {
            error!("Failed to fetch from primary URL {}: {}", primary_url, e);
            // Network errors might indicate overload, treat as potential 503
            is_503_error = true;
        }
    }

    // Try backup URL if available
    if let Some(backup_url) = backup_url {
        match client.get(backup_url).send().await {
            Ok(response) => {
                let status = response.status();
                if status.is_success() {
                    match response.json::<Value>().await {
                        Ok(data) => return Ok(data),
                        Err(e) => error!("Failed to parse JSON from backup URL {}: {}", backup_url, e),
                    }
                } else {
                    if status.as_u16() == 503 {
                        warn!("Received 503 Service Unavailable from backup URL: {}", backup_url);
                    } else {
                        error!("Received non-success status {} from backup URL {}", status, backup_url);
                    }
                }
            }
            Err(e) => error!("Failed to fetch from backup URL {}: {}", backup_url, e),
        }
    }

    // If we encountered 503 errors or network issues, try local backup data
    if is_503_error {
        if let Some(backup_endpoint) = local_backup {
            if let Some(backup_data) = load_backup_data(backup_endpoint) {
                warn!("Using local backup data for endpoint: {}", backup_endpoint);
                return Ok(backup_data);
            }
        }
    }

    Err("Failed to fetch data from all available sources".to_string())
}

async fn get_cached_or_fetch(cache_key: &str, primary_url: &str, backup_url: Option<&str>, local_backup: Option<&str>) -> Result<Value, String> {
    let cache = get_cache();

    // Check cache first
    if let Some(cached_data) = cache.get(cache_key).await {
        return Ok(cached_data);
    }

    // Fetch from API with all fallback mechanisms
    let data = fetch_with_fallback(primary_url, backup_url, local_backup).await?;

    // Cache the result
    cache.insert(cache_key.to_string(), data.clone()).await;

    Ok(data)
}

fn extract_path_param(uri: &str, pattern: &str, param_name: &str) -> Option<String> {
    // Simple path parameter extraction
    // For more complex routing, you might want to use a proper router library
    let pattern_parts: Vec<&str> = pattern.split('/').collect();
    let uri_parts: Vec<&str> = uri.split('/').collect();

    if pattern_parts.len() != uri_parts.len() {
        return None;
    }

    for (i, pattern_part) in pattern_parts.iter().enumerate() {
        if pattern_part.starts_with(':') && &pattern_part[1..] == param_name {
            return Some(uri_parts[i].to_string());
        }
    }

    None
}

async fn handle_bootstrap_static() -> Result<Value, String> {
    let primary_url = format!("{}/bootstrap-static/", FPL_API_BASE);
    let backup_url = format!("{}/{}/bootstrap-static.json", BACKUP_API_BASE, BACKUP_SEASON);

    get_cached_or_fetch("bootstrap-static", &primary_url, Some(&backup_url), Some("bootstrap-static")).await
}

async fn handle_fixtures() -> Result<Value, String> {
    let primary_url = format!("{}/fixtures/", FPL_API_BASE);
    let backup_url = format!("{}/{}/fixtures.json", BACKUP_API_BASE, BACKUP_SEASON);

    fetch_with_fallback(&primary_url, Some(&backup_url), Some("fixtures")).await
}

async fn handle_element_summary(id: &str) -> Result<Value, String> {
    let url = format!("{}/element-summary/{}/", FPL_API_BASE, id);
    fetch_with_fallback(&url, None, None).await
}

async fn handle_live_event(gw: &str) -> Result<Value, String> {
    let url = format!("{}/event/{}/live/", FPL_API_BASE, gw);
    let cache_key = format!("live-event-{}", gw);

    get_cached_or_fetch(&cache_key, &url, None, Some("live-event")).await
}

async fn handle_picks(manager_id: &str, gw: &str) -> Result<Value, String> {
    let url = format!("{}/entry/{}/event/{}/picks/", FPL_API_BASE, manager_id, gw);
    let cache_key = format!("picks-{}-{}", manager_id, gw);

    get_cached_or_fetch(&cache_key, &url, None, None).await
}

async fn handle_manager_info(id: &str) -> Result<Value, String> {
    let url = format!("{}/entry/{}/", FPL_API_BASE, id);
    fetch_with_fallback(&url, None, None).await
}

async fn handle_manager_transfers(id: &str) -> Result<Value, String> {
    let url = format!("{}/entry/{}/transfers/", FPL_API_BASE, id);
    fetch_with_fallback(&url, None, None).await
}

async fn handle_manager_history(id: &str) -> Result<Value, String> {
    let url = format!("{}/entry/{}/history/", FPL_API_BASE, id);
    fetch_with_fallback(&url, None, None).await
}

async fn handle_league_standings(league_id: &str, page: &str) -> Result<Value, String> {
    let url = format!("{}/leagues-classic/{}/standings/?page_standings={}", FPL_API_BASE, league_id, page);
    fetch_with_fallback(&url, None, None).await
}

async fn handle_league_standings_by_phase(league_id: &str, phase: &str) -> Result<Value, String> {
    let url = format!("{}/leagues-classic/{}/standings/?page_standings=1&phase={}", FPL_API_BASE, league_id, phase);
    fetch_with_fallback(&url, None, None).await
}

async fn handler(request: Request) -> Result<Response<Body>, Error> {
    // Initialize tracing if not already done
    tracing_subscriber::fmt()
        .with_env_filter("info")
        .try_init()
        .ok();

    let path = request.uri().path();
    info!("Handling request to: {}", path);

    // Route matching and handling
    let result = match path {
        "/health" => {
            Ok(json!({
                "status": "OK",
                "service": "Fantasy PL Vercel Proxy (Rust)",
                "timestamp": chrono::Utc::now().to_rfc3339()
            }))
        }
        "/bootstrap-static" => handle_bootstrap_static().await,
        "/fixtures" => handle_fixtures().await,
        path if path.starts_with("/element-summary/") => {
            if let Some(id) = extract_path_param(path, "/element-summary/:id", "id") {
                handle_element_summary(&id).await
            } else {
                Err("Invalid element ID".to_string())
            }
        }
        path if path.starts_with("/live-event/") => {
            if let Some(gw) = extract_path_param(path, "/live-event/:gw", "gw") {
                handle_live_event(&gw).await
            } else {
                Err("Invalid gameweek".to_string())
            }
        }
        path if path.starts_with("/picks/") => {
            // Handle /picks/:manager_id/:gw
            let parts: Vec<&str> = path.split('/').collect();
            if parts.len() == 4 && parts[1] == "picks" {
                handle_picks(parts[2], parts[3]).await
            } else {
                Err("Invalid picks path".to_string())
            }
        }
        path if path.starts_with("/manager/") => {
            let parts: Vec<&str> = path.split('/').collect();
            if parts.len() >= 3 {
                let manager_id = parts[2];
                if parts.len() == 3 {
                    // /manager/:id
                    handle_manager_info(manager_id).await
                } else if parts.len() == 4 {
                    match parts[3] {
                        "transfers" => handle_manager_transfers(manager_id).await,
                        "history" => handle_manager_history(manager_id).await,
                        _ => Err("Invalid manager endpoint".to_string()),
                    }
                } else {
                    Err("Invalid manager path".to_string())
                }
            } else {
                Err("Invalid manager path".to_string())
            }
        }
        path if path.starts_with("/league/") => {
            let parts: Vec<&str> = path.split('/').collect();
            if parts.len() == 4 && parts[1] == "league" {
                // /league/:league_id/:page
                handle_league_standings(parts[2], parts[3]).await
            } else if parts.len() == 5 && parts[1] == "league" && parts[2] == "mon" {
                // /league/mon/:league_id/:phase
                handle_league_standings_by_phase(parts[3], parts[4]).await
            } else {
                Err("Invalid league path".to_string())
            }
        }
        _ => Err("Not Found".to_string()),
    };

    // Convert result to Response
    match result {
        Ok(data) => {
            let json_body = serde_json::to_string(&data).map_err(|e| {
                error!("Failed to serialize JSON: {}", e);
                Error::from("JSON serialization error")
            })?;

            Response::builder()
                .status(200)
                .header("content-type", "application/json")
                .header("access-control-allow-origin", "*")
                .header("access-control-allow-methods", "GET, POST, PUT, DELETE, OPTIONS")
                .header("access-control-allow-headers", "Content-Type, Authorization")
                .header("cache-control", "public, max-age=300") // 5 minutes cache
                .body(Body::from(json_body))
                .map_err(Error::from)
        }
        Err(error_msg) => {
            error!("Request error: {}", error_msg);

            let error_json = json!({
                "error": error_msg,
                "timestamp": chrono::Utc::now().to_rfc3339()
            });

            let status = if error_msg == "Not Found" { 404 } else { 500 };

            Response::builder()
                .status(status)
                .header("content-type", "application/json")
                .header("access-control-allow-origin", "*")
                .header("access-control-allow-methods", "GET, POST, PUT, DELETE, OPTIONS")
                .header("access-control-allow-headers", "Content-Type, Authorization")
                .body(Body::from(error_json.to_string()))
                .map_err(Error::from)
        }
    }
}

#[tokio::main]
async fn main() -> Result<(), Error> {
    run(handler).await
}
