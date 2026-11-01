import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const script = join(root, '.github/scripts/check-pr-body.sh');
const template = readFileSync(join(root, '.github/pull_request_template.md'), 'utf8');

/** The template as a contributor would fill it in. */
const filled = template
  .replace('<!-- What does this PR change? -->', 'Adds NO_COLOR support.')
  .replace(/<!-- The problem.*?-->/, 'Colors break log viewers.')
  .replace(/<!-- Commands.*?-->/, 'NO_COLOR=1 pnpm test')
  .replaceAll('- [ ]', '- [x]');

function check(body: string) {
  return spawnSync('bash', [script], { env: { ...process.env, PR_BODY: body }, encoding: 'utf8' });
}

describe('check-pr-body.sh', () => {
  it('passes a filled-in template', () => {
    expect(check(filled).status).toBe(0);
  });

  it('fails the untouched template, naming every empty section', () => {
    const result = check(template);
    expect(result.status).toBe(1);
    for (const heading of ['What', 'Why', 'How to test']) expect(result.stdout).toContain(heading);
    expect(result.stdout).toContain('Tick every checklist box');
  });

  it('fails when one box is left unticked', () => {
    const result = check(filled.replace('- [x] Tests cover', '- [ ] Tests cover'));
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('Tick every checklist box');
  });

  it('fails an empty description', () => {
    const result = check('');
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('Checklist');
  });

  it('accepts Windows line endings', () => {
    expect(check(filled.replaceAll('\n', '\r\n')).status).toBe(0);
  });
});
