import { spawn } from 'child_process';
import path from 'path';

const isWin = process.platform === 'win32';
const nextBin = isWin ? path.resolve('node_modules/.bin/next.cmd') : path.resolve('node_modules/.bin/next');

console.log('Starting PakPrice API Server on port 4000...');
const api = spawn('node', ['apps/api/dist/index.js'], {
  cwd: path.resolve(process.cwd()),
  env: { ...process.env, PORT: '4000' },
  stdio: 'inherit',
});

console.log('Starting PakPrice Web Production Server on port 3000...');
const web = spawn(nextBin, ['start', 'apps/web', '-p', '3000', '-H', '0.0.0.0'], {
  cwd: path.resolve(process.cwd()),
  env: {
    ...process.env,
    PORT: '3000',
    NEXT_PUBLIC_API_URL: 'http://localhost:4000',
  },
  shell: isWin,
  stdio: 'inherit',
});

api.on('exit', (code) => {
  console.log(`API process exited with code ${code}`);
});

web.on('exit', (code) => {
  console.log(`Web process exited with code ${code}`);
});

process.on('SIGINT', () => {
  api.kill();
  web.kill();
  process.exit();
});

process.on('SIGTERM', () => {
  api.kill();
  web.kill();
  process.exit();
});
