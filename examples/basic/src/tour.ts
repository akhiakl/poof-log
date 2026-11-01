// One call to every poof method. Run it with `pnpm tour` (add DEBUG_FILE=true to also write the log file).
// Each method works like the console one of the same name; poof adds the `[project] (file:line)` prefix.

// Levels. log, debug and info print to stdout; warn and error print to stderr.
poof.log('plain message', { id: 1, tags: ['a', 'b'] });
poof.debug('detail while chasing a bug');
poof.info('server listening', { port: 3000 });
poof.warn('slow query', { ms: 840 });
poof.error('payment failed', new Error('card declined'));

// Format strings work like console.log.
poof.log('%s has %d items (%o)', 'cart', 3, { total: 29.5 });

// Tables and object dumps.
poof.table([
  { name: 'Ada', age: 36 },
  { name: 'Grace', age: 45 },
]);
poof.dir({ a: { b: { c: 1 } } }, { depth: 0 });
poof.dirxml({ note: 'same as log in Node' });

// Groups indent everything inside them.
poof.group('request /users/1');
poof.log('loading user');
poof.groupCollapsed('db');
poof.log('SELECT * FROM users WHERE id = 1');
poof.groupEnd();
poof.groupEnd();

// Counters.
poof.count('hits');
poof.count('hits');
poof.countReset('hits');
poof.count('hits');

// Timers.
poof.time('work');
for (let i = 0; i < 1e6; i++); // something to measure
poof.timeLog('work', 'halfway');
poof.timeEnd('work');

// Assertions print only when the condition is false.
poof.assert(1 + 1 === 2, 'not printed');
poof.assert(1 + 1 === 3, 'math is broken', { got: 2 });

// Stack trace of where you are.
poof.trace('who called me');

// Skip expensive work when poof is off (production).
if (poof.enabled) poof.log('expensive dump', JSON.stringify({ big: 'object' }));

// Not shown: poof.clear() clears a TTY terminal.
