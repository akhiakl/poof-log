import { waitForLog } from './wait-for-log.mjs';

poof.log('waiting for a signal');
await waitForLog('waiting for a signal');
process.stdout.write('READY\n');
setInterval(() => undefined, 1000);
