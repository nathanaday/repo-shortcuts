export interface RepoLink {
  name: string;
  path: string;
  url: string;
  description: string;
}

export interface OpenTarget {
  name: string;
  command: string;
}

export interface BlockSpec {
  repo: string;
  target: string;
}

export interface RepoStatus {
  branch: string;
  oid: string;
  detached: boolean;
  initial: boolean;
  upstream: string;
  upstreamGone: boolean;
  ahead: number;
  behind: number;
  staged: number;
  unstaged: number;
  untracked: number;
  conflicts: number;
  stash: number;
}

export interface BranchInfo {
  name: string;
  current: boolean;
  upstream: string;
  gone: boolean;
  ahead: number;
  behind: number;
}

export interface CommitInfo {
  hash: string;
  when: string;
  subject: string;
}

export const GITHUB_TARGET = "github";

/** Accepts `repo: x` / `target: y` lines, or bare lines read in that order. */
export function parseBlock(source: string): BlockSpec {
  const spec: BlockSpec = { repo: "", target: "" };
  const bare: string[] = [];
  for (const raw of source.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const keyed = /^(repo|target)\s*:\s*(.*)$/i.exec(line);
    if (keyed) spec[keyed[1].toLowerCase() as keyof BlockSpec] = keyed[2].trim();
    else bare.push(line);
  }
  if (!spec.repo && bare.length) spec.repo = bare.shift() as string;
  if (!spec.target && bare.length) spec.target = bare.shift() as string;
  return spec;
}

export function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Substitutes {path}, {name}, and {url}; each value is shell-quoted. */
export function expandCommand(template: string, values: { path: string; name: string; url: string }): string {
  return template.replace(/\{(path|name|url)\}/g, (_, key: "path" | "name" | "url") => shellQuote(values[key]));
}

/** Turns any common remote spelling (scp-like, ssh://, bare host) into an https URL. */
export function normalizeUrl(url: string): string {
  let out = url.trim();
  if (!out) return "";
  const scp = /^[\w.-]+@([\w.-]+):(.+)$/.exec(out);
  if (scp) out = `https://${scp[1]}/${scp[2]}`;
  out = out.replace(/^(ssh|git):\/\/(?:[\w.-]+@)?/, "https://");
  out = out.replace(/\.git\/?$/, "");
  if (!/^https?:\/\//i.test(out)) out = `https://${out}`;
  return out;
}

export function urlHost(url: string): string {
  const match = /^https?:\/\/([^/]+)/i.exec(normalizeUrl(url));
  return match ? match[1].replace(/^www\./, "") : "";
}

/** Parses `git status --porcelain=v2 --branch --show-stash`. */
export function parseStatus(text: string): RepoStatus {
  const status: RepoStatus = {
    branch: "",
    oid: "",
    detached: false,
    initial: false,
    upstream: "",
    upstreamGone: false,
    ahead: 0,
    behind: 0,
    staged: 0,
    unstaged: 0,
    untracked: 0,
    conflicts: 0,
    stash: 0,
  };
  let sawAb = false;
  for (const line of text.split("\n")) {
    if (line.startsWith("# branch.oid ")) {
      const oid = line.slice(13);
      status.initial = oid === "(initial)";
      status.oid = status.initial ? "" : oid;
    } else if (line.startsWith("# branch.head ")) {
      const head = line.slice(14);
      status.detached = head === "(detached)";
      status.branch = status.detached ? "" : head;
    } else if (line.startsWith("# branch.upstream ")) {
      status.upstream = line.slice(18);
    } else if (line.startsWith("# branch.ab ")) {
      const ab = /\+(\d+) -(\d+)/.exec(line);
      if (ab) {
        sawAb = true;
        status.ahead = Number(ab[1]);
        status.behind = Number(ab[2]);
      }
    } else if (line.startsWith("# stash ")) {
      status.stash = Number(line.slice(8)) || 0;
    } else if (line.startsWith("1 ") || line.startsWith("2 ")) {
      if (line[2] !== ".") status.staged++;
      if (line[3] !== ".") status.unstaged++;
    } else if (line.startsWith("u ")) {
      status.conflicts++;
    } else if (line.startsWith("? ")) {
      status.untracked++;
    }
  }
  status.upstreamGone = Boolean(status.upstream) && !sawAb;
  return status;
}

export function isClean(status: RepoStatus): boolean {
  return status.staged + status.unstaged + status.untracked + status.conflicts === 0;
}

export const BRANCH_FORMAT = "%(HEAD)%09%(refname:short)%09%(upstream:short)%09%(upstream:track,nobracket)";

/** Parses `git for-each-ref --format=BRANCH_FORMAT refs/heads`. */
export function parseBranches(text: string): BranchInfo[] {
  const branches: BranchInfo[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const [head, name, upstream = "", track = ""] = line.split("\t");
    branches.push({
      name,
      current: head === "*",
      upstream,
      gone: track.includes("gone"),
      ahead: Number(/ahead (\d+)/.exec(track)?.[1] ?? 0),
      behind: Number(/behind (\d+)/.exec(track)?.[1] ?? 0),
    });
  }
  return branches;
}

export const COMMIT_FORMAT = "%h%x09%cr%x09%s";

/** Parses `git log -1 --format=COMMIT_FORMAT`. */
export function parseCommit(text: string): CommitInfo | null {
  const line = text.split("\n")[0];
  if (!line) return null;
  const [hash, when, ...subject] = line.split("\t");
  return { hash, when: when ?? "", subject: subject.join("\t") };
}
