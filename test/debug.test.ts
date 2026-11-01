import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const appDir = join(root, 'test/fixtures/app');
const src = join(root, 'src/index.ts');
// The built files that ship: `exports.import` and `exports.require`.
const distEsm = join(root, 'dist/index.mjs');
const distCjs = join(root, 'dist/index.cjs');
const logFile = join(appDir, 'demo-my-app-.log');

type Env = Record<string, string | undefined>;

/** Development with the opt-in log file, which is what most tests exercise. */
const dev: Env = { NODE_ENV: 'development', DEBUG_FILE: 'true' };
type Preload = '--import' | '--require';

/** Child env without the parent's NODE_ENV (Vitest sets it to "test"). */
function childEnv(overrides: Env): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: undefined, DEBUG_ENABLED: undefined };
  Object.assign(env, overrides);
  for (const key of Object.keys(env)) if (env[key] === undefined) Reflect.deleteProperty(env, key);
  return env;
}

/** Preloads the engine exactly like an app would: no import in the script itself. */
function args(preload: Preload, script: string, entry = src): string[] {
  return [preload, preload === '--import' ? pathToFileURL(entry).href : entry, script];
}

function run(script: string, env: Env, preload: Preload = '--import', entry = src) {
  return spawnSync(process.execPath, args(preload, script, entry), {
    cwd: appDir,
    env: childEnv(env),
    encoding: 'utf8',
  });
}

afterEach(() => {
  rmSync(logFile, { force: true });
});

describe('types', () => {
  it('ships editor docs for every poof method', () => {
    const dts = readFileSync(join(root, 'dist/index.d.mts'), 'utf8');

    for (const level of ['log', 'debug', 'info', 'warn', 'error']) {
      expect(dts).toMatch(new RegExp(String.raw`/\*\*[^]*?@example[^]*?\*/\s*${level}\(`));
    }
  });
});

describe('surface', () => {
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

  it.each<[string, Env, string]>([
    ['enabled', { NODE_ENV: 'development' }, 'true'],
    ['disabled', { NODE_ENV: 'production' }, 'false'],
  ])('has every console method, and poof.enabled, when %s', (_label, env, enabled) => {
    const lines = run('surface.mjs', env).stdout.trim().split('\n');

    expect(lines).toEqual([...methods.map((name) => `${name}:function`), `enabled:${enabled}`]);
  });
});

describe('disabled', () => {
  it.each<[string, Env]>([
    ['production', { NODE_ENV: 'production' }],
    ['production even with DEBUG_ENABLED', { NODE_ENV: 'production', DEBUG_ENABLED: 'true' }],
    ['production even with DEBUG_FILE', { NODE_ENV: 'production', DEBUG_FILE: 'true' }],
    ['NODE_ENV unset', {}],
    ['NODE_ENV=test', { NODE_ENV: 'test' }],
  ])('is a silent no-op: %s', (_label, env) => {
    const result = run('log-and-exit.mjs', env);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('RETURN:undefined\nLOG:<none>\nSIGINT_LISTENERS:0\n');
    expect(existsSync(logFile)).toBe(false);
  });

  it('makes every level a no-op', () => {
    const result = run('log-levels.mjs', { NODE_ENV: 'production' });

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
  });

  it.each<[string, Preload, string]>([
    ['dist/index.mjs via --import', '--import', distEsm],
    ['dist/index.cjs via --require', '--require', distCjs],
  ])('is a silent no-op in production: %s', (_label, preload, entry) => {
    const result = run('log-and-exit.mjs', { NODE_ENV: 'production' }, preload, entry);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('RETURN:undefined\nLOG:<none>\nSIGINT_LISTENERS:0\n');
    expect(existsSync(logFile)).toBe(false);
  });
});

describe('enabled', () => {
  it('sends log, debug and info to stdout and warn and error to stderr, like console', () => {
    const result = run('log-levels.mjs', { NODE_ENV: 'development' });

    expect(result.stdout).toBe(
      [
        '[demo-my-app-] [LOG] (log-levels.mjs:1) a',
        '[demo-my-app-] [DEBUG] (log-levels.mjs:2) b',
        '[demo-my-app-] [INFO] (log-levels.mjs:3) c',
        '',
      ].join('\n'),
    );
    expect(result.stderr).toBe(
      [
        '[demo-my-app-] [WARN] (log-levels.mjs:4) d',
        '[demo-my-app-] [ERROR] (log-levels.mjs:5) e',
        '',
      ].join('\n'),
    );
  });

  it('colors each level when color is on, and not under NO_COLOR', () => {
    const colored = run('log-levels.mjs', { NODE_ENV: 'development', FORCE_COLOR: '1' });
    const esc = '\x1b[';

    expect(colored.stdout).toContain(`${esc}35m[DEBUG]${esc}0m`);
    expect(colored.stdout).toContain(`${esc}32m[INFO]${esc}0m`);
    expect(colored.stderr).toContain(`${esc}33m[WARN]${esc}0m`);
    expect(colored.stderr).toContain(`${esc}31m[ERROR]${esc}0m`);
    expect(colored.stdout.split('\n')[0]).toBe(
      `${esc}36m[demo-my-app-]${esc}0m ${esc}37m[LOG]${esc}0m ${esc}2m(log-levels.mjs:1)${esc}0m a`,
    );

    const plain = run('log-levels.mjs', {
      NODE_ENV: 'development',
      FORCE_COLOR: '1',
      NO_COLOR: '1',
    });
    expect(plain.stdout).not.toContain(esc);
  });

  it.each<[string, string, string, string]>([
    ['stdout', 'fake-tty-stdout.mjs', 'stdout', 'stderr'],
    ['stderr', 'fake-tty-stderr.mjs', 'stderr', 'stdout'],
  ])('colors only the stream that is a terminal: %s', (_label, fake, colored, plain) => {
    const result = spawnSync(
      process.execPath,
      ['--import', pathToFileURL(join(appDir, fake)).href, ...args('--import', 'log-levels.mjs')],
      { cwd: appDir, env: childEnv({ NODE_ENV: 'development' }), encoding: 'utf8' },
    );
    const out = { stdout: result.stdout, stderr: result.stderr };

    expect(out[colored as 'stdout']).toContain('\x1b[');
    expect(out[plain as 'stdout']).not.toContain('\x1b[');
  });

  it.each<[string, Preload, string]>([
    ['src', '--import', src],
    ['dist/index.mjs via --import', '--import', distEsm],
    ['dist/index.cjs via --require', '--require', distCjs],
  ])(
    'keeps console behaviour for group, table, count, assert and dir: %s',
    (_label, preload, entry) => {
      const result = run('console-surface.mjs', { NODE_ENV: 'development' }, preload, entry);

      expect(result.stdout.split('\n')).toEqual([
        '[demo-my-app-] [GROUP] (console-surface.mjs:1) g',
        '[demo-my-app-] [LOG] (console-surface.mjs:2)   in',
        // A multi-line result gets one header line and then the output as console prints it.
        '[demo-my-app-] [TABLE] (console-surface.mjs:4)',
        '┌─────────┬───┐',
        '│ (index) │ a │',
        '├─────────┼───┤',
        '│ 0       │ 1 │',
        '└─────────┴───┘',
        '[demo-my-app-] [COUNT] (console-surface.mjs:5) default: 1',
        '[demo-my-app-] [DIR] (console-surface.mjs:7) { a: { b: 1 } }',
        '',
      ]);
      expect(result.stderr).toBe(
        '[demo-my-app-] [ASSERT] (console-surface.mjs:6) Assertion failed: nope\n',
      );
    },
  );

  it('stays quiet when the reader of stdout goes away, as in `| head`', () => {
    const cmd = `"${process.execPath}" ${args('--import', 'log-many.mjs').join(' ')} | head -n 1`;
    const result = spawnSync('sh', ['-c', cmd], {
      cwd: appDir,
      env: childEnv({ NODE_ENV: 'development' }),
      encoding: 'utf8',
    });

    expect(result.stdout).toBe('[demo-my-app-] [LOG] (log-many.mjs:1) 0\n');
    expect(result.stderr).toBe('');
  });

  it('keeps each line on its own call site when a value prints with poof inside', () => {
    const result = run('reentrant.mjs', { NODE_ENV: 'development' });

    expect(result.stdout).toBe(
      '[demo-my-app-] [INFO] (reentrant.mjs:3) inner\n' +
        '[demo-my-app-] [LOG] (reentrant.mjs:7) outer OBJ\n',
    );
  });

  it('starts a trace at the caller, without poof-log frames', () => {
    const result = run('trace.mjs', { NODE_ENV: 'development' });
    const [header, message, first] = result.stderr.split('\n');

    expect(header).toBe('[demo-my-app-] [TRACE] (trace.mjs:1)');
    expect(message).toBe('Trace: where 1');
    expect(first).toMatch(/^ {4}at .*trace\.mjs:1:6/);
    expect(result.stderr).not.toContain('index.ts');
  });

  it('writes a multi-line call to the log file as one header and its lines', () => {
    // The file is deleted on exit, so read it from a fixture that waits.
    const waited = run('log-table.mjs', dev);

    expect(waited.stdout).toMatch(/LOG:\S+Z \[TABLE\] \[log-table\.mjs:4\]\n┌[^\n]*\n│[^]*\n└/);
  });

  it('does not define a global debug, which the debug package owns', () => {
    const result = spawnSync(
      process.execPath,
      [...args('--import', 'log-and-exit.mjs').slice(0, 2), '-p', 'typeof debug'],
      { cwd: appDir, env: childEnv({ NODE_ENV: 'development' }), encoding: 'utf8' },
    );

    expect(result.stdout).toBe('undefined\n');
  });

  it.each<[string, Env, Preload, string]>([
    ['src, NODE_ENV=development via --import', dev, '--import', src],
    [
      'src, DEBUG_ENABLED=true via --import',
      { DEBUG_ENABLED: 'true', DEBUG_FILE: 'true' },
      '--import',
      src,
    ],
    ['dist/index.mjs via --import', dev, '--import', distEsm],
    ['dist/index.cjs via --require', dev, '--require', distCjs],
  ])(
    'logs to stdout and file without waiting, then removes it: %s',
    (_label, env, preload, entry) => {
      const result = run('log-and-exit.mjs', env, preload, entry);

      expect(result.status).toBe(0);
      // No TTY in a spawned child, so the prefix is uncolored.
      expect(result.stdout).toContain(
        '[demo-my-app-] [LOG] (log-and-exit.mjs:4) hello { nested: { deep: [ 1, 2 ] } }\n',
      );
      expect(result.stdout).toMatch(
        /LOG:\d{4}-\d{2}-\d{2}T[\d:.]+Z \[LOG\] \[log-and-exit\.mjs:4\] hello \{ nested: \{ deep: \[ 1, 2 \] \} \}\n/,
      );
      // debug() hands the write to the background and returns at once.
      expect(result.stdout).toContain('RETURN:undefined\n');
      expect(result.stdout).toContain('SIGINT_LISTENERS:1\n');
      expect(existsSync(logFile)).toBe(false);
    },
  );

  it('prints to the terminal only, with no file and no listeners, unless DEBUG_FILE=true', () => {
    const result = run('log-and-exit.mjs', { NODE_ENV: 'development' });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      '[demo-my-app-] [LOG] (log-and-exit.mjs:4) hello { nested: { deep: [ 1, 2 ] } }\n',
    );
    expect(result.stdout).toContain('RETURN:undefined\nLOG:<none>\nSIGINT_LISTENERS:0\n');
    expect(existsSync(logFile)).toBe(false);
  });

  it.each<[NodeJS.Signals, number]>([
    ['SIGINT', 130],
    ['SIGTERM', 143],
  ])('removes the file and exits on %s', async (signal, code) => {
    const child = spawn(process.execPath, args('--import', 'log-and-wait.mjs'), {
      cwd: appDir,
      env: childEnv(dev),
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
      env: childEnv(dev),
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
    const result = run('log-after-worker.mjs', dev);

    expect(result.stdout).toContain('LOG_EXISTS:true\n');
    expect(existsSync(logFile)).toBe(false);
  });

  it('removes the file and exits 1 on an uncaught exception', () => {
    const result = run('log-and-throw.mjs', dev);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Error: boom');
    expect(existsSync(logFile)).toBe(false);
  });
});

describe('DEBUG_FILE=keep', () => {
  const keep: Env = { NODE_ENV: 'development', DEBUG_FILE: 'keep' };

  it('keeps the file after a normal exit, with no process listeners', () => {
    const result = run('log-and-exit.mjs', keep);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('SIGINT_LISTENERS:0\n');
    expect(readFileSync(logFile, 'utf8')).toMatch(/Z \[LOG\] \[log-and-exit\.mjs:4\] hello /);
  });

  it('appends to the file on every run, marking where each run starts', () => {
    run('log-and-exit.mjs', keep);
    run('log-and-exit.mjs', keep);

    const text = readFileSync(logFile, 'utf8');
    expect(text.match(/hello/g)).toHaveLength(2);
    expect(text.match(/\[poof-log\] started \(pid \d+\)/g)).toHaveLength(2);
  });

  it('keeps every line when the app crashes', () => {
    const result = run('log-and-throw.mjs', keep);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Error: boom');
    expect(readFileSync(logFile, 'utf8')).toContain('about to crash');
  });

  it('keeps the file when the app is stopped with a signal', async () => {
    const child = spawn(process.execPath, args('--import', 'log-and-wait.mjs'), {
      cwd: appDir,
      env: childEnv(keep),
    });
    await new Promise<void>((resolve) => {
      child.stdout.on('data', (chunk: Buffer) => {
        if (chunk.toString().includes('READY')) resolve();
      });
    });

    child.kill('SIGINT');
    await new Promise((resolve) => child.on('close', resolve));

    expect(readFileSync(logFile, 'utf8')).toContain('waiting for a signal');
  });
});
