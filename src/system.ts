import { execFile, spawn } from "child_process";
import { existsSync, statSync } from "fs";
import { homedir } from "os";
import { delimiter, join } from "path";
import {
  BRANCH_FORMAT,
  COMMIT_FORMAT,
  type BranchInfo,
  type CommitInfo,
  type RepoStatus,
  parseBranches,
  parseCommit,
  parseStatus,
} from "./core.ts";

export interface RepoSnapshot {
  status: RepoStatus;
  branches: BranchInfo[];
  commit: CommitInfo | null;
}

// Apps launched from the Finder or Dock get a minimal PATH that omits these.
const EXTRA_PATH = process.platform === "win32" ? [] : ["/opt/homebrew/bin", "/usr/local/bin"];

function childEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const path = [process.env.PATH, ...EXTRA_PATH].filter(Boolean).join(delimiter);
  return { ...process.env, PATH: path, ...extra };
}

export function resolvePath(path: string): string {
  const trimmed = path.trim();
  if (trimmed === "~") return homedir();
  if (trimmed.startsWith("~/")) return join(homedir(), trimmed.slice(2));
  return trimmed;
}

export function isDirectory(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isDirectory();
  } catch {
    return false;
  }
}

export function git(gitPath: string, cwd: string, args: string[], timeout = 10_000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      gitPath || "git",
      args,
      {
        cwd,
        timeout,
        maxBuffer: 16 * 1024 * 1024,
        env: childEnv({ GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0" }),
      },
      (error, stdout, stderr) => {
        if (!error) return resolve(stdout);
        const message = stderr.trim().split("\n")[0] || error.message;
        reject(new Error(message.replace(/^fatal: /, "")));
      },
    );
  });
}

export async function readSnapshot(gitPath: string, repoPath: string): Promise<RepoSnapshot> {
  const [status, branches, commit] = await Promise.all([
    git(gitPath, repoPath, ["status", "--porcelain=v2", "--branch", "--show-stash"]),
    git(gitPath, repoPath, ["for-each-ref", `--format=${BRANCH_FORMAT}`, "refs/heads"]),
    git(gitPath, repoPath, ["log", "-1", `--format=${COMMIT_FORMAT}`]).catch(() => ""),
  ]);
  return {
    status: parseStatus(status),
    branches: parseBranches(branches),
    commit: parseCommit(commit),
  };
}

export function fetchRemote(gitPath: string, repoPath: string): Promise<string> {
  return git(gitPath, repoPath, ["fetch", "--prune"], 60_000);
}

export async function originUrl(gitPath: string, repoPath: string): Promise<string> {
  try {
    return (await git(gitPath, repoPath, ["remote", "get-url", "origin"])).trim();
  } catch {
    return "";
  }
}

/**
 * Runs a launch command through the user's login shell, detached from Obsidian.
 * stdio is ignored so the launched app never holds a pipe that closes when Obsidian quits.
 */
export function launch(command: string, cwd: string | undefined, onFailure: (message: string) => void): void {
  const options = { cwd, detached: true, stdio: "ignore" as const, env: childEnv() };
  const child =
    process.platform === "win32"
      ? spawn(command, { ...options, shell: true })
      : spawn(process.env.SHELL || "/bin/sh", ["-lc", command], options);
  child.on("error", (error) => onFailure(error.message));
  child.on("exit", (code) => {
    if (code === 127) onFailure("command not found");
    else if (code) onFailure(`exited with code ${code}`);
  });
  child.unref();
}
