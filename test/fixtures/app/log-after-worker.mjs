import { existsSync } from 'node:fs';
import { Worker } from 'node:worker_threads';
import { waitForLog } from './wait-for-log.mjs';

poof.log('main start');
await waitForLog('main start');
const worker = new Worker(new URL('./worker-child.mjs', import.meta.url));
await new Promise((resolve) => worker.on('exit', resolve));
process.stdout.write(`LOG_EXISTS:${String(existsSync('demo-my-app-.log'))}\n`);
