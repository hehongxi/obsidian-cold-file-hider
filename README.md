# Cold File Hider

Automatically hide inactive (cold) files from the Obsidian file explorer. Files re-appear when accessed via search, Quick Switcher (Ctrl+O), link click, backlinks, or graph view.

![Demo](https://img.shields.io/badge/status-stable-brightgreen)
![Version](https://img.shields.io/badge/version-1.4.0-blue)

---

## Features

- **Auto-hide cold files** — Files not modified for N days are hidden from the file explorer.
- **All file types** — Works with `.md`, `.pdf`, `.png`, `.docx`, and any file in your vault.
- **Auto-hide cold folders** — When every file inside a folder becomes cold, the folder itself disappears too.
- **Smart thaw** — Opening a file (via search, links, graph view) permanently unhides it. Opening a file inside a hidden folder unhides the folder too.
- **Toggle show hidden** — Temporarily reveal all hidden files at reduced opacity.
- **Rename-aware** — Renamed files stay hidden. Deleted files are cleaned up.
- **Exclusion rules** — Exclude specific folders or glob patterns (`*.bak`, `**/Archive/**`).
- ****English / 中文** — Built-in bilingual interface.

## Usage

1. Install the plugin
2. Go to **Settings → Cold File Hider**
3. Set the **cold threshold** (days), default: 60
4. Click **Scan Now** to hide cold files
5. Hidden files will reappear when you access them

### Commands

| Command | Description |
|---------|-------------|
| `Cold File Hider: Scan vault for cold files` | Run a manual scan |
| `Cold File Hider: Toggle show hidden files` | Show/Hide cold files temporarily |

## Installation

### From Obsidian Community Plugin Marketplace (once approved)

Settings → Community plugins → Browse → Search "Cold File Hider"

### Manual (BRAT)

1. Install [BRAT](https://github.com/TfTHacker/obsidian42-brat)
2. Add Beta plugin: `hehongxi/obsidian-cold-file-hider`
3. Reload plugins

### Manual (git clone)

```bash
cd /path/to/your/vault/.obsidian/plugins/
git clone https://github.com/hehongxi/obsidian-cold-file-hider.git
```

Then enable the plugin in Settings → Community plugins.

## Configuration

| Setting | Description |
|---------|-------------|
| Cold threshold (days) | Files untouched for N days will be hidden |
| Scan on startup | Automatically scan when Obsidian opens |
| Exclude folders | Folders to skip, one per line |
| Exclude patterns (glob) | Glob patterns to skip (`*.bak`, `**/Archive/**`) |
| Language | Switch between 中文/English |

## About the Author

hehongxi — working in the chemical engineering industry. PVA optical film casting by day, Obsidian plugins by night.

[Email](mailto:koujika97@gmail.com)

## License

MIT
