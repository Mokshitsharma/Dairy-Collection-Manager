// Starts the Auth + Firestore emulators, persisting data in ./.emulator-data between runs.
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';

const dir = './.emulator-data';
const args = ['firebase', 'emulators:start', '--only', 'auth,firestore', '--project', 'demo-dairy', `--export-on-exit=${dir}`];
if (existsSync(`${dir}/firebase-export-metadata.json`)) args.push(`--import=${dir}`);

const child = spawn('npx', args, { stdio: 'inherit', shell: true });
child.on('exit', (code) => process.exit(code ?? 0));
