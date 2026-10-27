/* @vitest-environment node */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { SecretFieldError, SettingsStore } from '../../../src/main/settings';
import { DEFAULT_SUMMARY_PROMPT, MAX_SUMMARY_PROMPT_CHARS } from '../../../src/shared/summary';

describe('SettingsStore', () => {
  it('merges partial settings onto defaults and persists them', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tajtlisha-settings-'));
    const filePath = join(dir, 'settings.json');

    try {
      const store = new SettingsStore({ filePath });
      const updated = await store.update({
        uiLanguage: 'sr-Latn',
        exportDefaults: {
          exportOriginalSrt: false,
          exportTranslatedSrt: true,
          defaultBurnedInTrack: 'translation',
          overwritePolicy: 'create_copy',
          fileNamePattern: '{name}.{language}.{track}'
        }
      });

      expect(updated.uiLanguage).toBe('sr-Latn');
      expect(updated.exportDefaults.exportOriginalSrt).toBe(false);
      expect(updated.neverModifyOriginalVideo).toBe(true);

      const persisted = JSON.parse(await readFile(filePath, 'utf8'));
      expect(persisted.uiLanguage).toBe('sr-Latn');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('rejects secret-like fields anywhere in the patch', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tajtlisha-settings-'));
    const store = new SettingsStore({ filePath: join(dir, 'settings.json') });

    try {
      await expect(
        store.update({
          aiConnector: {
            apiKey: 'sk-test'
          } as never
        })
      ).rejects.toBeInstanceOf(SecretFieldError);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('serializes concurrent updates and persists the merged result atomically', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tajtlisha-settings-'));
    const filePath = join(dir, 'settings.json');

    try {
      const store = new SettingsStore({ filePath });
      await Promise.all([
        store.update({ uiLanguage: 'sr-Cyrl' }),
        store.update({
          exportDefaults: {
            exportOriginalSrt: true,
            exportTranslatedSrt: true,
            defaultBurnedInTrack: 'original',
            overwritePolicy: 'create_copy',
            fileNamePattern: '{name}.{language}.{track}'
          }
        })
      ]);

      const persisted = JSON.parse(await readFile(filePath, 'utf8'));
      expect(persisted.uiLanguage).toBe('sr-Cyrl');
      expect(persisted.exportDefaults.exportTranslatedSrt).toBe(true);
      expect(persisted.neverModifyOriginalVideo).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('treats an empty string as clearing an optional setting', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tajtlisha-settings-'));
    try {
      const store = new SettingsStore({ filePath: join(dir, 'settings.json') });
      await store.update({ defaultOutputFolder: '/videos/out' });
      const cleared = await store.update({ defaultOutputFolder: '' });
      expect(cleared.defaultOutputFolder).toBeUndefined();
      expect('defaultOutputFolder' in (await store.get())).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('defaults the UI zoom to 100% and snaps patched values to a level', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tajtlisha-settings-'));
    try {
      const store = new SettingsStore({ filePath: join(dir, 'settings.json') });
      expect((await store.get()).uiZoomPercent).toBe(100);

      expect((await store.update({ uiZoomPercent: 103 })).uiZoomPercent).toBe(105);
      expect((await store.update({ uiZoomPercent: 999 })).uiZoomPercent).toBe(150);
      expect((await store.update({ uiZoomPercent: 'abc' as never })).uiZoomPercent).toBe(100);

      const persisted = JSON.parse(await readFile(join(dir, 'settings.json'), 'utf8'));
      expect(persisted.uiZoomPercent).toBe(100);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('normalizes a hand-edited UI zoom when the file is read', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tajtlisha-settings-'));
    try {
      const filePath = join(dir, 'settings.json');
      const store = new SettingsStore({ filePath });

      await writeFile(filePath, JSON.stringify({ uiZoomPercent: 999 }), 'utf8');
      expect((await store.get()).uiZoomPercent).toBe(150);

      await writeFile(filePath, JSON.stringify({ uiZoomPercent: 'abc' }), 'utf8');
      expect((await store.get()).uiZoomPercent).toBe(100);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  describe('summary settings', () => {
    async function withSettingsFile<T>(fileContent: unknown, run: (store: SettingsStore) => Promise<T>): Promise<T> {
      const dir = await mkdtemp(join(tmpdir(), 'tajtlisha-settings-'));
      const filePath = join(dir, 'settings.json');
      try {
        if (fileContent !== undefined) {
          await writeFile(filePath, JSON.stringify(fileContent), 'utf8');
        }
        return await run(new SettingsStore({ filePath }));
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    }

    it('gives a file without a summary section the default summary settings', async () => {
      await withSettingsFile({ uiLanguage: 'en' }, async (store) => {
        const settings = await store.get();

        expect(settings.summary).toEqual({
          enabled: false,
          systemPrompt: DEFAULT_SUMMARY_PROMPT,
          modelByProvider: {},
          reasoningEffort: 'default'
        });
      });
    });

    it('persists summary patches without treating them as secrets', async () => {
      await withSettingsFile(undefined, async (store) => {
        const updated = await store.update({
          summary: { enabled: true, reasoningEffort: 'high', modelByProvider: { openai: 'gpt-4.1' } } as never
        });

        expect(updated.summary).toEqual({
          enabled: true,
          systemPrompt: DEFAULT_SUMMARY_PROMPT,
          modelByProvider: { openai: 'gpt-4.1' },
          reasoningEffort: 'high'
        });
        expect((await store.get()).summary.reasoningEffort).toBe('high');
      });
    });

    it('treats enabled as on only when it is the boolean true', async () => {
      for (const enabled of ['true', 1, 'yes', null]) {
        await withSettingsFile({ summary: { enabled } }, async (store) => {
          expect((await store.get()).summary.enabled).toBe(false);
        });
      }
      await withSettingsFile({ summary: { enabled: true } }, async (store) => {
        expect((await store.get()).summary.enabled).toBe(true);
      });
    });

    it('replaces a blank or non-string system prompt with the default', async () => {
      for (const systemPrompt of ['', '   \n\t', 42, null, ['prompt']]) {
        await withSettingsFile({ summary: { systemPrompt } }, async (store) => {
          expect((await store.get()).summary.systemPrompt).toBe(DEFAULT_SUMMARY_PROMPT);
        });
      }
    });

    it('keeps a custom system prompt and slices one longer than the limit', async () => {
      await withSettingsFile({ summary: { systemPrompt: 'Make a tweet.' } }, async (store) => {
        expect((await store.get()).summary.systemPrompt).toBe('Make a tweet.');
      });

      await withSettingsFile({ summary: { systemPrompt: 'a'.repeat(MAX_SUMMARY_PROMPT_CHARS + 500) } }, async (store) => {
        expect((await store.get()).summary.systemPrompt).toHaveLength(MAX_SUMMARY_PROMPT_CHARS);
      });
    });

    it('falls back to default reasoning effort for an unknown value and keeps every known one', async () => {
      await withSettingsFile({ summary: { reasoningEffort: 'ultra' } }, async (store) => {
        expect((await store.get()).summary.reasoningEffort).toBe('default');
      });

      for (const reasoningEffort of ['default', 'none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']) {
        await withSettingsFile({ summary: { reasoningEffort } }, async (store) => {
          expect((await store.get()).summary.reasoningEffort).toBe(reasoningEffort);
        });
      }
    });

    it('keeps only string model ids per provider', async () => {
      await withSettingsFile(
        { summary: { modelByProvider: { openai: 'gpt-4.1', openrouter: 7, extra: { nested: true }, blank: '' } } },
        async (store) => {
          expect((await store.get()).summary.modelByProvider).toEqual({ openai: 'gpt-4.1', blank: '' });
        }
      );

      await withSettingsFile({ summary: { modelByProvider: 'gpt-4.1' } }, async (store) => {
        expect((await store.get()).summary.modelByProvider).toEqual({});
      });
    });

    it('uses the default summary settings when the summary value is not an object', async () => {
      await withSettingsFile({ summary: null }, async (store) => {
        expect((await store.get()).summary).toEqual({
          enabled: false,
          systemPrompt: DEFAULT_SUMMARY_PROMPT,
          modelByProvider: {},
          reasoningEffort: 'default'
        });
      });
    });
  });
});

describe('watermark settings', () => {
  async function withSettingsFile<T>(fileContent: unknown, run: (store: SettingsStore) => Promise<T>): Promise<T> {
    const dir = await mkdtemp(join(tmpdir(), 'tajtlisha-watermark-'));
    const filePath = join(dir, 'settings.json');
    try {
      if (fileContent !== undefined) {
        await writeFile(filePath, JSON.stringify(fileContent), 'utf8');
      }
      return await run(new SettingsStore({ filePath }));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  it('has the logo on by default: the T and tajtliša text in the top-left corner', async () => {
    await withSettingsFile(undefined, async (store) => {
      const settings = await store.get();

      expect(settings.watermark).toEqual({
        enabled: true,
        content: 'mark_text',
        markText: 'T',
        text: 'tajtliša',
        background: 'all',
        backgroundColor: '#1D2025',
        markColor: '#F2A93B',
        textColor: '#F2F2F2',
        cornerRadiusPercent: 19,
        position: 'top_left',
        sizePercent: 7,
        marginPercent: 3,
        opacity: 0.9
      });
    });
  });

  it('gives a file written before the logo existed the default watermark settings', async () => {
    await withSettingsFile({ uiLanguage: 'en', exportDefaults: { overwritePolicy: 'overwrite' } }, async (store) => {
      const settings = await store.get();

      expect(settings.watermark.enabled).toBe(true);
      expect(settings.watermark.content).toBe('mark_text');
      expect(settings.exportDefaults.overwritePolicy).toBe('overwrite');
    });
  });

  it('upgrades a settings file with the old variant field to the new fields, keeping the valid old values', async () => {
    await withSettingsFile(
      { watermark: { enabled: false, variant: 'icon', position: 'bottom_right', sizePercent: 9, marginPercent: 2, opacity: 0.6 } },
      async (store) => {
        const settings = await store.get();

        expect(settings.watermark).toEqual({
          enabled: false,
          content: 'mark',
          markText: 'T',
          text: 'tajtliša',
          background: 'all',
          backgroundColor: '#1D2025',
          markColor: '#F2A93B',
          textColor: '#F2F2F2',
          cornerRadiusPercent: 19,
          position: 'bottom_right',
          sizePercent: 9,
          marginPercent: 2,
          opacity: 0.6
        });
      }
    );
  });

  it('normalizes invalid hand-edited values to defaults and clamps numbers to their ranges', async () => {
    await withSettingsFile(
      {
        watermark: {
          enabled: 'no',
          content: 'both',
          markText: 'ABCDE',
          text: 'x'.repeat(40),
          background: 'boxed',
          backgroundColor: 'red',
          cornerRadiusPercent: 99,
          position: 'center',
          sizePercent: 99,
          marginPercent: -4,
          opacity: 0.05
        }
      },
      async (store) => {
        const settings = await store.get();

        expect(settings.watermark).toMatchObject({
          enabled: true,
          content: 'mark_text',
          markText: 'ABC',
          text: 'x'.repeat(30),
          background: 'all',
          backgroundColor: '#1D2025',
          cornerRadiusPercent: 50,
          position: 'top_left',
          sizePercent: 15,
          marginPercent: 0,
          opacity: 0.2
        });
      }
    );
  });

  it('falls back to the default for a non-finite number', async () => {
    await withSettingsFile({ watermark: { sizePercent: null, opacity: 'high' } }, async (store) => {
      const settings = await store.get();

      expect(settings.watermark.sizePercent).toBe(7);
      expect(settings.watermark.opacity).toBe(0.9);
    });
  });

  it('persists a watermark patch and normalizes it on the way in', async () => {
    await withSettingsFile(undefined, async (store) => {
      const patch = {
        enabled: false,
        content: 'text' as const,
        markText: '',
        text: '  Moj kanal\n',
        background: 'none' as const,
        backgroundColor: '#ABCDEF',
        markColor: '#F2A93B',
        textColor: '#F2F2F2',
        cornerRadiusPercent: 19,
        position: 'bottom_center' as const,
        sizePercent: 40,
        marginPercent: 3,
        opacity: 0.5
      };
      const updated = await store.update({ watermark: patch });

      expect(updated.watermark).toEqual({ ...patch, text: 'Moj kanal', sizePercent: 15 });
      expect((await store.get()).watermark).toEqual(updated.watermark);
    });
  });
});

