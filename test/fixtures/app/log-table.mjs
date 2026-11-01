import { waitForLog } from './wait-for-log.mjs';
import { readFileSync } from 'node:fs';

poof.table([{ a: 1 }]);
await waitForLog('└');
process.stdout.write(`LOG:${readFileSync('demo-my-app-.log', 'utf8')}`);
