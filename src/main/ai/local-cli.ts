import { spawn, type ChildProcessWithoutNullStreams, type SpawnOptionsWithoutStdio } from 'node:child_process';
import { constants } from 'node:fs';
import { access, mkdtemp, readdir, rm } from 'node:fs/promises';
import { homedir as osHomedir, tmpdir } from 'node:os';
import { basename, delimiter, dirname, join, posix, win32, type PlatformPath } from 'node:path';
import { AppError } from '../../shared/errors';

/** Executables that local CLI providers run. Tajtlisha only spawns them; it never reads their auth files. */
export type CliName = 'codex' | 'claude';

/** Timeouts in milliseconds. */
export const CLI_TIMEOUT_MS = {
  /** `--version` and login status checks. */
  status: 5_000,
  /** Model list. */
  models: 10_000,
  /** One text request (translation, polish, summary). */
  request: 300_000
} as const;

/** Each of stdout and stderr is capped at this size; a larger output fails the request. */
export const CLI_MAX_OUTPUT_BYTES = 10 * 1024 * 1024;

/** Time between SIGTERM and SIGKILL when a CLI ignores the first signal. */
export const CLI_KILL_GRACE_MS = 2_000;

export type ResolveCliDeps = {
  env: NodeJS.ProcessEnv;
  homedir: () => string;
  platform: NodeJS.Platform;
  access: (path: string, mode?: number) => Promise<void>;
  readdir: (path: string) => Promise<string[]>;
};

export function defaultResolveCliDeps(): ResolveCliDeps {
  return {
    env: process.env,
    homedir: osHomedir,
    platform: process.platform,
    access: (filePath, mode) => access(filePath, mode),
    readdir: (dirPath) => readdir(dirPath)
  };
}

/**
 * Finds the CLI executable. Search order: every PATH entry, then fallback
 * directories. GUI-launched Electron apps often miss the user's shell PATH,
 * so the fallbacks cover the usual install locations, including every nvm
 * Node version (newest first). On Windows only `<name>.exe` is looked for;
 * npm `.cmd` shims are not supported yet.
 */
export async function resolveCliExecutable(name: CliName, deps: ResolveCliDeps = defaultResolveCliDeps()): Promise<string | null> {
  const pathApi = deps.platform === 'win32' ? win32 : posix;
  const fileName = deps.platform === 'win32' ? `${name}.exe` : name;

  for (const dir of await searchDirectories(deps, pathApi)) {
    const candidate = pathApi.resolve(dir, fileName);
    try {
      await deps.access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Not here or not executable: keep searching.
    }
  }

  return null;
}

async function searchDirectories(deps: ResolveCliDeps, pathApi: PlatformPath): Promise<string[]> {
  const pathDirs = (deps.env.PATH ?? '').split(pathApi.delimiter).filter((dir) => dir !== '');
  const home = deps.homedir();
  const fallbackDirs = [
    pathApi.join(home, '.local', 'bin'),
    pathApi.join(home, '.claude', 'local'),
    pathApi.join(home, '.npm-global', 'bin'),
    pathApi.join(home, '.bun', 'bin'),
    pathApi.join(home, '.volta', 'bin'),
    '/usr/local/bin',
    '/opt/homebrew/bin',
    ...(await nvmNodeBinDirectories(deps, pathApi))
  ];

  return [...new Set([...pathDirs, ...fallbackDirs])];
}

/** `~/.nvm/versions/node/<version>/bin`, newest Node version first (numeric, so v20 comes before v9). */
async function nvmNodeBinDirectories(deps: ResolveCliDeps, pathApi: PlatformPath): Promise<string[]> {
  const root = pathApi.join(deps.homedir(), '.nvm', 'versions', 'node');

  let entries: string[];
  try {
    entries = await deps.readdir(root);
  } catch {
    return [];
  }

  return entries
    .flatMap((entry) => {
      const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(entry);
      return match ? [{ entry, version: [Number(match[1]), Number(match[2]), Number(match[3])] }] : [];
    })
    .sort((a, b) => compareVersions(b.version, a.version))
    .map(({ entry }) => pathApi.join(root, entry, 'bin'));
}

function compareVersions(a: number[], b: number[]): number {
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

export type CliRunInput = {
  executable: string;
  args: string[];
  stdin?: string;
  /** Working directory of the child process; providers pass a fresh temp directory. */
  cwd: string;
  timeoutMs: number;
  signal?: AbortSignal;
  /** Name used in error messages. Defaults to the executable file name. */
  displayName?: string;
};

export type CliRunResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
};

/** Runs one CLI command. Providers receive this function, so tests can pass a fake. */
export type CliRunner = (input: CliRunInput) => Promise<CliRunResult>;

export type CliSpawn = (command: string, args: string[], options: SpawnOptionsWithoutStdio) => ChildProcessWithoutNullStreams;

export type RunCliOptions = {
  /** Injected for tests. Default: child_process.spawn. */
  spawn?: CliSpawn;
  /** Parent environment. Default: process.env. */
  env?: NodeJS.ProcessEnv;
  /** Platform used for spawn and kill behavior. Default: process.platform. */
  platform?: NodeJS.Platform;
  /** Kills the child and everything it started. Injected for tests. Default: killProcessTree. */
  killTree?: (child: ChildProcessWithoutNullStreams, signal: 'SIGTERM' | 'SIGKILL', platform: NodeJS.Platform) => void;
};

const defaultSpawn: CliSpawn = (command, args, options) => spawn(command, args, options);

/**
 * Extra wait after SIGKILL before the run settles anyway. A killed process
 * normally closes at once; this only guards against a lost 'close' event.
 */
const CLI_CLOSE_FALLBACK_MS = 3_000;

/**
 * Spawns the CLI without a shell. Stdin is written and closed. Output is
 * capped. Abort, timeout, and oversized output kill the whole process tree
 * (SIGTERM, then SIGKILL after a grace period) and reject only after the
 * process has closed, so the caller's temp directory outlives the process.
 * A spawn error (usually ENOENT) means the CLI is not installed.
 */
export function runCli(input: CliRunInput, options: RunCliOptions = {}): Promise<CliRunResult> {
  const spawnProcess = options.spawn ?? defaultSpawn;
  const platform = options.platform ?? process.platform;
  const killTree = options.killTree ?? killProcessTree;
  const displayName = input.displayName ?? basename(input.executable);

  return new Promise<CliRunResult>((resolve, reject) => {
    if (input.signal?.aborted) {
      reject(new AppError('JOB_CANCELED'));
      return;
    }

    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawnProcess(input.executable, input.args, {
        cwd: input.cwd,
        env: cliChildEnv(input.executable, options.env ?? process.env),
        shell: false,
        windowsHide: true,
        // Own process group on POSIX, so a kill reaches every process the CLI starts.
        detached: platform !== 'win32'
      });
    } catch {
      reject(notStartedError(displayName));
      return;
    }

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    const outputBytes = { stdout: 0, stderr: 0 };
    let settled = false;
    let failure: AppError | undefined;
    let killTimer: NodeJS.Timeout | undefined;
    let fallbackTimer: NodeJS.Timeout | undefined;

    const finish = (action: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      clearTimeout(killTimer);
      clearTimeout(fallbackTimer);
      input.signal?.removeEventListener('abort', onAbort);
      action();
    };

    const kill = (signal: 'SIGTERM' | 'SIGKILL'): void => {
      try {
        killTree(child, signal, platform);
      } catch {
        // The process is already gone.
      }
    };

    /** Records the first failure and stops the process; the run settles on 'close'. */
    const fail = (error: AppError): void => {
      if (settled || failure) return;
      failure = error;
      clearTimeout(timeoutTimer);
      input.signal?.removeEventListener('abort', onAbort);
      kill('SIGTERM');
      killTimer = setTimeout(() => {
        kill('SIGKILL');
        fallbackTimer = setTimeout(() => finish(() => reject(error)), CLI_CLOSE_FALLBACK_MS);
      }, CLI_KILL_GRACE_MS);
    };

    const onAbort = (): void => fail(new AppError('JOB_CANCELED'));

    const timeoutTimer = setTimeout(() => {
      fail(new AppError('PROVIDER_REQUEST_FAILED', `${displayName} timed out after ${Math.round(input.timeoutMs / 1000)} s.`));
    }, input.timeoutMs);

    input.signal?.addEventListener('abort', onAbort, { once: true });

    const collect = (stream: 'stdout' | 'stderr', chunks: Buffer[]) => (chunk: Buffer) => {
      if (settled || failure) return;
      outputBytes[stream] += chunk.length;
      if (outputBytes[stream] > CLI_MAX_OUTPUT_BYTES) {
        fail(new AppError('PROVIDER_REQUEST_FAILED', `${displayName} produced too much output.`));
        return;
      }
      chunks.push(chunk);
    };

    child.stdout.on('data', collect('stdout', stdoutChunks));
    child.stderr.on('data', collect('stderr', stderrChunks));

    // A CLI that exits before reading stdin causes EPIPE; the exit path reports the real outcome.
    child.stdin.on('error', () => undefined);
    child.stdin.end(input.stdin ?? '');

    child.on('error', () => {
      // No pid: the process never started, so there is nothing to wait for.
      if (child.pid === undefined) {
        finish(() => reject(notStartedError(displayName)));
        return;
      }
      fail(notStartedError(displayName));
    });

    child.on('close', (exitCode: number | null) => {
      finish(() => {
        if (failure) {
          reject(failure);
          return;
        }
        resolve({
          exitCode,
          stdout: Buffer.concat(stdoutChunks).toString('utf8'),
          stderr: Buffer.concat(stderrChunks).toString('utf8')
        });
      });
    });
  });
}

/**
 * Kills the child and its descendants. POSIX: the child leads its own process
 * group (spawned detached), so the negative pid signals the whole group.
 * Windows: `taskkill /T /F` ends the tree.
 */
export function killProcessTree(
  child: ChildProcessWithoutNullStreams,
  signal: 'SIGTERM' | 'SIGKILL',
  platform: NodeJS.Platform
): void {
  const pid = child.pid;
  if (pid === undefined) return;

  if (platform === 'win32') {
    const killer = spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    killer.on('error', () => child.kill(signal));
    return;
  }

  try {
    process.kill(-pid, signal);
  } catch {
    child.kill(signal);
  }
}

function notStartedError(displayName: string): AppError {
  return new AppError('PROVIDER_NOT_CONNECTED', `${displayName} could not be started. Check that it is installed and on PATH.`);
}

/**
 * Child environment: the parent environment without ELECTRON_RUN_AS_NODE,
 * with the executable's directory first on PATH. The codex npm launcher runs
 * `#!/usr/bin/env node`, and under nvm node sits next to the launcher.
 */
export function cliChildEnv(executable: string, parentEnv: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...parentEnv };
  delete env.ELECTRON_RUN_AS_NODE;

  const pathKey = Object.keys(env).find((key) => key.toUpperCase() === 'PATH') ?? 'PATH';
  const executableDir = dirname(executable);
  const existing = env[pathKey];
  env[pathKey] = existing ? `${executableDir}${delimiter}${existing}` : executableDir;

  return env;
}

const RATE_LIMIT_PATTERN = /rate[ _-]?limit|usage limit|too many requests|\b429\b|quota/i;
const AUTH_PATTERN = /not logged in|log ?in|sign ?in|unauthori[sz]ed|authenticat/i;

/**
 * Maps CLI failure text to an AppError. The text is only classified: CLI
 * output can echo the prompt (transcript, instructions), so it never becomes
 * part of the message. Messages are fixed per category.
 */
export function cliFailureError(displayName: string, text: string, exitCode?: number | null): AppError {
  if (RATE_LIMIT_PATTERN.test(text)) {
    return new AppError('PROVIDER_RATE_LIMITED', `${displayName} reached its usage limit. Try again later.`);
  }

  if (AUTH_PATTERN.test(text)) {
    return new AppError('PROVIDER_AUTH_FAILED', `${displayName} is not signed in. Sign in to the CLI in a terminal, then try again.`);
  }

  const code = typeof exitCode === 'number' && exitCode !== 0 ? ` (exit code ${exitCode})` : '';
  return new AppError('PROVIDER_REQUEST_FAILED', `${displayName} request failed${code}.`);
}

/** Runs `task` in a fresh temp directory and removes the directory afterwards. */
export async function withCliWorkDir<T>(task: (cwd: string) => Promise<T>): Promise<T> {
  const cwd = await mkdtemp(join(tmpdir(), 'tajtlisha-cli-'));
  try {
    return await task(cwd);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}
