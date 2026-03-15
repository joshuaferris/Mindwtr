# Obsidian Integration

Mindwtr can read tasks from an Obsidian vault on desktop and open the source note back in Obsidian.

Milestone 1 is intentionally narrow:

- Desktop only
- Read-only import from a local vault
- Standard Markdown task syntax (`- [ ]`, `- [x]`)
- Manual rescan
- Deep link back to the source note with `obsidian://`

Out of scope for Milestone 1:

- Mobile support
- Write-back to user-authored notes
- Obsidian plugin
- Dataview field parsing as a core contract
- File watching / auto-refresh

## Philosophy

Obsidian integration is a file-based external integration, not a new Mindwtr sync backend.

Mindwtr's sync engine is built around `data.json`, while Obsidian is note-based. To avoid destructive conflicts and surprise edits, Mindwtr only reads Markdown notes in Milestone 1 and stores imported tasks as read-only external state.

## Setup

On desktop:

1. Open **Settings -> Integrations**
2. Find **Obsidian Vault**
3. Select your vault folder
4. Enable the integration
5. Optionally limit scanning to specific folders
6. Save and run **Rescan vault**

By default, scan folders use `/`, which means “scan the whole vault”.

If the selected folder does not contain a `.obsidian/` directory, Mindwtr shows a warning but still lets you save the path.

## What Gets Imported

Mindwtr scans Markdown files under the configured scan folders and skips:

- `.obsidian/`
- `.trash/`
- hidden files/folders
- `node_modules/`

Supported task syntax:

```md
- [ ] Incomplete task
- [x] Completed task
```

Mindwtr also preserves:

- nested task indentation
- inline tags like `#work` or `#project/alpha`
- wiki-links like `[[Meeting Notes]]`
- YAML frontmatter tags at the note level

Imported tasks show:

- task text
- completion state
- source note path + line number
- an **Open in Obsidian** action

To keep scans predictable, Mindwtr skips unusually large Markdown files instead of loading them into memory.

## Deep Linking

Mindwtr opens source notes with Obsidian's URI scheme:

```text
obsidian://open?vault=VAULT_NAME&file=RELATIVE_PATH_WITHOUT_MD
```

This lets you review context in Obsidian without copying file paths manually.

## Current Limitations

- Rescans are manual in Milestone 1
- Imported tasks are not editable from Mindwtr
- File-level frontmatter is used only as context metadata
- Dataview-style inline fields such as `[due:: ...]` are not parsed yet
- Mobile vault access is not supported yet

## Planned Follow-ups

- file watching + incremental refresh
- write-back to a dedicated `Mindwtr/` folder inside the vault
- optional Dataview compatibility
- mobile feasibility work
- possible Obsidian plugin in a separate repo

## See Also

- [[Calendar Integration]]
