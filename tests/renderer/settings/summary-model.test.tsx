import '@testing-library/jest-dom/vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AiProviderCapabilities, ProviderModelDescriptor, ProviderStatus } from '../../../src/shared/types/ai';
import type { AppSettings } from '../../../src/shared/types/settings';
import { AiSection } from '../../../src/renderer/src/components/settings/AiSection';
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

function renderAi(options: {
  settings: AppSettings;
  providers?: ProviderStatus[];
  onSettingsChange?: (patch: Partial<AppSettings>) => void;
  onListModels?: ReturnType<typeof listModelsSpy>;
}) {
  const onSettingsChange = options.onSettingsChange ?? vi.fn();
  const onListModels = options.onListModels ?? listModelsSpy();
  renderWithI18n(
    <AiSection
      settings={options.settings}
      providers={options.providers ?? mockProviderStatuses}
      onSettingsChange={onSettingsChange}
      onListModels={onListModels}
    />
  );
  return { onSettingsChange, onListModels };
}

describe('ProviderPanel summary model row', () => {
  it('is hidden while the video summary is off', () => {
    renderAi({ settings: settingsWith({ enabled: false }) });

    expect(screen.queryByLabelText('Summary model')).not.toBeInTheDocument();
  });

  it('is shown when the summary is on, the provider is connected and it can summarize', () => {
    renderAi({ settings: settingsWith({ enabled: true }) });

    const input = screen.getByLabelText('Summary model');
    expect(input).toHaveAttribute('placeholder', 'Same as text model');
  });

  it('is hidden when the provider is not connected', () => {
    renderAi({
      settings: settingsWith({ enabled: true }),
      providers: [{ ...mockProviderStatuses[0], connected: false, maskedCredential: undefined }]
    });

    expect(screen.queryByLabelText('Summary model')).not.toBeInTheDocument();
  });

  it('is hidden when the provider cannot summarize', () => {
    renderAi({ settings: settingsWith({ enabled: true }), providers: capableProvider({ summary: false }) });

    expect(screen.queryByLabelText('Summary model')).not.toBeInTheDocument();
  });

  it('keeps typed text local and commits the model on blur', () => {
    const { onSettingsChange } = renderAi({ settings: settingsWith({ enabled: true }) });
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
    const { onSettingsChange } = renderAi({ settings: settingsWith({ enabled: true }) });
    const input = screen.getByLabelText('Summary model');

    fireEvent.change(input, { target: { value: 'gpt-5-mini' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onSettingsChange).toHaveBeenCalledWith({
      summary: expect.objectContaining({ modelByProvider: { openai: 'gpt-5-mini' } })
    });
  });

  it('stores a cleared model as an empty string, which means the text model', () => {
    const { onSettingsChange } = renderAi({
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
    const { onSettingsChange } = renderAi({
      settings: settingsWith({ enabled: true, modelByProvider: { openai: 'gpt-5-mini' } })
    });

    fireEvent.blur(screen.getByLabelText('Summary model'));

    expect(onSettingsChange).not.toHaveBeenCalled();
  });

  it('offers the provider summary models as suggestions and keeps the other lists loading', async () => {
    const { onListModels } = renderAi({ settings: settingsWith({ enabled: true }) });

    await waitFor(() => {
      expect(onListModels).toHaveBeenCalledWith('openai', 'summary');
    });
    expect(onListModels).toHaveBeenCalledWith('openai', 'transcription');
    expect(onListModels).toHaveBeenCalledWith('openai', 'translation');

    const input = screen.getByLabelText('Summary model');
    const listId = input.getAttribute('list');
    expect(listId).toBeTruthy();
    await waitFor(() => {
      const options = Array.from(document.querySelectorAll(`datalist#${listId} option`)).map((option) => option.getAttribute('value'));
      expect(options).toEqual(['gpt-5-mini']);
    });
  });

  it('stays usable when the summary model list fails', async () => {
    const { onSettingsChange } = renderAi({
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
