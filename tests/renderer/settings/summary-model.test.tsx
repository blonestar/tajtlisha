import '@testing-library/jest-dom/vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AiProviderCapabilities, ProviderModelDescriptor, ProviderStatus } from '../../../src/shared/types/ai';
import type { AppSettings } from '../../../src/shared/types/settings';
import { AiSection } from '../../../src/renderer/src/components/settings/AiSection';
import { SummarySettings } from '../../../src/renderer/src/components/settings/SummarySettings';
import { mockProviderStatuses, mockSettings } from './mockSettings';
import { renderWithI18n } from '../renderWithI18n';

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
  it('is not part of the AI section any more', () => {
    renderWithI18n(
      <AiSection settings={settingsWith({ enabled: true })} providers={mockProviderStatuses} onListModels={listModelsSpy()} />
    );

    expect(screen.queryByLabelText('Summary model')).not.toBeInTheDocument();
  });

  it('edits the active provider model even while the editor button is hidden', () => {
    renderSummaryTab({ settings: settingsWith({ enabled: false }) });

    const input = screen.getByLabelText('Summary model');
    expect(input).toBeEnabled();
    expect(input).toHaveAttribute('placeholder', 'Same as text model');
    expect(screen.getByText(/Uses the active AI provider: OpenAI\./)).toBeInTheDocument();
  });

  it('is disabled with a hint when the active provider is not connected', () => {
    renderSummaryTab({
      settings: settingsWith({ enabled: true }),
      providers: [{ ...mockProviderStatuses[0], connected: false, maskedCredential: undefined }]
    });

    expect(screen.getByLabelText('Summary model')).toBeDisabled();
    expect(screen.getByText('Connect the active AI provider in the AI section to choose a model.')).toBeInTheDocument();
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
