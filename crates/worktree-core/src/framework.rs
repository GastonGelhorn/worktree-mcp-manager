use crate::WorktreeError;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Debug, Serialize, Deserialize)]
pub struct FrameworkInfo {
    pub is_laravel: bool,
    pub has_composer: bool,
}

pub fn check_framework(path: &str) -> Result<FrameworkInfo, WorktreeError> {
    let base_path = Path::new(path);

    let has_artisan = base_path.join("artisan").exists();
    let composer_path = base_path.join("composer.json");
    let has_composer = composer_path.exists();

    let mut is_laravel = has_artisan;

    if !is_laravel && has_composer {
        if let Ok(content) = fs::read_to_string(&composer_path) {
            if content.contains("\"laravel/framework\"") {
                is_laravel = true;
            }
        }
    }

    Ok(FrameworkInfo {
        is_laravel,
        has_composer,
    })
}

pub fn apply_laravel_optimizations(
    path: &str,
    new_db_name: Option<String>,
    assign_vite_port: bool,
    clone_db: bool,
) -> Result<(), WorktreeError> {
    let base_path = Path::new(path);
    let env_path = base_path.join(".env");

    if !env_path.exists() {
        return Ok(());
    }

    let mut env_content = fs::read_to_string(&env_path).unwrap_or_default();
    let mut modified = false;

    if let Some(db_name) = new_db_name {
        let mut original_db_name = String::new();
        let mut db_connection = String::from("mysql");

        let lines: Vec<&str> = env_content.lines().collect();
        let mut new_lines = Vec::new();

        for line in &lines {
            if line.starts_with("DB_DATABASE=") {
                original_db_name = line.strip_prefix("DB_DATABASE=").unwrap_or("").trim().to_string();
                new_lines.push(format!("DB_DATABASE={}", db_name));
                modified = true;
            } else if line.starts_with("DB_CONNECTION=") {
                db_connection = line.strip_prefix("DB_CONNECTION=").unwrap_or("").trim().to_string();
                new_lines.push(line.to_string());
            } else {
                new_lines.push(line.to_string());
            }
        }
        env_content = new_lines.join("\n");

        if db_connection == "sqlite" {
            // For SQLite, DB_DATABASE usually points to a file, often database/database.sqlite if not absolute
            let mut original_sqlite_path = Path::new(&original_db_name).to_path_buf();
            // If it's a relative path like database/database.sqlite or just database.sqlite, resolve it relative to base
            // But the original file is in the *new* worktree (because .env was copied or git checked out).
            // Actually, if it's an absolute path, we might be writing over it! Laravel 11 often uses relative paths.
            if !original_sqlite_path.is_absolute() {
                original_sqlite_path = base_path.join(&original_sqlite_path);
            }

            let new_sqlite_path = base_path.join(format!("database/{}.sqlite", db_name));
            
            if clone_db && original_sqlite_path.exists() {
                fs::copy(&original_sqlite_path, &new_sqlite_path).map_err(|e| WorktreeError::Io {
                    message: format!("Failed to clone SQLite database: {}", e),
                })?;
            } else {
                // Just create an empty file
                fs::File::create(&new_sqlite_path).map_err(|e| WorktreeError::Io {
                    message: format!("Failed to create SQLite database: {}", e),
                })?;
                if let Err(e) = std::process::Command::new("php")
                    .current_dir(base_path)
                    .arg("artisan")
                    .arg("migrate")
                    .arg("--force")
                    .output() {
                    return Err(WorktreeError::Framework {
                        message: format!("Laravel migration failed: {}", e),
                    });
                }
            }

            // Update the .env to point to the new absolute or relative path
            let mut second_pass_lines = Vec::new();
            for line in env_content.lines() {
                if line.starts_with("DB_DATABASE=") {
                    // Update to the new sqlite path (using absolute path for safety)
                    second_pass_lines.push(format!("DB_DATABASE={}", new_sqlite_path.to_string_lossy()));
                } else {
                    second_pass_lines.push(line.to_string());
                }
            }
            env_content = second_pass_lines.join("\n");

        } else {
            // Assume MySQL / Herd default
            let escaped_db = db_name.replace('`', "");
            let sql = format!("CREATE DATABASE IF NOT EXISTS `{}`;", escaped_db);
            if let Err(e) = std::process::Command::new("mysql")
                .arg("-h")
                .arg("127.0.0.1")
                .arg("-u")
                .arg("root")
                .arg("-e")
                .arg(&sql)
                .output() {
                log::warn!("MySQL create database failed: {}", e);
            }

            if clone_db && !original_db_name.is_empty() {
                // Dump original and pipe to new db
                let escaped_orig = original_db_name.replace('`', "");
                let dump = std::process::Command::new("mysqldump")
                    .arg("-h")
                    .arg("127.0.0.1")
                    .arg("-u")
                    .arg("root")
                    .arg(&escaped_orig)
                    .stdout(std::process::Stdio::piped())
                    .spawn();

                if let Ok(mut dump_child) = dump {
                    if let Some(stdout) = dump_child.stdout.take() {
                        if let Err(e) = std::process::Command::new("mysql")
                            .arg("-h")
                            .arg("127.0.0.1")
                            .arg("-u")
                            .arg("root")
                            .arg(&escaped_db)
                            .stdin(stdout)
                            .output() {
                            log::warn!("MySQL import failed: {}", e);
                        }
                    }
                    let _ = dump_child.wait();
                }
            } else {
                // Run clean migrations
                if let Err(e) = std::process::Command::new("php")
                    .current_dir(base_path)
                    .arg("artisan")
                    .arg("migrate")
                    .arg("--force")
                    .output() {
                    return Err(WorktreeError::Framework {
                        message: format!("Laravel migration failed: {}", e),
                    });
                }
            }
        }
    }

    if assign_vite_port {
        let start = std::time::SystemTime::now();
        let since_the_epoch = start
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default();
        let random_port = 5174 + (since_the_epoch.as_millis() % 825) as u16;

        let mut has_vite_port = false;
        let lines: Vec<&str> = env_content.lines().collect();
        let mut new_lines = Vec::new();

        for line in lines {
            if line.starts_with("VITE_PORT=") {
                new_lines.push(format!("VITE_PORT={}", random_port));
                has_vite_port = true;
                modified = true;
            } else {
                new_lines.push(line.to_string());
            }
        }

        if !has_vite_port {
            new_lines.push(format!("VITE_PORT={}", random_port));
            modified = true;
        }

        env_content = new_lines.join("\n");
        if !env_content.ends_with('\n') {
            env_content.push('\n');
        }
    }

    if modified {
        fs::write(&env_path, env_content).map_err(|e| WorktreeError::Io {
            message: format!("Failed to write .env: {}", e),
        })?;
    }

    Ok(())
}
