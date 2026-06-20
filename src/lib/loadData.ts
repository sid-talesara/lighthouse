import type { LighthouseData } from '../types/lighthouse';

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
 * Minimal runtime validation — catches the most common mistakes in data.json
 * before the UI tries to render. Throws on invalid data.
 */
function validate(raw: unknown): LighthouseData {
  if (!raw || typeof raw !== 'object') throw new Error('data.json: root must be an object');
  const d = raw as Record<string, unknown>;

  // repo
  if (!d['repo'] || typeof d['repo'] !== 'object') throw new Error('data.json: missing repo');
  const repo = d['repo'] as Record<string, unknown>;
  if (!isString(repo['name'])) throw new Error('data.json: repo.name must be a string');
  if (!isString(repo['description'])) throw new Error('data.json: repo.description must be a string');

  // clusters
  if (!Array.isArray(d['clusters'])) throw new Error('data.json: clusters must be an array');
  for (const c of d['clusters'] as unknown[]) {
    const cl = c as Record<string, unknown>;
    if (!isString(cl['id'])) throw new Error('data.json: cluster missing id');
    if (!isString(cl['label'])) throw new Error('data.json: cluster missing label');
    if (!isString(cl['summary'])) throw new Error('data.json: cluster missing summary');
    if (!isStringArray(cl['modules'])) throw new Error(`data.json: cluster ${String(cl['id'])} modules must be string[]`);
  }

  // nodes
  if (!Array.isArray(d['nodes'])) throw new Error('data.json: nodes must be an array');
  const validKinds = new Set(['cluster', 'module', 'file']);
  for (const n of d['nodes'] as unknown[]) {
    const nd = n as Record<string, unknown>;
    if (!isString(nd['id'])) throw new Error('data.json: node missing id');
    if (!isString(nd['label'])) throw new Error('data.json: node missing label');
    if (!isString(nd['kind']) || !validKinds.has(nd['kind'] as string))
      throw new Error(`data.json: node ${String(nd['id'])} kind must be cluster|module|file`);
    if (!isString(nd['parent'])) throw new Error(`data.json: node ${String(nd['id'])} missing parent`);
    if (!isString(nd['summary'])) throw new Error(`data.json: node ${String(nd['id'])} missing summary`);
    if (!isStringArray(nd['key_files'])) throw new Error(`data.json: node ${String(nd['id'])} key_files must be string[]`);
    if (!isString(nd['path'])) throw new Error(`data.json: node ${String(nd['id'])} missing path`);
    if (!isBoolean(nd['changed_recently'])) throw new Error(`data.json: node ${String(nd['id'])} changed_recently must be boolean`);
  }

  // edges
  if (!Array.isArray(d['edges'])) throw new Error('data.json: edges must be an array');
  const validEdgeKinds = new Set(['depends', 'calls', 'imports']);
  for (const e of d['edges'] as unknown[]) {
    const ed = e as Record<string, unknown>;
    if (!isString(ed['source'])) throw new Error('data.json: edge missing source');
    if (!isString(ed['target'])) throw new Error('data.json: edge missing target');
    if (!isString(ed['kind']) || !validEdgeKinds.has(ed['kind'] as string))
      throw new Error('data.json: edge kind must be depends|calls|imports');
  }

  // flows
  if (!Array.isArray(d['flows'])) throw new Error('data.json: flows must be an array');
  for (const f of d['flows'] as unknown[]) {
    const fl = f as Record<string, unknown>;
    if (!isString(fl['name'])) throw new Error('data.json: flow missing name');
    if (!Array.isArray(fl['steps'])) throw new Error(`data.json: flow ${String(fl['name'])} steps must be an array`);
  }

  // sections
  if (!Array.isArray(d['sections'])) throw new Error('data.json: sections must be an array');
  for (const s of d['sections'] as unknown[]) {
    const sec = s as Record<string, unknown>;
    if (!isString(sec['id'])) throw new Error('data.json: section missing id');
    if (!isString(sec['title'])) throw new Error('data.json: section missing title');
    if (!isString(sec['body_markdown'])) throw new Error('data.json: section missing body_markdown');
    if (!isStringArray(sec['related_nodes'])) throw new Error(`data.json: section ${String(sec['id'])} related_nodes must be string[]`);
  }

  return raw as LighthouseData;
}

export async function loadData(): Promise<LighthouseData> {
  const response = await fetch('/data.json');
  if (!response.ok) {
    throw new Error(`Failed to load data.json: ${response.status} ${response.statusText}`);
  }
  const raw: unknown = await response.json();
  return validate(raw);
}
