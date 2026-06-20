import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { LighthouseData } from "../validate/schema.js";
import type { TrackedFileInventoryEntry } from "./tracked-files.js";

type ParsedNode = LighthouseData["nodes"][number];
type DbTable = NonNullable<LighthouseData["dbTables"]>[number];
type DbColumn = DbTable["columns"][number];

const TABLE_FN_RE = /\b(?:pgTable|mysqlTable|sqliteTable)\s*\(\s*["'`]([^"'`]+)["'`]/g;

/**
 * Match a Drizzle column definition line, e.g.:
 *   organizationId: uuid("organization_id").notNull().references(() => organizations.id)
 * Captures: property name, drizzle column helper (type), and the trailing chain.
 */
const COLUMN_RE = /^\s*(\w+)\s*:\s*(\w+)\s*\(([^]*?)\)((?:\s*\.\w+\([^]*?\))*)\s*,?\s*$/;

function slugify(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

/**
 * Extract column definitions inside the object literal that follows a table call.
 * Best-effort line-based parse; ignores index callbacks / unrelated lines.
 */
function extractColumns(body: string): DbColumn[] {
  const columns: DbColumn[] = [];
  for (const line of body.split("\n")) {
    const match = COLUMN_RE.exec(line);
    if (!match) continue;
    const [, prop, type, args, chain] = match;
    // Skip drizzle index/constraint helpers that can appear in the columns object.
    if (["index", "uniqueIndex", "primaryKey", "foreignKey", "unique", "check"].includes(type)) {
      continue;
    }
    // Column name is the string literal in args, else the property name.
    const nameLiteral = args.match(/^\s*["'`]([^"'`]+)["'`]/);
    const name = nameLiteral?.[1] ?? prop;
    const fullChain = `${args}${chain}`;
    const pk = /\.primaryKey\s*\(/.test(fullChain);
    const fkMatch = fullChain.match(/\.references\s*\(\s*\(\s*\)\s*=>\s*(\w+)\.(\w+)/);
    const column: DbColumn = { name, type };
    if (pk) column.pk = true;
    if (fkMatch) column.fk = slugify(fkMatch[1]);
    columns.push(column);
  }
  return columns;
}

/**
 * Pull the object-literal body that immediately follows a table-fn call site by
 * walking braces from the first `{` after the call.
 */
function sliceTableBody(source: string, callEndIndex: number): string {
  const open = source.indexOf("{", callEndIndex);
  if (open === -1) return "";
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  return "";
}

function nodeForPath(filePath: string, nodes: ParsedNode[]): string | undefined {
  const normalized = filePath.replace(/^\.\//, "");
  for (const node of nodes) {
    for (const keyFile of node.key_files ?? []) {
      if (keyFile.replace(/^\.\//, "") === normalized) return node.id;
    }
  }
  let best: { nodeId: string; len: number } | undefined;
  for (const node of nodes) {
    const dir = (node.path ?? "").replace(/^\.\//, "").replace(/\/$/, "");
    if (dir && normalized.startsWith(`${dir}/`) && (!best || dir.length > best.len)) {
      best = { nodeId: node.id, len: dir.length };
    }
  }
  return best?.nodeId;
}

/**
 * Scan tracked Drizzle schema files (.ts whose path contains "schema") and
 * regex-extract pgTable/mysqlTable/sqliteTable definitions with columns.
 * Returns [] gracefully when no Drizzle schema exists.
 */
export async function extractDbTables(
  repoPath: string,
  files: TrackedFileInventoryEntry[],
  nodes: ParsedNode[],
): Promise<DbTable[]> {
  const candidates = files.filter(
    (file) => file.path.endsWith(".ts") && /schema/i.test(file.path),
  );

  const tables: DbTable[] = [];
  const seenIds = new Set<string>();

  for (const file of candidates) {
    let source: string;
    try {
      source = await readFile(join(repoPath, file.path), "utf8");
    } catch {
      continue;
    }
    if (!/\b(?:pgTable|mysqlTable|sqliteTable)\s*\(/.test(source)) continue;

    const moduleId = nodeForPath(file.path, nodes);
    TABLE_FN_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = TABLE_FN_RE.exec(source)) !== null) {
      const tableName = match[1];
      const body = sliceTableBody(source, match.index + match[0].length);
      const columns = extractColumns(body);

      let id = slugify(tableName) || tableName;
      let suffix = 2;
      while (seenIds.has(id)) {
        id = `${slugify(tableName)}_${suffix}`;
        suffix += 1;
      }
      seenIds.add(id);

      const table: DbTable = {
        id,
        name: tableName,
        columns,
      };
      if (moduleId) table.module_id = moduleId;
      table.summary = `Drizzle table defined in ${file.path}`;
      tables.push(table);
    }
  }

  return tables;
}
