import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** Builds dist/ once so the tests can load the artifacts that actually ship. */
export default function setup(): void {
  const result = spawnSync('pnpm', ['exec', 'tsdown'], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    encoding: 'utf8',
  });
  if (result.status !== 0) throw new Error(`tsdown failed:\n${result.stdout}\n${result.stderr}`);
}
