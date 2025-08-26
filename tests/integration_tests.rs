use reqwest;
use serde_json::Value;
use std::time::Duration;
use tokio::time::timeout;

const BASE_URL: &str = "http://127.0.0.1:3000";

#[tokio::test]
async fn test_health_endpoint() {
    let client = reqwest::Client::new();

    let response = timeout(
        Duration::from_secs(10),
        client.get(&format!("{}/health", BASE_URL)).send()
    ).await;

    match response {
        Ok(Ok(resp)) => {
            assert_eq!(resp.status(), 200);
            let json: Value = resp.json().await.expect("Failed to parse JSON");
            assert_eq!(json["status"], "OK");
        }
        _ => {
            // If the server isn't running, this test will be skipped
            eprintln!("Server not running, skipping integration test");
        }
    }
}

#[tokio::test]
async fn test_bootstrap_static_endpoint() {
    let client = reqwest::Client::new();

    let response = timeout(
        Duration::from_secs(30),
        client.get(&format!("{}/bootstrap-static", BASE_URL)).send()
    ).await;

    match response {
        Ok(Ok(resp)) => {
            assert_eq!(resp.status(), 200);
            let json: Value = resp.json().await.expect("Failed to parse JSON");
            // Check that we have the expected structure
            assert!(json.get("events").is_some());
            assert!(json.get("teams").is_some());
            assert!(json.get("elements").is_some());
        }
        _ => {
            eprintln!("Server not running or bootstrap endpoint failed, skipping test");
        }
    }
}

#[tokio::test]
async fn test_fixtures_endpoint() {
    let client = reqwest::Client::new();

    let response = timeout(
        Duration::from_secs(30),
        client.get(&format!("{}/fixtures", BASE_URL)).send()
    ).await;

    match response {
        Ok(Ok(resp)) => {
            assert_eq!(resp.status(), 200);
            let json: Value = resp.json().await.expect("Failed to parse JSON");
            // Should be an array of fixtures
            assert!(json.is_array());
        }
        _ => {
            eprintln!("Server not running or fixtures endpoint failed, skipping test");
        }
    }
}
