await debug('about to crash');
setTimeout(() => {
  throw new Error('boom');
}, 0);
