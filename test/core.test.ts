import assert from "node:assert/strict";
import { test } from "node:test";
import {
  expandCommand,
  isClean,
  normalizeUrl,
  parseBlock,
  parseBranches,
  parseCommit,
  parseStatus,
} from "../src/core.ts";

test("parseBlock reads keyed and bare lines", () => {
  assert.deepEqual(parseBlock("yami\n"), { repo: "yami", target: "" });
  assert.deepEqual(parseBlock("repo: yami\ntarget: wezterm"), { repo: "yami", target: "wezterm" });
  assert.deepEqual(parseBlock("\n# note\nyami\nvscode\n"), { repo: "yami", target: "vscode" });
  assert.deepEqual(parseBlock("Target: github\nmy repo"), { repo: "my repo", target: "github" });
});

test("expandCommand shell-quotes values", () => {
  const values = { path: "/tmp/it's here", name: "n", url: "" };
  assert.equal(expandCommand("code {path}", values), `code '/tmp/it'\\''s here'`);
  assert.equal(expandCommand("echo {name} {other}", values), "echo 'n' {other}");
});

test("normalizeUrl handles common remote spellings", () => {
  assert.equal(normalizeUrl("git@github.com:owner/repo.git"), "https://github.com/owner/repo");
  assert.equal(normalizeUrl("ssh://git@github.com/owner/repo.git"), "https://github.com/owner/repo");
  assert.equal(normalizeUrl("www.github.com/owner/repo"), "https://www.github.com/owner/repo");
  assert.equal(normalizeUrl("https://github.com/owner/repo"), "https://github.com/owner/repo");
  assert.equal(normalizeUrl("  "), "");
});

test("parseStatus counts changes and tracking", () => {
  const status = parseStatus(
    [
      "# branch.oid 1234567890abcdef",
      "# branch.head main",
      "# branch.upstream origin/main",
      "# branch.ab +2 -1",
      "# stash 3",
      "1 M. N... 100644 100644 100644 a b staged.txt",
      "1 .M N... 100644 100644 100644 a b modified.txt",
      "1 MM N... 100644 100644 100644 a b both.txt",
      "2 R. N... 100644 100644 100644 a b R100 new.txt\told.txt",
      "u UU N... 100644 100644 100644 100644 a b c conflict.txt",
      "? untracked.txt",
      "",
    ].join("\n"),
  );
  assert.equal(status.branch, "main");
  assert.equal(status.upstream, "origin/main");
  assert.equal(status.upstreamGone, false);
  assert.deepEqual(
    [status.ahead, status.behind, status.staged, status.unstaged, status.untracked, status.conflicts, status.stash],
    [2, 1, 3, 2, 1, 1, 3],
  );
  assert.equal(isClean(status), false);
});

test("parseStatus handles detached, initial, and gone upstream", () => {
  const detached = parseStatus("# branch.oid abcdef1\n# branch.head (detached)\n");
  assert.equal(detached.detached, true);
  assert.equal(detached.branch, "");
  assert.equal(isClean(detached), true);

  const initial = parseStatus("# branch.oid (initial)\n# branch.head main\n");
  assert.equal(initial.initial, true);
  assert.equal(initial.oid, "");

  const gone = parseStatus("# branch.oid abc\n# branch.head f\n# branch.upstream origin/f\n");
  assert.equal(gone.upstreamGone, true);
});

test("parseBranches reads tracking info", () => {
  const branches = parseBranches(
    ["*\tmain\torigin/main\tahead 1, behind 2", " \tlocal\t\t", " \told\torigin/old\tgone", ""].join("\n"),
  );
  assert.deepEqual(branches, [
    { name: "main", current: true, upstream: "origin/main", gone: false, ahead: 1, behind: 2 },
    { name: "local", current: false, upstream: "", gone: false, ahead: 0, behind: 0 },
    { name: "old", current: false, upstream: "origin/old", gone: true, ahead: 0, behind: 0 },
  ]);
});

test("parseCommit splits hash, age, and subject", () => {
  assert.deepEqual(parseCommit("abc1234\t2 hours ago\tFix the\tthing\n"), {
    hash: "abc1234",
    when: "2 hours ago",
    subject: "Fix the\tthing",
  });
  assert.equal(parseCommit(""), null);
});
