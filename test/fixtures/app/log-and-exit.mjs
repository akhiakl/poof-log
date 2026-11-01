import { existsSync, readFileSync } from 'node:fs';
import { waitForLog } from './wait-for-log.mjs';

const returned = debug('hello', { nested: { deep: [1, 2] } });
process.stdout.write(`RETURN:${String(returned)}\n`);
// Production never writes the file, so there is nothing to wait for.
if (process.env.DEBUG_FILE === 'true' && process.env.NODE_ENV !== 'production') {
  await waitForLog('hello');
}

// Report what the engine left behind while the process is still alive.
const log = 'demo-my-app-.log';
process.stdout.write(`LOG:${existsSync(log) ? readFileSync(log, 'utf8') : '<none>\n'}`);
process.stdout.write(`SIGINT_LISTENERS:${String(process.listenerCount('SIGINT'))}\n`);
