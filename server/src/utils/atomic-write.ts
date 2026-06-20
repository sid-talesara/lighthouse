import { existsSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

export function writeFileAtomic(targetPath: string, contents: string): void {
  const dir = dirname(targetPath);
  const tmpPath = join(
    dir,
    `.${basename(targetPath)}.${process.pid}.${Date.now()}.tmp`,
  );

  try {
    writeFileSync(tmpPath, contents, { encoding: "utf8", mode: 0o644 });
    renameSync(tmpPath, targetPath);
  } catch (error) {
    if (existsSync(tmpPath)) {
      rmSync(tmpPath, { force: true });
    }
    throw error;
  }
}
