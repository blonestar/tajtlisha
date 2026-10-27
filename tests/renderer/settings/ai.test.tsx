import '@testing-library/jest-dom/vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProviderModelDescriptor, ProviderStatus } from '../../../src/shared/types/ai';
import { SettingsPage } from '../../../src/renderer/src/pages/SettingsPage';
import { mockProviderStatuses, mockSettings } from './mockSettings';
import { renderWithI18n } from '../renderWithI18n';
import { removeFakeApi } from './fixtures';

afterEach(() => {
  removeFakeApi();
});

const disconnectedOpenAi: ProviderStatus[] = [{ ...mockProviderStatuses[0], connected: false, maskedCredential: undefined }];

const transcriptionModels: ProviderModelDescriptor[] = [
  { id: 'whisper-1', label: 'whisper-1', capability: 'transcription', timestamps: 'word' },
  { id: 'gpt-4o-transcribe', label: 'GPT-4o transcribe', capability: 'transcription', timestamps: 'none' }
];

const textModels: ProviderModelDescriptor[] = [{ id: 'gpt-4.1-mini', label: 'GPT-4.1 mini', capability: 'translation' }];

function listModels(): (providerId: string, capability: keyof ProviderStatus['capabilities']) => Promise<ProviderModelDescriptor[]> {
  return async (_providerId, capability) => (capability === 'transcription' ? transcriptionModels : textModels);
}

/** Renders Settings and opens one of its tabs by its nav label. */
function openSettingsTab(tab: string, props: Partial<Parameters<typeof SettingsPage>[0]>): void {
  renderWithI18n(<SettingsPage settings={mockSettings} onLanguageChange={vi.fn()} {...props} />);
  fireEvent.click(screen.getByRole('button', { name: tab }));
}

function openAiSection(props: Partial<Parameters<typeof SettingsPage>[0]>): void {
  openSettingsTab('Connectors', props);
}

describe('Connectors connection', () => {
  it('connects with the typed key and clears the input so the secret is not kept', async () => {
    const onConnectProvider = vi.fn().mockResolvedValue(undefined);
    openAiSection({ providers: disconnectedOpenAi, onConnectProvider });

    const input = screen.getByLabelText('API key');
    expect(input).toHaveAttribute('type', 'password');
    fireEvent.change(input, { target: { value: 'sk-test-secret-1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));

    await waitFor(() => expect(onConnectProvider).toHaveBeenCalledWith('openai', 'api_key', 'sk-test-secret-1234'));
    expect(await screen.findByText('Provider connected.')).toBeInTheDocument();
    expect(screen.getByLabelText('API key')).toHaveValue('');
    expect(screen.queryByText('sk-test-secret-1234')).not.toBeInTheDocument();
  });

  it('clears the typed key even when connecting fails, and shows the error', async () => {
    const onConnectProvider = vi.fn().mockRejectedValue(new Error("Error invoking remote method 'ai:connectProvider': Error: Key rejected."));
    openAiSection({ providers: disconnectedOpenAi, onConnectProvider });

    fireEvent.change(screen.getByLabelText('API key'), { target: { value: 'sk-bad' } });
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));

    expect(await screen.findByText('Key rejected.')).toBeInTheDocument();
    expect(screen.getByLabelText('API key')).toHaveValue('');
  });

  it('shows the masked credential and offers test, use and disconnect for a connected provider', () => {
    const onDisconnectProvider = vi.fn().mockResolvedValue(undefined);
    const onTestProvider = vi.fn();
    openAiSection({ providers: mockProviderStatuses, onDisconnectProvider, onTestProvider, onListModels: listModels() });

    expect(screen.getByText('API key ending in 1234')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Replace key' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Test connection' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Use for subtitles' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    expect(onDisconnectProvider).toHaveBeenCalledWith('openai');
  });

  it('shows the test connection result message', async () => {
    const onTestProvider = vi.fn().mockResolvedValue({
      ok: true,
      providerId: 'openai',
      message: 'Key works. 12 models visible.',
      checkedAt: '2026-10-22T10:00:00.000Z'
    });
    openAiSection({ providers: mockProviderStatuses, onTestProvider, onListModels: listModels() });

    fireEvent.click(screen.getByRole('button', { name: 'Test connection' }));

    expect(await screen.findByText('Key works. 12 models visible.')).toBeInTheDocument();
    expect(onTestProvider).toHaveBeenCalledWith('openai');
  });

  it('uses the failure text when a failed test has no message', async () => {
    const onTestProvider = vi.fn().mockResolvedValue({ ok: false, providerId: 'openai', checkedAt: '2026-10-22T10:00:00.000Z' });
    openAiSection({ providers: mockProviderStatuses, onTestProvider, onListModels: listModels() });

    fireEvent.click(screen.getByRole('button', { name: 'Test connection' }));

    expect(await screen.findByText('Connection test failed.')).toBeInTheDocument();
  });
});

describe('Connectors models', () => {
  it('shows a word timing badge for a word-timed transcription model', async () => {
    renderWithI18n(
      <SettingsPage
        settings={{
          ...mockSettings,
          aiConnector: { ...mockSettings.aiConnector, transcriptionModelByProvider: { openai: 'whisper-1' } }
        }}
        onLanguageChange={vi.fn()}
        providers={mockProviderStatuses}
        onListModels={listModels()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Connectors' }));

    expect(await screen.findByText('Word timing')).toBeInTheDocument();
    expect(screen.getByText(/OpenAI retires it on 2027-02-26/)).toBeInTheDocument();
  });

  it('shows the approximate badge when the selected model has no timing', async () => {
    renderWithI18n(
      <SettingsPage
        settings={{
          ...mockSettings,
          aiConnector: {
            ...mockSettings.aiConnector,
            transcriptionModelByProvider: { openai: 'gpt-4o-transcribe' }
          }
        }}
        onLanguageChange={vi.fn()}
        providers={mockProviderStatuses}
        onListModels={listModels()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Connectors' }));

    expect(await screen.findByText('No timing - approximate')).toBeInTheDocument();
    expect(screen.queryByText('Word timing')).not.toBeInTheDocument();
  });

  it('patches the chosen transcription and translation models', async () => {
    const onSettingsChange = vi.fn();
    openAiSection({ providers: mockProviderStatuses, onSettingsChange, onListModels: listModels() });

    await screen.findByRole('option', { name: 'GPT-4o transcribe' });
    fireEvent.change(screen.getByLabelText('Transcription model'), { target: { value: 'gpt-4o-transcribe' } });
    expect(onSettingsChange).toHaveBeenLastCalledWith({
      aiConnector: expect.objectContaining({
        transcriptionModelByProvider: expect.objectContaining({ openai: 'gpt-4o-transcribe' })
      })
    });

    fireEvent.change(screen.getByLabelText('Translation model'), { target: { value: 'gpt-4.1-mini' } });
    expect(onSettingsChange).toHaveBeenLastCalledWith({
      aiConnector: expect.objectContaining({ textModelByProvider: expect.objectContaining({ openai: 'gpt-4.1-mini' }) })
    });
  });

  it('reports a model loading failure in place of the pickers', async () => {
    openAiSection({
      providers: mockProviderStatuses,
      onListModels: async () => {
        throw new Error('provider unavailable');
      }
    });

    expect(await screen.findByText('Models could not be loaded. Check the connection and try again.')).toBeInTheDocument();
  });

  it('asks for a connection before showing model pickers', () => {
    openAiSection({ providers: disconnectedOpenAi, onListModels: listModels() });

    expect(screen.getByText('Connect this provider to choose its models.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Transcription model')).not.toBeInTheDocument();
  });
});

describe('Translation tab polish', () => {
  it('maps the polish segmented control onto the two polish flags', () => {
    const onSettingsChange = vi.fn();
    openSettingsTab('Translation', { providers: mockProviderStatuses, onSettingsChange });

    fireEvent.click(screen.getByRole('button', { name: 'Social captions' }));
    expect(onSettingsChange).toHaveBeenLastCalledWith({
      aiConnector: expect.objectContaining({ conservativePolish: false, socialCaptionPolish: true })
    });

    fireEvent.click(screen.getByRole('button', { name: 'None' }));
    expect(onSettingsChange).toHaveBeenLastCalledWith({
      aiConnector: expect.objectContaining({ conservativePolish: false, socialCaptionPolish: false })
    });

    fireEvent.click(screen.getByRole('button', { name: 'Light' }));
    expect(onSettingsChange).toHaveBeenLastCalledWith({
      aiConnector: expect.objectContaining({ conservativePolish: true, socialCaptionPolish: false })
    });
  });

  it('shows the selected polish mode as pressed', () => {
    openSettingsTab('Translation', { providers: mockProviderStatuses });

    expect(screen.getByRole('button', { name: 'Light' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Social captions' })).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('Transcription tab captions', () => {
  it('patches the max characters per line from the slider', () => {
    const onSettingsChange = vi.fn();
    openSettingsTab('Transcription', { providers: mockProviderStatuses, onSettingsChange });

    expect(screen.getByText('42 characters')).toBeInTheDocument();
    const slider = screen.getByLabelText('Max characters per line');
    expect(slider).toHaveAttribute('min', '20');
    expect(slider).toHaveAttribute('max', '60');

    fireEvent.change(slider, { target: { value: '50' } });

    expect(onSettingsChange).toHaveBeenLastCalledWith({
      aiConnector: expect.objectContaining({ maxCharsPerLine: 50 })
    });
  });

  it('patches the max lines per caption from the segmented control', () => {
    const onSettingsChange = vi.fn();
    openSettingsTab('Transcription', { providers: mockProviderStatuses, onSettingsChange });

    fireEvent.click(screen.getByRole('button', { name: '1' }));

    expect(onSettingsChange).toHaveBeenLastCalledWith({
      aiConnector: expect.objectContaining({ maxLinesPerCaption: 1 })
    });
  });

  it('patches the auto-detect language switch', () => {
    const onSettingsChange = vi.fn();
    openSettingsTab('Transcription', { providers: mockProviderStatuses, onSettingsChange });

    fireEvent.click(screen.getByRole('switch', { name: 'Auto-detect spoken language' }));

    expect(onSettingsChange).toHaveBeenLastCalledWith({
      aiConnector: expect.objectContaining({ autoDetectInputLanguage: false })
    });
  });
});
