import { type App, type Editor, FuzzySuggestModal, Notice, Plugin } from "obsidian";
import { BLOCK_KINDS, type BlockKind, RepoBlock } from "./blocks.ts";
import { GITHUB_TARGET, type OpenTarget, type RepoLink, sameName } from "./core.ts";
import { DEFAULT_SETTINGS, type RepoShortcutsSettings, RepoShortcutsSettingTab } from "./settings.ts";

class PickModal extends FuzzySuggestModal<string> {
  constructor(
    app: App,
    private items: string[],
    placeholder: string,
    private onPick: (item: string) => void,
  ) {
    super(app);
    this.setPlaceholder(placeholder);
  }

  getItems(): string[] {
    return this.items;
  }

  getItemText(item: string): string {
    return item;
  }

  onChooseItem(item: string): void {
    this.onPick(item);
  }
}

export default class RepoShortcutsPlugin extends Plugin {
  settings: RepoShortcutsSettings = DEFAULT_SETTINGS;
  blocks = new Set<RepoBlock>();

  async onload(): Promise<void> {
    await this.loadSettings();
    this.addSettingTab(new RepoShortcutsSettingTab(this.app, this));

    for (const kind of BLOCK_KINDS) {
      this.registerMarkdownCodeBlockProcessor(`repo-${kind}`, (source, el, ctx) => {
        ctx.addChild(new RepoBlock(el, this, kind, source));
      });
      this.addCommand({
        id: `insert-${kind}-block`,
        name: `Insert repo ${kind} block`,
        editorCallback: (editor) => this.insertBlock(editor, kind),
      });
    }
  }

  findRepo(name: string): RepoLink | undefined {
    return this.settings.repos.find((repo) => repo.name && sameName(repo.name, name));
  }

  findTarget(name: string): OpenTarget | undefined {
    return this.settings.targets.find((target) => target.name && sameName(target.name, name));
  }

  openSettings(): void {
    // The settings modal is not part of the public API.
    const setting = (this.app as unknown as { setting?: { open(): void; openTabById(id: string): void } }).setting;
    setting?.open();
    setting?.openTabById(this.manifest.id);
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign(structuredClone(DEFAULT_SETTINGS), await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    for (const block of this.blocks) block.render();
  }

  private insertBlock(editor: Editor, kind: BlockKind): void {
    const repos = this.settings.repos.map((repo) => repo.name).filter(Boolean);
    if (!repos.length) {
      new Notice("Add a repository in the Repo Shortcuts settings first.");
      this.openSettings();
      return;
    }
    const insert = (lines: string[]) =>
      editor.replaceSelection(["```repo-" + kind, ...lines, "```", ""].join("\n"));

    new PickModal(this.app, repos, "Repository", (repo) => {
      if (kind !== "open") return insert([repo]);
      const targets = [GITHUB_TARGET, ...this.settings.targets.map((t) => t.name).filter(Boolean)];
      new PickModal(this.app, targets, "Open in", (target) =>
        insert([`repo: ${repo}`, `target: ${target}`]),
      ).open();
    }).open();
  }
}
