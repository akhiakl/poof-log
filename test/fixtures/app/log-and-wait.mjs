await debug('waiting for a signal');
process.stdout.write('READY\n');
setInterval(() => undefined, 1000);
