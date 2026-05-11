/**
 * Cold File Hider — Obsidian Plugin  v1.4.0
 *
 * Hides files of ANY type that haven't been modified for N days from the file
 * explorer via CSS injection. Hidden files re-appear permanently when opened
 * via search, quick switcher (Ctrl+O), link click, backlinks, or graph view.
 *
 * When every file inside a folder becomes hidden, the folder itself is
 * hidden too. Opening a file inside a hidden folder unhides both.
 *
 * ── v1.4.0 ──
 * - Bilingual UI: Chinese / English language switch in settings
 * ── v1.3.1 ──
 * - Fix CSS selector: use :has(>.tree-item-self[data-path=...]) for Obsidian DOM
 * ── v1.3.0 ──
 * - All file types: scan via vault.getFiles() instead of getMarkdownFiles()
 * - Auto-hide folders: when all children are cold, the folder disappears too
 * - CSS targets both .nav-file and .nav-folder selectors
 */

import {
    App,
    Notice,
    Plugin,
    PluginSettingTab,
    Setting,
    TAbstractFile,
    TFile,
    TFolder,
    normalizePath,
} from "obsidian";

// ── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_COLD_DAYS = 60;
const SAVE_DEBOUNCE_MS = 500;
const STAT_BATCH_SIZE = 50;

type Lang = "zh" | "en";

// ── i18n ───────────────────────────────────────────────────────────────────

const I18N: Record<Lang, Record<string, string>> = {
    zh: {
        "plugin.name": "Cold File Hider",
        "lang": "语言",
        "lang.desc": "插件界面显示语言",
        "cold.threshold": "冷度阈值（天）",
        "cold.threshold.desc": "超过此天数未修改的文件将从文件浏览器中隐藏。",
        "scan.startup": "启动时扫描",
        "scan.startup.desc": "Obsidian 启动时自动扫描仓库。",
        "exclude.folders": "排除文件夹",
        "exclude.folders.desc": "要排除的文件夹，每行一个。",
        "exclude.patterns": "排除模式（通配符）",
        "exclude.patterns.desc": "* 匹配单层目录，** 匹配任意层级，? 匹配单个字符。",
        "manual.scan": "手动扫描",
        "manual.scan.desc": "立即扫描并隐藏冷文件。",
        "scan.now": "立即扫描",
        "show.hidden": "显示隐藏文件",
        "show.hidden.desc": "临时以半透明方式显示隐藏文件。",
        "toggle.show.hide": "切换显示/隐藏",
        "status.line": "当前隐藏 {0} 个文件/文件夹。上次扫描：{1}",
        "never": "从未",
        "cmd.scan": "扫描仓库中的冷文件",
        "cmd.toggle": "切换显示隐藏文件",
        "notice.scanning": "Cold File Hider：正在扫描中，请稍候",
        "notice.scan.done": "Cold File Hider：已扫描 {0} 个文件，隐藏 {1} 个",
        "notice.showing": "Cold File Hider：已显示隐藏文件",
        "notice.hiding": "Cold File Hider：已隐藏冷文件",
        "console.scan.done": "Cold File Hider: scanned {0} files, {1} hidden (>= {2} days)",
        "console.thawed": "Cold File Hider: thawed {0}",
        "console.aborted": "Cold File Hider: scan aborted",
        "console.skipped": "Cold File Hider: skipped stat",
        "about.title": "关于作者",
        "about.desc": "hehongxi（何鸿曦），化工行业从业者。工作之余喜欢捣鼓技术——从 PVA 光学膜流延工艺到自动化脚本到 Obsidian 插件，兴趣驱动。如果你在化工领域有自动化、数据分析或辅助工具方面的需求，欢迎交流：",
        "about.email": "邮箱：koujika97@gmail.com",
        "about.cta": "欢迎化工行业的同行交流技术问题。",
    },
    en: {
        "plugin.name": "Cold File Hider",
        "lang": "Language",
        "lang.desc": "UI display language",
        "cold.threshold": "Cold threshold (days)",
        "cold.threshold.desc": "Files not modified for this many days will be hidden from the file explorer.",
        "scan.startup": "Scan on startup",
        "scan.startup.desc": "Automatically scan the vault when Obsidian opens.",
        "exclude.folders": "Exclude folders",
        "exclude.folders.desc": "Folders to exclude from scanning, one per line.",
        "exclude.patterns": "Exclude patterns (glob)",
        "exclude.patterns.desc": "* within dir, ** any depth, ? one char.",
        "manual.scan": "Manual scan",
        "manual.scan.desc": "Scan the vault now to find and hide cold files.",
        "scan.now": "Scan Now",
        "show.hidden": "Show hidden files",
        "show.hidden.desc": "Temporarily show hidden files with lower opacity.",
        "toggle.show.hide": "Toggle show / hide",
        "status.line": "Currently hiding {0} files & folders. Last scan: {1}",
        "never": "never",
        "cmd.scan": "Scan vault for cold files",
        "cmd.toggle": "Toggle: show hidden files",
        "notice.scanning": "Cold File Hider: scan already in progress",
        "notice.scan.done": "Cold File Hider: {0} files scanned, {1} hidden",
        "notice.showing": "Cold File Hider: showing hidden files",
        "notice.hiding": "Cold File Hider: hiding cold files",
        "console.scan.done": "Cold File Hider: scanned {0} files, {1} hidden (>= {2} days)",
        "console.thawed": "Cold File Hider: thawed {0}",
        "console.aborted": "Cold File Hider: scan aborted",
        "console.skipped": "Cold File Hider: skipped stat",
        "about.title": "About the Author",
        "about.desc": "hehongxi — working in the chemical engineering industry. In my spare time I tinker with tech, from PVA optical film casting processes to automation scripts to Obsidian plugins. If you're in the chemical field and need automation, data analysis, or productivity tools, feel free to reach out:",
        "about.email": "Email: koujika97@gmail.com",
        "about.cta": "Chemical industry peers welcome to connect.",
    },
};

function t(lang: Lang, key: string, ...args: (string | number)[]): string {
    let str = I18N[lang]?.[key] ?? I18N.en[key] ?? key;
    args.forEach((arg, i) => {
        str = str.replace(new RegExp(`\\{${i}\\}`, "g"), String(arg));
    });
    return str;
}

// ── Settings ──────────────────────────────────────────────────────────────

interface ColdFileHiderSettings {
    thresholdDays: number;
    excludeFolders: string[];
    excludePatterns: string[];
    scanOnStartup: boolean;
    lang: Lang;
}

const DEFAULT_SETTINGS: ColdFileHiderSettings = {
    thresholdDays: DEFAULT_COLD_DAYS,
    excludeFolders: [],
    excludePatterns: [],
    scanOnStartup: true,
    lang: "zh",
};

// ── Persisted data ────────────────────────────────────────────────────────

interface ColdFileHiderData {
    hiddenPaths: string[];
    lastScanTime: number;
}

const DEFAULT_DATA: ColdFileHiderData = {
    hiddenPaths: [],
    lastScanTime: 0,
};

// ── Sanitize helpers ──────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizeStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
}

function sanitizeHiddenPaths(value: unknown): string[] {
    const paths = sanitizeStringArray(value).map((path) => normalizePath(path));
    return Array.from(new Set(paths)).sort();
}

function sanitizePositiveInteger(value: unknown, fallback: number): number {
    if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
    const n = Math.floor(value);
    return n >= 1 ? n : fallback;
}

function sanitizeTimestamp(value: unknown): number {
    if (typeof value !== "number" || !Number.isFinite(value)) return 0;
    return value >= 0 ? value : 0;
}

function sanitizeLang(value: unknown): Lang {
    if (value === "zh" || value === "en") return value;
    return DEFAULT_SETTINGS.lang;
}

function normalizeFolder(folder: string): string {
    return normalizePath(folder.trim()).replace(/\/+$/, "");
}

// ── Glob helper ───────────────────────────────────────────────────────────

function globToRegex(pattern: string): RegExp | null {
    const trimmed = pattern.trim();
    if (!trimmed) return null;
    try {
        // Escape special regex chars first
        let source = trimmed.replace(/[.+^${}()|[\]\\]/g, "\\$&");
        // Then replace glob patterns directly (single pass, no temp char)
        source = source.replace(/\*\*/g, ".*");
        source = source.replace(/\*/g, "[^/]*");
        source = source.replace(/\?/g, "[^/]");
        return new RegExp(`^${source}$`);
    } catch (e) {
        console.warn("Cold File Hider: invalid exclude pattern skipped", pattern, e);
        return null;
    }
}

function nextAnimationFrame(): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, 0));
}

// ── Plugin ────────────────────────────────────────────────────────────────

export default class ColdFileHiderPlugin extends Plugin {
    settings: ColdFileHiderSettings = { ...DEFAULT_SETTINGS };
    data: ColdFileHiderData = { ...DEFAULT_DATA };
    hiddenSet: Set<string> = new Set();

    /** Map folder-path → Set of file-paths directly or recursively under it.
     *  Built during scan, used to decide folder visibility. */
    private folderCoverage: Map<string, Set<string>> = new Map();

    private showingHidden = false;
    private scanning = false;
    private scanAbortController: AbortController | null = null;
    private thawedDuringScan: Set<string> | null = null;

    private saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    private savePromise: Promise<void> = Promise.resolve();
    private unloaded = false;

    private observer: MutationObserver | null = null;
    private observerDebounceTimer: ReturnType<typeof setTimeout> | null = null;

    /** Shorthand for current-language i18n lookup. */
    tr(key: string, ...args: (string | number)[]): string {
        return t(this.settings.lang, key, ...args);
    }

    // ── Lifecycle ────────────────────────────────────────────────────────

    async onload(): Promise<void> {
        await this.loadAll();
        this.hiddenSet = new Set(this.data.hiddenPaths);

        this.addCommand({
            id: "scan-now",
            name: this.tr("cmd.scan"),
            callback: () => void this.scanColdFiles(),
        });

        this.addCommand({
            id: "toggle-show",
            name: this.tr("cmd.toggle"),
            callback: () => this.toggleShowHidden(),
        });

        this.addSettingTab(new ColdFileHiderSettingTab(this.app, this));

        this.registerEvent(
            this.app.workspace.on("file-open", (file: TFile | null) => {
                if (file) this.unhideFile(file.path);
            })
        );

        this.registerEvent(
            this.app.vault.on("rename", (file: TAbstractFile, oldPath: string) => {
                if (!(file instanceof TFile)) return;
                this.renameHiddenPath(oldPath, file.path);
            })
        );

        this.registerEvent(
            this.app.vault.on("delete", (file: TAbstractFile) => {
                if (!(file instanceof TFile)) return;
                this.deleteHiddenPath(file.path);
            })
        );

        this.refreshUI();
        this.startObserver();

        if (this.settings.scanOnStartup) {
            this.app.workspace.onLayoutReady(() => {
                if (!this.unloaded) void this.scanColdFiles();
            });
        }
    }

    async onunload(): Promise<void> {
        this.unloaded = true;
        this.scanAbortController?.abort();
        this.scanAbortController = null;
        this.thawedDuringScan = null;
        this.stopObserver();
        await this.flushSave();
    }

    // ── Data persistence ─────────────────────────────────────────────────

    async loadAll(): Promise<void> {
        try {
            const raw = await this.loadData();
            const root = isRecord(raw) ? raw : {};
            const rawSettings = isRecord(root.settings) ? root.settings : {};
            this.settings = {
                thresholdDays: sanitizePositiveInteger(
                    rawSettings.thresholdDays, DEFAULT_SETTINGS.thresholdDays),
                excludeFolders: sanitizeStringArray(rawSettings.excludeFolders),
                excludePatterns: sanitizeStringArray(rawSettings.excludePatterns),
                scanOnStartup:
                    typeof rawSettings.scanOnStartup === "boolean"
                        ? rawSettings.scanOnStartup
                        : DEFAULT_SETTINGS.scanOnStartup,
                lang: sanitizeLang(rawSettings.lang),
            };
            this.data = {
                hiddenPaths: sanitizeHiddenPaths(root.hiddenPaths),
                lastScanTime: sanitizeTimestamp(root.lastScanTime),
            };
        } catch (e) {
            console.error("Cold File Hider: failed to load data, using defaults", e);
            this.settings = { ...DEFAULT_SETTINGS };
            this.data = { ...DEFAULT_DATA };
        }
    }

    async saveAll(): Promise<void> {
        await this.saveData({
            settings: this.settings,
            hiddenPaths: this.data.hiddenPaths,
            lastScanTime: this.data.lastScanTime,
        });
    }

    persistHiddenPaths(): void {
        this.data.hiddenPaths = Array.from(this.hiddenSet).sort();
        this.debouncedSave();
    }

    private debouncedSave(): void {
        if (this.unloaded) return;
        if (this.saveDebounceTimer) clearTimeout(this.saveDebounceTimer);
        this.saveDebounceTimer = setTimeout(() => {
            this.saveDebounceTimer = null;
            this.savePromise = this.savePromise
                .catch(() => undefined)
                .then(() => this.saveAll())
                .catch((e) => console.error("Cold File Hider: failed to save data", e));
        }, SAVE_DEBOUNCE_MS);
    }

    private async flushSave(): Promise<void> {
        if (this.saveDebounceTimer) {
            clearTimeout(this.saveDebounceTimer);
            this.saveDebounceTimer = null;
            this.data.hiddenPaths = Array.from(this.hiddenSet).sort();
        }
        await this.savePromise.catch((e) => console.error("Cold File Hider: pending save failed", e));
    }

    // ── DOM attribute-based UI (replaces CSS injection) ──────────────────

    refreshUI(): void {
        this.applyExplorerAttributes();
        this.cleanupOrphanObserver();
    }

    private startObserver(): void {
        this.stopObserver();
        const sidebarEl = document.querySelector('.workspace-leaf-content[data-type="file-explorer"] .nav-files-container');
        if (!sidebarEl) {
            // Retry on layout ready
            this.app.workspace.onLayoutReady(() => this.startObserver());
            return;
        }
        this.observer = new MutationObserver(() => {
            if (this.observerDebounceTimer) clearTimeout(this.observerDebounceTimer);
            this.observerDebounceTimer = setTimeout(() => this.applyExplorerAttributes(), 200);
        });
        this.observer.observe(sidebarEl, { childList: true, subtree: true });
    }

    private stopObserver(): void {
        this.observer?.disconnect();
        this.observer = null;
        if (this.observerDebounceTimer) {
            clearTimeout(this.observerDebounceTimer);
            this.observerDebounceTimer = null;
        }
    }

    private applyExplorerAttributes(): void {
        const paths = this.hiddenSet;
        const items = document.querySelectorAll('.tree-item.nav-file > .tree-item-self, .tree-item.nav-folder > .tree-item-self');
        for (const item of items) {
            const path = item.getAttribute('data-path');
            if (!path) continue;
            const parent = item.parentElement;
            if (!parent) continue;
            if (paths.has(path)) {
                parent.setAttribute('data-cfh', this.showingHidden ? 'dimmed' : 'hidden');
            } else {
                parent.removeAttribute('data-cfh');
            }
        }
    }

    private cleanupOrphanObserver(): void {
        // Ensure observer is still connected; restart if the sidebar was recreated
        if (!this.observer) {
            this.startObserver();
        }
    }

    // ── Folder coverage ──────────────────────────────────────────────────

    /**
     * Build folderCoverage: for every folder, the set of all file paths
     * (recursive) contained within it. Called once per scan.
     */
    private buildFolderCoverage(files: TFile[]): void {
        this.folderCoverage.clear();
        const seenFolders = new Set<string>();

        for (const file of files) {
            let parent: TFolder | null = file.parent;
            while (parent && !parent.isRoot()) {
                const pPath = parent.path;
                seenFolders.add(pPath);
                if (!this.folderCoverage.has(pPath)) {
                    this.folderCoverage.set(pPath, new Set());
                }
                this.folderCoverage.get(pPath)!.add(file.path);
                parent = parent.parent;
            }
        }
    }

    /** After file-level hiddenSet changes, add/remove folder entries. */
    private syncFolderVisibility(): void {
        if (this.folderCoverage.size === 0) return;

        for (const [folderPath, filePaths] of this.folderCoverage) {
            if (filePaths.size === 0) continue;
            const allHidden = [...filePaths].every((fp) => this.hiddenSet.has(fp));
            if (allHidden) {
                this.hiddenSet.add(folderPath);
            } else {
                this.hiddenSet.delete(folderPath);
            }
        }
    }

    // ── Core: Scan ───────────────────────────────────────────────────────

    async scanColdFiles(): Promise<void> {
        if (this.scanning) {
            new Notice(this.tr("notice.scanning"));
            return;
        }

        this.scanAbortController?.abort();
        this.scanAbortController = new AbortController();
        const signal = this.scanAbortController.signal;

        this.scanning = true;
        this.thawedDuringScan = new Set<string>();

        try {
            // ── All file types (not just .md) ──
            const files = this.app.vault.getFiles();
            const currentPaths = new Set(files.map((f) => f.path));

            if (files.length === 0) {
                this.hiddenSet.clear();
                this.data.lastScanTime = Date.now();
                this.persistHiddenPaths();
                this.refreshUI();
                return;
            }

            const now = Date.now();
            const thresholdMs = this.settings.thresholdDays * 24 * 60 * 60 * 1000;
            const coldPaths: string[] = [];

            const excludeRegexes = this.settings.excludePatterns
                .map(globToRegex)
                .filter((regex): regex is RegExp => regex !== null);
            const excludeFolders = this.settings.excludeFolders
                .map(normalizeFolder)
                .filter((folder) => folder.length > 0);

            for (let i = 0; i < files.length; i += STAT_BATCH_SIZE) {
                if (signal.aborted || this.unloaded) {
                    console.debug(this.tr("console.aborted"));
                    return;
                }

                const batch = files.slice(i, i + STAT_BATCH_SIZE);
                const results = await Promise.allSettled(
                    batch.map(async (file) => {
                        if (this.isExcludedPath(file.path, excludeFolders, excludeRegexes))
                            return null;
                        try {
                            const stat = await this.app.vault.adapter.stat(file.path);
                            if (!stat) return null;
                            return now - stat.mtime >= thresholdMs ? file.path : null;
                        } catch (e) {
                            console.debug(this.tr("console.skipped"), file.path, e);
                            return null;
                        }
                    })
                );

                for (const result of results) {
                    if (result.status === "fulfilled" && result.value) {
                        coldPaths.push(result.value);
                    }
                }

                if (i + STAT_BATCH_SIZE < files.length) {
                    await nextAnimationFrame();
                }
            }

            if (signal.aborted || this.unloaded) {
                console.debug(this.tr("console.aborted"));
                return;
            }

            // ── Build folder coverage (once, for folder visibility) ──
            this.buildFolderCoverage(files);

            // ── Incremental merge: only ADD newly-cold files ──
            const thawed = this.thawedDuringScan ?? new Set<string>();
            for (const path of coldPaths) {
                if (!thawed.has(path)) {
                    this.hiddenSet.add(path);
                }
            }

            // Remove stale paths
            for (const path of this.hiddenSet) {
                if (!currentPaths.has(path) && !this.folderCoverage.has(path)) {
                    this.hiddenSet.delete(path);
                }
            }

            // ── Hide folders whose children are all cold ──
            this.syncFolderVisibility();

            this.data.lastScanTime = Date.now();
            this.persistHiddenPaths();
            this.refreshUI();

            new Notice(
                this.tr("notice.scan.done", files.length, this.hiddenSet.size)
            );
            console.debug(
                this.tr("console.scan.done", files.length, this.hiddenSet.size, this.settings.thresholdDays)
            );
        } finally {
            this.scanning = false;
            this.scanAbortController = null;
            this.thawedDuringScan = null;
        }
    }

    // ── Core: Unhide / path updates ──────────────────────────────────────

    unhideFile(path: string): void {
        const normalized = normalizePath(path);
        this.thawedDuringScan?.add(normalized);

        if (!this.hiddenSet.has(normalized)) return;

        this.hiddenSet.delete(normalized);

        // Unhide ancestor folders whose "all cold" condition just broke
        let current = normalized;
        while (true) {
            const slash = current.lastIndexOf("/");
            if (slash <= 0) break;
            const parent = current.slice(0, slash);
            if (!this.hiddenSet.has(parent)) break;
            const coverage = this.folderCoverage.get(parent);
            if (!coverage) break;
            const stillAllCold = [...coverage].every((fp) => this.hiddenSet.has(fp));
            if (!stillAllCold) {
                this.hiddenSet.delete(parent);
            }
            current = parent;
        }

        this.persistHiddenPaths();
        this.refreshUI();
        console.debug(this.tr("console.thawed", normalized));
    }

    private renameHiddenPath(oldPath: string, newPath: string): void {
        const oldNorm = normalizePath(oldPath);
        const newNorm = normalizePath(newPath);
        if (!this.hiddenSet.has(oldNorm)) return;

        this.hiddenSet.delete(oldNorm);
        this.hiddenSet.add(newNorm);
        this.persistHiddenPaths();
        this.refreshUI();
    }

    private deleteHiddenPath(path: string): void {
        const normalized = normalizePath(path);
        if (!this.hiddenSet.has(normalized)) return;

        this.hiddenSet.delete(normalized);
        this.persistHiddenPaths();
        this.refreshUI();
    }

    // ── Toggle ───────────────────────────────────────────────────────────

    toggleShowHidden(): void {
        this.showingHidden = !this.showingHidden;
        this.refreshUI();
        new Notice(
            this.showingHidden
                ? this.tr("notice.showing")
                : this.tr("notice.hiding")
        );
    }

    // ── Exclusion ────────────────────────────────────────────────────────

    private isExcludedPath(
        path: string,
        excludeFolders: string[],
        excludeRegexes: RegExp[]
    ): boolean {
        for (const folder of excludeFolders) {
            if (path === folder || path.startsWith(folder + "/")) return true;
        }
        for (const regex of excludeRegexes) {
            if (regex.test(path)) return true;
        }
        return false;
    }
}

// ── Settings tab ──────────────────────────────────────────────────────────

class ColdFileHiderSettingTab extends PluginSettingTab {
    constructor(app: App, private plugin: ColdFileHiderPlugin) {
        super(app, plugin);
    }

    display(): void {
        const { containerEl } = this;
        const p = this.plugin;
        const tr = (key: string, ...args: (string | number)[]) => p.tr(key, ...args);

        containerEl.empty();

        new Setting(containerEl).setName(tr("plugin.name")).setHeading();

        // ── About / Ad section (top) ────────────────────────────────────────
        containerEl.createEl("hr");
        new Setting(containerEl).setName(tr("about.title")).setHeading();
        containerEl.createEl("p", {
            cls: "setting-item-description",
            text: tr("about.desc"),
        });
        const linkEmail = containerEl.createEl("a", {
            href: "mailto:koujika97@gmail.com",
            text: tr("about.email"),
        });
        linkEmail.classList.add("cfh-link-block");
        const aboutCta = containerEl.createEl("p", {
            cls: "setting-item-description",
            text: tr("about.cta"),
        });
        aboutCta.classList.add("cfh-cta-text");
        containerEl.createEl("hr");

        // ── Language selector ──
        new Setting(containerEl)
            .setName(tr("lang"))
            .setDesc(tr("lang.desc"))
            .addDropdown((dropdown) => {
                dropdown
                    .addOption("zh", "中文")
                    .addOption("en", "English")
                    .setValue(p.settings.lang)
                    .onChange(async (value: string) => {
                        p.settings.lang = value as Lang;
                        await p.saveAll();
                        // Refresh the settings tab with new language
                        this.display();
                    });
            });

        new Setting(containerEl)
            .setName(tr("cold.threshold"))
            .setDesc(tr("cold.threshold.desc"))
            .addText((text) =>
                text
                    .setPlaceholder("60")
                    .setValue(String(p.settings.thresholdDays))
                    .onChange(async (value) => {
                        const n = Number.parseInt(value, 10);
                        if (Number.isFinite(n) && n >= 1) {
                            p.settings.thresholdDays = Math.floor(n);
                            await p.saveAll();
                        }
                    })
            );

        new Setting(containerEl)
            .setName(tr("scan.startup"))
            .setDesc(tr("scan.startup.desc"))
            .addToggle((toggle) =>
                toggle
                    .setValue(p.settings.scanOnStartup)
                    .onChange(async (value) => {
                        p.settings.scanOnStartup = value;
                        await p.saveAll();
                    })
            );

        new Setting(containerEl)
            .setName(tr("exclude.folders"))
            .setDesc(tr("exclude.folders.desc"))
            .addTextArea((text) => {
                text
                    .setPlaceholder("daily\ntemplates")
                    .setValue(p.settings.excludeFolders.join("\n"))
                    .onChange(async (value) => {
                        p.settings.excludeFolders = sanitizeStringArray(
                            value.split("\n")
                        );
                        await p.saveAll();
                    });
                text.inputEl.rows = 4;
                text.inputEl.cols = 30;
            });

        new Setting(containerEl)
            .setName(tr("exclude.patterns"))
            .setDesc(tr("exclude.patterns.desc"))
            .addTextArea((text) => {
                text
                    .setPlaceholder("templates/*\n**/Archive/**")
                    .setValue(p.settings.excludePatterns.join("\n"))
                    .onChange(async (value) => {
                        p.settings.excludePatterns = sanitizeStringArray(
                            value.split("\n")
                        );
                        await p.saveAll();
                    });
                text.inputEl.rows = 4;
                text.inputEl.cols = 30;
            });

        new Setting(containerEl)
            .setName(tr("manual.scan"))
            .setDesc(tr("manual.scan.desc"))
            .addButton((button) =>
                button.setButtonText(tr("scan.now")).onClick(() => {
                    void p.scanColdFiles();
                })
            );

        new Setting(containerEl)
            .setName(tr("show.hidden"))
            .setDesc(tr("show.hidden.desc"))
            .addButton((button) =>
                button.setButtonText(tr("toggle.show.hide")).onClick(() => {
                    p.toggleShowHidden();
                    this.display();
                })
            );

        const infoEl = containerEl.createEl("p", { cls: "setting-item-description" });
        const hiddenCount = p.hiddenSet.size;
        const lastScanTime = p.data.lastScanTime;
        const lastScanText =
            lastScanTime > 0
                ? new Date(lastScanTime).toLocaleString(p.settings.lang === "zh" ? "zh-CN" : "en-US")
                : tr("never");
        infoEl.textContent = tr("status.line", hiddenCount, lastScanText);
    }
}
