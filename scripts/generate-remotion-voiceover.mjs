import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const publicDir = path.join(root, 'public', 'remotion');
const tmpAiff = path.join(publicDir, 'architecture-walkthrough.aiff');
const outMp3 = path.join(publicDir, 'architecture-walkthrough.mp3');
const narration = [
  'Lighthouse turns a codebase into a reviewed architecture index. The data file is the contract, and the app renders only that structure.',
  'Start with the repo map, then zoom into clusters and modules. That gives you the product surfaces first, then the implementation boundaries underneath them.',
  'Follow the service path next. The web app and API sit in the middle, workers and the Python runner carry execution, and WebSocket plus the extension handle live recording.',
  'Then land on evidence. Changed modules, key files, and related sections make every claim traceable to concrete paths and summaries.',
  'For questions and change review, use the index as the fast evidence layer, and let the local coding agent do the reasoning and rendering work.',
].join(' ');

fs.mkdirSync(publicDir, {recursive: true});
execFileSync('/usr/bin/say', ['-v', 'Eddy (English (US))', '-r', '150', '-o', tmpAiff, narration], {stdio: 'inherit'});
execFileSync('/opt/homebrew/bin/ffmpeg', [
  '-y',
  '-i',
  tmpAiff,
  '-ac',
  '1',
  '-ar',
  '44100',
  '-codec:a',
  'libmp3lame',
  '-q:a',
  '4',
  outMp3,
], {stdio: 'inherit'});
fs.rmSync(tmpAiff, {force: true});
