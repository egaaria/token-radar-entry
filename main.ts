// Token Radar entrypoint: read the sealed snapshot, build the ranked board, and assemble the local dossier.
// Node 22 runs this erasable TypeScript directly; it uses only the Node standard library.
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

function argument(name: string, fallback: string): string {
  const flag = `--${name}`;
  const index = process.argv.indexOf(flag);
  if (index >= 0 && index + 1 < process.argv.length) return process.argv[index + 1]!;
  const equal = process.argv.find((value) => value.startsWith(`${flag}=`));
  return equal === undefined ? fallback : equal.slice(flag.length + 1);
}

const inputArg = argument('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
const out = argument('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');
if (!existsSync(inputFile)) {
  process.stderr.write(`token radar: no snapshot at ${inputFile}; pass --input <snapshot.json|directory> or mount /input\n`);
  process.exit(2);
}

const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const { board, radar } = buildRadar(snapshot);
const issue = boardIssue(board, snapshot);
if (issue !== null) {
  process.stderr.write(`token radar: the model wrote a board the gate refuses: ${issue}\n`);
  process.exit(1);
}

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(out, 'data.js'), dataScript(radar));

function copyRegularFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const source = join(from, name);
    if (!statSync(source).isFile()) continue;
    copyFileSync(source, join(to, name));
    copied.push(name);
  }
  return copied;
}

const dashboardFiles = copyRegularFiles(join(here, 'dashboard'), join(out, 'dashboard'));
if (!dashboardFiles.includes('index.html') || !dashboardFiles.some((name) => name.endsWith('.css')) || !dashboardFiles.some((name) => name.endsWith('.js'))) {
  process.stderr.write('token radar: dashboard/ must contain index.html plus at least one .css and one .js file\n');
  process.exit(1);
}

const screenshots = copyRegularFiles(join(here, 'screenshots'), join(out, 'screenshots'));
if (screenshots.length < 3 || screenshots.length > 4) {
  process.stderr.write(`token radar: screenshots/ contains ${screenshots.length} files; expected 3 or 4\n`);
  process.exit(1);
}
for (const name of screenshots) {
  if (!IMAGE_NAME.test(name)) {
    process.stderr.write(`token radar: screenshots/${name}: invalid dossier image name\n`);
    process.exit(1);
  }
}

// The scorer rebuilds this exact byte sequence from the copied dashboard and screenshots.
writeFileSync(join(out, 'dossier.json'), buildDossier(out, {
  text_max_bytes: TEXT_MAX_BYTES,
  screenshots: SCREENSHOT_CAPS,
  dashboard: { max_files: 400, max_bytes: 4_194_304 },
}));

process.stdout.write(`token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${radar.early_size} early, ${radar.live_size} live set aside)\n`);
