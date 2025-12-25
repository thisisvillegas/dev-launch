use axum::{
    body::Body,
    extract::{Request, State},
    http::StatusCode,
    response::IntoResponse,
    routing::any,
    Router,
};
use chrono::Utc;
use lazy_static::lazy_static;
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, net::SocketAddr, sync::Arc};
use std::process::{Child, Command, Stdio};
use tauri::{AppHandle, Emitter};
use tokio::sync::{mpsc, Mutex};
use tower_http::cors::CorsLayer;

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct WebhookEvent {
    pub id: String,
    pub timestamp: i64,
    pub path: String,
    pub method: String,
    pub headers: HashMap<String, String>,
    pub body: String,
    pub query: String,
}

struct ServerState {
    events: Arc<Mutex<Vec<WebhookEvent>>>,
    app_handle: AppHandle,
}

struct WebhookServer {
    shutdown_tx: Option<mpsc::Sender<()>>,
    port: u16,
    events: Arc<Mutex<Vec<WebhookEvent>>>,
}

lazy_static! {
    static ref SERVER: Arc<Mutex<Option<WebhookServer>>> = Arc::new(Mutex::new(None));
    static ref NGROK_PROCESS: std::sync::Mutex<Option<Child>> = std::sync::Mutex::new(None);
}

async fn handle_webhook(
    State(state): State<Arc<ServerState>>,
    request: Request<Body>,
) -> impl IntoResponse {
    // Extract request info
    let method = request.method().to_string();
    let path = request.uri().path().to_string();
    let query = request.uri().query().unwrap_or("").to_string();

    // Extract headers
    let mut headers = HashMap::new();
    for (name, value) in request.headers() {
        if let Ok(v) = value.to_str() {
            headers.insert(name.to_string(), v.to_string());
        }
    }

    // Extract body
    let body_bytes = axum::body::to_bytes(request.into_body(), 1024 * 1024) // 1MB limit
        .await
        .unwrap_or_default();
    let body = String::from_utf8_lossy(&body_bytes).to_string();

    // Create event
    let event = WebhookEvent {
        id: uuid::Uuid::new_v4().to_string(),
        timestamp: Utc::now().timestamp_millis(),
        path,
        method,
        headers,
        body,
        query,
    };

    // Store event
    {
        let mut events = state.events.lock().await;
        events.push(event.clone());
        // Keep only last 100 events
        if events.len() > 100 {
            events.remove(0);
        }
    }

    // Emit to frontend
    let _ = state.app_handle.emit("webhook-received", event);

    StatusCode::OK
}

#[tauri::command]
pub async fn start_webhook_server(app: AppHandle, port: u16) -> Result<String, String> {
    println!("[webhook_server] start_webhook_server called with port: {}", port);

    let mut server = SERVER.lock().await;
    println!("[webhook_server] Got server lock");

    if server.is_some() {
        println!("[webhook_server] Server already running");
        return Err("Server is already running".to_string());
    }

    let events: Arc<Mutex<Vec<WebhookEvent>>> = Arc::new(Mutex::new(Vec::new()));
    let (shutdown_tx, mut shutdown_rx) = mpsc::channel::<()>(1);

    let state = Arc::new(ServerState {
        events: events.clone(),
        app_handle: app,
    });

    let app_router = Router::new()
        .fallback(any(handle_webhook))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));

    println!("[webhook_server] Binding to {}", addr);
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .map_err(|e| {
            println!("[webhook_server] Failed to bind: {}", e);
            format!("Failed to bind to port {}: {}", port, e)
        })?;

    let actual_port = listener.local_addr().map_err(|e| e.to_string())?.port();
    println!("[webhook_server] Bound to port {}", actual_port);

    tokio::spawn(async move {
        axum::serve(listener, app_router)
            .with_graceful_shutdown(async move {
                shutdown_rx.recv().await;
            })
            .await
            .ok();
    });

    *server = Some(WebhookServer {
        shutdown_tx: Some(shutdown_tx),
        port: actual_port,
        events,
    });

    let url = format!("http://localhost:{}", actual_port);
    println!("[webhook_server] Server started at {}", url);
    Ok(url)
}

#[tauri::command]
pub async fn stop_webhook_server() -> Result<(), String> {
    let mut server = SERVER.lock().await;

    if let Some(s) = server.take() {
        if let Some(tx) = s.shutdown_tx {
            let _ = tx.send(()).await;
        }
        Ok(())
    } else {
        Err("No server is running".to_string())
    }
}

#[tauri::command]
pub async fn get_webhook_events() -> Result<Vec<WebhookEvent>, String> {
    let server = SERVER.lock().await;

    if let Some(s) = server.as_ref() {
        let events = s.events.lock().await;
        Ok(events.clone())
    } else {
        Ok(Vec::new())
    }
}

#[tauri::command]
pub async fn clear_webhook_events() -> Result<(), String> {
    let server = SERVER.lock().await;

    if let Some(s) = server.as_ref() {
        let mut events = s.events.lock().await;
        events.clear();
        Ok(())
    } else {
        Ok(())
    }
}

#[tauri::command]
pub async fn get_webhook_server_status() -> Result<Option<u16>, String> {
    let server = SERVER.lock().await;
    Ok(server.as_ref().map(|s| s.port))
}

#[tauri::command]
pub fn start_ngrok(port: u16) -> Result<(), String> {
    println!("[ngrok] Starting ngrok for port {}", port);

    let mut ngrok = NGROK_PROCESS.lock().map_err(|e| e.to_string())?;

    // Kill existing ngrok process if any
    if let Some(mut child) = ngrok.take() {
        println!("[ngrok] Killing existing ngrok process");
        let _ = child.kill();
        let _ = child.wait();
    }

    // Start new ngrok process
    let child = Command::new("ngrok")
        .args(["http", &port.to_string()])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to start ngrok: {}. Make sure ngrok is installed.", e))?;

    println!("[ngrok] Started ngrok process with PID {:?}", child.id());
    *ngrok = Some(child);

    Ok(())
}

#[tauri::command]
pub fn stop_ngrok() -> Result<(), String> {
    println!("[ngrok] Stopping ngrok");

    let mut ngrok = NGROK_PROCESS.lock().map_err(|e| e.to_string())?;

    if let Some(mut child) = ngrok.take() {
        println!("[ngrok] Killing ngrok process");
        child.kill().map_err(|e| format!("Failed to kill ngrok: {}", e))?;
        child.wait().map_err(|e| format!("Failed to wait for ngrok: {}", e))?;
        println!("[ngrok] ngrok stopped");
        Ok(())
    } else {
        Err("ngrok is not running".to_string())
    }
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct NgrokTunnelInfo {
    pub public_url: String,
    pub request_count: u64,
    pub connection_count: u64,
}

#[tauri::command]
pub fn set_ngrok_auth_token(token: String) -> Result<(), String> {
    println!("[ngrok] Setting auth token");
    
    let output = Command::new("ngrok")
        .args(["config", "add-authtoken", &token])
        .output()
        .map_err(|e| format!("Failed to run ngrok config: {}. Make sure ngrok is installed.", e))?;
    
    if output.status.success() {
        println!("[ngrok] Auth token set successfully");
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("Failed to set ngrok auth token: {}", stderr))
    }
}

#[tauri::command]
pub async fn get_ngrok_status() -> Result<Option<NgrokTunnelInfo>, String> {
    // Check if ngrok process is running
    {
        let ngrok = NGROK_PROCESS.lock().map_err(|e| e.to_string())?;
        if ngrok.is_none() {
            return Ok(None);
        }
    }

    // Query ngrok API
    let client = reqwest::Client::new();
    let response = client
        .get("http://localhost:4040/api/tunnels")
        .send()
        .await
        .map_err(|e| format!("Failed to query ngrok: {}", e))?;

    if !response.status().is_success() {
        return Ok(None);
    }

    let data: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse ngrok response: {}", e))?;

    if let Some(tunnels) = data.get("tunnels").and_then(|t| t.as_array()) {
        if let Some(tunnel) = tunnels.first() {
            let public_url = tunnel
                .get("public_url")
                .and_then(|u| u.as_str())
                .unwrap_or("")
                .to_string();

            let request_count = tunnel
                .get("metrics")
                .and_then(|m| m.get("http"))
                .and_then(|h| h.get("count"))
                .and_then(|c| c.as_u64())
                .unwrap_or(0);

            let connection_count = tunnel
                .get("metrics")
                .and_then(|m| m.get("conns"))
                .and_then(|c| c.get("count"))
                .and_then(|c| c.as_u64())
                .unwrap_or(0);

            if !public_url.is_empty() {
                return Ok(Some(NgrokTunnelInfo {
                    public_url,
                    request_count,
                    connection_count,
                }));
            }
        }
    }

    Ok(None)
}
