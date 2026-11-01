poof.group('g');
poof.log('in');
poof.groupEnd();
poof.table([{ a: 1 }]);
poof.count();
poof.assert(false, 'nope');
poof.dir({ a: { b: 1 } });
