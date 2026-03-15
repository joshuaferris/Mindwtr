import type { ObsidianTask } from '@mindwtr/core';
import { createWithEqualityFn } from 'zustand/traditional';
import { ObsidianService, type ObsidianConfig } from '../lib/obsidian-service';
import { normalizeObsidianConfig } from '../lib/obsidian-scanner';

type ObsidianStoreState = {
    config: ObsidianConfig;
    tasks: ObsidianTask[];
    scannedFileCount: number;
    warnings: string[];
    hasScannedThisSession: boolean;
    hasVaultMarker: boolean | null;
    isLoadingConfig: boolean;
    isScanning: boolean;
    isInitialized: boolean;
    error: string | null;
    refreshConfig: () => Promise<void>;
    loadConfig: () => Promise<void>;
    saveConfig: (nextConfig: Partial<ObsidianConfig>) => Promise<ObsidianConfig>;
    updateConfig: (nextConfig: Partial<ObsidianConfig>) => Promise<ObsidianConfig>;
    setVaultPath: (vaultPath: string | null, options?: { enabled?: boolean }) => Promise<ObsidianConfig>;
    removeConfig: () => Promise<void>;
    disconnect: () => Promise<void>;
    refreshVaultMarker: () => Promise<void>;
    scan: () => Promise<void>;
    rescan: () => Promise<void>;
    clearError: () => void;
};

const defaultConfig = normalizeObsidianConfig({});

const toErrorMessage = (error: unknown, fallback: string): string => {
    if (error instanceof Error && error.message.trim()) return error.message.trim();
    const text = String(error || '').trim();
    return text || fallback;
};

export const useObsidianStore = createWithEqualityFn<ObsidianStoreState>()((set, get) => ({
    config: defaultConfig,
    tasks: [],
    scannedFileCount: 0,
    warnings: [],
    hasScannedThisSession: false,
    hasVaultMarker: null,
    isLoadingConfig: false,
    isScanning: false,
    isInitialized: false,
    error: null,
    refreshConfig: async () => {
        await get().loadConfig();
    },
    loadConfig: async () => {
        if (get().isLoadingConfig) return;
        set({ isLoadingConfig: true, error: null });
        try {
            const config = normalizeObsidianConfig(await ObsidianService.getConfig());
            const hasVaultMarker = config.vaultPath ? await ObsidianService.hasVaultMarker(config.vaultPath) : null;
            set({
                config,
                hasVaultMarker,
                warnings: [],
                isInitialized: true,
                isLoadingConfig: false,
            });
        } catch (error) {
            set({
                isLoadingConfig: false,
                isInitialized: true,
                error: toErrorMessage(error, 'Failed to load Obsidian config.'),
            });
        }
    },
    saveConfig: async (nextConfig) => {
        return get().updateConfig(nextConfig);
    },
    updateConfig: async (nextConfig) => {
        const merged = normalizeObsidianConfig({ ...get().config, ...nextConfig });
        const saved = normalizeObsidianConfig(await ObsidianService.setConfig(merged));
        const hasVaultMarker = saved.vaultPath ? await ObsidianService.hasVaultMarker(saved.vaultPath) : null;
        set({
            config: saved,
            hasVaultMarker,
            warnings: [],
            error: null,
            hasScannedThisSession: false,
        });
        if (!saved.enabled || !saved.vaultPath) {
            set({ tasks: [], scannedFileCount: 0, warnings: [], hasScannedThisSession: false });
        }
        return saved;
    },
    setVaultPath: async (vaultPath, options) => {
        const trimmed = String(vaultPath || '').trim() || null;
        const current = get().config;
        const next = await get().updateConfig({
            ...current,
            vaultPath: trimmed,
            enabled: trimmed ? options?.enabled ?? true : false,
            lastScannedAt: trimmed ? current.lastScannedAt : null,
        });
        return next;
    },
    removeConfig: async () => {
        await get().disconnect();
    },
    disconnect: async () => {
        await get().updateConfig({
            vaultPath: null,
            enabled: false,
            lastScannedAt: null,
            scanFolders: ['/'],
        });
        set({
            tasks: [],
            scannedFileCount: 0,
            warnings: [],
            hasScannedThisSession: false,
            hasVaultMarker: null,
        });
    },
    refreshVaultMarker: async () => {
        const vaultPath = get().config.vaultPath;
        const hasVaultMarker = vaultPath ? await ObsidianService.hasVaultMarker(vaultPath) : null;
        set({ hasVaultMarker });
    },
    scan: async () => {
        await get().rescan();
    },
    rescan: async () => {
        if (get().isScanning) return;
        const config = get().config;
        if (!config.enabled || !config.vaultPath) {
            set({ tasks: [], scannedFileCount: 0, warnings: [], hasScannedThisSession: false });
            return;
        }

        const startedAt = new Date().toISOString();
        set({ isScanning: true, error: null });
        try {
            const result = await ObsidianService.scanVault(config);
            const savedConfig = await ObsidianService.setConfig({
                ...config,
                lastScannedAt: startedAt,
            });
            set({
                config: savedConfig,
                tasks: result.tasks,
                scannedFileCount: result.scannedFileCount,
                warnings: result.warnings,
                hasScannedThisSession: true,
                isScanning: false,
                error: null,
            });
        } catch (error) {
            set({
                warnings: [],
                hasScannedThisSession: true,
                isScanning: false,
                error: toErrorMessage(error, 'Failed to scan Obsidian vault.'),
            });
        }
    },
    clearError: () => set({ error: null }),
}));
