import { spawn, ChildProcess } from 'child_process';
import axios from 'axios';
import path from 'path';

async function main() {
  console.log('Testing production API boot (node apps/api/dist/index.js)...');

  const apiProcess = spawn('node', ['apps/api/dist/index.js'], {
    cwd: path.resolve(process.cwd()),
    env: { ...process.env, PORT: '4005' },
    stdio: 'pipe',
  });

  apiProcess.stdout?.on('data', (d) => process.stdout.write(`[API] ${d}`));
  apiProcess.stderr?.on('data', (d) => process.stderr.write(`[API-ERR] ${d}`));

  let ready = false;
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    try {
      const resLive = await axios.get('http://127.0.0.1:4005/health/live');
      const resReady = await axios.get('http://127.0.0.1:4005/health/ready');
      console.log(`\n/health/live  : HTTP ${resLive.status} - ${JSON.stringify(resLive.data)}`);
      console.log(`/health/ready : HTTP ${resReady.status} - ${JSON.stringify(resReady.data)}`);
      ready = true;
      break;
    } catch (err: any) {
      // Waiting for server to start
    }
  }

  apiProcess.kill();

  if (!ready) {
    console.error('❌ Failed to reach API on /health/live and /health/ready');
    process.exit(1);
  } else {
    console.log('✅ API booted cleanly and responded 200 OK on all health endpoints!\n');
    process.exit(0);
  }
}

main().catch(console.error);

