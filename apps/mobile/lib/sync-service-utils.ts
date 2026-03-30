import {
  formatSyncErrorMessage as formatCoreSyncErrorMessage,
  getFileSyncDir,
  isLikelyOfflineSyncError as isCoreLikelyOfflineSyncError,
  isSyncFilePath as isCoreSyncFilePath,
  normalizeSyncBackend,
  sanitizeSyncErrorMessage,
  type SyncBackend as CoreSyncBackend,
} from '@mindwtr/core';

export type SyncBackend = CoreSyncBackend | 'cloudkit';

const SYNC_FILE_NAME = 'data.json';
const LEGACY_SYNC_FILE_NAME = 'mindwtr-sync.json';
const FILE_EXTENSION_PATTERN = /\.[A-Za-z0-9]{1,16}$/;
const READONLY_ERROR_PATTERN = /isn't writable|not writable|read-only|read only|permission denied|EACCES/i;
const IOS_TEMP_INBOX_PATTERN = /\/tmp\/[^/\s]*-Inbox\//i;
const IOS_ABSOLUTE_PATH_PATTERN = /^\/(private\/)?var\/mobile\//i;

export const formatSyncErrorMessage = (error: unknown, backend: SyncBackend): string => {
  const raw = sanitizeSyncErrorMessage(String(error));
  if (backend === 'file') {
    if (IOS_TEMP_INBOX_PATTERN.test(raw) && READONLY_ERROR_PATTERN.test(raw)) {
      return 'Selected iOS sync file is a temporary Files copy. Google Drive and OneDrive are not reliable for file sync here yet. Use iCloud Drive or WebDAV instead.';
    }
  }
  return formatCoreSyncErrorMessage(error, backend);
};

export const isLikelyOfflineSyncError = (errorOrMessage: unknown): boolean => {
  return isCoreLikelyOfflineSyncError(errorOrMessage);
};

export const normalizeFileSyncPath = (path: string, platformOs: string): string => {
  const trimmed = path.trim();
  if (!trimmed) return trimmed;
  if (platformOs !== 'ios') return trimmed;
  if (trimmed.startsWith('content://')) return trimmed;
  if (trimmed.startsWith('file://')) return trimmed;
  if (IOS_ABSOLUTE_PATH_PATTERN.test(trimmed)) {
    return `file://${trimmed}`;
  }
  return trimmed;
};

export const isSyncFilePath = (path: string) => isCoreSyncFilePath(path, SYNC_FILE_NAME, LEGACY_SYNC_FILE_NAME);

const stripPathQueryAndFragment = (value: string): string => value.split('?')[0]?.split('#')[0] ?? value;

export const isLikelyFilePath = (path: string): boolean => {
  if (!path) return false;
  const stripped = stripPathQueryAndFragment(path).replace(/[\\/]+$/, '');
  if (!stripped) return false;
  if (isSyncFilePath(stripped)) return true;
  const lastSlash = Math.max(stripped.lastIndexOf('/'), stripped.lastIndexOf('\\'));
  if (lastSlash < 0 || lastSlash >= stripped.length - 1) return false;
  const leaf = stripped.slice(lastSlash + 1);
  return FILE_EXTENSION_PATTERN.test(leaf);
};

export const getFileSyncBaseDir = (syncPath: string) => {
  if (!isLikelyFilePath(syncPath)) {
    return getFileSyncDir(syncPath, SYNC_FILE_NAME, LEGACY_SYNC_FILE_NAME);
  }
  const stripped = stripPathQueryAndFragment(syncPath).replace(/[\\/]+$/, '');
  const lastSlash = Math.max(stripped.lastIndexOf('/'), stripped.lastIndexOf('\\'));
  return lastSlash > -1 ? stripped.slice(0, lastSlash) : '';
};

export const isRemoteSyncBackend = (backend: SyncBackend): boolean =>
  backend === 'webdav' || backend === 'cloud' || backend === 'cloudkit';

export const resolveBackend = (value: string | null): SyncBackend => {
  if (value === 'cloudkit') return 'cloudkit';
  return normalizeSyncBackend(value);
};

export const coerceSupportedBackend = (backend: SyncBackend, allowCloudKit: boolean): SyncBackend =>
  backend === 'cloudkit' && !allowCloudKit ? 'off' : backend;
