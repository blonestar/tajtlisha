import { describe, expect, it } from 'vitest';
import { ClaudeCodeCliProvider, claudeCodeCliProviderDefinition, claudeEffort } from '../../../src/main/ai/claude-code-cli-provider';
import type { ProviderPolishRequest, ProviderSummarizeRequest, ProviderTranslateRequest } from '../../../src/main/ai/provider';
import {
  buildCaptionItemsInput,
  buildPolishInstructions,
  buildTranslationInstructions,
  CAPTION_ITEMS_SCHEMA
} from '../../../src/main/ai/text-prompts';
import { failed, fakeRunner, installedResolveDeps, missingResolveDeps, ok } from './local-cli-fakes';

const ITEMS = [{ id: '1', text: 'ali ja sam veliki obožavalac' }];

const TRANSLATE_REQUEST: ProviderTranslateRequest = {
  items: ITEMS,
  sourceLanguage: 'en',
  targetLanguage: 'sr-Latn',
  maxCharsPerLine: 42,
  maxLinesPerCaption: 2
};

const POLISH_REQUEST: ProviderPolishRequest = {
  items: ITEMS,
  language: 'sr-Latn',
  mode: 'conservative',
  maxCharsPerLine: 42,
  maxLinesPerCaption: 2
};

const SUMMARY_REQUEST: ProviderSummarizeRequest = {
  systemPrompt: 'Summarize the video.',
  transcript: '[0:00] ali ja sam veliki obožavalac'
};

/** Verified shape of `claude -p --output-format json --json-schema ...` (Claude Code 2.1.312), trimmed. */
function structuredReply(items: Array<{ id: string; text: string }>): string {
  return JSON.stringify({
    type: 'result',
    subtype: 'success',
    is_error: false,
    result: JSON.stringify({ items }),
    structured_output: { items }
  });
}

function textReply(result: string): string {
  return JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result });
}

/** The shared argv prefix; `schema` adds `--json-schema` in its place. */
function argvPrefix(systemPrompt: string, schema: boolean): string[] {
  return [
    '-p',
    '--output-format',
    'json',
    ...(schema ? ['--json-schema', JSON.stringify(CAPTION_ITEMS_SCHEMA)] : []),
    '--system-prompt',
    systemPrompt,
    '--tools',
    '',
    '--no-session-persistence',
    '--safe-mode'
  ];
}

describe('ClaudeCodeCliProvider definition', () => {
  it('declares a local CLI, text-only capabilities, and experimental status', () => {
    const provider = new ClaudeCodeCliProvider({ runner: fakeRunner().runner, resolveDeps: missingResolveDeps() });

    expect(provider).toMatchObject({
      id: 'claude_code_cli',
      displayName: 'Claude Code (local)',
      authModes: ['local_cli'],
      experimental: true
    });
    expect(provider.capabilities).toMatchObject({
      translation: true,
      subtitlePolish: true,
      summary: true,
      transcription: false,
      detectLanguage: false,
      textToSpeech: false
    });
    expect(claudeCodeCliProviderDefinition.id).toBe('claude_code_cli');
  });

  it('lists the Claude CLI aliases for every text capability and none for transcription', async () => {
    const provider = new ClaudeCodeCliProvider({ runner: fakeRunner().runner, resolveDeps: missingResolveDeps() });

    for (const capability of ['translation', 'subtitlePolish', 'summary'] as const) {
      await expect(provider.listModels(capability)).resolves.toEqual([
        { id: 'fable', label: 'Claude Fable', capability, available: true },
        { id: 'opus', label: 'Claude Opus', capability, available: true },
        { id: 'sonnet', label: 'Claude Sonnet', capability, available: true },
        { id: 'haiku', label: 'Claude Haiku', capability, available: true }
      ]);
    }
    await expect(provider.listModels('transcription')).resolves.toEqual([]);
  });

  it('refuses transcription without running the CLI', async () => {
    const { runner } = fakeRunner();
    const provider = new ClaudeCodeCliProvider({ runner, resolveDeps: installedResolveDeps('claude') });

    await expect(provider.transcribe({ audioPath: '/tmp/a.mp3', audioFormat: 'mp3' })).rejects.toMatchObject({
      code: 'PROVIDER_UNSUPPORTED'
    });
    expect(runner).not.toHaveBeenCalled();
  });

  it('fails text requests with PROVIDER_NOT_CONNECTED when the CLI is not installed', async () => {
    const { runner } = fakeRunner();
    const provider = new ClaudeCodeCliProvider({ runner, resolveDeps: missingResolveDeps() });

    await expect(provider.translateTexts(TRANSLATE_REQUEST)).rejects.toMatchObject({ code: 'PROVIDER_NOT_CONNECTED' });
    await expect(provider.summarizeText(SUMMARY_REQUEST)).rejects.toMatchObject({ code: 'PROVIDER_NOT_CONNECTED' });
    expect(runner).not.toHaveBeenCalled();
  });
});

describe('ClaudeCodeCliProvider detection and sign-in', () => {
  it('detects the CLI and its version from --version', async () => {
    const { runner, calls } = fakeRunner(() => ok('2.1.312 (Claude Code)\n'));
    const provider = new ClaudeCodeCliProvider({ runner, resolveDeps: installedResolveDeps('claude') });

    await expect(provider.detectLocalCli()).resolves.toEqual({ path: '/opt/bin/claude', version: '2.1.312 (Claude Code)' });
    expect(calls[0]).toMatchObject({ executable: '/opt/bin/claude', args: ['--version'], timeoutMs: 5_000 });
  });

  it('returns null when the CLI is missing or its version call fails', async () => {
    const missing = new ClaudeCodeCliProvider({ runner: fakeRunner().runner, resolveDeps: missingResolveDeps() });
    const broken = new ClaudeCodeCliProvider({
      runner: fakeRunner(() => failed('crash')).runner,
      resolveDeps: installedResolveDeps('claude')
    });

    await expect(missing.detectLocalCli()).resolves.toBeNull();
    await expect(broken.detectLocalCli()).resolves.toBeNull();
  });

  it('reports a signed-in login from `claude auth status` without copying the e-mail or organization', async () => {
    const { runner, calls } = fakeRunner(() =>
      ok(
        JSON.stringify({
          loggedIn: true,
          authMethod: 'claude.ai',
          email: 'bojan@example.com',
          orgName: 'Secret Workspace'
        })
      )
    );
    const provider = new ClaudeCodeCliProvider({ runner, resolveDeps: installedResolveDeps('claude') });

    const result = await provider.testConnection();

    expect(result).toMatchObject({ ok: true, providerId: 'claude_code_cli', message: 'Claude Code (local) is signed in (claude.ai).' });
    expect(JSON.stringify(result)).not.toContain('bojan@example.com');
    expect(JSON.stringify(result)).not.toContain('Secret Workspace');
    expect(calls[0]).toMatchObject({ args: ['auth', 'status'], timeoutMs: 5_000 });
  });

  it('does not put an e-mail-like auth method into the message', async () => {
    const provider = new ClaudeCodeCliProvider({
      runner: fakeRunner(() => ok(JSON.stringify({ loggedIn: true, authMethod: 'bojan@example.com' }))).runner,
      resolveDeps: installedResolveDeps('claude')
    });

    const result = await provider.testConnection();

    expect(result.ok).toBe(true);
    expect(result.message).toBe('Claude Code (local) is signed in.');
  });

  it('reports a missing login with the sign-in instruction', async () => {
    const provider = new ClaudeCodeCliProvider({
      runner: fakeRunner(() => ok(JSON.stringify({ loggedIn: false, email: 'bojan@example.com' }))).runner,
      resolveDeps: installedResolveDeps('claude')
    });

    const result = await provider.testConnection();

    expect(result.ok).toBe(false);
    expect(result.message).toContain('"claude"');
    expect(result.message).not.toContain('bojan@example.com');
  });

  it('treats unreadable status output as not signed in', async () => {
    const provider = new ClaudeCodeCliProvider({
      runner: fakeRunner(() => ok('not json')).runner,
      resolveDeps: installedResolveDeps('claude')
    });

    await expect(provider.testConnection()).resolves.toMatchObject({ ok: false });
  });

  it('reports a missing CLI from testConnection', async () => {
    const provider = new ClaudeCodeCliProvider({ runner: fakeRunner().runner, resolveDeps: missingResolveDeps() });

    await expect(provider.testConnection()).resolves.toMatchObject({
      ok: false,
      message: 'Claude Code (local) was not found on this computer.'
    });
  });
});

describe('ClaudeCodeCliProvider text requests', () => {
  it('translates with the exact argv, without --bare, and sends the caption items on stdin', async () => {
    const { runner, calls } = fakeRunner(() => ok(structuredReply([{ id: '1', text: 'ali ja sam veliki obožavalac' }])));
    const provider = new ClaudeCodeCliProvider({ runner, resolveDeps: installedResolveDeps('claude') });

    await expect(provider.translateTexts(TRANSLATE_REQUEST)).resolves.toEqual(ITEMS);

    const call = calls[0];
    expect(call.executable).toBe('/opt/bin/claude');
    expect(call.args).toEqual(argvPrefix(buildTranslationInstructions(TRANSLATE_REQUEST), true));
    expect(call.args).not.toContain('--bare');
    expect(call.stdin).toBe(buildCaptionItemsInput(ITEMS));
    expect(call.timeoutMs).toBe(300_000);
    expect(call.cwd).toMatch(/tajtlisha-cli-/);
  });

  it('passes --model and --effort after the common flags when they are set', async () => {
    const { runner, calls } = fakeRunner(() => ok(structuredReply(ITEMS)));
    const provider = new ClaudeCodeCliProvider({ runner, resolveDeps: installedResolveDeps('claude') });

    await provider.polishTexts({ ...POLISH_REQUEST, modelId: 'sonnet' });

    expect(calls[0].args).toEqual([
      ...argvPrefix(buildPolishInstructions(POLISH_REQUEST), true),
      '--model',
      'sonnet'
    ]);
    expect(calls[0].stdin).toBe(buildCaptionItemsInput(ITEMS));
  });

  it('prefers structured_output and falls back to the result text', async () => {
    const structuredOnly = fakeRunner(() =>
      ok(JSON.stringify({ subtype: 'success', is_error: false, result: '', structured_output: { items: [{ id: '1', text: 'A' }] } }))
    );
    const resultOnly = fakeRunner(() => ok(textReply(JSON.stringify({ items: [{ id: '1', text: 'B' }] }))));

    await expect(
      new ClaudeCodeCliProvider({ runner: structuredOnly.runner, resolveDeps: installedResolveDeps('claude') }).translateTexts(
        TRANSLATE_REQUEST
      )
    ).resolves.toEqual([{ id: '1', text: 'A' }]);
    await expect(
      new ClaudeCodeCliProvider({ runner: resultOnly.runner, resolveDeps: installedResolveDeps('claude') }).translateTexts(
        TRANSLATE_REQUEST
      )
    ).resolves.toEqual([{ id: '1', text: 'B' }]);
  });

  it('maps is_error to a failure without parsing captions', async () => {
    const provider = new ClaudeCodeCliProvider({
      runner: fakeRunner(() =>
        ok(JSON.stringify({ subtype: 'success', is_error: true, result: 'Rate limit reached. Try again later.' }))
      ).runner,
      resolveDeps: installedResolveDeps('claude')
    });

    await expect(provider.translateTexts(TRANSLATE_REQUEST)).rejects.toMatchObject({ code: 'PROVIDER_RATE_LIMITED' });
  });

  it('maps a non-success subtype to PROVIDER_REQUEST_FAILED', async () => {
    const provider = new ClaudeCodeCliProvider({
      runner: fakeRunner(() => ok(JSON.stringify({ subtype: 'error_max_turns', is_error: false, result: '' }))).runner,
      resolveDeps: installedResolveDeps('claude')
    });

    await expect(provider.polishTexts(POLISH_REQUEST)).rejects.toMatchObject({ code: 'PROVIDER_REQUEST_FAILED' });
  });

  it('maps a non-JSON failure that mentions the login to PROVIDER_AUTH_FAILED', async () => {
    const provider = new ClaudeCodeCliProvider({
      runner: fakeRunner(() => ({ exitCode: 1, stdout: 'Not logged in · Run /login', stderr: '' })).runner,
      resolveDeps: installedResolveDeps('claude')
    });

    await expect(provider.translateTexts(TRANSLATE_REQUEST)).rejects.toMatchObject({ code: 'PROVIDER_AUTH_FAILED' });
  });

  it('fails with PROVIDER_REQUEST_FAILED when a successful reply has neither structured output nor text', async () => {
    const provider = new ClaudeCodeCliProvider({
      runner: fakeRunner(() => ok(JSON.stringify({ subtype: 'success', is_error: false }))).runner,
      resolveDeps: installedResolveDeps('claude')
    });

    await expect(provider.translateTexts(TRANSLATE_REQUEST)).rejects.toMatchObject({ code: 'PROVIDER_REQUEST_FAILED' });
  });

  it('fails with PROVIDER_REQUEST_FAILED when the output is not JSON at all', async () => {
    const provider = new ClaudeCodeCliProvider({
      runner: fakeRunner(() => ok('plain text')).runner,
      resolveDeps: installedResolveDeps('claude')
    });

    await expect(provider.translateTexts(TRANSLATE_REQUEST)).rejects.toMatchObject({ code: 'PROVIDER_REQUEST_FAILED' });
  });

  it('summarizes without --json-schema, with the summary prompt, and returns the trimmed result', async () => {
    const { runner, calls } = fakeRunner(() => ok(textReply('  Kratak sažetak.\n')));
    const provider = new ClaudeCodeCliProvider({ runner, resolveDeps: installedResolveDeps('claude') });

    await expect(provider.summarizeText({ ...SUMMARY_REQUEST, modelId: 'opus', reasoningEffort: 'xhigh' })).resolves.toBe(
      'Kratak sažetak.'
    );

    expect(calls[0].args).toEqual([...argvPrefix(SUMMARY_REQUEST.systemPrompt, false), '--model', 'opus', '--effort', 'xhigh']);
    expect(calls[0].args).not.toContain('--json-schema');
    expect(calls[0].stdin).toBe(SUMMARY_REQUEST.transcript);
  });

  it('fails with PROVIDER_REQUEST_FAILED when the summary is empty', async () => {
    const provider = new ClaudeCodeCliProvider({
      runner: fakeRunner(() => ok(textReply('   '))).runner,
      resolveDeps: installedResolveDeps('claude')
    });

    await expect(provider.summarizeText(SUMMARY_REQUEST)).rejects.toMatchObject({ code: 'PROVIDER_REQUEST_FAILED' });
  });
});

describe('claudeEffort', () => {
  it('maps none and minimal to low and keeps the other values', () => {
    expect(claudeEffort('none')).toBe('low');
    expect(claudeEffort('minimal')).toBe('low');
    expect(claudeEffort('low')).toBe('low');
    expect(claudeEffort('medium')).toBe('medium');
    expect(claudeEffort('high')).toBe('high');
    expect(claudeEffort('xhigh')).toBe('xhigh');
    expect(claudeEffort('max')).toBe('max');
  });

  it('sends the mapped effort to the CLI', async () => {
    const { runner, calls } = fakeRunner(() => ok(textReply('Done.')));
    const provider = new ClaudeCodeCliProvider({ runner, resolveDeps: installedResolveDeps('claude') });

    await provider.summarizeText({ ...SUMMARY_REQUEST, reasoningEffort: 'minimal' });

    expect(calls[0].args.slice(-2)).toEqual(['--effort', 'low']);
  });
});
