use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PresetProject {
    pub path: String,
    pub script: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Preset {
    pub id: String,
    pub name: String,
    pub projects: Vec<PresetProject>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LastSession {
    pub running_projects: Vec<PresetProject>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct WindowState {
    pub width: u32,
    pub height: u32,
    pub x: i32,
    pub y: i32,
    pub maximized: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitToken {
    pub id: String,
    pub pattern: String,
    pub token: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitPreferences {
    #[serde(default = "default_git_enabled")]
    pub enabled: bool,
    #[serde(default = "default_polling_interval")]
    pub polling_interval_minutes: u32,
    #[serde(default)]
    pub tokens: Vec<GitToken>,
    // Legacy field for migration - read old configs but don't write
    #[serde(skip_serializing, default)]
    git_token: Option<String>,
}

impl Default for GitPreferences {
    fn default() -> Self {
        Self {
            enabled: default_git_enabled(),
            polling_interval_minutes: default_polling_interval(),
            tokens: Vec::new(),
            git_token: None,
        }
    }
}

impl GitPreferences {
    /// Migrate legacy single git_token to tokens array
    pub fn migrate_legacy_token(&mut self) {
        if let Some(token) = self.git_token.take() {
            if !token.is_empty() && self.tokens.is_empty() {
                self.tokens.push(GitToken {
                    id: uuid::Uuid::new_v4().to_string(),
                    pattern: "*".to_string(),
                    token,
                    label: Some("Migrated token".to_string()),
                });
            }
        }
    }
}

fn default_git_enabled() -> bool {
    true
}

fn default_polling_interval() -> u32 {
    10
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Preferences {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ngrok_auth_token: Option<String>,
    #[serde(default = "default_webhook_port")]
    pub default_webhook_port: u16,
    #[serde(default)]
    pub git: GitPreferences,
}

fn default_webhook_port() -> u16 {
    3456
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    pub watched_dirs: Vec<String>,
    pub presets: Vec<Preset>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_session: Option<LastSession>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub window_state: Option<WindowState>,
    #[serde(default)]
    pub preferences: Preferences,
}

fn get_config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    // Ensure directory exists
    fs::create_dir_all(&app_data_dir)
        .map_err(|e| format!("Failed to create app data dir: {}", e))?;

    Ok(app_data_dir.join("config.json"))
}

#[tauri::command]
pub fn load_config(app: AppHandle) -> Result<AppConfig, String> {
    let config_path = get_config_path(&app)?;

    if !config_path.exists() {
        return Ok(AppConfig::default());
    }

    let content = fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read config: {}", e))?;

    let mut config: AppConfig = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse config: {}", e))?;

    // Migrate legacy single git_token to tokens array
    config.preferences.git.migrate_legacy_token();

    Ok(config)
}

#[tauri::command]
pub fn save_config(app: AppHandle, config: AppConfig) -> Result<(), String> {
    let config_path = get_config_path(&app)?;

    let content = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;

    fs::write(&config_path, content)
        .map_err(|e| format!("Failed to write config: {}", e))?;

    Ok(())
}

#[tauri::command]
pub fn get_config_path_string(app: AppHandle) -> Result<String, String> {
    let path = get_config_path(&app)?;
    Ok(path.to_string_lossy().to_string())
}
