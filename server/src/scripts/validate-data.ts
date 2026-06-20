import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { LighthouseDataSchema } from "../validate/schema.js";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const dataPath = join(repoRoot, "public", "data.json");
const parsed = JSON.parse(readFileSync(dataPath, "utf8"));

LighthouseDataSchema.parse(parsed);
console.log(`[companion] valid ${dataPath}`);
