import { existsSync } from 'node:fs';
import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
    MAX_OBSIDIAN_MARKDOWN_BYTES,
    MAX_OBSIDIAN_SCAN_WARNINGS,
    normalizeObsidianConfig,
    scanObsidianVault,
    type ObsidianScannerDependencies,
} from './obsidian-scanner';

const fixtureRoot = join(
    dirname(fileURLToPath(import.meta.url)),
    '../../../../packages/core/src/__fixtures__/obsidian-test-vault'
);

const nodeFsDeps: ObsidianScannerDependencies = {
    exists: async (path) => existsSync(path),
    readDir: async (path) => {
        const entries = await readdir(path, { withFileTypes: true });
        return entries.map((entry) => ({
            name: entry.name,
            isFile: entry.isFile(),
            isDirectory: entry.isDirectory(),
        }));
    },
    readTextFile: async (path) => readFile(path, 'utf8'),
    stat: async (path) => {
        const fileInfo = await stat(path);
        return {
            mtime: fileInfo.mtime,
            isFile: fileInfo.isFile(),
            isDirectory: fileInfo.isDirectory(),
        };
    },
};

describe('scanObsidianVault', () => {
    it('walks the fixture vault and skips hidden Obsidian directories', async () => {
        const result = await scanObsidianVault({
            vaultPath: fixtureRoot,
            enabled: true,
            scanFolders: ['/'],
        }, nodeFsDeps);

        expect(result.scannedFileCount).toBe(8);
        expect(result.tasks).toHaveLength(13);
        expect(result.warnings).toEqual([]);
        expect(result.tasks.map((task) => task.source.relativeFilePath)).not.toContain('.trash/Deleted.md');
        expect(result.tasks.map((task) => task.source.relativeFilePath)).not.toContain('.obsidian/.gitkeep');
        expect(result.tasks[0]?.source.relativeFilePath).toBe('Daily/2026-03-14.md');
        expect(result.tasks[result.tasks.length - 1]?.source.relativeFilePath).toBe('Unicode-任务.md');
    });

    it('respects configured scan folders', async () => {
        const result = await scanObsidianVault({
            vaultPath: fixtureRoot,
            enabled: true,
            scanFolders: ['Projects'],
        }, nodeFsDeps);

        expect(result.scannedFileCount).toBe(2);
        expect(result.tasks).toHaveLength(6);
        expect(result.warnings).toEqual([]);
        expect([...new Set(result.tasks.map((task) => task.source.relativeFilePath))]).toEqual([
            'Projects/Alpha.md',
            'Projects/Beta.md',
        ]);
    });

    it('ignores hidden scan folders and can scan a single markdown file path', async () => {
        const hiddenResult = await scanObsidianVault({
            vaultPath: fixtureRoot,
            enabled: true,
            scanFolders: ['.obsidian', 'Projects'],
        }, nodeFsDeps);
        const singleFileResult = await scanObsidianVault({
            vaultPath: fixtureRoot,
            enabled: true,
            scanFolders: ['Inbox.md'],
        }, nodeFsDeps);

        expect(hiddenResult.scannedFileCount).toBe(2);
        expect(hiddenResult.tasks).toHaveLength(6);
        expect(hiddenResult.warnings).toEqual(['Skipped invalid scan folder: .obsidian']);
        expect(singleFileResult.scannedFileCount).toBe(1);
        expect(singleFileResult.tasks.map((task) => task.text)).toEqual([
            'Buy groceries #errands',
            'Pay rent [[Bills]]',
            'Review docs #writing/reference',
        ]);
        expect(singleFileResult.warnings).toEqual([]);
    });

    it('skips markdown files larger than the size limit and reports a warning', async () => {
        const deps: ObsidianScannerDependencies = {
            exists: async () => true,
            readDir: async (path) => {
                if (path === '/Vault') {
                    return [{ name: 'Huge.md', isFile: true, isDirectory: false }];
                }
                return [];
            },
            readTextFile: async () => '- [ ] should never be read',
            stat: async (path) => ({
                mtime: new Date('2026-03-14T12:00:00.000Z'),
                isFile: path.endsWith('.md'),
                isDirectory: !path.endsWith('.md'),
                size: path.endsWith('.md') ? MAX_OBSIDIAN_MARKDOWN_BYTES + 1 : 0,
            }),
        };

        const result = await scanObsidianVault({
            vaultPath: '/Vault',
            enabled: true,
            scanFolders: ['/'],
        }, deps);

        expect(result.scannedFileCount).toBe(0);
        expect(result.tasks).toHaveLength(0);
        expect(result.warnings).toEqual(['Skipped large Markdown file: Huge.md']);
    });

    it('caps accumulated scan warnings', async () => {
        const deps: ObsidianScannerDependencies = {
            exists: async () => true,
            readDir: async (path) => {
                if (path === '/Vault') {
                    return Array.from({ length: MAX_OBSIDIAN_SCAN_WARNINGS + 5 }, (_, index) => ({
                        name: `Huge-${index}.md`,
                        isFile: true,
                        isDirectory: false,
                    }));
                }
                return [];
            },
            readTextFile: async () => '- [ ] should never be read',
            stat: async (path) => ({
                mtime: new Date('2026-03-14T12:00:00.000Z'),
                isFile: path.endsWith('.md'),
                isDirectory: !path.endsWith('.md'),
                size: path.endsWith('.md') ? MAX_OBSIDIAN_MARKDOWN_BYTES + 1 : 0,
            }),
        };

        const result = await scanObsidianVault({
            vaultPath: '/Vault',
            enabled: true,
            scanFolders: ['/'],
        }, deps);

        expect(result.warnings).toHaveLength(MAX_OBSIDIAN_SCAN_WARNINGS);
        expect(result.warnings[0]).toBe('Skipped large Markdown file: Huge-0.md');
        expect(result.warnings[result.warnings.length - 1]).toBe(
            `Skipped large Markdown file: Huge-${MAX_OBSIDIAN_SCAN_WARNINGS - 1}.md`
        );
    });
});

describe('normalizeObsidianConfig', () => {
    it('derives vault name and disables the integration without a vault path', () => {
        expect(normalizeObsidianConfig({
            vaultPath: '  ',
            enabled: true,
            scanFolders: [],
        })).toEqual({
            vaultPath: null,
            vaultName: '',
            scanFolders: ['/'],
            lastScannedAt: null,
            enabled: false,
        });

        expect(normalizeObsidianConfig({
            vaultPath: '/Users/dd/Notes',
            enabled: true,
            scanFolders: ['Projects', './Daily'],
        })).toMatchObject({
            vaultPath: '/Users/dd/Notes',
            vaultName: 'Notes',
            enabled: true,
            scanFolders: ['Projects', 'Daily'],
        });
    });
});
