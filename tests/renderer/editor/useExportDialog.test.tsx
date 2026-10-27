import type { ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TajtlishaApi } from '../../../src/shared/types/ipc';
import { useExportDialog } from '../../../src/renderer/src/hooks/useExportDialog';
import type { JobRunner } from '../../../src/renderer/src/state/useJobRunner';
import { useProjectStore } from '../../../src/renderer/src/state/useProjectStore';
import { createI18n } from '../../../src/renderer/src/i18n';
import { caption, makeProject, SETTINGS } from './fixtures';
import { createFakeApi } from '../state/fakeApi';

function wrapper({ children }: { children: ReactNode }) {
  return <I18nextProvider i18n={createI18n('en')}>{children}</I18nextProvider>;
}

/** Runs the start function like the real runner, so the export call is observable. */
function directJobRunner(): JobRunner {
  return {
    job: null,
    run: async (_kind: string, start: (jobId: string) => Promise<unknown>) => ({
      status: 'done',
      value: await start('job-1')
    }),
    cancel: vi.fn(async () => undefined)
  } as unknown as JobRunner;
}

function setup(logoEnabled: boolean) {
  const fake = createFakeApi();
  fake.loadLast.mockResolvedValue({
    project: makeProject({ captions: [caption('a', 0, 1000, 'Hello', 'Zdravo')] }),
    sourceStatus: 'ok'
  });
  const exportProject = vi.fn((_request: Record<string, unknown>) => Promise.resolve({ files: [] }));
  vi.stubGlobal('tajtlisha', { ...fake.api, export: { exportProject } } as unknown as TajtlishaApi);

  const settings = { ...SETTINGS, watermark: { ...SETTINGS.watermark, enabled: logoEnabled } };
  const hook = renderHook(
    () => {
      const store = useProjectStore({ targetLanguage: 'en', api: fake.api });
      const exportDialog = useExportDialog({ store, settings, job: directJobRunner() });
      return { store, exportDialog };
    },
    { wrapper }
  );
  return { hook, exportProject, settings };
}

describe('useExportDialog logo', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts from settings.watermark.enabled and sends the settings logo with that choice', async () => {
    const { hook, exportProject, settings } = setup(true);
    await waitFor(() => expect(hook.result.current.store.ready).toBe(true));

    act(() => hook.result.current.exportDialog.openDialog());
    expect(hook.result.current.exportDialog.includeLogo).toBe(true);

    act(() => hook.result.current.exportDialog.setIncludeLogo(false));
    act(() => hook.result.current.exportDialog.start());

    await waitFor(() => expect(exportProject).toHaveBeenCalledTimes(1));
    expect(exportProject.mock.calls[0]?.[0]).toMatchObject({
      watermark: { ...settings.watermark, enabled: false }
    });
  });

  it('resets the choice to the setting each time the dialog opens', async () => {
    const { hook } = setup(false);
    await waitFor(() => expect(hook.result.current.store.ready).toBe(true));

    act(() => hook.result.current.exportDialog.openDialog());
    expect(hook.result.current.exportDialog.includeLogo).toBe(false);

    act(() => hook.result.current.exportDialog.setIncludeLogo(true));
    act(() => hook.result.current.exportDialog.openDialog());
    expect(hook.result.current.exportDialog.includeLogo).toBe(false);
  });
});
