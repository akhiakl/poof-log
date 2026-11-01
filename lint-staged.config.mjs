// Runs on `git commit` against staged files only (see .husky/pre-commit).
export default {
  '*.{ts,mts,cts,js,mjs,cjs}': [
    'eslint --fix',
    'prettier --write',
    // Type errors can come from any file, so check the whole project, once.
    () => 'tsc --noEmit',
  ],
  '*.{json,md,yml,yaml}': 'prettier --write',
};
