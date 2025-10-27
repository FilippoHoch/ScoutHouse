import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const runCommand = (command, args, options = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: process.platform === "win32",
      ...options
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
      }
    });
  });

const ensureStatsWithinBudget = async (statsFile, maxBytes) => {
  const raw = await readFile(statsFile, "utf8");
  const stats = JSON.parse(raw);

  const findMainChunks = (node) => {
    const items = [];
    if (node.name && typeof node.name === "string" && /main|index|app/i.test(node.name)) {
      items.push(node);
    }

    if (Array.isArray(node.children)) {
      node.children.forEach((child) => {
        items.push(...findMainChunks(child));
      });
    }

    return items;
  };

  const rootNode = stats.tree ?? stats;
  const chunks = findMainChunks(rootNode);
  if (chunks.length === 0) {
    throw new Error(`Unable to locate main chunk data in ${statsFile}`);
  }

  const oversized = chunks.find((chunk) => {
    const gzipBytes = Number(chunk.gzipSize ?? chunk.gzipLength ?? 0);
    return gzipBytes > maxBytes;
  });
  if (oversized) {
    const gzipBytes = Number(oversized.gzipSize ?? oversized.gzipLength ?? 0);
    const sizeKb = (gzipBytes / 1024).toFixed(2);
    throw new Error(`Main chunk exceeds budget: ${sizeKb} kB gzip (limit ${(maxBytes / 1024).toFixed(2)} kB)`);
  }
};

const main = async () => {
  const projectDir = path.resolve(__dirname, "..");
  const env = { ...process.env, ANALYZE: "true" };

  await runCommand("npx", ["tsc", "--noEmit"], { cwd: projectDir, env });
  await runCommand("npx", ["vite", "build"], { cwd: projectDir, env });

  const statsFile = path.join(projectDir, "dist", "analyze", "stats.json");
  await ensureStatsWithinBudget(statsFile, 180 * 1024);

  console.log("Bundle analysis complete: main chunk within budget.");
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
