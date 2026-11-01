import { spawn, spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const appDir = join(root, 'test/fixtures/app');
const entry = join(root, 'src/index.ts');
const logFile = join(appDir, 'demo-my-app-.log');

type Env = Record<string, string | undefined>;
type Preload = '--import' | '--require';

/** Child env without the parent's NODE_ENV (Vitest sets it to "test"). */
function childEnv(overrides: Env): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: undefined, DEBUG_ENABLED: undefined };
  Object.assign(env, overrides);
  for (const key of Object.keys(env)) if (env[key] === undefined) Reflect.deleteProperty(env, key);
  return env;
}

/** Preloads the engine exactly like an app would: no import in the script itself. */
function args(preload: Preload, script: string): string[] {
  return [preload, preload === '--import' ? pathToFileURL(entry).href : entry, script];
}

function run(script: string, env: Env, preload: Preload = '--import') {
  return spawnSync(process.execPath, args(preload, script), {
    cwd: appDir,
    env: childEnv(env),
    encoding: 'utf8',
  });
}

afterEach(() => {
  rmSync(logFile, { force: true });
});

describe('disabled', () => {
  it.each<[string, Env]>([
    ['production', { NODE_ENV: 'production' }],
    ['production even with DEBUG_ENABLED', { NODE_ENV: 'production', DEBUG_ENABLED: 'true' }],
    ['NODE_ENV unset', {}],
    ['NODE_ENV=test', { NODE_ENV: 'test' }],
  ])('is a silent no-op: %s', (_label, env) => {
    const result = run('log-and-exit.mjs', env);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('LOG:<none>\nSIGINT_LISTENERS:0\n');
    expect(existsSync(logFile)).toBe(false);
  });
});

describe('enabled', () => {
  it.each<[string, Env, Preload]>([
    ['NODE_ENV=development via --import', { NODE_ENV: 'development' }, '--import'],
    ['DEBUG_ENABLED=true via --import', { DEBUG_ENABLED: 'true' }, '--import'],
    ['NODE_ENV=development via --require', { NODE_ENV: 'development' }, '--require'],
  ])('logs to stdout and file, then removes it: %s', (_label, env, preload) => {
    const result = run('log-and-exit.mjs', env, preload);

    expect(result.status).toBe(0);
    // No TTY in a spawned child, so the prefix is uncolored.
    expect(result.stdout).toContain(
      '[demo-my-app-] (log-and-exit.mjs:2) hello { nested: { deep: [ 1, 2 ] } }\n',
    );
    expect(result.stdout).toMatch(
      /LOG:\d{4}-\d{2}-\d{2}T[\d:.]+Z \[log-and-exit\.mjs:2\] hello \{ nested: \{ deep: \[ 1, 2 \] \} \}\n/,
    );
    expect(result.stdout).toContain('SIGINT_LISTENERS:1\n');
    expect(existsSync(logFile)).toBe(false);
  });

  it.each<[NodeJS.Signals, number]>([
    ['SIGINT', 130],
    ['SIGTERM', 143],
  ])('removes the file and exits on %s', async (signal, code) => {
    const child = spawn(process.execPath, args('--import', 'log-and-wait.mjs'), {
      cwd: appDir,
      env: childEnv({ NODE_ENV: 'development' }),
    });
    await new Promise<void>((resolve) => {
      child.stdout.on('data', (chunk: Buffer) => {
        if (chunk.toString().includes('READY')) resolve();
      });
    });
    expect(existsSync(logFile)).toBe(true);

    child.kill(signal);
    const exitCode = await new Promise<number | null>((resolve) => child.on('close', resolve));

    expect(exitCode).toBe(code);
    expect(existsSync(logFile)).toBe(false);
  });

  it('still exits on Ctrl+C when a signal-exit style library listens too', async () => {
    const child = spawn(process.execPath, args('--import', 'signal-exit-style.mjs'), {
      cwd: appDir,
      env: childEnv({ NODE_ENV: 'development' }),
    });
    await new Promise<void>((resolve) => {
      child.stdout.on('data', (chunk: Buffer) => {
        if (chunk.toString().includes('READY')) resolve();
      });
    });

    child.kill('SIGINT');
    const outcome = await Promise.race([
      new Promise<'exited'>((resolve) =>
        child.on('close', () => {
          resolve('exited');
        }),
      ),
      new Promise<'hung'>((resolve) =>
        setTimeout(() => {
          resolve('hung');
        }, 3000),
      ),
    ]);
    child.kill('SIGKILL');

    expect(outcome).toBe('exited');
    expect(existsSync(logFile)).toBe(false);
  });

  it('keeps the log file when a worker thread exits', () => {
    const result = run('log-after-worker.mjs', { NODE_ENV: 'development' });

    expect(result.stdout).toContain('LOG_EXISTS:true\n');
    expect(existsSync(logFile)).toBe(false);
  });

  it('removes the file and exits 1 on an uncaught exception', () => {
    const result = run('log-and-throw.mjs', { NODE_ENV: 'development' });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Error: boom');
    expect(existsSync(logFile)).toBe(false);
  });
});
