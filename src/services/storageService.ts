import { invoke } from '@tauri-apps/api/core';

export interface StorageEntryStat {
  key: string;
  name: string;
  path: string;
  isDir: boolean;
  sizeBytes: number;
  itemCount: number;
}

export interface StorageOverview {
  rootPath: string;
  scannedAt: number;
  totalBytes: number;
  categories: StorageEntryStat[];
  instancesTotalBytes: number;
  instances: StorageEntryStat[];
  unknownEntries: StorageEntryStat[];
  scanWarnings: string[];
}

export async function getStorageOverview(): Promise<StorageOverview> {
  return await invoke('get_storage_overview');
}
