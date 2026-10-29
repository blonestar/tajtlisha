import { EventEmitter } from 'node:events';
import { constants, existsSync } from 'node:fs';
import type { ChildProcessWithoutNullStreams, SpawnOptionsWithoutStdio } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CLI_KILL_GRACE_MS,
  CLI_MAX_OUTPUT_BYTES,
  cliChildEnv,
  cliFailureError,
  resolveCliExecutable,
  runCli,
  withCliWorkDir,
  type CliRunInput,
  type ResolveCliDeps
} from '../../../src/main/ai/local-cli';
import { AppError } from '../../../src/shared/errors';
import { fakeResolveDeps } from './local-cli-fakes';

afterEach(() => {
  vi.useRealTimers();
});

/** Discovery fake whose readdir knows the nvm versions directory. */
function nvmDeps(versions: string[], existing: string[]): ResolveCliDeps {
  const deps = fakeResolveDeps({ existing });
  return {
    ...deps,
    readdir: async (dirPath: string) => {
      if (dirPath === '/home/tester/.nvm/versions/node') return versions;
      throw new Error('ENOENT');
    }
  };
}

describe('resolveCliExecutable', () => {
  it('searches PATH entries before the fallback directories', async () => {
    const deps = fakeResolveDeps({
      env: { PATH: '/usr/bin:/opt/tools' },
      existing: ['/opt/tools/codex', '/home/tester/.local/bin/codex']
    });

    await expect(resolveCliExecutable('codex', deps)).resolves.toBe('/opt/tools/codex');
  });

  it('falls back to the usual install directories when PATH does not have the CLI', async () => {
    const deps = fakeResolveDeps({ env: { PATH: '/usr/bin' }, existing: ['/home/tester/.local/bin/claude'] });

    await expect(resolveCliExecutable('claude', deps)).resolves.toBe('/home/tester/.local/bin/claude');
  });

  it('finds the CLI in the Homebrew and Volta fallback directories', async () => {
    await expect(
      resolveCliExecutable('codex', fakeResolveDeps({ env: {}, existing: ['/opt/homebrew/bin/codex'] }))
    ).resolves.toBe('/opt/homebrew/bin/codex');
    await expect(
      resolveCliExecutable('codex', fakeResolveDeps({ env: {}, existing: ['/home/tester/.volta/bin/codex'] }))
    ).resolves.toBe('/home/tester/.volta/bin/codex');
  });

  it('checks every nvm Node version, newest first by numeric semver order', async () => {
    const deps = nvmDeps(['v9.11.2', 'v20.10.0', 'v18.20.0', 'v22.1.0', 'not-a-version'], [
      '/home/tester/.nvm/versions/node/v9.11.2/bin/codex',
      '/home/tester/.nvm/versions/node/v20.10.0/bin/codex'
    ]);

    // String order would put v9 first; numeric order finds v20 first.
    await expect(resolveCliExecutable('codex', { ...deps, env: {} })).resolves.toBe(
      '/home/tester/.nvm/versions/node/v20.10.0/bin/codex'
    );
  });

  it('only accepts candidates that are executable (X_OK)', async () => {
    const deps = fakeResolveDeps({ env: { PATH: '/bad:/good' }, existing: ['/good/codex'] });
    const accessSpy = vi.spyOn(deps, 'access');

    await expect(resolveCliExecutable('codex', deps)).resolves.toBe('/good/codex');
    expect(accessSpy).toHaveBeenCalledWith('/bad/codex', constants.X_OK);
  });

  it('returns null when no directory has the CLI', async () => {
    await expect(resolveCliExecutable('codex', fakeResolveDeps({ env: { PATH: '/usr/bin' } }))).resolves.toBeNull();
  });

  it('looks only for codex.exe on win32', async () => {
    const deps = fakeResolveDeps({
      platform: 'win32',
      env: { PATH: 'C:\\Tools;C:\\Other' },
      existing: ['C:\\Tools\\codex', 'C:\\Other\\codex.exe']
    });

    await expect(resolveCliExecutable('codex', deps)).resolves.toBe('C:\\Other\\codex.exe');
  });

  it('returns null on win32 when only an extensionless or .cmd shim exists', async () => {
    const deps = fakeResolveDeps({
      platform: 'win32',
      env: { PATH: 'C:\\Tools' },
      existing: ['C:\\Tools\\claude', 'C:\\Tools\\claude.cmd']
    });

    await expect(resolveCliExecutable('claude', deps)).resolves.toBeNull();
  });
});

describe('cliChildEnv', () => {
  it('removes ELECTRON_RUN_AS_NODE and puts the executable directory first on PATH', () => {
    const parent = { PATH: '/usr/bin:/bin', ELECTRON_RUN_AS_NODE: '1', HOME: '/home/tester' };

    const env = cliChildEnv('/home/tester/.nvm/versions/node/v22.1.0/bin/codex', parent);

    expect(env).toEqual({
      PATH: '/home/tester/.nvm/versions/node/v22.1.0/bin:/usr/bin:/bin',
      HOME: '/home/tester'
    });
    expect(parent.ELECTRON_RUN_AS_NODE).toBe('1');
  });

  it('sets PATH to the executable directory when the parent has no PATH', () => {
    expect(cliChildEnv('/opt/bin/claude', {})).toEqual({ PATH: '/opt/bin' });
  });
});

type FakeChild = EventEmitter & {
  stdin: EventEmitter & { end: ReturnType<typeof vi.fn> };
  stdout: EventEmitter;
  stderr: EventEmitter;
  kill: ReturnType<typeof vi.fn>;
};

function fakeChild(): FakeChild {
  const child = new EventEmitter() as FakeChild;
  child.stdin = Object.assign(new EventEmitter(), { end: vi.fn() });
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = vi.fn(() => true);
  return child;
}

function spawnReturning(child: FakeChild) {
  return vi.fn((_command: string, _args: string[], _options: SpawnOptionsWithoutStdio) => child as unknown as ChildProcessWithoutNullStreams);
}

const baseInput: CliRunInput = {
  executable: '/home/tester/.local/bin/codex',
  args: ['exec', '-'],
  stdin: 'hello',
  cwd: '/tmp/tajtlisha-cli-test',
  timeoutMs: 5_000
};

describe('runCli', () => {
  it('spawns without a shell, with the working directory, a child env, and hidden window, then writes and closes stdin', async () => {
    const child = fakeChild();
    const spawn = spawnReturning(child);

    const pending = runCli(baseInput, {
      spawn,
      env: { PATH: '/usr/bin', ELECTRON_RUN_AS_NODE: '1' }
    });
    child.stdout.emit('data', Buffer.from('answer'));
    child.stderr.emit('data', Buffer.from('note'));
    child.emit('close', 0);

    await expect(pending).resolves.toEqual({ exitCode: 0, stdout: 'answer', stderr: 'note' });
    expect(spawn).toHaveBeenCalledWith(
      '/home/tester/.local/bin/codex',
      ['exec', '-'],
      expect.objectContaining({
        cwd: '/tmp/tajtlisha-cli-test',
        shell: false,
        windowsHide: true,
        env: expect.objectContaining({ PATH: '/home/tester/.local/bin:/usr/bin' })
      })
    );
    const options = spawn.mock.calls[0][2];
    expect(options.env).not.toHaveProperty('ELECTRON_RUN_AS_NODE');
    expect(child.stdin.end).toHaveBeenCalledWith('hello');
  });

  it('returns a non-zero exit code without rejecting', async () => {
    const child = fakeChild();
    const pending = runCli(baseInput, { spawn: spawnReturning(child) });

    child.stderr.emit('data', Buffer.from('Not logged in'));
    child.emit('close', 1);

    await expect(pending).resolves.toEqual({ exitCode: 1, stdout: '', stderr: 'Not logged in' });
  });

  it('maps a spawn error (ENOENT) to PROVIDER_NOT_CONNECTED', async () => {
    const child = fakeChild();
    const pending = runCli({ ...baseInput, displayName: 'Codex CLI (local)' }, { spawn: spawnReturning(child) });

    child.emit('error', new Error('spawn codex ENOENT'));

    await expect(pending).rejects.toMatchObject({ code: 'PROVIDER_NOT_CONNECTED' });
    await expect(pending).rejects.toThrow('Codex CLI (local) could not be started');
  });

  it('rejects with JOB_CANCELED and kills the child on abort, then SIGKILL after the grace period', async () => {
    vi.useFakeTimers();
    const child = fakeChild();
    const controller = new AbortController();
    const pending = runCli({ ...baseInput, signal: controller.signal }, { spawn: spawnReturning(child) });
    const rejection = expect(pending).rejects.toMatchObject({ code: 'JOB_CANCELED' });

    controller.abort();
    await rejection;

    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    expect(child.kill).not.toHaveBeenCalledWith('SIGKILL');
    vi.advanceTimersByTime(CLI_KILL_GRACE_MS);
    expect(child.kill).toHaveBeenLastCalledWith('SIGKILL');
  });

  it('does not send SIGKILL when the child exits after SIGTERM', async () => {
    vi.useFakeTimers();
    const child = fakeChild();
    const controller = new AbortController();
    const pending = runCli({ ...baseInput, signal: controller.signal }, { spawn: spawnReturning(child) });
    const rejection = expect(pending).rejects.toMatchObject({ code: 'JOB_CANCELED' });

    controller.abort();
    await rejection;
    child.emit('close', null);
    vi.advanceTimersByTime(CLI_KILL_GRACE_MS);

    expect(child.kill.mock.calls).toEqual([['SIGTERM']]);
  });

  it('does not spawn when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const spawn = spawnReturning(fakeChild());

    await expect(runCli({ ...baseInput, signal: controller.signal }, { spawn })).rejects.toMatchObject({ code: 'JOB_CANCELED' });
    expect(spawn).not.toHaveBeenCalled();
  });

  it('rejects with PROVIDER_REQUEST_FAILED and kills the child on timeout', async () => {
    vi.useFakeTimers();
    const child = fakeChild();
    const pending = runCli({ ...baseInput, timeoutMs: 1_000, displayName: 'Claude Code (local)' }, { spawn: spawnReturning(child) });
    const rejection = expect(pending).rejects.toMatchObject({ code: 'PROVIDER_REQUEST_FAILED' });

    vi.advanceTimersByTime(1_000);

    await rejection;
    await expect(pending).rejects.toThrow('Claude Code (local) timed out after 1 s.');
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
  });

  it('names the executable file in messages when no display name is given', async () => {
    vi.useFakeTimers();
    const pending = runCli({ ...baseInput, timeoutMs: 2_000 }, { spawn: spawnReturning(fakeChild()) });
    const rejection = expect(pending).rejects.toThrow('codex timed out after 2 s.');

    vi.advanceTimersByTime(2_000);

    await rejection;
  });

  it('rejects output above the 10 MB cap and kills the child', async () => {
    const child = fakeChild();
    const pending = runCli({ ...baseInput, displayName: 'Codex CLI (local)' }, { spawn: spawnReturning(child) });

    child.stdout.emit('data', Buffer.alloc(CLI_MAX_OUTPUT_BYTES + 1));

    await expect(pending).rejects.toMatchObject({ code: 'PROVIDER_REQUEST_FAILED' });
    await expect(pending).rejects.toThrow('Codex CLI (local) produced too much output.');
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
  });

  it('keeps output at exactly the cap', async () => {
    const child = fakeChild();
    const pending = runCli(baseInput, { spawn: spawnReturning(child) });

    child.stdout.emit('data', Buffer.alloc(CLI_MAX_OUTPUT_BYTES));
    child.emit('close', 0);

    await expect(pending).resolves.toMatchObject({ exitCode: 0 });
  });
});

describe('cliFailureError', () => {
  it('maps rate and usage limit wording to PROVIDER_RATE_LIMITED', () => {
    expect(cliFailureError('Codex CLI (local)', 'ERROR: Rate limit reached for this plan')).toMatchObject({
      code: 'PROVIDER_RATE_LIMITED'
    });
    expect(cliFailureError('Claude Code (local)', 'You have hit your usage limit')).toMatchObject({
      code: 'PROVIDER_RATE_LIMITED'
    });
  });

  it('maps login and authentication wording to PROVIDER_AUTH_FAILED', () => {
    expect(cliFailureError('Codex CLI (local)', 'Not logged in. Run codex login.')).toMatchObject({ code: 'PROVIDER_AUTH_FAILED' });
    expect(cliFailureError('Claude Code (local)', 'Error: 401 unauthorized')).toMatchObject({ code: 'PROVIDER_AUTH_FAILED' });
    expect(cliFailureError('Claude Code (local)', 'Authentication failed')).toMatchObject({ code: 'PROVIDER_AUTH_FAILED' });
  });

  it('maps anything else to PROVIDER_REQUEST_FAILED with the text tail as detail', () => {
    const error = cliFailureError('Codex CLI (local)', 'boom');

    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ code: 'PROVIDER_REQUEST_FAILED', detail: 'Codex CLI (local) failed: boom' });
  });

  it('keeps only the last 300 characters of the CLI text', () => {
    const error = cliFailureError('Codex CLI (local)', `${'x'.repeat(1_000)}THE-END`);

    expect(error.detail?.endsWith('THE-END')).toBe(true);
    expect(error.detail?.length).toBeLessThanOrEqual('Codex CLI (local) failed: '.length + 300);
  });

  it('removes e-mail addresses from the detail', () => {
    const error = cliFailureError('Claude Code (local)', 'Request failed for bojan@example.com');

    expect(error.detail).not.toContain('bojan@example.com');
    expect(error.detail).toContain('[email]');
  });
});

describe('withCliWorkDir', () => {
  it('runs the task in a fresh tajtlisha-cli directory and removes it afterwards', async () => {
    let seen = '';

    await withCliWorkDir(async (cwd) => {
      seen = cwd;
      expect(cwd).toMatch(/tajtlisha-cli-/);
      expect(existsSync(cwd)).toBe(true);
    });

    expect(existsSync(seen)).toBe(false);
  });

  it('removes the directory when the task throws', async () => {
    let seen = '';

    await expect(
      withCliWorkDir(async (cwd) => {
        seen = cwd;
        throw new Error('task failed');
      })
    ).rejects.toThrow('task failed');

    expect(existsSync(seen)).toBe(false);
  });
});
