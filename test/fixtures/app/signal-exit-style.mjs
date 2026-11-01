import { waitForLog } from './wait-for-log.mjs';

// Mimics signal-exit v4: re-raise the signal only once every other listener is gone.
const reraise = () => {
  if (process.listeners('SIGINT').length === 1) {
    process.off('SIGINT', reraise);
    process.kill(process.pid, 'SIGINT');
  }
};
process.on('SIGINT', reraise);
poof.log('ready');
await waitForLog('ready');
process.stdout.write('READY\n');
setInterval(() => undefined, 1000);
