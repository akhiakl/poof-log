const obj = {
  [Symbol.for('nodejs.util.inspect.custom')]() {
    poof.info('inner');
    return 'OBJ';
  },
};
poof.log('outer', obj);
