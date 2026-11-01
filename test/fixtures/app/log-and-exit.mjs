import { existsSync, readFileSync } from 'node:fs';
await debug('hello', { nested: { deep: [1, 2] } });

// Report what the engine left behind while the process is still alive.
const log = 'demo-my-app-.log';
process.stdout.write(`LOG:${existsSync(log) ? readFileSync(log, 'utf8') : '<none>\n'}`);
process.stdout.write(`SIGINT_LISTENERS:${String(process.listenerCount('SIGINT'))}\n`);
