import '@testing-library/jest-dom/vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AiProviderCapabilities, ProviderModelDescriptor, ProviderStatus } from '../../../src/shared/types/ai';
import type { AppSettings } from '../../../src/shared/types/settings';
import { ConnectorsSection } from '../../../src/renderer/src/components/settings/ConnectorsSection';
import { SummarySettings } from '../../../src/renderer/src/components/settings/SummarySettings';
import { mockProviderStatuses, mockSettings } from './mockSettings';
import { renderWithI18n } from '../renderWithI18n';

/** Local CLI provider that can summarize, found on this computer. */
const codexFound: ProviderStatus = {
  id: 'codex_cli',
  displayName: 'Codex CLI (local)',
  authModes: ['local_cli'],
  experimental: true,
  enabled: true,
  connected: true,
  cliVersion: 'codex-cli 0.165.0',
  cliPath: '/home/user/.local/bin/codex',
  capabilities: {
    detectLanguage: false,
    transcription: false,
    segmentTimestamps: false,
    wordTimestamps: false,
    translation: true,
    subtitlePolish: true,
    textToSpeech: false,
    summary: true
  }
};

afterEach(() => {
  vi.restoreAllMocks();
});

const summaryModels: ProviderModelDescriptor[] = [
  { id: 'gpt-5-mini', label: 'GPT-5 mini', capability: 'summary' }
];

const textModels: ProviderModelDescriptor[] = [{ id: 'gpt-4.1-mini', label: 'GPT-4.1 mini', capability: 'translation' }];

function listModelsSpy(summary: ProviderModelDescriptor[] | Error = summaryModels) {
  return vi.fn(async (_providerId: string, capability: keyof AiProviderCapabilities) => {
    if (capability === 'summary') {
      if (summary instanceof Error) throw summary;
      return summary;
    }
    return capability === 'transcription' ? [] : textModels;
  });
}

function settingsWith(overrides: Partial<AppSettings['summary']>): AppSettings {
  return { ...mockSettings, summary: { ...mockSettings.summary, ...overrides } };
}

function capableProvider(overrides: Partial<ProviderStatus['capabilities']> = {}): ProviderStatus[] {
  return [{ ...mockProviderStatuses[0], capabilities: { ...mockProviderStatuses[0].capabilities, ...overrides } }];
}

function renderSummaryTab(options: {
  settings: AppSettings;
  providers?: ProviderStatus[];
  onSettingsChange?: (patch: Partial<AppSettings>) => void;
  onListModels?: ReturnType<typeof listModelsSpy>;
}) {
  const onSettingsChange = options.onSettingsChange ?? vi.fn();
  const onListModels = options.onListModels ?? listModelsSpy();
  renderWithI18n(
    <SummarySettings
      settings={options.settings}
      providers={options.providers ?? mockProviderStatuses}
      onSettingsChange={onSettingsChange}
      onListModels={onListModels}
    />
  );
  return { onSettingsChange, onListModels };
}

describe('Summary tab model row', () => {
  it('is not part of the Connectors section any more', () => {
    renderWithI18n(<ConnectorsSection settings={settingsWith({ enabled: true })} providers={mockProviderStatuses} />);

    expect(screen.queryByLabelText('Summary model')).not.toBeInTheDocument();
  });

  it('edits the active provider model even while the editor button is hidden', () => {
    renderSummaryTab({ settings: settingsWith({ enabled: false }) });

    const input = screen.getByLabelText('Summary model');
    expect(input).toBeEnabled();
    expect(input).toHaveAttribute('placeholder', 'Same as text model');
    expect(screen.getByText(/Uses the summary provider: OpenAI\./)).toBeInTheDocument();
  });

  it('is disabled with a hint when the active provider is not connected', () => {
    renderSummaryTab({
      settings: settingsWith({ enabled: true }),
      providers: [{ ...mockProviderStatuses[0], connected: false, maskedCredential: undefined }]
    });

    expect(screen.getByLabelText('Summary model')).toBeDisabled();
    expect(screen.getByText('Connect the summary provider in the Connectors section to choose a model.')).toBeInTheDocument();
  });

  it('is disabled with a hint when the provider cannot summarize', () => {
    renderSummaryTab({ settings: settingsWith({ enabled: true }), providers: capableProvider({ summary: false }) });

    expect(screen.getByLabelText('Summary model')).toBeDisabled();
    expect(screen.getByText('OpenAI cannot summarize text.')).toBeInTheDocument();
  });

  it('keeps typed text local and commits the model on blur', () => {
    const { onSettingsChange } = renderSummaryTab({ settings: settingsWith({ enabled: true }) });
    const input = screen.getByLabelText('Summary model');

    fireEvent.change(input, { target: { value: 'gpt-5' } });
    fireEvent.change(input, { target: { value: 'gpt-5-mini' } });
    expect(onSettingsChange).not.toHaveBeenCalled();

    fireEvent.blur(input);
    expect(onSettingsChange).toHaveBeenCalledTimes(1);
    expect(onSettingsChange).toHaveBeenCalledWith({
      summary: expect.objectContaining({
        enabled: true,
        modelByProvider: { openai: 'gpt-5-mini' }
      })
    });
  });

  it('saves a typed model when Settings closes with Esc (no blur)', () => {
    const onSettingsChange = vi.fn();
    const view = renderWithI18n(
      <SummarySettings
        settings={settingsWith({ enabled: true })}
        providers={mockProviderStatuses}
        onSettingsChange={onSettingsChange}
        onListModels={listModelsSpy()}
      />
    );

    fireEvent.change(screen.getByLabelText('Summary model'), { target: { value: 'gpt-5-mini' } });
    view.unmount();

    expect(onSettingsChange).toHaveBeenCalledTimes(1);
    expect(onSettingsChange).toHaveBeenCalledWith({
      summary: expect.objectContaining({ modelByProvider: { openai: 'gpt-5-mini' } })
    });
  });

  it('does not save the model twice when a blur already saved it', () => {
    const onSettingsChange = vi.fn();
    const view = renderWithI18n(
      <SummarySettings
        settings={settingsWith({ enabled: true })}
        providers={mockProviderStatuses}
        onSettingsChange={onSettingsChange}
        onListModels={listModelsSpy()}
      />
    );
    const input = screen.getByLabelText('Summary model');

    fireEvent.change(input, { target: { value: 'gpt-5-mini' } });
    fireEvent.blur(input);
    view.unmount();

    expect(onSettingsChange).toHaveBeenCalledTimes(1);
  });

  it('commits on Enter', () => {
    const { onSettingsChange } = renderSummaryTab({ settings: settingsWith({ enabled: true }) });
    const input = screen.getByLabelText('Summary model');

    fireEvent.change(input, { target: { value: 'gpt-5-mini' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onSettingsChange).toHaveBeenCalledWith({
      summary: expect.objectContaining({ modelByProvider: { openai: 'gpt-5-mini' } })
    });
  });

  it('stores a cleared model as an empty string, which means the text model', () => {
    const { onSettingsChange } = renderSummaryTab({
      settings: settingsWith({ enabled: true, modelByProvider: { openai: 'gpt-5-mini' } })
    });
    const input = screen.getByLabelText('Summary model');

    fireEvent.change(input, { target: { value: '  ' } });
    fireEvent.blur(input);

    expect(onSettingsChange).toHaveBeenCalledWith({
      summary: expect.objectContaining({ modelByProvider: { openai: '' } })
    });
  });

  it('does not write settings when the value did not change', () => {
    const { onSettingsChange } = renderSummaryTab({
      settings: settingsWith({ enabled: true, modelByProvider: { openai: 'gpt-5-mini' } })
    });

    fireEvent.blur(screen.getByLabelText('Summary model'));

    expect(onSettingsChange).not.toHaveBeenCalled();
  });

  it('offers the provider summary models as suggestions', async () => {
    const { onListModels } = renderSummaryTab({ settings: settingsWith({ enabled: true }) });

    await waitFor(() => {
      expect(onListModels).toHaveBeenCalledWith('openai', 'summary');
    });

    const input = screen.getByLabelText('Summary model');
    const listId = input.getAttribute('list');
    expect(listId).toBeTruthy();
    await waitFor(() => {
      const options = Array.from(document.querySelectorAll(`datalist#${listId} option`)).map((option) => option.getAttribute('value'));
      expect(options).toEqual(['gpt-5-mini']);
    });
  });

  it('stays usable when the summary model list fails', async () => {
    const { onSettingsChange } = renderSummaryTab({
      settings: settingsWith({ enabled: true }),
      onListModels: listModelsSpy(new Error('offline'))
    });
    const input = screen.getByLabelText('Summary model');

    await waitFor(() => {
      expect(document.querySelectorAll(`datalist#${input.getAttribute('list')} option`)).toHaveLength(0);
    });

    fireEvent.change(input, { target: { value: 'custom-model' } });
    fireEvent.blur(input);
    expect(onSettingsChange).toHaveBeenCalledWith({
      summary: expect.objectContaining({ modelByProvider: { openai: 'custom-model' } })
    });
  });
});

describe('Summary tab provider', () => {
  it('stores "Same as translation" as an empty provider id', () => {
    const { onSettingsChange } = renderSummaryTab({
      settings: settingsWith({ enabled: true, providerId: 'codex_cli' }),
      providers: [...mockProviderStatuses, codexFound]
    });

    fireEvent.change(screen.getByLabelText('Summary provider'), { target: { value: '' } });

    expect(onSettingsChange).toHaveBeenCalledWith({
      summary: expect.objectContaining({ providerId: '' })
    });
  });

  it('offers only providers that can summarize, and shows "Same as translation" as the blank choice', () => {
    renderSummaryTab({
      settings: settingsWith({ enabled: true }),
      providers: [...mockProviderStatuses, { ...codexFound, capabilities: { ...codexFound.capabilities, summary: false } }]
    });

    const select = screen.getByLabelText('Summary provider') as HTMLSelectElement;
    expect(Array.from(select.options).map((option) => option.text)).toEqual(['Same as translation (OpenAI)', 'OpenAI']);
    expect(select.value).toBe('');
  });

  it('follows the translation provider when the summary has no provider of its own', () => {
    const onListModels = listModelsSpy();
    renderSummaryTab({
      settings: { ...settingsWith({ enabled: true }), aiConnector: { ...mockSettings.aiConnector, textProviderId: 'codex_cli' } },
      providers: [...mockProviderStatuses, codexFound],
      onListModels
    });

    expect(screen.getByLabelText('Summary provider')).toHaveValue('');
    expect(screen.getByText(/Uses the summary provider: Codex CLI \(local\)\./)).toBeInTheDocument();
    expect(onListModels).toHaveBeenCalledWith('codex_cli', 'summary');
  });

  it('uses its own provider, and its model list, when one is chosen', () => {
    const onListModels = listModelsSpy();
    renderSummaryTab({
      settings: {
        ...settingsWith({ enabled: true, providerId: 'codex_cli' }),
        aiConnector: { ...mockSettings.aiConnector, textProviderId: 'openai' }
      },
      providers: [...mockProviderStatuses, codexFound],
      onListModels
    });

    expect(screen.getByLabelText('Summary provider')).toHaveValue('codex_cli');
    expect(screen.getByText(/Uses the summary provider: Codex CLI \(local\)\./)).toBeInTheDocument();
    expect(onListModels).toHaveBeenCalledWith('codex_cli', 'summary');
  });

  it('keeps the model saved for the resolved provider', () => {
    const { onSettingsChange } = renderSummaryTab({
      settings: {
        ...settingsWith({ enabled: true, modelByProvider: { codex_cli: 'gpt-5-codex' } }),
        aiConnector: { ...mockSettings.aiConnector, textProviderId: 'codex_cli' }
      },
      providers: [...mockProviderStatuses, codexFound]
    });

    expect(screen.getByLabelText('Summary model')).toHaveValue('gpt-5-codex');
    fireEvent.change(screen.getByLabelText('Summary model'), { target: { value: 'gpt-5' } });
    fireEvent.blur(screen.getByLabelText('Summary model'));

    expect(onSettingsChange).toHaveBeenCalledWith({
      summary: expect.objectContaining({ modelByProvider: { codex_cli: 'gpt-5' } })
    });
  });
});
