use crate::config::GitToken;
use serde::{Deserialize, Serialize};
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatusResult {
    pub is_git_repo: bool,
    pub branch: Option<String>,
    pub remote: Option<String>,
    pub behind_count: u32,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitPullResult {
    pub success: bool,
    pub message: String,
    pub commits_pulled: u32,
}

/// Get the remote URL for a git repository
fn get_remote_url(path: &str) -> Option<String> {
    Command::new("git")
        .current_dir(path)
        .args(["remote", "get-url", "origin"])
        .output()
        .ok()
        .and_then(|o| {
            if o.status.success() {
                String::from_utf8(o.stdout).ok()
            } else {
                None
            }
        })
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

/// Match a URL against a pattern
/// Patterns support:
/// - "*" matches everything (fallback)
/// - "github.com/*" matches all github.com repos
/// - "github.com/org/*" matches all repos in an org
/// - "github.com/org/repo" matches a specific repo
fn pattern_matches(pattern: &str, url: &str) -> bool {
    if pattern == "*" {
        return true;
    }

    // Normalize URL - remove protocol and .git suffix
    let normalized_url = url
        .replace("https://", "")
        .replace("http://", "")
        .replace("git@", "")
        .replace(".git", "")
        .replace(":", "/"); // for SSH URLs like git@github.com:org/repo

    // Simple glob matching - pattern like "github.com/org/*"
    if pattern.ends_with("/*") {
        let prefix = &pattern[..pattern.len() - 1]; // remove the *
        normalized_url.starts_with(prefix)
    } else if pattern.contains('*') {
        // More complex patterns - basic glob support
        let parts: Vec<&str> = pattern.split('*').collect();
        if parts.len() == 2 {
            normalized_url.starts_with(parts[0]) && normalized_url.ends_with(parts[1])
        } else {
            // Fallback to contains for the first part
            normalized_url.contains(parts[0])
        }
    } else {
        // Exact match (without protocol/suffix)
        normalized_url == pattern || normalized_url.contains(pattern)
    }
}

/// Find the best matching token for a remote URL
fn find_matching_token<'a>(remote_url: &str, tokens: &'a [GitToken]) -> Option<&'a str> {
    // First try to find a specific match (non-wildcard patterns first)
    for token in tokens.iter().filter(|t| t.pattern != "*") {
        if pattern_matches(&token.pattern, remote_url) {
            return Some(&token.token);
        }
    }
    // Then fall back to wildcard if exists
    for token in tokens.iter().filter(|t| t.pattern == "*") {
        return Some(&token.token);
    }
    None
}

/// Internal fetch function - handles authentication via token
fn git_fetch_internal(path: &str, token: Option<&str>) -> Result<(), String> {
    let mut cmd = Command::new("git");
    cmd.current_dir(path);

    // If token provided, use it for authentication
    // This works for GitHub/GitLab with PATs
    if let Some(t) = token {
        // Use credential helper approach
        cmd.env("GIT_ASKPASS", "/bin/echo");
        cmd.env("GIT_TERMINAL_PROMPT", "0");
        // For HTTPS repos, set credentials in the URL isn't ideal
        // Instead, use the GIT_CREDENTIAL environment
        cmd.env("GIT_USERNAME", "x-access-token");
        cmd.env("GIT_PASSWORD", t);
    } else {
        // Disable prompts for non-authenticated requests
        cmd.env("GIT_TERMINAL_PROMPT", "0");
    }

    cmd.args(["fetch", "--quiet"]);

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to run git fetch: {}", e))?;

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if stderr.contains("Authentication")
            || stderr.contains("could not read Username")
            || stderr.contains("terminal prompts disabled")
        {
            Err("Authentication required. Add a Git token in Preferences.".to_string())
        } else if stderr.is_empty() {
            // Sometimes fetch fails silently (e.g., no network)
            Ok(()) // Treat as success - we just won't have updated refs
        } else {
            Err(format!("Fetch failed: {}", stderr.trim()))
        }
    }
}

/// Check git status for a project directory
#[tauri::command]
pub async fn git_status(path: String, tokens: Vec<GitToken>) -> Result<GitStatusResult, String> {
    // 1. Check if it's a git repo
    let is_repo = Command::new("git")
        .current_dir(&path)
        .args(["rev-parse", "--is-inside-work-tree"])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);

    if !is_repo {
        return Ok(GitStatusResult {
            is_git_repo: false,
            branch: None,
            remote: None,
            behind_count: 0,
            error: None,
        });
    }

    // 2. Get current branch
    let branch = Command::new("git")
        .current_dir(&path)
        .args(["rev-parse", "--abbrev-ref", "HEAD"])
        .output()
        .ok()
        .and_then(|o| {
            if o.status.success() {
                String::from_utf8(o.stdout).ok()
            } else {
                None
            }
        })
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty() && s != "HEAD"); // HEAD means detached state

    // 3. Get remote name (usually "origin")
    let remote = Command::new("git")
        .current_dir(&path)
        .args(["remote"])
        .output()
        .ok()
        .and_then(|o| {
            if o.status.success() {
                String::from_utf8(o.stdout).ok()
            } else {
                None
            }
        })
        .and_then(|s| s.lines().next().map(|l| l.trim().to_string()))
        .filter(|s| !s.is_empty());

    // 4. If no remote, we can't check behind count
    if remote.is_none() {
        return Ok(GitStatusResult {
            is_git_repo: true,
            branch,
            remote: None,
            behind_count: 0,
            error: None,
        });
    }

    // 5. Find matching token based on remote URL
    let remote_url = get_remote_url(&path);
    let token = remote_url
        .as_ref()
        .and_then(|url| find_matching_token(url, &tokens));

    // 6. Fetch from remote (with optional token for auth)
    let fetch_error = match git_fetch_internal(&path, token) {
        Ok(()) => None,
        Err(e) => Some(e),
    };

    // 6. Count commits behind (even if fetch failed, use cached refs)
    let behind_count = if let (Some(ref b), Some(ref r)) = (&branch, &remote) {
        let remote_branch = format!("{}/{}", r, b);
        Command::new("git")
            .current_dir(&path)
            .args(["rev-list", "--count", &format!("HEAD..{}", remote_branch)])
            .output()
            .ok()
            .and_then(|o| {
                if o.status.success() {
                    String::from_utf8(o.stdout).ok()
                } else {
                    None
                }
            })
            .and_then(|s| s.trim().parse::<u32>().ok())
            .unwrap_or(0)
    } else {
        0
    };

    Ok(GitStatusResult {
        is_git_repo: true,
        branch,
        remote,
        behind_count,
        error: fetch_error,
    })
}

/// Pull updates from remote
#[tauri::command]
pub async fn git_pull(path: String, tokens: Vec<GitToken>) -> Result<GitPullResult, String> {
    // First, check if there are uncommitted changes
    let status_output = Command::new("git")
        .current_dir(&path)
        .args(["status", "--porcelain"])
        .output()
        .map_err(|e| format!("Failed to check status: {}", e))?;

    let status = String::from_utf8_lossy(&status_output.stdout);
    if !status.trim().is_empty() {
        return Ok(GitPullResult {
            success: false,
            message: "Cannot pull: uncommitted changes exist. Please commit or stash your changes first.".to_string(),
            commits_pulled: 0,
        });
    }

    // Get current HEAD before pull
    let before_head = Command::new("git")
        .current_dir(&path)
        .args(["rev-parse", "HEAD"])
        .output()
        .ok()
        .and_then(|o| {
            if o.status.success() {
                String::from_utf8(o.stdout).ok()
            } else {
                None
            }
        })
        .map(|s| s.trim().to_string());

    // Find matching token based on remote URL
    let remote_url = get_remote_url(&path);
    let token = remote_url
        .as_ref()
        .and_then(|url| find_matching_token(url, &tokens));

    // Perform pull
    let mut cmd = Command::new("git");
    cmd.current_dir(&path);

    if let Some(t) = token {
        cmd.env("GIT_ASKPASS", "/bin/echo");
        cmd.env("GIT_TERMINAL_PROMPT", "0");
        cmd.env("GIT_USERNAME", "x-access-token");
        cmd.env("GIT_PASSWORD", t);
    } else {
        cmd.env("GIT_TERMINAL_PROMPT", "0");
    }

    cmd.args(["pull", "--ff-only"]);

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to run git pull: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Ok(GitPullResult {
            success: false,
            message: if stderr.contains("Not possible to fast-forward") {
                "Cannot fast-forward. You may have local commits that diverge from remote.".to_string()
            } else if stderr.contains("Authentication") || stderr.contains("terminal prompts disabled") {
                "Authentication required. Add a Git token in Preferences.".to_string()
            } else {
                stderr.trim().to_string()
            },
            commits_pulled: 0,
        });
    }

    // Count pulled commits
    let commits_pulled = if let Some(before) = before_head {
        Command::new("git")
            .current_dir(&path)
            .args(["rev-list", "--count", &format!("{}..HEAD", before)])
            .output()
            .ok()
            .and_then(|o| {
                if o.status.success() {
                    String::from_utf8(o.stdout).ok()
                } else {
                    None
                }
            })
            .and_then(|s| s.trim().parse::<u32>().ok())
            .unwrap_or(0)
    } else {
        0
    };

    Ok(GitPullResult {
        success: true,
        message: if commits_pulled > 0 {
            format!("Successfully pulled {} commit(s)", commits_pulled)
        } else {
            "Already up to date".to_string()
        },
        commits_pulled,
    })
}
