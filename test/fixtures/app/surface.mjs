const methods = [
  'assert',
  'clear',
  'count',
  'countReset',
  'debug',
  'dir',
  'dirxml',
  'error',
  'group',
  'groupCollapsed',
  'groupEnd',
  'info',
  'log',
  'table',
  'time',
  'timeEnd',
  'timeLog',
  'trace',
  'warn',
];
for (const name of methods) process.stdout.write(`${name}:${typeof poof[name]}\n`);
process.stdout.write(`enabled:${String(poof.enabled)}\n`);
