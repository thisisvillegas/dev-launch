mod config;
mod git;
mod process;
mod system;
mod webhook_server;

use tauri::{
    image::Image,
    menu::{AboutMetadata, Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, WindowEvent,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            // Create app menu (macOS menu bar)
            let about = PredefinedMenuItem::about(
                app,
                Some("About DevLaunch"),
                Some(AboutMetadata {
                    version: Some(env!("CARGO_PKG_VERSION").to_string()),
                    authors: Some(vec!["Andres".to_string()]),
                    comments: Some("Dev Server Manager - Start and manage your local development servers".to_string()),
                    ..Default::default()
                }),
            )?;
            let preferences_item = MenuItem::with_id(app, "preferences", "Preferences...", true, Some("CmdOrCtrl+,"))?;
            let separator = PredefinedMenuItem::separator(app)?;
            let quit_item = PredefinedMenuItem::quit(app, Some("Quit DevLaunch"))?;
            
            let app_menu = Submenu::with_items(
                app,
                "DevLaunch",
                true,
                &[&about, &preferences_item, &separator, &quit_item],
            )?;
            
            let edit_menu = Submenu::with_items(
                app,
                "Edit",
                true,
                &[
                    &PredefinedMenuItem::undo(app, None)?,
                    &PredefinedMenuItem::redo(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::cut(app, None)?,
                    &PredefinedMenuItem::copy(app, None)?,
                    &PredefinedMenuItem::paste(app, None)?,
                    &PredefinedMenuItem::select_all(app, None)?,
                ],
            )?;
            
            let window_menu = Submenu::with_items(
                app,
                "Window",
                true,
                &[
                    &PredefinedMenuItem::minimize(app, None)?,
                    &PredefinedMenuItem::maximize(app, None)?,
                    &PredefinedMenuItem::close_window(app, None)?,
                ],
            )?;
            
            let menu = Menu::with_items(app, &[&app_menu, &edit_menu, &window_menu])?;
            app.set_menu(menu)?;
            
            // Handle app menu events
            app.on_menu_event(|app_handle, event| {
                if event.id().as_ref() == "preferences" {
                    // Emit event to frontend to open preferences modal
                    let _ = app_handle.emit("open-preferences", ());
                }
            });

            // Create tray menu
            let tray_quit = MenuItem::with_id(app, "quit", "Quit DevLaunch", true, None::<&str>)?;
            let tray_show = MenuItem::with_id(app, "show", "Show Window", true, None::<&str>)?;
            let tray_hide = MenuItem::with_id(app, "hide", "Hide Window", true, None::<&str>)?;
            let tray_sep = MenuItem::with_id(app, "sep", "─────────────", false, None::<&str>)?;

            let tray_menu = Menu::with_items(app, &[&tray_show, &tray_hide, &tray_sep, &tray_quit])?;

            // Use the app icon for the tray
            let icon = Image::from_bytes(include_bytes!("../icons/32x32.png"))
                .expect("Failed to load tray icon");

            let _tray = TrayIconBuilder::new()
                .icon(icon)
                .menu(&tray_menu)
                .show_menu_on_left_click(false)
                .tooltip("DevLaunch")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => {
                        // Kill all processes before quitting
                        let _ = process::kill_all_processes_internal();
                        app.exit(0);
                    }
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "hide" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.hide();
                        }
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            // Handle window close - hide instead of quit
            let main_window = app.get_webview_window("main").unwrap();
            let app_handle = app.handle().clone();

            main_window.on_window_event(move |event| {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    // Check if there are running processes
                    let count = process::get_running_count_internal();
                    if count > 0 {
                        // Let the frontend handle the quit dialog
                        // Don't prevent close here - it's handled in App.tsx
                    } else {
                        // No running processes - hide to tray instead of quitting
                        if let Some(window) = app_handle.get_webview_window("main") {
                            api.prevent_close();
                            let _ = window.hide();
                        }
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            process::spawn_process,
            process::kill_process,
            process::kill_all_processes,
            process::get_running_count,
            process::get_process_status,
            process::scan_ports,
            system::get_system_info,
            system::get_top_processes,
            config::load_config,
            config::save_config,
            config::get_config_path_string,
            webhook_server::start_webhook_server,
            webhook_server::stop_webhook_server,
            webhook_server::get_webhook_events,
            webhook_server::clear_webhook_events,
            webhook_server::get_webhook_server_status,
            webhook_server::start_ngrok,
            webhook_server::stop_ngrok,
            webhook_server::get_ngrok_status,
            webhook_server::set_ngrok_auth_token,
            git::git_status,
            git::git_pull,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
