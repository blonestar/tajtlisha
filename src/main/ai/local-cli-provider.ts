import type {
  AiProviderCapabilities,
  AiProviderId,
  AuthMode,
  ProviderModelDescriptor,
  TestConnectionResult
} from '../../shared/types/ai';
import { AppError } from '../../shared/errors';
import type {
  AiProvider,
  ProviderDefinition,
  ProviderPolishRequest,
  ProviderSummarizeRequest,
  ProviderTextItem,
  ProviderTranscribeRequest,
  ProviderTranscribeResult,
  ProviderTranslateRequest
} from './provider';
import {
  CLI_TIMEOUT_MS,
  defaultResolveCliDeps,
  resolveCliExecutable,
  runCli,
  withCliWorkDir,
  type CliName,
  type CliRunInput,
  type CliRunner,
  type CliRunResult,
  type ResolveCliDeps
} from './local-cli';

export type LocalCliProviderOptions = {
  /** Runs the CLI. Default: runCli (spawns the real binary). Tests pass a fake. */
  runner?: CliRunner;
  /** Where the executable is searched for. Default: the real file system and process env. */
  resolveDeps?: ResolveCliDeps;
};

export type LocalCliDetection = { path: string; version: string };

/**
 * Shared base for providers that run an AI CLI on this computer. The CLI
 * keeps its own login; no secret is stored here. Only text work is supported:
 * translation, subtitle polish, and summary.
 */
export abstract class LocalCliProvider implements AiProvider {
  readonly id: AiProviderId;
  readonly displayName: string;
  readonly authModes: AuthMode[];
  readonly capabilities: AiProviderCapabilities;
  readonly experimental = true;

  protected abstract readonly cliName: CliName;
  protected readonly runner: CliRunner;
  protected readonly resolveDeps: ResolveCliDeps;

  private readonly modelDescriptors: ProviderModelDescriptor[];

  constructor(definition: ProviderDefinition, options: LocalCliProviderOptions = {}) {
    this.id = definition.id;
    this.displayName = definition.displayName;
    this.authModes = definition.authModes;
    this.capabilities = definition.capabilities;
    this.modelDescriptors = definition.modelDescriptors;
    this.runner = options.runner ?? runCli;
    this.resolveDeps = options.resolveDeps ?? defaultResolveCliDeps();
  }

  async listModels(capability: keyof AiProviderCapabilities): Promise<ProviderModelDescriptor[]> {
    if (!this.capabilities[capability]) {
      return [];
    }

    return this.modelDescriptors
      .filter((model) => model.capability === capability)
      .map((model) => ({ ...model, available: model.available ?? true }));
  }

  /** Finds the CLI and reads its version. Null when it is missing or `--version` fails. */
  async detectLocalCli(): Promise<{ path: string; version: string } | null> {
    const executable = await resolveCliExecutable(this.cliName, this.resolveDeps);
    if (!executable) {
      return null;
    }

    try {
      const result = await withCliWorkDir((cwd) => this.exec({ executable, args: ['--version'], cwd, timeoutMs: CLI_TIMEOUT_MS.status }));
      const version = firstNonEmptyLine(result.stdout);
      return result.exitCode === 0 && version ? { path: executable, version } : null;
    } catch {
      return null;
    }
  }

  abstract testConnection(): Promise<TestConnectionResult>;

  abstract translateTexts(request: ProviderTranslateRequest): Promise<ProviderTextItem[]>;

  abstract polishTexts(request: ProviderPolishRequest): Promise<ProviderTextItem[]>;

  abstract summarizeText(request: ProviderSummarizeRequest): Promise<string>;

  transcribe(_request: ProviderTranscribeRequest): Promise<ProviderTranscribeResult> {
    return Promise.reject(this.unsupported('transcription'));
  }

  protected unsupported(operation: string): AppError {
    return new AppError('PROVIDER_UNSUPPORTED', `${this.displayName} does not support ${operation}.`);
  }

  /** The executable path, or PROVIDER_NOT_CONNECTED when the CLI is not installed. */
  protected async requireExecutable(): Promise<string> {
    const executable = await resolveCliExecutable(this.cliName, this.resolveDeps);
    if (!executable) {
      throw new AppError('PROVIDER_NOT_CONNECTED', `${this.displayName} was not found on this computer.`);
    }

    return executable;
  }

  /** One CLI command. `cwd` comes from withCliWorkDir, so the command never runs in the project. */
  protected exec(input: Omit<CliRunInput, 'displayName'>): Promise<CliRunResult> {
    return this.runner({ ...input, displayName: this.displayName });
  }
}

function firstNonEmptyLine(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line !== '') ?? '';
}
