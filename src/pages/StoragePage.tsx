import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Database, FolderOpen, Layers, RefreshCw } from 'lucide-react';
import * as accountService from '../services/accountService';
import { getStorageOverview, type StorageEntryStat, type StorageOverview } from '../services/storageService';

const EMPTY_TEXT = '-';

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  const precision = value >= 100 || index === 0 ? 0 : 1;
  return `${value.toFixed(precision)} ${units[index]}`;
}

function toPercent(value: number, total: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.max(0, Math.min(100, (value / total) * 100));
}

function formatScanTime(scannedAt: number): string {
  if (!Number.isFinite(scannedAt) || scannedAt <= 0) return EMPTY_TEXT;
  return new Date(scannedAt * 1000).toLocaleString();
}

function StorageList({
  entries,
  totalBytes,
}: {
  entries: StorageEntryStat[];
  totalBytes: number;
}) {
  if (entries.length === 0) {
    return (
      <div className="storage-empty">
        {EMPTY_TEXT}
      </div>
    );
  }

  return (
    <div className="storage-list">
      {entries.map((entry) => {
        const ratio = toPercent(entry.sizeBytes, totalBytes);
        return (
          <div className="storage-item" key={`${entry.key}-${entry.path}`}>
            <div className="storage-item-top">
              <div className="storage-item-name" title={entry.name}>{entry.name}</div>
              <div className="storage-item-size">{formatBytes(entry.sizeBytes)}</div>
            </div>
            <div className="storage-item-sub">
              <span className="storage-item-path" title={entry.path}>{entry.path}</span>
              <span className="storage-item-ratio">{ratio.toFixed(1)}%</span>
            </div>
            <div className="storage-item-progress">
              <span className="storage-item-progress-fill" style={{ width: `${ratio}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function StoragePage() {
  const { t } = useTranslation();
  const [overview, setOverview] = useState<StorageOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getStorageOverview();
      setOverview(data);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const otherEntries = useMemo(() => overview?.unknownEntries ?? [], [overview]);
  const initialLoading = loading && !overview;
  const instancesRatio = toPercent(overview?.instancesTotalBytes ?? 0, overview?.totalBytes ?? 0);

  return (
    <div className="storage-page">
      <div className="page-header">
        <div className="page-title">{t('settings.general.storageTitle')}</div>
        <div className="page-subtitle">{t('settings.general.dataDirDesc')}</div>
      </div>

      <div className="storage-toolbar">
        <button className="btn btn-secondary" onClick={() => void loadOverview()} disabled={loading}>
          <RefreshCw size={16} className={loading ? 'icon-spin' : ''} />
          {t('common.refresh')}
        </button>
        <button className="btn btn-secondary" onClick={() => accountService.openDataFolder()}>
          <FolderOpen size={16} />
          {t('common.open')}
        </button>
      </div>

      {error && (
        <div className="storage-message storage-message-error">
          {t('common.failed')}: {error}
        </div>
      )}

      {initialLoading && (
        <div className="loading-state">{t('common.loading')}</div>
      )}

      {overview && (
        <>
          <div className="storage-summary">
            <div className="storage-summary-card">
              <div className="storage-summary-label">{t('settings.general.dataDir')}</div>
              <div className="storage-summary-value">{formatBytes(overview.totalBytes)}</div>
              <div className="storage-summary-meta" title={overview.rootPath}>{overview.rootPath}</div>
            </div>
            <div className="storage-summary-card">
              <div className="storage-summary-label">{t('nav.instances')}</div>
              <div className="storage-summary-value">{formatBytes(overview.instancesTotalBytes)}</div>
              <div className="storage-summary-meta">{instancesRatio.toFixed(1)}%</div>
            </div>
            <div className="storage-summary-card">
              <div className="storage-summary-label">{t('common.detail')}</div>
              <div className="storage-summary-value">{overview.categories.length}</div>
              <div className="storage-summary-meta">{formatScanTime(overview.scannedAt)}</div>
            </div>
          </div>

          <section className="storage-section">
            <div className="storage-section-title">
              <Database size={16} />
              <span>{t('settings.general.dataDir')}</span>
            </div>
            <StorageList entries={overview.categories} totalBytes={overview.totalBytes} />
          </section>

          <section className="storage-section">
            <div className="storage-section-title">
              <Layers size={16} />
              <span>{t('nav.instances')}</span>
            </div>
            <StorageList entries={overview.instances} totalBytes={overview.instancesTotalBytes} />
          </section>

          {otherEntries.length > 0 && (
            <section className="storage-section">
              <div className="storage-section-title">
                <AlertTriangle size={16} />
                <span>{t('common.detail')}</span>
              </div>
              <StorageList entries={otherEntries} totalBytes={overview.totalBytes} />
            </section>
          )}

          {overview.scanWarnings.length > 0 && (
            <div className="storage-message">
              {overview.scanWarnings.join(' | ')}
            </div>
          )}
        </>
      )}
    </div>
  );
}
