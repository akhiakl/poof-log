import { lstatSync, readdirSync, readFileSync, readlinkSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const skillsDir = join(root, '.agents/skills');
const claudeDir = join(root, '.claude/skills');
const skills = readdirSync(skillsDir);

describe('shared agent instructions', () => {
  it('keeps every rule in AGENTS.md, with CLAUDE.md only importing it', () => {
    expect(readFileSync(join(root, 'CLAUDE.md'), 'utf8').trim()).toBe('@AGENTS.md');
  });

  it('has at least one skill', () => {
    expect(skills.length).toBeGreaterThan(0);
  });

  describe.each(skills)('skill %s', (skill) => {
    const text = readFileSync(join(skillsDir, skill, 'SKILL.md'), 'utf8');
    const frontmatter = /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1] ?? '';

    it('has a name matching its folder and a description', () => {
      expect(/^name: (.+)$/m.exec(frontmatter)?.[1]).toBe(skill);
      expect(/^description: (.{20,})$/m.exec(frontmatter)).not.toBeNull();
    });

    it('is symlinked for Claude Code and listed in AGENTS.md', () => {
      const link = join(claudeDir, skill);
      expect(lstatSync(link).isSymbolicLink()).toBe(true);
      expect(readlinkSync(link)).toBe(`../../.agents/skills/${skill}`);
      expect(realpathSync(link)).toBe(realpathSync(join(skillsDir, skill)));
      expect(readFileSync(join(root, 'AGENTS.md'), 'utf8')).toContain(`\`${skill}\``);
    });
  });

  it('has no Claude skill without a shared source', () => {
    expect(readdirSync(claudeDir).sort()).toEqual([...skills].sort());
  });
});
