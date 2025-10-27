import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, test, beforeAll } from "vitest";

let stats: any;

beforeAll(() => {
  const projectDir = path.resolve(__dirname, "..");
  execFileSync("npm", ["run", "analyze"], { cwd: projectDir, stdio: "inherit" });
  const statsPath = path.join(projectDir, "dist", "analyze", "stats.json");
  const raw = readFileSync(statsPath, "utf8");
  stats = JSON.parse(raw);
});

const collectMainChunks = (node: any): Array<{ name: string; gzipSize?: number }> => {
  const items: Array<{ name: string; gzipSize?: number }> = [];
  if (node && typeof node === "object") {
    if (typeof node.name === "string" && /main|index|app/i.test(node.name)) {
      items.push({ name: node.name, gzipSize: Number(node.gzipSize ?? node.gzipLength ?? 0) });
    }
    if (Array.isArray(node.children)) {
      node.children.forEach((child) => {
        items.push(...collectMainChunks(child));
      });
    }
  }
  return items;
};

describe("bundle budget", () => {
  test("main chunk stays under 180kB gzip", () => {
    const root = stats?.tree ?? stats;
    const chunks = collectMainChunks(root);
    expect(chunks.length).toBeGreaterThan(0);
    const oversize = chunks.find((chunk) => (chunk.gzipSize ?? 0) > 180 * 1024);
    expect(oversize).toBeUndefined();
  });
});
