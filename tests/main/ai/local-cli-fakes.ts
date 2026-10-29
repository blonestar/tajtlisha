import { vi } from 'vitest';
import type { CliName, CliRunInput, CliRunResult, ResolveCliDeps } from '../../../src/main/ai/local-cli';

/** Fake file system for executable discovery: only `existing` paths can be accessed. */
export function fakeResolveDeps(options: { existing?: string[]; env?: NodeJS.ProcessEnv; platform?: NodeJS.Platform } = {}): ResolveCliDeps {
  const existing = new Set(options.existing ?? []);
  return {
    env: options.env ?? { PATH: '/opt/bin' },
    homedir: () => '/home/tester',
    platform: options.platform ?? 'linux',
    access: async (filePath: string) => {
      if (!existing.has(filePath)) throw new Error(`ENOENT: ${filePath}`);
    },
    readdir: async () => []
  };
}

/** Discovery deps where the given CLI is installed at /opt/bin/<name>. */
export function installedResolveDeps(name: CliName): ResolveCliDeps {
  return fakeResolveDeps({ existing: [`/opt/bin/${name}`] });
}

/** Discovery deps where nothing is installed. */
export function missingResolveDeps(): ResolveCliDeps {
  return fakeResolveDeps();
}

export type FakeRunner = {
  runner: (input: CliRunInput) => Promise<CliRunResult>;
  calls: CliRunInput[];
};

/**
 * Records every CLI call. `respond` produces the result and may write files the
 * CLI would write (for example the codex `-o` output file).
 */
export function fakeRunner(respond: (input: CliRunInput) => CliRunResult | Promise<CliRunResult> = () => ok()): FakeRunner {
  const calls: CliRunInput[] = [];
  const runner = vi.fn(async (input: CliRunInput) => {
    calls.push(input);
    return respond(input);
  });
  return { runner, calls };
}

export function ok(stdout = '', stderr = ''): CliRunResult {
  return { exitCode: 0, stdout, stderr };
}

export function failed(stderr: string, stdout = ''): CliRunResult {
  return { exitCode: 1, stdout, stderr };
}

/** The value that follows `flag` in argv. Throws when the flag is missing, so tests fail loudly. */
export function argAfter(args: string[], flag: string): string {
  const index = args.indexOf(flag);
  if (index === -1 || index + 1 >= args.length) throw new Error(`missing ${flag} in ${args.join(' ')}`);
  return args[index + 1];
}
