export type ObsidianSourceRef = {
    vaultName: string;
    vaultPath: string;
    relativeFilePath: string;
    lineNumber: number;
    fileModifiedAt: string;
    noteTags: string[];
};

export type ObsidianTask = {
    id: string;
    text: string;
    completed: boolean;
    tags: string[];
    wikiLinks: string[];
    nestingLevel: number;
    source: ObsidianSourceRef;
};

export type ObsidianFrontmatter = {
    tags: string[];
    due?: string;
    properties: Record<string, string | string[]>;
};

export type ParseObsidianTasksOptions = {
    vaultName: string;
    vaultPath: string;
    relativeFilePath: string;
    fileModifiedAt: string;
};

export type ParseObsidianTasksResult = {
    tasks: ObsidianTask[];
    frontmatter: ObsidianFrontmatter;
};

const FRONTMATTER_BOUNDARY_RE = /^---\s*$/;
const FENCE_RE = /^\s*(`{3,}|~{3,})/;
const TASK_RE = /^([ \t]*)(?:[-*+])\s+\[( |x|X)\]\s+(.+)$/;
const WIKI_LINK_RE = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
const TAG_RE = /(^|\s)#([\p{L}\p{N}_/.:-]+)/gu;

const stripYamlQuotes = (value: string): string => {
    const trimmed = value.trim();
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith('\'') && trimmed.endsWith('\''))) {
        return trimmed.slice(1, -1);
    }
    return trimmed;
};

const parseYamlScalar = (value: string): string | string[] => {
    const trimmed = value.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        return trimmed
            .slice(1, -1)
            .split(',')
            .map((item) => stripYamlQuotes(item))
            .map((item) => item.trim())
            .filter(Boolean);
    }
    return stripYamlQuotes(trimmed);
};

const normalizeTagValue = (value: string): string => {
    const trimmed = value.trim();
    if (!trimmed) return '';
    return trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;
};

const uniqueStrings = (items: string[]): string[] => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const item of items) {
        const trimmed = item.trim();
        if (!trimmed || seen.has(trimmed)) continue;
        seen.add(trimmed);
        result.push(trimmed);
    }
    return result;
};

export const normalizeObsidianRelativePath = (value: string): string => {
    const normalized = String(value || '').trim().replace(/\\/g, '/').replace(/\/+/g, '/');
    if (!normalized) return '';
    if (normalized.startsWith('/')) {
        throw new Error('Obsidian relative paths cannot be absolute.');
    }
    if (/^[A-Za-z]:/.test(normalized)) {
        throw new Error('Obsidian relative paths cannot include drive prefixes.');
    }

    const segments = normalized
        .split('/')
        .map((segment) => segment.trim())
        .filter(Boolean);

    if (segments.some((segment) => segment === '..')) {
        throw new Error('Obsidian relative paths cannot contain parent traversal.');
    }

    return segments.filter((segment) => segment !== '.').join('/');
};

export const buildObsidianTaskId = (relativeFilePath: string, lineNumber: number): string => {
    const normalizedLineNumber = Number.isFinite(lineNumber) ? Math.max(0, Math.floor(lineNumber)) : 0;
    const source = `${normalizeObsidianRelativePath(relativeFilePath)}:${normalizedLineNumber}`;
    let hash = 0x811c9dc5;
    for (let index = 0; index < source.length; index += 1) {
        hash ^= source.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return `obsidian-${normalizedLineNumber}-${(hash >>> 0).toString(36)}`;
};

export const extractObsidianTags = (text: string): string[] => {
    const tags: string[] = [];
    let match: RegExpExecArray | null;
    TAG_RE.lastIndex = 0;
    while ((match = TAG_RE.exec(text)) !== null) {
        const value = normalizeTagValue(match[2] || '');
        if (value) tags.push(value);
    }
    return uniqueStrings(tags);
};

export const extractObsidianWikiLinks = (text: string): string[] => {
    const links: string[] = [];
    let match: RegExpExecArray | null;
    WIKI_LINK_RE.lastIndex = 0;
    while ((match = WIKI_LINK_RE.exec(text)) !== null) {
        const value = stripYamlQuotes(match[1] || '').trim();
        if (value) links.push(value);
    }
    return uniqueStrings(links);
};

const parseObsidianFrontmatter = (input: string): ObsidianFrontmatter => {
    const properties: Record<string, string | string[]> = {};
    let currentArrayKey: string | null = null;
    for (const rawLine of input.split(/\r?\n/)) {
        const line = rawLine.trimEnd();
        if (!line.trim() || line.trimStart().startsWith('#')) {
            continue;
        }
        const listItemMatch = line.match(/^\s*-\s*(.+)$/);
        if (listItemMatch && currentArrayKey) {
            const current = properties[currentArrayKey];
            const item = stripYamlQuotes(listItemMatch[1] || '').trim();
            if (!item) continue;
            if (Array.isArray(current)) {
                current.push(item);
            } else if (typeof current === 'string' && current.trim()) {
                properties[currentArrayKey] = [current, item];
            } else {
                properties[currentArrayKey] = [item];
            }
            continue;
        }

        const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
        if (!match) {
            currentArrayKey = null;
            continue;
        }

        const key = match[1];
        const rawValue = match[2] ?? '';
        if (!rawValue.trim()) {
            properties[key] = [];
            currentArrayKey = key;
            continue;
        }

        const parsed = parseYamlScalar(rawValue);
        properties[key] = parsed;
        currentArrayKey = Array.isArray(parsed) ? key : null;
    }

    const noteTags = uniqueStrings([
        ...((Array.isArray(properties.tags) ? properties.tags : typeof properties.tags === 'string' ? [properties.tags] : [])
            .map(normalizeTagValue)
            .filter(Boolean)),
        ...((Array.isArray(properties.tag) ? properties.tag : typeof properties.tag === 'string' ? [properties.tag] : [])
            .map(normalizeTagValue)
            .filter(Boolean)),
    ]);

    const dueValue = properties.due;
    const due = typeof dueValue === 'string' && dueValue.trim() ? dueValue.trim() : undefined;

    return {
        tags: noteTags,
        ...(due ? { due } : {}),
        properties,
    };
};

const splitFrontmatter = (
    markdown: string
): { frontmatter: ObsidianFrontmatter; bodyLines: string[]; bodyStartLineNumber: number } => {
    const lines = markdown.replace(/\r\n/g, '\n').split('\n');
    if (!FRONTMATTER_BOUNDARY_RE.test(lines[0] || '')) {
        return {
            frontmatter: { tags: [], properties: {} },
            bodyLines: lines,
            bodyStartLineNumber: 1,
        };
    }

    for (let index = 1; index < lines.length; index += 1) {
        if (!FRONTMATTER_BOUNDARY_RE.test(lines[index] || '')) continue;
        const frontmatter = parseObsidianFrontmatter(lines.slice(1, index).join('\n'));
        return {
            frontmatter,
            bodyLines: lines.slice(index + 1),
            bodyStartLineNumber: index + 2,
        };
    }

    return {
        frontmatter: { tags: [], properties: {} },
        bodyLines: lines,
        bodyStartLineNumber: 1,
    };
};

const computeIndentLevel = (rawIndent: string): number => {
    let tabs = 0;
    let spaces = 0;
    for (const char of rawIndent) {
        if (char === '\t') {
            tabs += 1;
            continue;
        }
        if (char === ' ') {
            spaces += 1;
        }
    }
    return tabs + Math.floor(spaces / 2);
};

export const parseObsidianTasksFromMarkdown = (
    markdown: string,
    options: ParseObsidianTasksOptions
): ParseObsidianTasksResult => {
    const normalizedRelativePath = normalizeObsidianRelativePath(options.relativeFilePath);
    const { frontmatter, bodyLines, bodyStartLineNumber } = splitFrontmatter(markdown);
    const tasks: ObsidianTask[] = [];
    let inFence = false;

    for (let index = 0; index < bodyLines.length; index += 1) {
        const line = bodyLines[index] ?? '';
        if (FENCE_RE.test(line)) {
            inFence = !inFence;
            continue;
        }
        if (inFence) continue;

        const match = TASK_RE.exec(line);
        if (!match) continue;
        const text = (match[3] || '').trim();
        if (!text) continue;

        const lineNumber = bodyStartLineNumber + index;
        const taskTags = uniqueStrings([...extractObsidianTags(text), ...frontmatter.tags]);
        tasks.push({
            id: buildObsidianTaskId(normalizedRelativePath, lineNumber),
            text,
            completed: (match[2] || '').toLowerCase() === 'x',
            tags: taskTags,
            wikiLinks: extractObsidianWikiLinks(text),
            nestingLevel: computeIndentLevel(match[1] || ''),
            source: {
                vaultName: options.vaultName,
                vaultPath: options.vaultPath,
                relativeFilePath: normalizedRelativePath,
                lineNumber,
                fileModifiedAt: options.fileModifiedAt,
                noteTags: frontmatter.tags,
            },
        });
    }

    return { tasks, frontmatter };
};
