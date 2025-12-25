use serde::Serialize;
use std::process::Command;

#[derive(Debug, Serialize, Clone)]
pub struct ProcessInfo {
    pub pid: u32,
    pub name: String,
    pub command: String,
    pub cpu_percent: f32,
    pub memory_mb: f32,
    pub memory_percent: f32,
    pub vsz_mb: f32,
    pub private_mb: f32,
    pub shared_mb: f32,
    pub user: String,
    pub state: String,
    pub elapsed: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct SystemInfo {
    pub cpu: CpuInfo,
    pub memory: MemoryInfo,
    pub disk: DiskInfo,
    pub gpu: Option<GpuInfo>,
    pub uptime: String,
    pub load_average: Vec<f32>,
}

#[derive(Debug, Serialize, Clone)]
pub struct CpuInfo {
    pub usage_percent: f32,
    pub user_percent: f32,
    pub system_percent: f32,
    pub idle_percent: f32,
    pub core_count: u32,
    pub model: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct MemoryInfo {
    pub total_gb: f32,
    pub used_gb: f32,
    pub free_gb: f32,
    pub usage_percent: f32,
    pub app_memory_gb: f32,
    pub wired_memory_gb: f32,
    pub compressed_gb: f32,
    pub cached_files_gb: f32,
    pub memory_pressure: String,
    pub swap_total_gb: f32,
    pub swap_used_gb: f32,
}

#[derive(Debug, Serialize, Clone)]
pub struct DiskInfo {
    pub total_gb: f32,
    pub used_gb: f32,
    pub free_gb: f32,
    pub usage_percent: f32,
}

#[derive(Debug, Serialize, Clone)]
pub struct GpuInfo {
    pub name: String,
    pub vendor: String,
    pub vram_mb: Option<u32>,
}

/// Get comprehensive system information
#[tauri::command]
pub async fn get_system_info() -> Result<SystemInfo, String> {
    #[cfg(target_os = "macos")]
    {
        let cpu = get_cpu_info_macos()?;
        let memory = get_memory_info_macos()?;
        let disk = get_disk_info_macos()?;
        let gpu = get_gpu_info_macos().ok();
        let uptime = get_uptime_macos()?;
        let load_average = get_load_average_macos()?;

        Ok(SystemInfo {
            cpu,
            memory,
            disk,
            gpu,
            uptime,
            load_average,
        })
    }

    #[cfg(not(target_os = "macos"))]
    {
        Err("System monitoring only supported on macOS".to_string())
    }
}

#[cfg(target_os = "macos")]
fn get_cpu_info_macos() -> Result<CpuInfo, String> {
    // Get CPU model
    let model_output = Command::new("sysctl")
        .args(["-n", "machdep.cpu.brand_string"])
        .output()
        .map_err(|e| e.to_string())?;
    let model = String::from_utf8_lossy(&model_output.stdout).trim().to_string();

    // Get core count
    let cores_output = Command::new("sysctl")
        .args(["-n", "hw.ncpu"])
        .output()
        .map_err(|e| e.to_string())?;
    let core_count: u32 = String::from_utf8_lossy(&cores_output.stdout)
        .trim()
        .parse()
        .unwrap_or(1);

    // Get CPU usage from top
    let top_output = Command::new("top")
        .args(["-l", "1", "-n", "0", "-stats", "cpu"])
        .output()
        .map_err(|e| e.to_string())?;
    let top_str = String::from_utf8_lossy(&top_output.stdout);

    let mut user_percent = 0.0f32;
    let mut system_percent = 0.0f32;
    let mut idle_percent = 100.0f32;

    for line in top_str.lines() {
        if line.contains("CPU usage:") {
            // Parse "CPU usage: 5.26% user, 10.52% sys, 84.21% idle"
            let parts: Vec<&str> = line.split(',').collect();
            for part in parts {
                let trimmed = part.trim();
                if trimmed.contains("user") {
                    if let Some(val) = trimmed.split('%').next() {
                        user_percent = val.split_whitespace().last()
                            .and_then(|s| s.parse().ok())
                            .unwrap_or(0.0);
                    }
                } else if trimmed.contains("sys") {
                    if let Some(val) = trimmed.split('%').next() {
                        system_percent = val.split_whitespace().last()
                            .and_then(|s| s.parse().ok())
                            .unwrap_or(0.0);
                    }
                } else if trimmed.contains("idle") {
                    if let Some(val) = trimmed.split('%').next() {
                        idle_percent = val.split_whitespace().last()
                            .and_then(|s| s.parse().ok())
                            .unwrap_or(100.0);
                    }
                }
            }
            break;
        }
    }

    Ok(CpuInfo {
        usage_percent: user_percent + system_percent,
        user_percent,
        system_percent,
        idle_percent,
        core_count,
        model,
    })
}

#[cfg(target_os = "macos")]
fn get_memory_info_macos() -> Result<MemoryInfo, String> {
    // Get total memory
    let total_output = Command::new("sysctl")
        .args(["-n", "hw.memsize"])
        .output()
        .map_err(|e| e.to_string())?;
    let total_bytes: u64 = String::from_utf8_lossy(&total_output.stdout)
        .trim()
        .parse()
        .unwrap_or(0);
    let total_gb = total_bytes as f32 / 1024.0 / 1024.0 / 1024.0;

    // Get memory stats from vm_stat
    let vm_output = Command::new("vm_stat")
        .output()
        .map_err(|e| e.to_string())?;
    let vm_str = String::from_utf8_lossy(&vm_output.stdout);

    let page_size: u64 = 16384; // macOS page size
    let mut pages_free: u64 = 0;
    let mut pages_active: u64 = 0;
    let mut pages_inactive: u64 = 0;
    let mut pages_wired: u64 = 0;
    let mut pages_compressed: u64 = 0;
    let mut pages_file_backed: u64 = 0;
    let mut _pages_purgeable: u64 = 0;
    let mut _pages_speculative: u64 = 0;

    for line in vm_str.lines() {
        let parts: Vec<&str> = line.split(':').collect();
        if parts.len() == 2 {
            let value: u64 = parts[1].trim().trim_end_matches('.').parse().unwrap_or(0);
            let key = parts[0].trim();
            match key {
                "Pages free" => pages_free = value,
                "Pages active" => pages_active = value,
                "Pages inactive" => pages_inactive = value,
                "Pages wired down" => pages_wired = value,
                "Pages stored in compressor" => pages_compressed = value,
                "File-backed pages" => pages_file_backed = value,
                "Pages purgeable" => _pages_purgeable = value,
                "Pages speculative" => _pages_speculative = value,
                _ => {}
            }
        }
    }

    let free_bytes = pages_free * page_size;
    let app_bytes = (pages_active + pages_inactive) * page_size;
    let wired_bytes = pages_wired * page_size;
    let compressed_bytes = pages_compressed * page_size;
    let cached_bytes = pages_file_backed * page_size;
    let used_bytes = total_bytes - free_bytes;

    let free_gb = free_bytes as f32 / 1024.0 / 1024.0 / 1024.0;
    let used_gb = used_bytes as f32 / 1024.0 / 1024.0 / 1024.0;
    let app_memory_gb = app_bytes as f32 / 1024.0 / 1024.0 / 1024.0;
    let wired_memory_gb = wired_bytes as f32 / 1024.0 / 1024.0 / 1024.0;
    let compressed_gb = compressed_bytes as f32 / 1024.0 / 1024.0 / 1024.0;
    let cached_files_gb = cached_bytes as f32 / 1024.0 / 1024.0 / 1024.0;

    // Get swap usage from sysctl
    // Output format: "vm.swapusage: total = 2048.00M  used = 512.00M  free = 1536.00M"
    let swap_output = Command::new("sysctl")
        .args(["vm.swapusage"])
        .output()
        .map_err(|e| e.to_string())?;
    let swap_str = String::from_utf8_lossy(&swap_output.stdout);

    let mut swap_total_gb: f32 = 0.0;
    let mut swap_used_gb: f32 = 0.0;

    // Parse swap values
    for part in swap_str.split_whitespace() {
        if part.ends_with('M') {
            let val: f32 = part.trim_end_matches('M').parse().unwrap_or(0.0);
            // Determine which field this is by checking what came before
            if swap_str.contains(&format!("total = {}", part)) {
                swap_total_gb = val / 1024.0;
            } else if swap_str.contains(&format!("used = {}", part)) {
                swap_used_gb = val / 1024.0;
            }
        } else if part.ends_with('G') {
            let val: f32 = part.trim_end_matches('G').parse().unwrap_or(0.0);
            if swap_str.contains(&format!("total = {}", part)) {
                swap_total_gb = val;
            } else if swap_str.contains(&format!("used = {}", part)) {
                swap_used_gb = val;
            }
        }
    }

    // Calculate memory pressure based on macOS heuristics
    // Low: plenty of free + purgeable memory
    // Medium: using compressed memory significantly
    // High: very low free memory, heavy compression, or using swap
    let memory_pressure = if swap_used_gb > 0.1 || free_gb < 0.5 || compressed_gb > 4.0 {
        "high".to_string()
    } else if free_gb < 1.5 || compressed_gb > 2.0 {
        "medium".to_string()
    } else {
        "low".to_string()
    };

    Ok(MemoryInfo {
        total_gb,
        used_gb,
        free_gb,
        usage_percent: (used_gb / total_gb) * 100.0,
        app_memory_gb,
        wired_memory_gb,
        compressed_gb,
        cached_files_gb,
        memory_pressure,
        swap_total_gb,
        swap_used_gb,
    })
}

#[cfg(target_os = "macos")]
fn get_disk_info_macos() -> Result<DiskInfo, String> {
    let output = Command::new("df")
        .args(["-h", "/"])
        .output()
        .map_err(|e| e.to_string())?;
    let df_str = String::from_utf8_lossy(&output.stdout);

    // Parse df output: Filesystem Size Used Avail Capacity
    for line in df_str.lines().skip(1) {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 5 {
            let total_str = parts[1];
            let used_str = parts[2];
            let avail_str = parts[3];
            let capacity_str = parts[4];

            let parse_size = |s: &str| -> f32 {
                let s = s.trim();
                if s.ends_with("Gi") || s.ends_with("G") {
                    s.trim_end_matches("Gi").trim_end_matches('G').parse().unwrap_or(0.0)
                } else if s.ends_with("Ti") || s.ends_with("T") {
                    s.trim_end_matches("Ti").trim_end_matches('T').parse::<f32>().unwrap_or(0.0) * 1024.0
                } else if s.ends_with("Mi") || s.ends_with("M") {
                    s.trim_end_matches("Mi").trim_end_matches('M').parse::<f32>().unwrap_or(0.0) / 1024.0
                } else {
                    0.0
                }
            };

            let total_gb = parse_size(total_str);
            let used_gb = parse_size(used_str);
            let free_gb = parse_size(avail_str);
            let usage_percent: f32 = capacity_str
                .trim_end_matches('%')
                .parse()
                .unwrap_or(0.0);

            return Ok(DiskInfo {
                total_gb,
                used_gb,
                free_gb,
                usage_percent,
            });
        }
    }

    Err("Could not parse disk info".to_string())
}

#[cfg(target_os = "macos")]
fn get_gpu_info_macos() -> Result<GpuInfo, String> {
    let output = Command::new("system_profiler")
        .args(["SPDisplaysDataType", "-json"])
        .output()
        .map_err(|e| e.to_string())?;

    let json_str = String::from_utf8_lossy(&output.stdout);

    // Simple JSON parsing for GPU info
    let mut name = String::new();
    let mut vendor = String::new();
    let mut vram_mb: Option<u32> = None;

    // Look for chipset_model or device_name
    for line in json_str.lines() {
        let line = line.trim();
        if line.contains("\"sppci_model\"") || line.contains("\"chipset_model\"") {
            if let Some(val) = extract_json_string(line) {
                name = val;
            }
        } else if line.contains("\"spdisplays_vendor\"") || line.contains("\"vendor\"") {
            if let Some(val) = extract_json_string(line) {
                vendor = val;
            }
        } else if line.contains("\"spdisplays_vram\"") || line.contains("\"vram\"") {
            if let Some(val) = extract_json_string(line) {
                // Parse VRAM like "8 GB" or "8192 MB"
                let val = val.to_uppercase();
                if val.contains("GB") {
                    if let Ok(gb) = val.replace("GB", "").trim().parse::<u32>() {
                        vram_mb = Some(gb * 1024);
                    }
                } else if val.contains("MB") {
                    if let Ok(mb) = val.replace("MB", "").trim().parse::<u32>() {
                        vram_mb = Some(mb);
                    }
                }
            }
        }
    }

    if name.is_empty() {
        return Err("No GPU found".to_string());
    }

    Ok(GpuInfo {
        name,
        vendor,
        vram_mb,
    })
}

fn extract_json_string(line: &str) -> Option<String> {
    // Extract value from JSON like: "key" : "value"
    let parts: Vec<&str> = line.splitn(2, ':').collect();
    if parts.len() == 2 {
        let value = parts[1].trim().trim_matches(',').trim_matches('"');
        if !value.is_empty() {
            return Some(value.to_string());
        }
    }
    None
}

#[cfg(target_os = "macos")]
fn get_uptime_macos() -> Result<String, String> {
    let output = Command::new("uptime")
        .output()
        .map_err(|e| e.to_string())?;
    let uptime_str = String::from_utf8_lossy(&output.stdout);

    // Parse uptime like "12:34  up 5 days,  3:42, 4 users"
    // Extract the "up X days, Y:ZZ" part
    if let Some(up_idx) = uptime_str.find("up ") {
        let after_up = &uptime_str[up_idx + 3..];
        if let Some(users_idx) = after_up.find(" user") {
            let uptime_part = after_up[..users_idx].trim();
            // Remove trailing comma and numbers
            let uptime_clean = uptime_part.rsplit(',').skip(1).collect::<Vec<_>>()
                .into_iter().rev().collect::<Vec<_>>().join(",");
            let uptime_clean = if uptime_clean.is_empty() { uptime_part.to_string() } else { uptime_clean };
            return Ok(uptime_clean.trim_end_matches(',').trim().to_string());
        }
    }

    Ok("Unknown".to_string())
}

#[cfg(target_os = "macos")]
fn get_load_average_macos() -> Result<Vec<f32>, String> {
    let output = Command::new("sysctl")
        .args(["-n", "vm.loadavg"])
        .output()
        .map_err(|e| e.to_string())?;
    let load_str = String::from_utf8_lossy(&output.stdout);

    // Parse "{ 1.23 4.56 7.89 }"
    let load_str = load_str.trim().trim_matches(|c| c == '{' || c == '}');
    let loads: Vec<f32> = load_str
        .split_whitespace()
        .filter_map(|s| s.parse().ok())
        .collect();

    Ok(loads)
}

/// Get top processes by memory usage
#[tauri::command]
pub async fn get_top_processes(limit: Option<u32>) -> Result<Vec<ProcessInfo>, String> {
    #[cfg(target_os = "macos")]
    {
        get_top_processes_macos(limit.unwrap_or(15))
    }

    #[cfg(not(target_os = "macos"))]
    {
        Err("Process monitoring only supported on macOS".to_string())
    }
}

#[cfg(target_os = "macos")]
fn get_top_processes_macos(limit: u32) -> Result<Vec<ProcessInfo>, String> {
    // Use ps to get detailed process info
    // Format: pid, cpu%, mem%, rss (KB), vsz (KB), rprvt (private bytes), rshrd (shared bytes), user, state, elapsed time, command with args
    let output = Command::new("ps")
        .args(["-A", "-o", "pid=,pcpu=,pmem=,rss=,vsz=,rprvt=,rshrd=,user=,state=,etime=,args=", "-r"])
        .output()
        .map_err(|e| e.to_string())?;

    let ps_str = String::from_utf8_lossy(&output.stdout);
    let mut processes: Vec<ProcessInfo> = Vec::new();

    for line in ps_str.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        // Use split_whitespace to properly handle multiple consecutive spaces
        let fields: Vec<&str> = line.split_whitespace().collect();

        if fields.len() >= 11 {
            let pid: u32 = fields[0].parse().unwrap_or(0);
            let cpu_percent: f32 = fields[1].parse().unwrap_or(0.0);
            let memory_percent: f32 = fields[2].parse().unwrap_or(0.0);
            let rss_kb: f32 = fields[3].parse().unwrap_or(0.0);
            let vsz_kb: f32 = fields[4].parse().unwrap_or(0.0);
            // rprvt and rshrd are in bytes, parse with suffix handling
            let private_bytes = parse_memory_value(fields[5]);
            let shared_bytes = parse_memory_value(fields[6]);
            let user = fields[7].to_string();
            let state = fields[8].to_string();
            let elapsed = fields[9].to_string();
            // Command is everything from field 10 onwards, joined back together
            let command = fields[10..].join(" ");

            let memory_mb = rss_kb / 1024.0;
            let vsz_mb = vsz_kb / 1024.0;
            let private_mb = private_bytes / 1024.0 / 1024.0;
            let shared_mb = shared_bytes / 1024.0 / 1024.0;

            // Extract just the executable name from the full path
            let name = command
                .split('/')
                .last()
                .unwrap_or(&command)
                .split_whitespace()
                .next()
                .unwrap_or(&command)
                .to_string();

            // Skip kernel processes and very small processes
            if pid > 0 && (cpu_percent > 0.0 || memory_mb > 10.0) {
                processes.push(ProcessInfo {
                    pid,
                    name,
                    command,
                    cpu_percent,
                    memory_mb,
                    memory_percent,
                    vsz_mb,
                    private_mb,
                    shared_mb,
                    user,
                    state,
                    elapsed,
                });
            }
        }

        if processes.len() >= (limit * 2) as usize {
            // Collect more than needed, we'll sort and trim later
            break;
        }
    }

    // Sort by memory (descending)
    processes.sort_by(|a, b| b.memory_mb.partial_cmp(&a.memory_mb).unwrap_or(std::cmp::Ordering::Equal));

    Ok(processes.into_iter().take(limit as usize).collect())
}

/// Parse memory values that may have suffixes like K, M, G
fn parse_memory_value(s: &str) -> f32 {
    let s = s.trim();
    if s.ends_with('K') || s.ends_with('k') {
        s[..s.len()-1].parse::<f32>().unwrap_or(0.0) * 1024.0
    } else if s.ends_with('M') || s.ends_with('m') {
        s[..s.len()-1].parse::<f32>().unwrap_or(0.0) * 1024.0 * 1024.0
    } else if s.ends_with('G') || s.ends_with('g') {
        s[..s.len()-1].parse::<f32>().unwrap_or(0.0) * 1024.0 * 1024.0 * 1024.0
    } else if s.ends_with('B') || s.ends_with('b') {
        // Handle "123B" format
        s[..s.len()-1].parse::<f32>().unwrap_or(0.0)
    } else {
        // Assume bytes
        s.parse::<f32>().unwrap_or(0.0)
    }
}
