use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

const PRIMARY_CATEGORY_KEYS: [&str; 4] = ["instances", "accounts", "cache", "logs"];
const MAX_SCAN_WARNINGS: usize = 20;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageEntryStat {
    pub key: String,
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size_bytes: u64,
    pub item_count: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageOverview {
    pub root_path: String,
    pub scanned_at: i64,
    pub total_bytes: u64,
    pub categories: Vec<StorageEntryStat>,
    pub instances_total_bytes: u64,
    pub instances: Vec<StorageEntryStat>,
    pub unknown_entries: Vec<StorageEntryStat>,
    pub scan_warnings: Vec<String>,
}

fn push_warning(warnings: &mut Vec<String>, message: String) {
    if warnings.len() >= MAX_SCAN_WARNINGS {
        return;
    }
    warnings.push(message);
}

fn measure_dir(path: &Path, warnings: &mut Vec<String>) -> (u64, u64) {
    let mut total_size: u64 = 0;
    let mut total_items: u64 = 0;

    let read_dir = match fs::read_dir(path) {
        Ok(iter) => iter,
        Err(err) => {
            push_warning(
                warnings,
                format!("读取目录失败: {} ({})", path.display(), err),
            );
            return (0, 0);
        }
    };

    for entry_result in read_dir {
        let entry = match entry_result {
            Ok(value) => value,
            Err(err) => {
                push_warning(
                    warnings,
                    format!("读取目录项失败: {} ({})", path.display(), err),
                );
                continue;
            }
        };

        let child_path = entry.path();
        let metadata = match fs::symlink_metadata(&child_path) {
            Ok(value) => value,
            Err(err) => {
                push_warning(
                    warnings,
                    format!("读取元信息失败: {} ({})", child_path.display(), err),
                );
                continue;
            }
        };

        total_items = total_items.saturating_add(1);

        if metadata.is_file() {
            total_size = total_size.saturating_add(metadata.len());
            continue;
        }

        if metadata.is_dir() {
            let (child_size, child_items) = measure_dir(&child_path, warnings);
            total_size = total_size.saturating_add(child_size);
            total_items = total_items.saturating_add(child_items);
        }
    }

    (total_size, total_items)
}

fn measure_path(
    path: &Path,
    is_dir: bool,
    file_size: u64,
    warnings: &mut Vec<String>,
) -> (u64, u64) {
    if is_dir {
        return measure_dir(path, warnings);
    }
    (file_size, 1)
}

fn create_entry(path: &Path, warnings: &mut Vec<String>) -> Option<StorageEntryStat> {
    let metadata = match fs::symlink_metadata(path) {
        Ok(value) => value,
        Err(err) => {
            push_warning(
                warnings,
                format!("读取元信息失败: {} ({})", path.display(), err),
            );
            return None;
        }
    };

    let file_name = path.file_name()?.to_string_lossy().to_string();
    let key = file_name.to_lowercase();
    let is_dir = metadata.is_dir();
    let file_size = metadata.len();
    let (size_bytes, item_count) = measure_path(path, is_dir, file_size, warnings);

    Some(StorageEntryStat {
        key,
        name: file_name,
        path: path.to_string_lossy().to_string(),
        is_dir,
        size_bytes,
        item_count,
    })
}

fn sort_entries(entries: &mut Vec<StorageEntryStat>) {
    entries.sort_by(|a, b| {
        b.size_bytes
            .cmp(&a.size_bytes)
            .then_with(|| a.name.cmp(&b.name))
    });
}

fn load_top_level_entries(
    root_path: &Path,
    warnings: &mut Vec<String>,
) -> Result<Vec<StorageEntryStat>, String> {
    let mut entries = Vec::new();
    let read_dir = fs::read_dir(root_path).map_err(|e| format!("读取数据目录失败: {}", e))?;

    for entry_result in read_dir {
        let entry = match entry_result {
            Ok(value) => value,
            Err(err) => {
                push_warning(
                    warnings,
                    format!("读取顶层目录项失败: {} ({})", root_path.display(), err),
                );
                continue;
            }
        };

        let path = entry.path();
        if let Some(item) = create_entry(&path, warnings) {
            entries.push(item);
        }
    }

    Ok(entries)
}

fn load_instance_entries(
    instances_dir: &Path,
    warnings: &mut Vec<String>,
) -> Vec<StorageEntryStat> {
    let mut entries = Vec::new();
    let read_dir = match fs::read_dir(instances_dir) {
        Ok(iter) => iter,
        Err(err) => {
            push_warning(
                warnings,
                format!("读取实例目录失败: {} ({})", instances_dir.display(), err),
            );
            return entries;
        }
    };

    for entry_result in read_dir {
        let entry = match entry_result {
            Ok(value) => value,
            Err(err) => {
                push_warning(
                    warnings,
                    format!("读取实例目录项失败: {} ({})", instances_dir.display(), err),
                );
                continue;
            }
        };

        let path = entry.path();
        if let Some(item) = create_entry(&path, warnings) {
            entries.push(item);
        }
    }

    entries
}

pub fn collect_storage_overview() -> Result<StorageOverview, String> {
    let root = crate::modules::account::get_data_dir()?;
    let mut warnings = Vec::new();

    let mut categories = load_top_level_entries(&root, &mut warnings)?;
    sort_entries(&mut categories);

    let total_bytes = categories
        .iter()
        .fold(0u64, |acc, item| acc.saturating_add(item.size_bytes));

    let instances_root = root.join("instances");
    let mut instances = if instances_root.is_dir() {
        load_instance_entries(&instances_root, &mut warnings)
    } else {
        Vec::new()
    };
    sort_entries(&mut instances);

    let instances_total_bytes = instances
        .iter()
        .fold(0u64, |acc, item| acc.saturating_add(item.size_bytes));

    let unknown_entries = categories
        .iter()
        .filter(|item| !PRIMARY_CATEGORY_KEYS.contains(&item.key.as_str()))
        .cloned()
        .collect::<Vec<_>>();

    let scanned_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or_default();

    Ok(StorageOverview {
        root_path: root.to_string_lossy().to_string(),
        scanned_at,
        total_bytes,
        categories,
        instances_total_bytes,
        instances,
        unknown_entries,
        scan_warnings: warnings,
    })
}
