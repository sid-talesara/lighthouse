import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";

import type { LighthouseData } from "../validate/schema.js";
import type { TrackedFileInventoryEntry } from "./tracked-files.js";

type DbMigration = NonNullable<LighthouseData["dbMigrations"]>[number];

/**
 * Directories that conventionally hold migration files. A tracked file counts as
 * a migration candidate when its path sits under one of these segments.
 */
const MIGRATION_DIR_RE = /(?:^|\/)(?:drizzle\/migrations|drizzle|migrations|db\/migrations)\//i;

/** Journal files (Drizzle) that record migration ordering + timestamps. */
const JOURNAL_RE = /(?:^|\/)meta\/_journal\.json$/i;

/** A migration file is a .sql file inside a recognised migrations directory. */
function isMigrationSqlFile(path: string): boolean {
  return path.toLowerCase().endsWith(".sql") && MIGRATION_DIR_RE.test(path);
}

/**
 * Derive a human-readable name from a migration filename.
 * e.g. "0002_add_runs.sql" -> "0002 add runs".
 */
function nameFromFile(path: string): string {
  const base = basename(path).replace(/\.sql$/i, "");
  const cleaned = base.replace(/[_-]+/g, " ").trim();
  return cleaned || base;
}

/**
 * Try to parse an ISO date from a migration filename. Supports a leading
 * 14-digit timestamp (YYYYMMDDHHMMSS) or a YYYY-MM-DD / YYYYMMDD prefix.
 */
function dateFromFile(path: string): string | undefined {
  const base = basename(path);
  const ts = base.match(/^(\d{4})(\d{2})(\d{2})(?:(\d{2})(\d{2})(\d{2}))?/);
  if (ts) {
    const [, y, mo, d] = ts;
    const month = Number.parseInt(mo, 10);
    const day = Number.parseInt(d, 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${y}-${mo}-${d}`;
    }
  }
  const dash = base.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (dash) return `${dash[1]}-${dash[2]}-${dash[3]}`;
  return undefined;
}

interface JournalEntry {
  idx?: number;
  tag?: string;
  when?: number;
}

/**
 * Read a Drizzle `meta/_journal.json` and return a map from migration tag to
 * an ISO date derived from its `when` epoch-millis timestamp.
 */
async function readJournalDates(
  repoPath: string,
  journalPath: string,
): Promise<Map<string, string>> {
  const dates = new Map<string, string>();
  try {
    const raw = await readFile(join(repoPath, journalPath), "utf8");
    const parsed = JSON.parse(raw) as { entries?: JournalEntry[] };
    for (const entry of parsed.entries ?? []) {
      if (!entry.tag || typeof entry.when !== "number") continue;
      const date = new Date(entry.when);
      if (!Number.isNaN(date.getTime())) {
        dates.set(entry.tag, date.toISOString().slice(0, 10));
      }
    }
  } catch {
    // Missing/invalid journal — degrade gracefully.
  }
  return dates;
}

/**
 * Scan tracked files for database migration files (Drizzle/SQL migration dirs)
 * and emit one DbMigration per file. Dates are taken from the filename or, when
 * available, the Drizzle `meta/_journal.json`. Returns [] gracefully when none.
 */
export async function extractDbMigrations(
  repoPath: string,
  files: TrackedFileInventoryEntry[],
): Promise<DbMigration[]> {
  const migrationFiles = files
    .filter((file) => isMigrationSqlFile(file.path))
    .sort((a, b) => a.path.localeCompare(b.path));

  if (migrationFiles.length === 0) return [];

  // Merge dates from every journal under a migrations dir (keyed by tag).
  const journalDates = new Map<string, string>();
  for (const file of files) {
    if (JOURNAL_RE.test(file.path) && MIGRATION_DIR_RE.test(file.path)) {
      const dates = await readJournalDates(repoPath, file.path);
      for (const [tag, date] of dates) journalDates.set(tag, date);
    }
  }

  const migrations: DbMigration[] = [];
  const seenIds = new Set<string>();

  for (const file of migrationFiles) {
    const tag = basename(file.path).replace(/\.sql$/i, "");
    let id = tag || file.path;
    let suffix = 2;
    while (seenIds.has(id)) {
      id = `${tag}_${suffix}`;
      suffix += 1;
    }
    seenIds.add(id);

    const date = journalDates.get(tag) ?? dateFromFile(file.path);
    const migration: DbMigration = {
      id,
      name: nameFromFile(file.path),
      file: file.path,
    };
    if (date) migration.date = date;
    migration.summary = `Database migration defined in ${file.path}`;
    migrations.push(migration);
  }

  return migrations;
}
