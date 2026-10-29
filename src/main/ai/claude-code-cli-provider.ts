import type { ProviderModelDescriptor, ReasoningEffort, TestConnectionResult } from '../../shared/types/ai';
import { AppError } from '../../shared/errors';
import { CLI_TIMEOUT_MS, cliFailureError, resolveCliExecutable, withCliWorkDir, type CliRunResult } from './local-cli';
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

/** CLI model aliases. Each one always points to the latest model of its family. */
const CLAUDE_MODEL_ALIASES: Array<{ id: string; label: string }> = [
  { id: 'fable', label: 'Claude Fable' },
  { id: 'opus', label: 'Claude Opus' },
  { id: 'sonnet', label: 'Claude Sonnet' },
  { id: 'haiku', label: 'Claude Haiku' }
];

const CLAUDE_TEXT_CAPABILITIES = ['translation', 'subtitlePolish', 'summary'] as const;

export const claudeCodeCliProviderDefinition: ProviderDefinition = {
  id: 'claude_code_cli',
  displayName: 'Claude Code (local)',
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
  modelDescriptors: CLAUDE_TEXT_CAPABILITIES.flatMap((capability) =>
    CLAUDE_MODEL_ALIASES.map((model): ProviderModelDescriptor => ({ ...model, capability }))
  )
};

/** `claude --effort` accepts low|medium|high|xhigh|max. `none` and `minimal` map to `low`. */
export function claudeEffort(effort: ReasoningEffort): 'low' | 'medium' | 'high' | 'xhigh' | 'max' {
  switch (effort) {
    case 'none':
    case 'minimal':
      return 'low';
    default:
      return effort;
  }
}

type ClaudeResultPayload = {
  subtype?: unknown;
  is_error?: unknown;
  result?: unknown;
  structured_output?: unknown;
};

/**
 * Runs Claude Code (`claude`) with the user's subscription login. Tajtlisha
 * never reads ~/.claude. Text requests are one-shot `claude -p` calls with no
 * tools and no session saved. `--bare` is not used, because it skips the login.
 */
export class ClaudeCodeCliProvider extends LocalCliProvider {
  protected override readonly cliName = 'claude' as const;

  constructor(options: LocalCliProviderOptions = {}) {
    super(claudeCodeCliProviderDefinition, options);
  }

  /** `claude auth status` JSON. The e-mail and organization from it are never copied into the message. */
  override async testConnection(): Promise<TestConnectionResult> {
    const checkedAt = new Date().toISOString();
    const executable = await resolveCliExecutable(this.cliName, this.resolveDeps);
    if (!executable) {
      return { ok: false, providerId: this.id, checkedAt, message: `${this.displayName} was not found on this computer.` };
    }

    try {
      const result = await withCliWorkDir((cwd) =>
        this.exec({ executable, args: ['auth', 'status'], cwd, timeoutMs: CLI_TIMEOUT_MS.status })
      );
      const status = parseAuthStatus(result.stdout);

      if (status.loggedIn) {
        return {
          ok: true,
          providerId: this.id,
          checkedAt,
          message: status.authMethod
            ? `${this.displayName} is signed in (${status.authMethod}).`
            : `${this.displayName} is signed in.`
        };
      }

      return {
        ok: false,
        providerId: this.id,
        checkedAt,
        message: `${this.displayName} is not signed in. Run "claude" in a terminal, sign in, then test again.`
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
      systemPrompt: buildTranslationInstructions(request),
      items: request.items,
      modelId: request.modelId,
      signal: request.signal
    });
  }

  override polishTexts(request: ProviderPolishRequest): Promise<ProviderTextItem[]> {
    return this.captionRequest({
      systemPrompt: buildPolishInstructions(request),
      items: request.items,
      modelId: request.modelId,
      signal: request.signal
    });
  }

  override async summarizeText(request: ProviderSummarizeRequest): Promise<string> {
    const executable = await this.requireExecutable();

    return withCliWorkDir(async (cwd) => {
      const result = await this.exec({
        executable,
        args: claudeArgs({
          systemPrompt: request.systemPrompt,
          modelId: request.modelId,
          reasoningEffort: request.reasoningEffort
        }),
        stdin: request.transcript,
        cwd,
        timeoutMs: CLI_TIMEOUT_MS.request,
        signal: request.signal
      });

      const payload = this.readResult(result);
      const text = typeof payload.result === 'string' ? payload.result.trim() : '';
      if (!text) {
        throw new AppError('PROVIDER_REQUEST_FAILED', `${this.displayName} returned an empty summary.`);
      }

      return text;
    });
  }

  /**
   * Caption JSON. `--json-schema` makes Claude Code return the schema-checked
   * object in `structured_output`; `result` is the fallback.
   */
  private async captionRequest(input: {
    systemPrompt: string;
    items: ProviderTextItem[];
    modelId?: string;
    signal?: AbortSignal;
  }): Promise<ProviderTextItem[]> {
    const executable = await this.requireExecutable();

    return withCliWorkDir(async (cwd) => {
      const result = await this.exec({
        executable,
        args: claudeArgs({ systemPrompt: input.systemPrompt, modelId: input.modelId, schema: true }),
        stdin: buildCaptionItemsInput(input.items),
        cwd,
        timeoutMs: CLI_TIMEOUT_MS.request,
        signal: input.signal
      });

      const payload = this.readResult(result);
      if (payload.structured_output) {
        return parseCaptionItems(JSON.stringify(payload.structured_output), this.displayName);
      }
      if (typeof payload.result === 'string') {
        return parseCaptionItems(payload.result, this.displayName);
      }

      throw new AppError('PROVIDER_REQUEST_FAILED', `${this.displayName} returned an invalid caption response.`);
    });
  }

  /**
   * The single JSON object `claude -p --output-format json` prints. Throws the
   * mapped failure unless the run succeeded: no JSON, `is_error`, a non-success
   * subtype, or a non-zero exit code.
   */
  private readResult(result: CliRunResult): ClaudeResultPayload {
    let payload: unknown;
    try {
      payload = JSON.parse(result.stdout);
    } catch {
      payload = undefined;
    }

    const resultPayload = payload !== null && typeof payload === 'object' ? (payload as ClaudeResultPayload) : undefined;

    if (!resultPayload || resultPayload.is_error === true || resultPayload.subtype !== 'success' || result.exitCode !== 0) {
      const failureText = typeof resultPayload?.result === 'string' ? resultPayload.result : '';
      throw cliFailureError(this.displayName, failureText || result.stderr || result.stdout);
    }

    return resultPayload;
  }
}

/**
 * `claude -p` argv. The prompt is on stdin. `--tools ""` disables every tool,
 * `--safe-mode` keeps the run isolated, and `--no-session-persistence` saves
 * nothing to disk.
 */
function claudeArgs(input: {
  systemPrompt: string;
  modelId?: string;
  reasoningEffort?: ReasoningEffort;
  schema?: boolean;
}): string[] {
  return [
    '-p',
    '--output-format',
    'json',
    ...(input.schema ? ['--json-schema', JSON.stringify(CAPTION_ITEMS_SCHEMA)] : []),
    '--system-prompt',
    input.systemPrompt,
    '--tools',
    '',
    '--no-session-persistence',
    '--safe-mode',
    ...(input.modelId ? ['--model', input.modelId] : []),
    ...(input.reasoningEffort ? ['--effort', claudeEffort(input.reasoningEffort)] : [])
  ];
}

/**
 * Reads `claude auth status` JSON. Only the boolean and a short auth method
 * name are kept. The auth method must look like an identifier (`claude.ai`),
 * so an e-mail address can never pass through.
 */
function parseAuthStatus(stdout: string): { loggedIn: boolean; authMethod?: string } {
  try {
    const payload = JSON.parse(stdout) as { loggedIn?: unknown; authMethod?: unknown } | null;
    const authMethod = typeof payload?.authMethod === 'string' && /^[A-Za-z0-9._-]{1,32}$/.test(payload.authMethod) ? payload.authMethod : undefined;
    return { loggedIn: payload?.loggedIn === true, authMethod };
  } catch {
    return { loggedIn: false };
  }
}
