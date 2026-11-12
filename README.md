# Repo Shortcuts

**Status:** in development. Desktop only.

## About

Notes about a project usually sit far from the repository that holds its code. To check a branch or start work on a task, you leave Obsidian, find the folder, and open a terminal or editor by hand.

Repo Shortcuts is an Obsidian plugin that puts the repository inside the note. You register a local repository once in the plugin settings, then reference it by name from a code block. The block renders the repository's details, its live git status, or a button that opens it in your editor, your terminal, or on GitHub.

## Quickstart

### Prerequisites

- Obsidian 1.4 or later on desktop
- `git` on your machine
- Node.js 22 or later, to build the plugin

### Building

```sh
npm install
npm run build
```

The build writes `main.js` next to `manifest.json` and `styles.css`. Copy or symlink those three files into `<vault>/.obsidian/plugins/repo-shortcuts/`, then enable **Repo Shortcuts** under **Settings → Community plugins**.

Use `npm run dev` to rebuild on every change, and `npm test` to run the unit tests.

### Setup

Open **Settings → Repo Shortcuts**.

1. Under **Repositories**, add a repository with a name and a local path. The GitHub URL and description are optional. **Detect** fills an empty name and URL from the path.
2. Under **Open targets**, adjust the shell commands that open a repository. The plugin ships with `vscode` and `wezterm`, and you can add any other editor or terminal.

A target command may use three placeholders, each replaced with a shell-quoted value: `{path}`, `{name}`, and `{url}`. For example, `open -a iTerm {path}` adds an iTerm target.

## Usage

Each block names one repository and performs one action. The **Insert repo … block** commands in the command palette write these blocks for you.

Show the name, description, path, and URL:

````markdown
```repo-info
yami
```
````

Show the branch, upstream, ahead and behind counts, working tree state, last commit, and local branches:

````markdown
```repo-status
yami
```
````

The status block reads local state when the note renders. **Refresh** reads it again, and **Fetch** runs `git fetch --prune` first, so the plugin contacts the network only when you ask.

Add a button that opens the repository in a target:

````markdown
```repo-open
repo: yami
target: wezterm
```
````

The `github` target is built in and opens the repository URL in your browser. Every other target name must match one from the settings.

## Conventions

- **One block, one repository, one action.** A note states each shortcut explicitly, so nothing depends on hidden context such as frontmatter.
- **No network access on render.** Only the **Fetch** button reaches a remote.
- **Targets are shell commands.** Supporting a new editor or terminal takes a settings entry, with no change to the plugin.

## Documentation

- Block parsing and git output parsing: `./src/core.ts`
- Git and launch commands: `./src/system.ts`
- Block rendering: `./src/blocks.ts`
- [Obsidian plugin API](https://docs.obsidian.md/Home)

## License

MIT
