import type { LighthouseData } from '../types/lighthouse';

const GENERATED_DATA_URL = '/api/data';
const SEED_DATA_URL = '/data.json';

function isString(v: unknown): v is string {
  return typeof v === 'string';
}

function isBoolean(v: unknown): v is boolean {
  return typeof v === 'boolean';
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every(isString);
}

/**
 * Minimal runtime validation — catches the most common mistakes in Lighthouse
 * data before the UI tries to render. Throws on invalid data.
 */
function validate(raw: unknown, source: string): LighthouseData {
  if (!raw || typeof raw !== 'object') throw new Error(`${source}: root must be an object`);
  const d = raw as Record<string, unknown>;

  // repo
  if (!d['repo'] || typeof d['repo'] !== 'object') throw new Error(`${source}: missing repo`);
  const repo = d['repo'] as Record<string, unknown>;
  if (!isString(repo['name'])) throw new Error(`${source}: repo.name must be a string`);
  if (!isString(repo['description'])) throw new Error(`${source}: repo.description must be a string`);

  // Optional full deterministic file inventory. Older seed data may not have it.
  if (d['files'] !== undefined) {
    if (!Array.isArray(d['files'])) throw new Error(`${source}: files must be an array`);
    for (const f of d['files'] as unknown[]) {
      const file = f as Record<string, unknown>;
      if (!isString(file['path'])) throw new Error(`${source}: file missing path`);
      if (!isString(file['language'])) throw new Error(`${source}: file ${String(file['path'])} missing language`);
      if (typeof file['size_bytes'] !== 'number')
        throw new Error(`${source}: file ${String(file['path'])} size_bytes must be a number`);
    }
  }

  // clusters
  if (!Array.isArray(d['clusters'])) throw new Error(`${source}: clusters must be an array`);
  for (const c of d['clusters'] as unknown[]) {
    const cl = c as Record<string, unknown>;
    if (!isString(cl['id'])) throw new Error(`${source}: cluster missing id`);
    if (!isString(cl['label'])) throw new Error(`${source}: cluster missing label`);
    if (!isString(cl['summary'])) throw new Error(`${source}: cluster missing summary`);
    if (!isStringArray(cl['modules'])) throw new Error(`${source}: cluster ${String(cl['id'])} modules must be string[]`);
  }

  // nodes
  if (!Array.isArray(d['nodes'])) throw new Error(`${source}: nodes must be an array`);
  const validKinds = new Set(['cluster', 'module', 'file']);
  for (const n of d['nodes'] as unknown[]) {
    const nd = n as Record<string, unknown>;
    if (!isString(nd['id'])) throw new Error(`${source}: node missing id`);
    if (!isString(nd['label'])) throw new Error(`${source}: node missing label`);
    if (!isString(nd['kind']) || !validKinds.has(nd['kind'] as string))
      throw new Error(`${source}: node ${String(nd['id'])} kind must be cluster|module|file`);
    if (!isString(nd['parent'])) throw new Error(`${source}: node ${String(nd['id'])} missing parent`);
    if (!isString(nd['summary'])) throw new Error(`${source}: node ${String(nd['id'])} missing summary`);
    if (!isStringArray(nd['key_files'])) throw new Error(`${source}: node ${String(nd['id'])} key_files must be string[]`);
    if (!isString(nd['path'])) throw new Error(`${source}: node ${String(nd['id'])} missing path`);
    if (!isBoolean(nd['changed_recently'])) throw new Error(`${source}: node ${String(nd['id'])} changed_recently must be boolean`);
  }

  // edges
  if (!Array.isArray(d['edges'])) throw new Error(`${source}: edges must be an array`);
  const validEdgeKinds = new Set(['depends', 'calls', 'imports']);
  for (const e of d['edges'] as unknown[]) {
    const ed = e as Record<string, unknown>;
    if (!isString(ed['source'])) throw new Error(`${source}: edge missing source`);
    if (!isString(ed['target'])) throw new Error(`${source}: edge missing target`);
    if (!isString(ed['kind']) || !validEdgeKinds.has(ed['kind'] as string))
      throw new Error(`${source}: edge kind must be depends|calls|imports`);
  }

  // flows
  if (!Array.isArray(d['flows'])) throw new Error(`${source}: flows must be an array`);
  for (const f of d['flows'] as unknown[]) {
    const fl = f as Record<string, unknown>;
    if (!isString(fl['name'])) throw new Error(`${source}: flow missing name`);
    if (!Array.isArray(fl['steps'])) throw new Error(`${source}: flow ${String(fl['name'])} steps must be an array`);
  }

  // sections
  if (!Array.isArray(d['sections'])) throw new Error(`${source}: sections must be an array`);
  for (const s of d['sections'] as unknown[]) {
    const sec = s as Record<string, unknown>;
    if (!isString(sec['id'])) throw new Error(`${source}: section missing id`);
    if (!isString(sec['title'])) throw new Error(`${source}: section missing title`);
    if (!isString(sec['body_markdown'])) throw new Error(`${source}: section missing body_markdown`);
    if (!isStringArray(sec['related_nodes'])) throw new Error(`${source}: section ${String(sec['id'])} related_nodes must be string[]`);
  }

  return raw as LighthouseData;
}

async function tryLoadGeneratedData(): Promise<LighthouseData | null> {
  let response: Response;
  try {
    response = await fetch(GENERATED_DATA_URL, { cache: 'no-store' });
  } catch {
    return null;
  }

  if (!response.ok) {
    const body = await response
      .clone()
      .json()
      .catch(() => null);
    if (
      body &&
      typeof body === 'object' &&
      (body as Record<string, unknown>)['generatedData'] === true
    ) {
      const message = (body as Record<string, unknown>)['error'];
      throw new Error(isString(message) ? message : 'Generated data failed to load.');
    }
    return null;
  }

  const raw: unknown = await response.json();
  return validate(raw, 'generated data');
}

export async function loadData(): Promise<LighthouseData> {
  const generated = await tryLoadGeneratedData();
  if (generated) return generated;

  const response = await fetch(SEED_DATA_URL);
  if (!response.ok) {
    throw new Error(`Failed to load seed data: ${response.status} ${response.statusText}`);
  }
  const raw: unknown = await response.json();
  return validate(raw, 'seed data');
}
