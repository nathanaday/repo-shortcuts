import { MarkdownRenderChild, Notice, setIcon } from "obsidian";
import {
  GITHUB_TARGET,
  type BlockSpec,
  type RepoLink,
  expandCommand,
  isClean,
  normalizeUrl,
  parseBlock,
  sameName,
  urlHost,
} from "./core.ts";
import { type RepoSnapshot, fetchRemote, isDirectory, launch, readSnapshot, resolvePath } from "./system.ts";
import type RepoShortcutsPlugin from "./main.ts";

export const BLOCK_KINDS = ["info", "status", "open"] as const;
export type BlockKind = (typeof BLOCK_KINDS)[number];

type Tone = "ok" | "info" | "warn" | "error" | "muted";

function icon(parent: HTMLElement, name: string, fallback = "circle"): HTMLElement {
  const el = parent.createSpan({ cls: "rs-icon" });
  setIcon(el, name);
  if (!el.firstChild) setIcon(el, fallback);
  return el;
}

function chip(parent: HTMLElement, tone: Tone, iconName: string, text: string): void {
  const el = parent.createSpan({ cls: `rs-chip rs-${tone}` });
  icon(el, iconName);
  el.createSpan({ text });
}

function plural(count: number, noun: string, many = `${noun}s`): string {
  return `${count} ${count === 1 ? noun : many}`;
}

export class RepoBlock extends MarkdownRenderChild {
  private spec: BlockSpec;
  private renderToken = 0;

  constructor(
    containerEl: HTMLElement,
    private plugin: RepoShortcutsPlugin,
    private kind: BlockKind,
    source: string,
  ) {
    super(containerEl);
    this.spec = parseBlock(source);
  }

  onload(): void {
    this.plugin.blocks.add(this);
    this.render();
  }

  onunload(): void {
    this.plugin.blocks.delete(this);
  }

  render(): void {
    this.renderToken++;
    this.containerEl.empty();
    const root = this.containerEl.createDiv({ cls: `repo-shortcuts rs-${this.kind}` });

    if (!this.spec.repo) return this.renderProblem(root, "Name a repository in this block.");
    const repo = this.plugin.findRepo(this.spec.repo);
    if (!repo) return this.renderProblem(root, `No repository named "${this.spec.repo}" is configured.`);

    if (this.kind === "info") this.renderInfo(root, repo);
    else if (this.kind === "status") void this.renderStatus(root, repo);
    else this.renderOpen(root, repo);
  }

  private renderProblem(root: HTMLElement, message: string): void {
    root.addClass("rs-problem");
    const row = root.createDiv({ cls: "rs-row" });
    icon(row, "alert-triangle");
    row.createSpan({ text: message });
    const names = this.plugin.settings.repos.map((r) => r.name).filter(Boolean);
    if (names.length) root.createDiv({ cls: "rs-hint", text: `Configured: ${names.join(", ")}` });
    const button = root.createEl("button", { cls: "rs-button", text: "Open settings" });
    button.addEventListener("click", () => this.plugin.openSettings());
  }

  private renderInfo(root: HTMLElement, repo: RepoLink): void {
    const head = root.createDiv({ cls: "rs-head" });
    icon(head, "folder-git-2", "folder");
    head.createSpan({ cls: "rs-title", text: repo.name });

    if (repo.description) root.createDiv({ cls: "rs-desc", text: repo.description });

    const path = resolvePath(repo.path);
    const pathRow = root.createDiv({ cls: "rs-row" });
    icon(pathRow, "folder");
    const pathEl = pathRow.createEl("code", { cls: "rs-path", text: repo.path || "(no path)" });
    pathEl.setAttribute("aria-label", "Copy path");
    pathEl.addEventListener("click", () => {
      void navigator.clipboard.writeText(path);
      new Notice("Path copied");
    });
    if (!isDirectory(path)) pathRow.createSpan({ cls: "rs-chip rs-error", text: "not found" });

    if (repo.url) {
      const url = normalizeUrl(repo.url);
      const urlRow = root.createDiv({ cls: "rs-row" });
      icon(urlRow, "link");
      urlRow.createEl("a", { cls: "rs-url", text: url.replace(/^https?:\/\//, ""), href: url });
    }
  }

  private async renderStatus(root: HTMLElement, repo: RepoLink): Promise<void> {
    const token = this.renderToken;
    const path = resolvePath(repo.path);
    const fail = (message: string) => {
      root.empty();
      root.addClass("rs-problem");
      const head = root.createDiv({ cls: "rs-head" });
      icon(head, "git-branch");
      head.createSpan({ cls: "rs-title", text: repo.name });
      const row = root.createDiv({ cls: "rs-row" });
      icon(row, "alert-triangle");
      row.createSpan({ text: message });
      this.renderStatusFooter(root, path, false);
    };

    if (!isDirectory(path)) return fail(`Path not found: ${repo.path}`);

    root.createDiv({ cls: "rs-hint", text: `Reading ${repo.name}…` });
    let snapshot: RepoSnapshot;
    try {
      snapshot = await readSnapshot(this.plugin.settings.gitPath, path);
    } catch (error) {
      if (token === this.renderToken) fail((error as Error).message);
      return;
    }
    if (token !== this.renderToken) return;
    root.empty();

    const { status, branches, commit } = snapshot;

    const head = root.createDiv({ cls: "rs-head" });
    icon(head, "git-branch");
    const branchLabel = status.detached
      ? `detached at ${status.oid.slice(0, 7)}`
      : status.branch || "(no branch)";
    head.createSpan({ cls: "rs-title", text: branchLabel });
    if (status.upstream) {
      icon(head, "arrow-right").addClass("rs-faint");
      head.createSpan({ cls: "rs-upstream", text: status.upstream });
    }
    head.createSpan({ cls: "rs-repo-name", text: repo.name });

    const chips = root.createDiv({ cls: "rs-chips" });
    if (!status.upstream) chip(chips, "muted", "cloud-off", "no upstream");
    else if (status.upstreamGone) chip(chips, "warn", "cloud-off", "upstream gone");
    else if (!status.ahead && !status.behind) chip(chips, "ok", "check", "in sync");
    else {
      if (status.ahead) chip(chips, "info", "arrow-up", `${status.ahead} ahead`);
      if (status.behind) chip(chips, "warn", "arrow-down", `${status.behind} behind`);
    }

    if (isClean(status)) chip(chips, "ok", "check", "working tree clean");
    else {
      if (status.conflicts) chip(chips, "error", "alert-triangle", plural(status.conflicts, "conflict"));
      if (status.staged) chip(chips, "info", "plus", `${status.staged} staged`);
      if (status.unstaged) chip(chips, "warn", "pencil", `${status.unstaged} modified`);
      if (status.untracked) chip(chips, "muted", "file-question", `${status.untracked} untracked`);
    }
    if (status.stash) chip(chips, "muted", "archive", plural(status.stash, "stash", "stashes"));

    const commitRow = root.createDiv({ cls: "rs-row rs-commit" });
    icon(commitRow, "git-commit-horizontal", "git-commit");
    if (commit) {
      commitRow.createEl("code", { text: commit.hash });
      commitRow.createSpan({ cls: "rs-subject", text: commit.subject });
      commitRow.createSpan({ cls: "rs-faint rs-when", text: commit.when });
    } else {
      commitRow.createSpan({ cls: "rs-faint", text: "no commits yet" });
    }

    if (branches.length) {
      const details = root.createEl("details", { cls: "rs-branches" });
      details.createEl("summary", { text: plural(branches.length, "branch", "branches") });
      const list = details.createEl("ul");
      for (const branch of branches) {
        const item = list.createEl("li", { cls: branch.current ? "rs-current" : "" });
        item.createSpan({ cls: "rs-branch-name", text: branch.name });
        const track = item.createSpan({ cls: "rs-faint rs-track" });
        if (!branch.upstream) track.setText("local only");
        else if (branch.gone) track.setText(`${branch.upstream} (gone)`);
        else {
          const parts = [branch.upstream];
          if (branch.ahead) parts.push(`↑${branch.ahead}`);
          if (branch.behind) parts.push(`↓${branch.behind}`);
          track.setText(parts.join("  "));
        }
      }
    }

    this.renderStatusFooter(root, path, Boolean(status.upstream) || branches.some((b) => b.upstream));
  }

  private renderStatusFooter(root: HTMLElement, path: string, canFetch: boolean): void {
    const foot = root.createDiv({ cls: "rs-foot" });
    const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    foot.createSpan({ cls: "rs-faint", text: `Read at ${time}` });
    const actions = foot.createDiv({ cls: "rs-actions" });

    const refresh = actions.createEl("button", { cls: "rs-button" });
    icon(refresh, "refresh-cw");
    refresh.createSpan({ text: "Refresh" });
    refresh.addEventListener("click", () => this.render());

    if (!canFetch) return;
    const fetch = actions.createEl("button", { cls: "rs-button" });
    icon(fetch, "download-cloud", "download");
    const label = fetch.createSpan({ text: "Fetch" });
    fetch.addEventListener("click", async () => {
      fetch.disabled = true;
      label.setText("Fetching…");
      try {
        await fetchRemote(this.plugin.settings.gitPath, path);
      } catch (error) {
        new Notice(`Fetch failed: ${(error as Error).message}`);
      }
      this.render();
    });
  }

  private renderOpen(root: HTMLElement, repo: RepoLink): void {
    const targetName = this.spec.target;
    const available = [GITHUB_TARGET, ...this.plugin.settings.targets.map((t) => t.name).filter(Boolean)];
    if (!targetName) return this.renderProblem(root, `Name a target: ${available.join(", ")}.`);

    let label: string;
    let iconName: string;
    let run: () => void;
    let problem = "";

    if (sameName(targetName, GITHUB_TARGET)) {
      const url = normalizeUrl(repo.url);
      const host = urlHost(repo.url);
      label = host === "github.com" || !host ? "Open on GitHub" : `Open on ${host}`;
      iconName = "github";
      if (!url) problem = "no URL configured";
      run = () => window.open(url);
    } else {
      const target = this.plugin.findTarget(targetName);
      if (!target) return this.renderProblem(root, `No target named "${targetName}". Available: ${available.join(", ")}.`);
      const path = resolvePath(repo.path);
      label = `Open in ${target.name}`;
      iconName = /code|cursor|zed|idea|editor|vim/i.test(target.name) ? "code-2" : "terminal";
      if (!isDirectory(path)) problem = "path not found";
      else if (!target.command.trim()) problem = "target has no command";
      run = () => {
        const command = expandCommand(target.command, { path, name: repo.name, url: normalizeUrl(repo.url) });
        launch(command, path, (message) => new Notice(`${target.name}: ${message}`));
      };
    }

    const button = root.createEl("button", { cls: "rs-open-button" });
    const head = button.createDiv({ cls: "rs-head" });
    icon(head, "folder-git-2", "folder");
    head.createSpan({ cls: "rs-title", text: repo.name });
    const row = button.createDiv({ cls: "rs-row rs-open-action" });
    icon(row, iconName, sameName(targetName, GITHUB_TARGET) ? "globe" : "terminal");
    row.createSpan({ text: label });
    if (problem) row.createSpan({ cls: "rs-chip rs-warn", text: problem });
    icon(row, "arrow-up-right").addClass("rs-open-arrow");
    if (problem) {
      button.disabled = true;
      button.addClass("rs-disabled");
    } else {
      button.addEventListener("click", run);
    }
  }
}
