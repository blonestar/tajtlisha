import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CodexCliProvider, codexCliProviderDefinition, parseCodexModels } from '../../../src/main/ai/codex-cli-provider';
import {
  buildCaptionItemsInput,
  buildPolishInstructions,
  buildTranslationInstructions,
  CAPTION_ITEMS_SCHEMA
} from '../../../src/main/ai/text-prompts';
import type { ProviderPolishRequest, ProviderSummarizeRequest, ProviderTranslateRequest } from '../../../src/main/ai/provider';
import { argAfter, failed, fakeRunner, installedResolveDeps, missingResolveDeps, ok } from './local-cli-fakes';

const ITEMS = [{ id: 'c1', text: 'Hello there.' }];

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
  transcript: '[0:00] Hello there.'
};

/** The `codex exec` argv every text request shares, up to the optional flags. */
function execPrefix(cwd: string): string[] {
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
    cwd
  ];
}

/** A fake codex that answers caption requests by writing `reply` to the `-o` file. */
function codexReplying(reply: string) {
  return fakeRunner(async (input) => {
    await writeFile(argAfter(input.args, '-o'), reply);
    return ok();
  });
}

describe('CodexCliProvider definition', () => {
  it('declares a local CLI, text-only capabilities, and experimental status', () => {
    const provider = new CodexCliProvider({ runner: fakeRunner().runner, resolveDeps: missingResolveDeps() });

    expect(provider).toMatchObject({
      id: 'codex_cli',
      displayName: 'Codex CLI (local)',
      authModes: ['local_cli'],
      experimental: true
    });
    expect(provider.capabilities).toEqual({
      detectLanguage: false,
      transcription: false,
      segmentTimestamps: false,
      wordTimestamps: false,
      translation: true,
      subtitlePolish: true,
      textToSpeech: false,
      summary: true
    });
    expect(codexCliProviderDefinition.id).toBe('codex_cli');
  });

  it('refuses transcription without running the CLI', async () => {
    const { runner } = fakeRunner();
    const provider = new CodexCliProvider({ runner, resolveDeps: installedResolveDeps('codex') });

    await expect(provider.transcribe({ audioPath: '/tmp/a.mp3', audioFormat: 'mp3' })).rejects.toMatchObject({
      code: 'PROVIDER_UNSUPPORTED'
    });
    expect(runner).not.toHaveBeenCalled();
  });

  it('fails text requests with PROVIDER_NOT_CONNECTED when the CLI is not installed', async () => {
    const { runner } = fakeRunner();
    const provider = new CodexCliProvider({ runner, resolveDeps: missingResolveDeps() });

    await expect(provider.translateTexts(TRANSLATE_REQUEST)).rejects.toMatchObject({ code: 'PROVIDER_NOT_CONNECTED' });
    await expect(provider.polishTexts(POLISH_REQUEST)).rejects.toMatchObject({ code: 'PROVIDER_NOT_CONNECTED' });
    await expect(provider.summarizeText(SUMMARY_REQUEST)).rejects.toMatchObject({ code: 'PROVIDER_NOT_CONNECTED' });
    expect(runner).not.toHaveBeenCalled();
  });
});

describe('CodexCliProvider detection and sign-in', () => {
  it('detects the CLI and its version from --version', async () => {
    const { runner, calls } = fakeRunner(() => ok('codex-cli 0.165.0\n'));
    const provider = new CodexCliProvider({ runner, resolveDeps: installedResolveDeps('codex') });

    await expect(provider.detectLocalCli()).resolves.toEqual({ path: '/opt/bin/codex', version: 'codex-cli 0.165.0' });
    expect(calls[0]).toMatchObject({ executable: '/opt/bin/codex', args: ['--version'], timeoutMs: 5_000 });
  });

  it('returns null when the CLI is not installed, without running it', async () => {
    const { runner } = fakeRunner();
    const provider = new CodexCliProvider({ runner, resolveDeps: missingResolveDeps() });

    await expect(provider.detectLocalCli()).resolves.toBeNull();
    expect(runner).not.toHaveBeenCalled();
  });

  it('returns null when the version call fails', async () => {
    const provider = new CodexCliProvider({
      runner: fakeRunner(() => failed('broken')).runner,
      resolveDeps: installedResolveDeps('codex')
    });

    await expect(provider.detectLocalCli()).resolves.toBeNull();
  });

  it('reports a signed-in ChatGPT login from `codex login status`', async () => {
    const { runner, calls } = fakeRunner(() => ok('Logged in using ChatGPT\n'));
    const provider = new CodexCliProvider({ runner, resolveDeps: installedResolveDeps('codex') });

    await expect(provider.testConnection()).resolves.toMatchObject({
      ok: true,
      providerId: 'codex_cli',
      message: 'Codex CLI (local) is signed in (ChatGPT).'
    });
    expect(calls[0]).toMatchObject({ args: ['login', 'status'], timeoutMs: 5_000 });
  });

  it('reads the login status from stderr, where codex-cli 0.165.0 prints it', async () => {
    const provider = new CodexCliProvider({
      runner: fakeRunner(() => ok('', 'Logged in using ChatGPT\n')).runner,
      resolveDeps: installedResolveDeps('codex')
    });

    await expect(provider.testConnection()).resolves.toMatchObject({ ok: true, message: 'Codex CLI (local) is signed in (ChatGPT).' });
  });

  it('does not read "Not logged in" with exit code 0 as signed in', async () => {
    const provider = new CodexCliProvider({
      runner: fakeRunner(() => ok('', 'Not logged in\n')).runner,
      resolveDeps: installedResolveDeps('codex')
    });

    await expect(provider.testConnection()).resolves.toMatchObject({ ok: false });
  });

  it('reports a missing login with the command to run', async () => {
    const provider = new CodexCliProvider({
      runner: fakeRunner(() => failed('Not logged in')).runner,
      resolveDeps: installedResolveDeps('codex')
    });

    const result = await provider.testConnection();

    expect(result.ok).toBe(false);
    expect(result.message).toContain('codex login');
  });

  it('reports a missing CLI from testConnection', async () => {
    const provider = new CodexCliProvider({ runner: fakeRunner().runner, resolveDeps: missingResolveDeps() });

    await expect(provider.testConnection()).resolves.toMatchObject({
      ok: false,
      message: 'Codex CLI (local) was not found on this computer.'
    });
  });
});

describe('CodexCliProvider text requests', () => {
  it('passes the reasoning effort of a caption request to codex', async () => {
    const { runner, calls } = fakeRunner(async (input) => {
      await writeFile(argAfter(input.args, '-o'), JSON.stringify({ items: [{ id: 'c1', text: 'Zdravo.' }] }));
      return ok();
    });
    const provider = new CodexCliProvider({ runner, resolveDeps: installedResolveDeps('codex') });

    await provider.translateTexts({ ...TRANSLATE_REQUEST, reasoningEffort: 'low' });

    expect(argAfter(calls[0].args, '-c')).toBe('model_reasoning_effort="low"');
  });

  it('translates with the exact argv, the schema file, and instructions plus items on stdin', async () => {
    let schemaJson = '';
    const { runner, calls } = fakeRunner(async (input) => {
      schemaJson = await readFile(argAfter(input.args, '--output-schema'), 'utf8');
      await writeFile(argAfter(input.args, '-o'), JSON.stringify({ items: [{ id: 'c1', text: 'Zdravo.' }] }));
      return ok();
    });
    const provider = new CodexCliProvider({ runner, resolveDeps: installedResolveDeps('codex') });

    await expect(provider.translateTexts(TRANSLATE_REQUEST)).resolves.toEqual([{ id: 'c1', text: 'Zdravo.' }]);

    const call = calls[0];
    expect(call.executable).toBe('/opt/bin/codex');
    expect(call.args).toEqual([
      ...execPrefix(call.cwd),
      '--output-schema',
      join(call.cwd, 'schema.json'),
      '-o',
      join(call.cwd, 'out.txt'),
      '-'
    ]);
    expect(JSON.parse(schemaJson)).toEqual(CAPTION_ITEMS_SCHEMA);
    expect(call.stdin).toBe(`${buildTranslationInstructions(TRANSLATE_REQUEST)}\n\n${buildCaptionItemsInput(ITEMS)}`);
  });

  it('adds -m for a chosen model and removes the temp directory afterwards', async () => {
    const { runner, calls } = codexReplying(JSON.stringify({ items: ITEMS }));
    const provider = new CodexCliProvider({ runner, resolveDeps: installedResolveDeps('codex') });

    await provider.polishTexts({ ...POLISH_REQUEST, modelId: 'gpt-5.5' });

    expect(calls[0].args).toEqual([...execPrefix(calls[0].cwd), '--output-schema', join(calls[0].cwd, 'schema.json'), '-o', join(calls[0].cwd, 'out.txt'), '-m', 'gpt-5.5', '-']);
    expect(calls[0].args).not.toContain('-c');
    expect(existsSync(calls[0].cwd)).toBe(false);
  });

  it('sends polish instructions for the chosen mode', async () => {
    const { runner, calls } = codexReplying(JSON.stringify({ items: ITEMS }));
    const provider = new CodexCliProvider({ runner, resolveDeps: installedResolveDeps('codex') });

    await provider.polishTexts({ ...POLISH_REQUEST, mode: 'social_caption' });

    expect(calls[0].stdin).toBe(
      `${buildPolishInstructions({ ...POLISH_REQUEST, mode: 'social_caption' })}\n\n${buildCaptionItemsInput(ITEMS)}`
    );
  });

  it('summarizes with no output schema and the summary prompt on stdin, and returns trimmed text', async () => {
    const { runner, calls } = codexReplying('  Short summary.\n');
    const provider = new CodexCliProvider({ runner, resolveDeps: installedResolveDeps('codex') });

    await expect(provider.summarizeText({ ...SUMMARY_REQUEST, modelId: 'gpt-5.5', reasoningEffort: 'high' })).resolves.toBe(
      'Short summary.'
    );

    const call = calls[0];
    expect(call.args).toEqual([
      ...execPrefix(call.cwd),
      '-o',
      join(call.cwd, 'out.txt'),
      '-m',
      'gpt-5.5',
      '-c',
      'model_reasoning_effort="high"',
      '-'
    ]);
    expect(call.args).not.toContain('--output-schema');
    expect(call.stdin).toBe(`${SUMMARY_REQUEST.systemPrompt}\n\n${SUMMARY_REQUEST.transcript}`);
  });

  it('sends no reasoning or model flag when the summary has none', async () => {
    const { runner, calls } = codexReplying('Summary.');
    const provider = new CodexCliProvider({ runner, resolveDeps: installedResolveDeps('codex') });

    await provider.summarizeText(SUMMARY_REQUEST);

    expect(calls[0].args).not.toContain('-m');
    expect(calls[0].args).not.toContain('-c');
  });

  it('fails with PROVIDER_REQUEST_FAILED when the output file is empty', async () => {
    const provider = new CodexCliProvider({ runner: codexReplying('   ').runner, resolveDeps: installedResolveDeps('codex') });

    await expect(provider.summarizeText(SUMMARY_REQUEST)).rejects.toMatchObject({ code: 'PROVIDER_REQUEST_FAILED' });
  });

  it('fails with PROVIDER_REQUEST_FAILED when the caption reply is not valid JSON', async () => {
    const provider = new CodexCliProvider({ runner: codexReplying('not json').runner, resolveDeps: installedResolveDeps('codex') });

    await expect(provider.translateTexts(TRANSLATE_REQUEST)).rejects.toMatchObject({ code: 'PROVIDER_REQUEST_FAILED' });
  });

  it('fails with PROVIDER_REQUEST_FAILED when codex writes no output file', async () => {
    const provider = new CodexCliProvider({ runner: fakeRunner().runner, resolveDeps: installedResolveDeps('codex') });

    await expect(provider.summarizeText(SUMMARY_REQUEST)).rejects.toMatchObject({ code: 'PROVIDER_REQUEST_FAILED' });
  });

  it('maps a rate limit from stderr to PROVIDER_RATE_LIMITED', async () => {
    const provider = new CodexCliProvider({
      runner: fakeRunner(() => failed('ERROR: rate limit reached, try again later')).runner,
      resolveDeps: installedResolveDeps('codex')
    });

    await expect(provider.translateTexts(TRANSLATE_REQUEST)).rejects.toMatchObject({ code: 'PROVIDER_RATE_LIMITED' });
  });

  it('maps a login failure from stderr to PROVIDER_AUTH_FAILED', async () => {
    const provider = new CodexCliProvider({
      runner: fakeRunner(() => failed('Not logged in. Run codex login.')).runner,
      resolveDeps: installedResolveDeps('codex')
    });

    await expect(provider.polishTexts(POLISH_REQUEST)).rejects.toMatchObject({ code: 'PROVIDER_AUTH_FAILED' });
  });

  it('ignores the echoed prompt when it classifies a failure, and keeps caption text out of the message', async () => {
    const request = { ...TRANSLATE_REQUEST, items: [{ id: 'c1', text: 'Please log in to your quota dashboard SECRET_CAPTION' }] };
    const provider = new CodexCliProvider({
      runner: fakeRunner((input) => failed(`user\n${input.stdin}\nERROR: stream disconnected`)).runner,
      resolveDeps: installedResolveDeps('codex')
    });

    const error = await provider.translateTexts(request).catch((caught: unknown) => caught);

    expect(error).toMatchObject({ code: 'PROVIDER_REQUEST_FAILED' });
    expect(String((error as { detail?: string }).detail)).not.toContain('SECRET_CAPTION');
  });

  it('runs requests in a temp directory, never in the project', async () => {
    const { runner, calls } = codexReplying(JSON.stringify({ items: ITEMS }));
    const provider = new CodexCliProvider({ runner, resolveDeps: installedResolveDeps('codex') });

    await provider.translateTexts(TRANSLATE_REQUEST);

    expect(calls[0].cwd).toMatch(/tajtlisha-cli-/);
    expect(calls[0].timeoutMs).toBe(300_000);
  });
});

describe('parseCodexModels', () => {
  const MODELS_JSON = JSON.stringify({
    models: [
      { slug: 'gpt-b', display_name: 'GPT B', visibility: 'list', priority: 2 },
      { slug: 'hidden-model', display_name: 'Hidden', visibility: 'hide', priority: 0 },
      { slug: 'gpt-a', display_name: '', visibility: 'list', priority: 1 },
      { slug: 'gpt-c', visibility: 'list' },
      { display_name: 'No slug', visibility: 'list', priority: 3 }
    ]
  });

  it('keeps listed models, sorted by priority, with the slug as fallback label', () => {
    expect(parseCodexModels(MODELS_JSON, 'translation')).toEqual([
      { id: 'gpt-a', label: 'gpt-a', capability: 'translation' },
      { id: 'gpt-b', label: 'GPT B', capability: 'translation' },
      { id: 'gpt-c', label: 'gpt-c', capability: 'translation' }
    ]);
  });

  it('returns an empty list for invalid JSON or a missing models array', () => {
    expect(parseCodexModels('oops', 'summary')).toEqual([]);
    expect(parseCodexModels('{}', 'summary')).toEqual([]);
    expect(parseCodexModels('null', 'summary')).toEqual([]);
  });
});

describe('CodexCliProvider listModels', () => {
  it('lists text models from `codex debug models`', async () => {
    const { runner, calls } = fakeRunner(() =>
      ok(JSON.stringify({ models: [{ slug: 'gpt-5.5', display_name: 'GPT-5.5', visibility: 'list', priority: 0 }] }))
    );
    const provider = new CodexCliProvider({ runner, resolveDeps: installedResolveDeps('codex') });

    await expect(provider.listModels('subtitlePolish')).resolves.toEqual([
      { id: 'gpt-5.5', label: 'GPT-5.5', capability: 'subtitlePolish' }
    ]);
    expect(calls[0]).toMatchObject({ args: ['debug', 'models'], timeoutMs: 10_000 });
  });

  it('returns an empty list when the command fails or the CLI is missing', async () => {
    const failing = new CodexCliProvider({
      runner: fakeRunner(() => failed('boom')).runner,
      resolveDeps: installedResolveDeps('codex')
    });
    const missing = new CodexCliProvider({ runner: fakeRunner().runner, resolveDeps: missingResolveDeps() });

    await expect(failing.listModels('translation')).resolves.toEqual([]);
    await expect(missing.listModels('translation')).resolves.toEqual([]);
  });

  it('returns an empty list for transcription and never runs the CLI for it', async () => {
    const { runner } = fakeRunner();
    const provider = new CodexCliProvider({ runner, resolveDeps: installedResolveDeps('codex') });

    await expect(provider.listModels('transcription')).resolves.toEqual([]);
    expect(runner).not.toHaveBeenCalled();
  });
});
