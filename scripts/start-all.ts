import { spawn, execSync } from 'child_process';
import path from 'path';

function killProcessTree(pid?: number) {
  if (!pid) return;
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /pid ${pid} /f /t`, { stdio: 'ignore' });
    } else {
      process.kill(-pid);
    }
  } catch {}
}

const isWin = process.platform === 'win32';
const npmCmd = isWin ? 'npm.cmd' : 'npm';

console.log('════════════════════════════════════════════════════════════════');
console.log('  STARTING PAKPRICE SERVICES');
console.log('  • API:  http://localhost:4000');
console.log('  • Web:  http://localhost:3000');
console.log('════════════════════════════════════════════════════════════════\n');

// 1. Start API Server
const apiProcess = spawn('node', ['apps/api/dist/index.js'], {
  cwd: path.resolve(process.cwd()),
  env: { ...process.env, PORT: '4000' },
  stdio: ['inherit', 'pipe', 'pipe'],
});

apiProcess.stdout?.on('data', (d) => process.stdout.write(`[API] ${d}`));
apiProcess.stderr?.on('data', (d) => process.stderr.write(`[API ERR] ${d}`));

// 2. Start Web Server
const webProcess = spawn(npmCmd, ['run', 'start', '--workspace=apps/web'], {
  cwd: path.resolve(process.cwd()),
  env: {
    ...process.env,
    PORT: '3000',
    NEXT_PUBLIC_API_URL: 'http://localhost:4000',
  },
  shell: isWin,
  stdio: ['inherit', 'pipe', 'pipe'],
});

webProcess.stdout?.on('data', (d) => process.stdout.write(`[WEB] ${d}`));
webProcess.stderr?.on('data', (d) => process.stderr.write(`[WEB ERR] ${d}`));

const cleanup = () => {
  console.log('\nShutting down PakPrice servers...');
  killProcessTree(apiProcess.pid);
  killProcessTree(webProcess.pid);
  process.exit(0);
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('exit', () => {
  killProcessTree(apiProcess.pid);
  killProcessTree(webProcess.pid);
});

