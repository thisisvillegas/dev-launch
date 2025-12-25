use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::process::{Command, Stdio};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

// Global registry of spawned process PIDs and compiled URL regex
lazy_static::lazy_static! {
    static ref PROCESS_REGISTRY: Mutex<HashSet<u32>> = Mutex::new(HashSet::new());
    // Regex to detect URLs like http://localhost:3000 or http://127.0.0.1:8080
    static ref URL_REGEX: Regex = Regex::new(r"https?://(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d+)").unwrap();
    // Regex to detect port mentions like "listening on port 3000" or "ready on port 8080"
    static ref PORT_REGEX: Regex = Regex::new(r"(?i)(?:listening|ready|running|started|server|local)\s+(?:on|at)?\s*(?:port\s+)?:?(\d{4,5})").unwrap();
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProcessStatus {
    pub running: bool,
    pub pid: Option<u32>,
}

/// Spawn a new process and return its PID
#[tauri::command]
pub async fn spawn_process(
    app: AppHandle,
    cwd: String,
    command: String,
    args: Vec<String>,
) -> Result<u32, String> {
    let mut cmd = Command::new(&command);
    cmd.current_dir(&cwd)
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    // On Unix, create a new process group so we can kill the whole tree
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        cmd.process_group(0);
    }

    let mut child = cmd.spawn().map_err(|e| format!("Failed to spawn: {}", e))?;

    let pid = child.id();

    // Register the PID in our process registry
    if let Ok(mut registry) = PROCESS_REGISTRY.lock() {
        registry.insert(pid);
    }

    // Spawn a task to read stdout and emit events
    let app_clone = app.clone();
    let cwd_clone = cwd.clone();
    if let Some(stdout) = child.stdout.take() {
        std::thread::spawn(move || {
            use std::io::{BufRead, BufReader};
            let reader = BufReader::new(stdout);
            for line in reader.lines().map_while(Result::ok) {
                // Emit log event
                let _ = app_clone.emit(
                    "process-log",
                    LogEvent {
                        path: cwd_clone.clone(),
                        level: detect_log_level(&line),
                        message: line.clone(),
                    },
                );

                // Check for URL/port in the log line and emit URL event
                if let Some((url, port)) = detect_url(&line) {
                    let _ = app_clone.emit(
                        "process-url",
                        UrlEvent {
                            path: cwd_clone.clone(),
                            url,
                            port,
                        },
                    );
                }
            }
        });
    }

    // Spawn a task to read stderr
    let app_clone = app.clone();
    let cwd_clone = cwd.clone();
    if let Some(stderr) = child.stderr.take() {
        std::thread::spawn(move || {
            use std::io::{BufRead, BufReader};
            let reader = BufReader::new(stderr);
            for line in reader.lines().map_while(Result::ok) {
                let _ = app_clone.emit(
                    "process-log",
                    LogEvent {
                        path: cwd_clone.clone(),
                        level: "error".to_string(),
                        message: line,
                    },
                );
            }
        });
    }

    // Note: In a full implementation, you'd store `child` in a registry
    // For now, we just detach it since we're using PIDs for management

    Ok(pid)
}

/// Kill a process by PID
#[tauri::command]
pub async fn kill_process(pid: u32) -> Result<bool, String> {
    let result = kill_process_internal(pid);

    // Remove from registry if killed successfully
    if result.as_ref().unwrap_or(&false) == &true {
        if let Ok(mut registry) = PROCESS_REGISTRY.lock() {
            registry.remove(&pid);
        }
    }

    result
}

fn kill_process_internal(pid: u32) -> Result<bool, String> {
    #[cfg(unix)]
    {
        use std::process::Command;
        // First try to kill the process group (negative PID)
        // This works for processes we spawned with process_group(0)
        let group_result = Command::new("kill")
            .args(["-TERM", &format!("-{}", pid)])
            .status();

        // If process group kill succeeded, we're done
        if let Ok(s) = &group_result {
            if s.success() {
                return Ok(true);
            }
        }

        // Process group kill failed - try killing just the individual process
        // This is needed for processes not started by DevLaunch (e.g., from Ports monitor)
        let status = Command::new("kill")
            .args(["-TERM", &pid.to_string()])
            .status();

        match status {
            Ok(s) => Ok(s.success()),
            Err(e) => Err(format!("Failed to kill: {}", e)),
        }
    }

    #[cfg(windows)]
    {
        use std::process::Command;
        let status = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .status()
            .map_err(|e| format!("Failed to kill: {}", e))?;
        Ok(status.success())
    }
}

/// Kill all tracked processes
#[tauri::command]
pub async fn kill_all_processes() -> Result<u32, String> {
    let pids: Vec<u32> = {
        let registry = PROCESS_REGISTRY.lock().map_err(|e| e.to_string())?;
        registry.iter().copied().collect()
    };

    let mut killed = 0u32;
    for pid in pids {
        if kill_process_internal(pid).unwrap_or(false) {
            killed += 1;
        }
    }

    // Clear the registry
    if let Ok(mut registry) = PROCESS_REGISTRY.lock() {
        registry.clear();
    }

    Ok(killed)
}

/// Kill all tracked processes (internal non-async version for tray)
pub fn kill_all_processes_internal() -> Result<u32, String> {
    let pids: Vec<u32> = {
        let registry = PROCESS_REGISTRY.lock().map_err(|e| e.to_string())?;
        registry.iter().copied().collect()
    };

    let mut killed = 0u32;
    for pid in pids {
        if kill_process_internal(pid).unwrap_or(false) {
            killed += 1;
        }
    }

    // Clear the registry
    if let Ok(mut registry) = PROCESS_REGISTRY.lock() {
        registry.clear();
    }

    Ok(killed)
}

/// Get count of tracked running processes (internal non-async version for tray)
pub fn get_running_count_internal() -> u32 {
    PROCESS_REGISTRY
        .lock()
        .map(|r| r.len() as u32)
        .unwrap_or(0)
}

/// Get count of tracked running processes
#[tauri::command]
pub async fn get_running_count() -> Result<u32, String> {
    let registry = PROCESS_REGISTRY.lock().map_err(|e| e.to_string())?;
    Ok(registry.len() as u32)
}

/// Check if a process is still running
#[tauri::command]
pub async fn get_process_status(pid: u32) -> Result<ProcessStatus, String> {
    #[cfg(unix)]
    {
        use std::process::Command;
        let output = Command::new("kill")
            .args(["-0", &pid.to_string()])
            .output();

        match output {
            Ok(o) => Ok(ProcessStatus {
                running: o.status.success(),
                pid: Some(pid),
            }),
            Err(_) => Ok(ProcessStatus {
                running: false,
                pid: None,
            }),
        }
    }

    #[cfg(windows)]
    {
        use std::process::Command;
        let output = Command::new("tasklist")
            .args(["/FI", &format!("PID eq {}", pid)])
            .output()
            .map_err(|e| format!("Failed to check status: {}", e))?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        Ok(ProcessStatus {
            running: stdout.contains(&pid.to_string()),
            pid: Some(pid),
        })
    }
}

#[derive(Clone, Serialize)]
struct LogEvent {
    path: String,
    level: String,
    message: String,
}

#[derive(Clone, Serialize)]
struct UrlEvent {
    path: String,
    url: String,
    port: u16,
}

/// Detect URL or port from log message, returns (url, port) if found
fn detect_url(msg: &str) -> Option<(String, u16)> {
    // First try to match a full URL
    if let Some(caps) = URL_REGEX.captures(msg) {
        if let Some(url_match) = caps.get(0) {
            if let Some(port_match) = caps.get(1) {
                if let Ok(port) = port_match.as_str().parse::<u16>() {
                    return Some((url_match.as_str().to_string(), port));
                }
            }
        }
    }

    // Fall back to port-only detection
    if let Some(caps) = PORT_REGEX.captures(msg) {
        if let Some(port_match) = caps.get(1) {
            if let Ok(port) = port_match.as_str().parse::<u16>() {
                let url = format!("http://localhost:{}", port);
                return Some((url, port));
            }
        }
    }

    None
}

/// Simple heuristic to detect log level from message content
fn detect_log_level(msg: &str) -> String {
    let lower = msg.to_lowercase();
    if lower.contains("error") || lower.contains("[err]") {
        "error".to_string()
    } else if lower.contains("warn") || lower.contains("[wrn]") {
        "warn".to_string()
    } else if lower.contains("debug") || lower.contains("[dbg]") {
        "debug".to_string()
    } else {
        "info".to_string()
    }
}

#[derive(Debug, Serialize, Clone)]
pub struct PortInfo {
    pub port: u16,
    pub pid: u32,
    pub process_name: String,
    pub address: String,
    pub command: String,      // Full command with arguments
    pub uptime: String,       // How long the process has been running
    pub cpu_percent: f32,     // CPU usage percentage
    pub mem_percent: f32,     // Memory usage percentage
    pub user: String,         // User running the process
}

/// Get detailed process info using ps command
#[cfg(unix)]
fn get_process_details(pid: u32) -> (String, String, f32, f32, String) {
    use std::process::Command;

    // Get command, elapsed time, cpu, mem, and user
    let output = Command::new("ps")
        .args(["-p", &pid.to_string(), "-o", "args=,etime=,%cpu=,%mem=,user="])
        .output();

    match output {
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout);
            let line = stdout.trim();

            if line.is_empty() {
                return (String::new(), String::new(), 0.0, 0.0, String::new());
            }

            // Parse from the end since command can have spaces
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 4 {
                let user = parts[parts.len() - 1].to_string();
                let mem: f32 = parts[parts.len() - 2].parse().unwrap_or(0.0);
                let cpu: f32 = parts[parts.len() - 3].parse().unwrap_or(0.0);
                let etime = parts[parts.len() - 4].to_string();
                // Command is everything before the last 4 fields
                let cmd_parts = &parts[..parts.len().saturating_sub(4)];
                let command = cmd_parts.join(" ");

                (command, etime, cpu, mem, user)
            } else {
                (line.to_string(), String::new(), 0.0, 0.0, String::new())
            }
        }
        Err(_) => (String::new(), String::new(), 0.0, 0.0, String::new()),
    }
}

/// Scan for listening ports on the system
#[tauri::command]
pub async fn scan_ports() -> Result<Vec<PortInfo>, String> {
    #[cfg(unix)]
    {
        use std::process::Command;

        // Use lsof to find listening TCP ports
        let output = Command::new("lsof")
            .args(["-iTCP", "-sTCP:LISTEN", "-n", "-P"])
            .output()
            .map_err(|e| format!("Failed to run lsof: {}", e))?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut ports = Vec::new();

        for line in stdout.lines().skip(1) {
            // lsof output: COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 9 {
                let process_name = parts[0].to_string();
                let pid: u32 = parts[1].parse().unwrap_or(0);
                let user_from_lsof = parts[2].to_string();
                let name = parts[8]; // e.g., "*:3000" or "127.0.0.1:8080"

                // Parse the port from the NAME field
                if let Some(port_str) = name.rsplit(':').next() {
                    if let Ok(port) = port_str.parse::<u16>() {
                        // Extract address part
                        let address = name.replace(&format!(":{}", port), "");
                        let address = if address == "*" { "0.0.0.0".to_string() } else { address };

                        // Avoid duplicates
                        if !ports.iter().any(|p: &PortInfo| p.port == port && p.pid == pid) {
                            // Get additional process details
                            let (command, uptime, cpu_percent, mem_percent, user) =
                                get_process_details(pid);

                            ports.push(PortInfo {
                                port,
                                pid,
                                process_name,
                                address,
                                command,
                                uptime,
                                cpu_percent,
                                mem_percent,
                                user: if user.is_empty() { user_from_lsof } else { user },
                            });
                        }
                    }
                }
            }
        }

        // Sort by port number
        ports.sort_by_key(|p| p.port);
        Ok(ports)
    }

    #[cfg(windows)]
    {
        use std::process::Command;

        // Use netstat on Windows
        let output = Command::new("netstat")
            .args(["-ano", "-p", "TCP"])
            .output()
            .map_err(|e| format!("Failed to run netstat: {}", e))?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut ports = Vec::new();

        for line in stdout.lines() {
            if line.contains("LISTENING") {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() >= 5 {
                    // Local Address is typically parts[1], PID is last
                    let local_addr = parts[1];
                    let pid: u32 = parts.last().and_then(|s| s.parse().ok()).unwrap_or(0);

                    if let Some(port_str) = local_addr.rsplit(':').next() {
                        if let Ok(port) = port_str.parse::<u16>() {
                            let address = local_addr.replace(&format!(":{}", port), "");

                            if !ports.iter().any(|p: &PortInfo| p.port == port) {
                                ports.push(PortInfo {
                                    port,
                                    pid,
                                    process_name: format!("PID:{}", pid),
                                    address,
                                    command: String::new(),
                                    uptime: String::new(),
                                    cpu_percent: 0.0,
                                    mem_percent: 0.0,
                                    user: String::new(),
                                });
                            }
                        }
                    }
                }
            }
        }

        ports.sort_by_key(|p| p.port);
        Ok(ports)
    }
}
