import { type App, Notice, PluginSettingTab, Setting, debounce } from "obsidian";
import { basename } from "path";
import { GITHUB_TARGET, type OpenTarget, type RepoLink, normalizeUrl } from "./core.ts";
import { isDirectory, originUrl, resolvePath } from "./system.ts";
import type RepoShortcutsPlugin from "./main.ts";

export interface RepoShortcutsSettings {
  repos: RepoLink[];
  targets: OpenTarget[];
  gitPath: string;
}

export const DEFAULT_SETTINGS: RepoShortcutsSettings = {
  repos: [],
  targets: [
    { name: "vscode", command: "code {path}" },
    { name: "wezterm", command: "wezterm start --cwd {path}" },
  ],
  gitPath: "git",
};

export class RepoShortcutsSettingTab extends PluginSettingTab {
  private save = debounce(() => void this.plugin.saveSettings(), 500, true);

  constructor(
    app: App,
    private plugin: RepoShortcutsPlugin,
  ) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    const { settings } = this.plugin;
    containerEl.empty();
    containerEl.addClass("repo-shortcuts-settings");

    new Setting(containerEl)
      .setName("Repositories")
      .setDesc("Each repository is referenced from a code block by its name.")
      .setHeading();

    settings.repos.forEach((repo, index) => this.displayRepo(containerEl, repo, index));

    new Setting(containerEl).addButton((button) =>
      button
        .setButtonText("Add repository")
        .setCta()
        .onClick(() => {
          settings.repos.push({ name: "", path: "", url: "", description: "" });
          this.save();
          this.display();
        }),
    );

    new Setting(containerEl)
      .setName("Open targets")
      .setDesc(
        `Each target runs a shell command. {path}, {name}, and {url} are replaced with shell-quoted values. The "${GITHUB_TARGET}" target is built in and opens the repository URL in your browser.`,
      )
      .setHeading();

    settings.targets.forEach((target, index) => {
      new Setting(containerEl)
        .addText((text) =>
          text
            .setPlaceholder("Name")
            .setValue(target.name)
            .onChange((value) => {
              target.name = value.trim();
              this.save();
            }),
        )
        .addText((text) => {
          text
            .setPlaceholder("Command, for example: code {path}")
            .setValue(target.command)
            .onChange((value) => {
              target.command = value;
              this.save();
            });
          text.inputEl.addClass("rs-wide-input");
        })
        .addExtraButton((button) =>
          button
            .setIcon("trash-2")
            .setTooltip("Remove target")
            .onClick(() => {
              settings.targets.splice(index, 1);
              this.save();
              this.display();
            }),
        )
        .setClass("rs-target-setting");
    });

    new Setting(containerEl).addButton((button) =>
      button.setButtonText("Add target").onClick(() => {
        settings.targets.push({ name: "", command: "" });
        this.save();
        this.display();
      }),
    );

    new Setting(containerEl).setName("Advanced").setHeading();

    new Setting(containerEl)
      .setName("Git executable")
      .setDesc("Name or full path of the git binary.")
      .addText((text) =>
        text
          .setPlaceholder("git")
          .setValue(settings.gitPath)
          .onChange((value) => {
            settings.gitPath = value.trim() || "git";
            this.save();
          }),
      );
  }

  private displayRepo(containerEl: HTMLElement, repo: RepoLink, index: number): void {
    const { settings } = this.plugin;
    const card = containerEl.createDiv({ cls: "rs-repo-card" });

    new Setting(card)
      .setName("Name")
      .addText((text) =>
        text
          .setPlaceholder("my-repo")
          .setValue(repo.name)
          .onChange((value) => {
            repo.name = value.trim();
            this.save();
          }),
      )
      .addExtraButton((button) =>
        button
          .setIcon("trash-2")
          .setTooltip("Remove repository")
          .onClick(() => {
            settings.repos.splice(index, 1);
            this.save();
            this.display();
          }),
      );

    const pathSetting = new Setting(card).setName("Local path");
    const describePath = () => {
      const missing = repo.path && !isDirectory(resolvePath(repo.path));
      pathSetting.setDesc(missing ? "This directory does not exist." : "");
      pathSetting.descEl.toggleClass("mod-warning", Boolean(missing));
    };
    describePath();
    pathSetting
      .addText((text) => {
        text
          .setPlaceholder("/path/to/repo")
          .setValue(repo.path)
          .onChange((value) => {
            repo.path = value.trim();
            describePath();
            this.save();
          });
        text.inputEl.addClass("rs-wide-input");
      })
      .addButton((button) =>
        button
          .setButtonText("Detect")
          .setTooltip("Fill empty name and URL from the path")
          .onClick(async () => {
            const path = resolvePath(repo.path);
            if (!isDirectory(path)) {
              new Notice("Enter an existing directory first.");
              return;
            }
            if (!repo.name) repo.name = basename(path);
            if (!repo.url) repo.url = normalizeUrl(await originUrl(settings.gitPath, path));
            this.save();
            this.display();
          }),
      );

    new Setting(card).setName("GitHub URL").addText((text) => {
      text
        .setPlaceholder("https://github.com/owner/repo (optional)")
        .setValue(repo.url)
        .onChange((value) => {
          repo.url = value.trim();
          this.save();
        });
      text.inputEl.addClass("rs-wide-input");
    });

    new Setting(card).setName("Description").addText((text) => {
      text
        .setPlaceholder("Optional")
        .setValue(repo.description)
        .onChange((value) => {
          repo.description = value;
          this.save();
        });
      text.inputEl.addClass("rs-wide-input");
    });
  }
}
