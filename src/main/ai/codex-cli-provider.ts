import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  AiProviderCapabilities,
  ProviderModelDescriptor,
  ReasoningEffort,
  TestConnectionResult
} from '../../shared/types/ai';
import { AppError } from '../../shared/errors';
import { CLI_TIMEOUT_MS, cliFailureError, resolveCliExecutable, withCliWorkDir } from './local-cli';
import { LocalCliProvider, type LocalCliProviderOptions } from './local-cli-provider';
import type {
  ProviderDefinition,
  ProviderPolishRequest,
  ProviderSummarizeRequest,
  ProviderTextItem,
  ProviderTranslateRequest
} from './provider';
import {
  buildCaptionItemsInput,
  buildPolishInstructions,
  buildTranslationInstructions,
  CAPTION_ITEMS_SCHEMA,
  parseCaptionItems
} from './text-prompts';

export const codexCliProviderDefinition: ProviderDefinition = {
  id: 'codex_cli',
  displayName: 'Codex CLI (local)',
  authModes: ['local_cli'],
  experimental: true,
  capabilities: {
    detectLanguage: false,
    transcription: false,
    segmentTimestamps: false,
    wordTimestamps: false,
    translation: true,
    subtitlePolish: true,
    textToSpeech: false,
    summary: true
  },
  modelDescriptors: []
};

type CodexModelsPayload = {
  models?: Array<{ slug?: unknown; display_name?: unknown; visibility?: unknown; priority?: unknown }>;
};

/**
 * Runs the Codex CLI (`codex`) with its own ChatGPT login. Tajtlisha never
 * reads ~/.codex/auth.json. Text requests run `codex exec` in a read-only,
 * ephemeral sandbox, and the reply is read from the `-o` output file.
 */
export class CodexCliProvider extends LocalCliProvider {
  protected override readonly cliName = 'codex' as const;

  constructor(options: LocalCliProviderOptions = {}) {
    super(codexCliProviderDefinition, options);
  }

  /**
   * Text models come from `codex debug models`, filtered to the models the
   * CLI lists and sorted by its priority. Any failure gives an empty list, and
   * the UI then offers the provider default (no `-m`).
   */
  override async listModels(capability: keyof AiProviderCapabilities): Promise<ProviderModelDescriptor[]> {
    if (!this.capabilities[capability]) {
      return [];
    }

    try {
      const executable = await this.requireExecutable();
      const result = await withCliWorkDir((cwd) =>
        this.exec({ executable, args: ['debug', 'models'], cwd, timeoutMs: CLI_TIMEOUT_MS.models })
      );
      return result.exitCode === 0 ? parseCodexModels(result.stdout, capability) : [];
    } catch {
      return [];
    }
  }

  override async testConnection(): Promise<TestConnectionResult> {
    const checkedAt = new Date().toISOString();
    const executable = await resolveCliExecutable(this.cliName, this.resolveDeps);
    if (!executable) {
      return { ok: false, providerId: this.id, checkedAt, message: `${this.displayName} was not found on this computer.` };
    }

    try {
      const result = await withCliWorkDir((cwd) =>
        this.exec({ executable, args: ['login', 'status'], cwd, timeoutMs: CLI_TIMEOUT_MS.status })
      );

      if (result.exitCode === 0 && /logged in/i.test(result.stdout)) {
        const viaChatGpt = /chatgpt/i.test(result.stdout);
        return {
          ok: true,
          providerId: this.id,
          checkedAt,
          message: viaChatGpt ? `${this.displayName} is signed in (ChatGPT).` : `${this.displayName} is signed in.`
        };
      }

      return {
        ok: false,
        providerId: this.id,
        checkedAt,
        message: `${this.displayName} is not signed in. Run "codex login" in a terminal, sign in, then test again.`
      };
    } catch (error) {
      if (error instanceof AppError && error.code === 'JOB_CANCELED') throw error;
      return {
        ok: false,
        providerId: this.id,
        checkedAt,
        message: error instanceof AppError && error.detail ? error.detail : `${this.displayName} sign-in status could not be checked.`
      };
    }
  }

  override translateTexts(request: ProviderTranslateRequest): Promise<ProviderTextItem[]> {
    return this.captionRequest({
      instructions: buildTranslationInstructions(request),
      items: request.items,
      modelId: request.modelId,
      reasoningEffort: request.reasoningEffort,
      signal: request.signal
    });
  }

  override polishTexts(request: ProviderPolishRequest): Promise<ProviderTextItem[]> {
    return this.captionRequest({
      instructions: buildPolishInstructions(request),
      items: request.items,
      modelId: request.modelId,
      reasoningEffort: request.reasoningEffort,
      signal: request.signal
    });
  }

  override async summarizeText(request: ProviderSummarizeRequest): Promise<string> {
    const executable = await this.requireExecutable();

    return withCliWorkDir(async (cwd) => {
      const outputPath = join(cwd, 'out.txt');
      await this.runCodex({
        executable,
        cwd,
        outputPath,
        stdin: `${request.systemPrompt}\n\n${request.transcript}`,
        modelId: request.modelId,
        reasoningEffort: request.reasoningEffort,
        signal: request.signal
      });

      return (await readCodexOutput(outputPath, this.displayName)).trim();
    });
  }

  /** Caption JSON: the output schema makes codex reply with `{ items: [...] }`. */
  private async captionRequest(input: {
    instructions: string;
    items: ProviderTextItem[];
    modelId?: string;
    reasoningEffort?: ReasoningEffort;
    signal?: AbortSignal;
  }): Promise<ProviderTextItem[]> {
    const executable = await this.requireExecutable();

    return withCliWorkDir(async (cwd) => {
      const schemaPath = join(cwd, 'schema.json');
      const outputPath = join(cwd, 'out.txt');
      await writeFile(schemaPath, JSON.stringify(CAPTION_ITEMS_SCHEMA));

      await this.runCodex({
        executable,
        cwd,
        outputPath,
        outputSchemaPath: schemaPath,
        stdin: `${input.instructions}\n\n${buildCaptionItemsInput(input.items)}`,
        modelId: input.modelId,
        reasoningEffort: input.reasoningEffort,
        signal: input.signal
      });

      return parseCaptionItems(await readCodexOutput(outputPath, this.displayName), this.displayName);
    });
  }

  private async runCodex(input: {
    executable: string;
    cwd: string;
    outputPath: string;
    outputSchemaPath?: string;
    stdin: string;
    modelId?: string;
    reasoningEffort?: ReasoningEffort;
    signal?: AbortSignal;
  }): Promise<void> {
    const result = await this.exec({
      executable: input.executable,
      args: codexExecArgs(input),
      stdin: input.stdin,
      cwd: input.cwd,
      timeoutMs: CLI_TIMEOUT_MS.request,
      signal: input.signal
    });

    if (result.exitCode !== 0) {
      throw cliFailureError(this.displayName, result.stderr || result.stdout);
    }
  }
}

/**
 * `codex exec` argv. The prompt comes from stdin (the final `-`). `--ignore-user-config`
 * skips the user's config and MCP servers; auth still works. `--ephemeral` keeps no session.
 */
function codexExecArgs(input: {
  cwd: string;
  outputPath: string;
  outputSchemaPath?: string;
  modelId?: string;
  reasoningEffort?: ReasoningEffort;
}): string[] {
  return [
    'exec',
    '--skip-git-repo-check',
    '--sandbox',
    'read-only',
    '--ephemeral',
    '--ignore-user-config',
    '--ignore-rules',
    '--color',
    'never',
    '-C',
    input.cwd,
    ...(input.outputSchemaPath ? ['--output-schema', input.outputSchemaPath] : []),
    '-o',
    input.outputPath,
    ...(input.modelId ? ['-m', input.modelId] : []),
    ...(input.reasoningEffort ? ['-c', `model_reasoning_effort="${input.reasoningEffort}"`] : []),
    '-'
  ];
}

async function readCodexOutput(outputPath: string, displayName: string): Promise<string> {
  const text = await readFile(outputPath, 'utf8').catch(() => '');
  if (!text.trim()) {
    throw new AppError('PROVIDER_REQUEST_FAILED', `${displayName} returned an empty response.`);
  }

  return text;
}

/** Parses `codex debug models` output. Keeps listed models, sorted by priority. Invalid output gives []. */
export function parseCodexModels(stdout: string, capability: keyof AiProviderCapabilities): ProviderModelDescriptor[] {
  let payload: CodexModelsPayload;
  try {
    payload = JSON.parse(stdout) as CodexModelsPayload;
  } catch {
    return [];
  }

  const models = Array.isArray(payload?.models) ? payload.models : [];

  return models
    .flatMap((model) => (model.visibility === 'list' && typeof model.slug === 'string' && model.slug !== '' ? [{ model, slug: model.slug }] : []))
    .sort((a, b) => priorityOf(a.model) - priorityOf(b.model))
    .map(({ model, slug }) => ({
      id: slug,
      label: typeof model.display_name === 'string' && model.display_name.trim() !== '' ? model.display_name : slug,
      capability
    }));
}

function priorityOf(model: { priority?: unknown }): number {
  return typeof model.priority === 'number' ? model.priority : Number.MAX_SAFE_INTEGER;
}
