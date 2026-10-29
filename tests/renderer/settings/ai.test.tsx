import '@testing-library/jest-dom/vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProviderModelDescriptor, ProviderStatus } from '../../../src/shared/types/ai';
import type { AppSettings } from '../../../src/shared/types/settings';
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

/** Local CLI provider as main reports it when the CLI was found. */
const codexFound: ProviderStatus = {
  id: 'codex_cli',
  displayName: 'Codex CLI (local)',
  authModes: ['local_cli'],
  experimental: true,
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

const codexMissing: ProviderStatus = { ...codexFound, connected: false, cliVersion: undefined, cliPath: undefined };

const openRouterConnected: ProviderStatus = {
  ...mockProviderStatuses[0],
  id: 'openrouter',
  displayName: 'OpenRouter',
  authModes: ['api_key'],
  maskedCredential: 'API key ending in 9999'
};

/** Renders Settings and opens one of its tabs by its nav label. */
function openSettingsTab(tab: string, props: Partial<Parameters<typeof SettingsPage>[0]>): void {
  renderWithI18n(<SettingsPage settings={mockSettings} onLanguageChange={vi.fn()} {...props} />);
  fireEvent.click(screen.getByRole('button', { name: tab }));
}

function withConnector(overrides: Partial<AppSettings['aiConnector']>): AppSettings {
  return { ...mockSettings, aiConnector: { ...mockSettings.aiConnector, ...overrides } };
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

  it('shows the masked credential and offers test and disconnect, without model pickers or a use button', () => {
    const onDisconnectProvider = vi.fn().mockResolvedValue(undefined);
    const onTestProvider = vi.fn();
    openAiSection({ providers: mockProviderStatuses, onDisconnectProvider, onTestProvider });

    expect(screen.getByText('API key ending in 1234')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Replace key' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Test connection' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Use for subtitles' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Transcription model')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Translation model')).not.toBeInTheDocument();

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
    openAiSection({ providers: mockProviderStatuses, onTestProvider });

    fireEvent.click(screen.getByRole('button', { name: 'Test connection' }));

    expect(await screen.findByText('Key works. 12 models visible.')).toBeInTheDocument();
    expect(onTestProvider).toHaveBeenCalledWith('openai');
  });

  it('uses the failure text when a failed test has no message', async () => {
    const onTestProvider = vi.fn().mockResolvedValue({ ok: false, providerId: 'openai', checkedAt: '2026-10-22T10:00:00.000Z' });
    openAiSection({ providers: mockProviderStatuses, onTestProvider });

    fireEvent.click(screen.getByRole('button', { name: 'Test connection' }));

    expect(await screen.findByText('Connection test failed.')).toBeInTheDocument();
  });
});

describe('Connectors cards and roles', () => {
  it('shows the role of each provider chosen in the tabs, and the experimental badge', () => {
    openAiSection({
      settings: withConnector({ textProviderId: 'codex_cli' }),
      providers: [...mockProviderStatuses, codexFound]
    });

    const openAiCard = screen.getByRole('button', { name: /OpenAI/ });
    expect(within(openAiCard).getByText('Transcription')).toBeInTheDocument();
    expect(within(openAiCard).queryByText('Translation')).not.toBeInTheDocument();

    const codexCard = screen.getByRole('button', { name: /Codex CLI/ });
    expect(within(codexCard).getByText('Translation')).toBeInTheDocument();
    expect(within(codexCard).getByText('Summary')).toBeInTheDocument();
    expect(within(codexCard).getByText('Experimental')).toBeInTheDocument();
    expect(within(codexCard).queryByText('Transcription')).not.toBeInTheDocument();
  });

  it('resolves the summary role to the translation provider while the summary has no provider of its own', () => {
    openAiSection({ settings: withConnector({ textProviderId: 'codex_cli' }), providers: [...mockProviderStatuses, codexFound] });

    expect(within(screen.getByRole('button', { name: /OpenAI/ })).queryByText('Summary')).not.toBeInTheDocument();
    expect(within(screen.getByRole('button', { name: /Codex CLI/ })).getByText('Summary')).toBeInTheDocument();
  });

  it('does not show a Connectors model select or the old use button in the connectors tab', () => {
    openAiSection({ providers: [...mockProviderStatuses, codexFound] });

    expect(screen.queryByText('Use for subtitles')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });
});

describe('Local CLI provider panel', () => {
  it('shows the found CLI with its version and path, and no API key field', () => {
    openAiSection({ providers: [codexFound] });

    const card = screen.getByRole('button', { name: /Codex CLI/ });
    expect(within(card).getByText('Found')).toBeInTheDocument();
    expect(screen.getByText('codex-cli 0.165.0')).toBeInTheDocument();
    expect(screen.getByText('/home/user/.local/bin/codex')).toBeInTheDocument();
    expect(screen.queryByLabelText('API key')).not.toBeInTheDocument();
    expect(screen.getByText(/Experimental\. Works only for translation/)).toBeInTheDocument();
  });

  it('asks to install the CLI and sign in when it was not found', () => {
    openAiSection({ providers: [codexMissing] });

    expect(within(screen.getByRole('button', { name: /Codex CLI/ })).getByText('Not found')).toBeInTheDocument();
    expect(screen.getByText('Install Codex CLI (local) on this computer and sign in to it, then press Check again.')).toBeInTheDocument();
    expect(screen.queryByText('CLI version')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('API key')).not.toBeInTheDocument();
  });

  it('checks the providers again from the panel', async () => {
    const onRefreshProviders = vi.fn().mockResolvedValue(undefined);
    openAiSection({ providers: [codexMissing], onRefreshProviders });

    fireEvent.click(screen.getByRole('button', { name: 'Check again' }));

    await waitFor(() => expect(onRefreshProviders).toHaveBeenCalledTimes(1));
  });

  it('shows the message of the connection test', async () => {
    const onTestProvider = vi.fn().mockResolvedValue({
      ok: true,
      providerId: 'codex_cli',
      message: 'Logged in with your ChatGPT plan.',
      checkedAt: '2026-10-29T10:00:00.000Z'
    });
    openAiSection({ providers: [codexFound], onTestProvider });

    fireEvent.click(screen.getByRole('button', { name: 'Test connection' }));

    expect(await screen.findByText('Logged in with your ChatGPT plan.')).toBeInTheDocument();
    expect(onTestProvider).toHaveBeenCalledWith('codex_cli');
  });
});

describe('Transcription tab provider and model', () => {
  it('lists only connected providers that can transcribe, and saves the chosen provider', () => {
    const onSettingsChange = vi.fn();
    openSettingsTab('Transcription', {
      providers: [mockProviderStatuses[0], openRouterConnected, codexFound],
      onSettingsChange,
      onListModels: listModels()
    });

    const select = screen.getByLabelText('Transcription provider');
    const options = Array.from((select as HTMLSelectElement).options).map((option) => option.text);
    expect(options).toEqual(['OpenAI', 'OpenRouter']);

    fireEvent.change(select, { target: { value: 'openrouter' } });
    expect(onSettingsChange).toHaveBeenLastCalledWith({
      aiConnector: expect.objectContaining({ activeProviderId: 'openrouter' })
    });
  });

  it('shows a chosen provider that is not connected, marked as such', () => {
    openSettingsTab('Transcription', { providers: [{ ...mockProviderStatuses[0], connected: false }, openRouterConnected] });

    const select = screen.getByLabelText('Transcription provider') as HTMLSelectElement;
    expect(select.value).toBe('openai');
    expect(select.options[select.selectedIndex].text).toBe('OpenAI (not connected)');
  });

  it('saves the transcription model in its own map', async () => {
    const onSettingsChange = vi.fn();
    openSettingsTab('Transcription', { providers: mockProviderStatuses, onSettingsChange, onListModels: listModels() });

    await screen.findByRole('option', { name: 'whisper-1' });
    fireEvent.change(screen.getByLabelText('Transcription model'), { target: { value: 'whisper-1' } });

    expect(onSettingsChange).toHaveBeenLastCalledWith({
      aiConnector: expect.objectContaining({
        transcriptionModelByProvider: expect.objectContaining({ openai: 'whisper-1' })
      })
    });
  });

  it('saves the provider default as an empty string', async () => {
    const onSettingsChange = vi.fn();
    openSettingsTab('Transcription', { providers: mockProviderStatuses, onSettingsChange, onListModels: listModels() });

    await screen.findByRole('option', { name: 'GPT-4o transcribe' });
    fireEvent.change(screen.getByLabelText('Transcription model'), { target: { value: '' } });

    expect(onSettingsChange).toHaveBeenLastCalledWith({
      aiConnector: expect.objectContaining({ transcriptionModelByProvider: { openai: '' } })
    });
  });

  it('shows a word timing badge for a word-timed transcription model, and the OpenAI retirement hint', async () => {
    openSettingsTab('Transcription', {
      settings: withConnector({ transcriptionModelByProvider: { openai: 'whisper-1' } }),
      providers: mockProviderStatuses,
      onListModels: listModels()
    });

    expect(await screen.findByText('Word timing')).toBeInTheDocument();
    expect(screen.getByText(/OpenAI retires it on 2027-02-26/)).toBeInTheDocument();
  });

  it('shows the approximate badge when the selected model has no timing', async () => {
    openSettingsTab('Transcription', {
      settings: withConnector({ transcriptionModelByProvider: { openai: 'gpt-4o-transcribe' } }),
      providers: mockProviderStatuses,
      onListModels: listModels()
    });

    expect(await screen.findByText('No timing - approximate')).toBeInTheDocument();
    expect(screen.queryByText('Word timing')).not.toBeInTheDocument();
  });

  it('reports a model loading failure in place of the picker options', async () => {
    openSettingsTab('Transcription', {
      providers: mockProviderStatuses,
      onListModels: async () => {
        throw new Error('provider unavailable');
      }
    });

    expect(await screen.findByText('Models could not be loaded. Check the connection and try again.')).toBeInTheDocument();
  });

  it('asks for a connection before showing the model picker', () => {
    openSettingsTab('Transcription', { providers: disconnectedOpenAi, onListModels: listModels() });

    expect(screen.getByText('Connect this provider to choose its models.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Transcription model')).not.toBeInTheDocument();
  });

  it('offers a button to the Connectors tab when no connected provider can transcribe', () => {
    openSettingsTab('Transcription', { providers: [codexFound] });

    expect(screen.getByText('No connected provider can transcribe audio.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open Connectors' }));

    expect(screen.getByRole('heading', { level: 2, name: 'Connectors' })).toBeInTheDocument();
  });

  it('says that correction uses the provider and model chosen in the Translation tab', () => {
    openSettingsTab('Transcription', { providers: mockProviderStatuses });

    expect(screen.getByText(/uses the provider and model chosen in the Translation tab and keeps the timing/)).toBeInTheDocument();
  });
});

describe('Translation tab provider and model', () => {
  it('lists the connected translation providers and saves the text provider', () => {
    const onSettingsChange = vi.fn();
    openSettingsTab('Translation', { providers: [mockProviderStatuses[0], codexFound], onSettingsChange, onListModels: listModels() });

    const select = screen.getByLabelText('Translation provider') as HTMLSelectElement;
    expect(Array.from(select.options).map((option) => option.text)).toEqual(['OpenAI', 'Codex CLI (local)']);
    expect(select.value).toBe('openai');

    fireEvent.change(select, { target: { value: 'codex_cli' } });
    expect(onSettingsChange).toHaveBeenLastCalledWith({
      aiConnector: expect.objectContaining({ textProviderId: 'codex_cli' })
    });
  });

  it('saves the translation model of the chosen provider', async () => {
    const onSettingsChange = vi.fn();
    openSettingsTab('Translation', {
      settings: withConnector({ textModelByProvider: { openai: '' } }),
      providers: mockProviderStatuses,
      onSettingsChange,
      onListModels: listModels()
    });

    await screen.findByRole('option', { name: 'GPT-4.1 mini' });
    fireEvent.change(screen.getByLabelText('Translation model'), { target: { value: 'gpt-4.1-mini' } });

    expect(onSettingsChange).toHaveBeenLastCalledWith({
      aiConnector: expect.objectContaining({ textModelByProvider: expect.objectContaining({ openai: 'gpt-4.1-mini' }) })
    });
  });

  it('offers only the provider default when a provider lists no translation models', async () => {
    const onListModels = vi.fn(async () => []);
    openSettingsTab('Translation', {
      settings: withConnector({ textProviderId: 'codex_cli' }),
      providers: [mockProviderStatuses[0], codexFound],
      onListModels
    });

    await waitFor(() => expect(onListModels).toHaveBeenCalledWith('codex_cli', 'translation'));
    const options = Array.from((screen.getByLabelText('Translation model') as HTMLSelectElement).options).map((option) => option.text);
    expect(options).toEqual(['Provider default']);
  });

  it('saves the chosen thinking effort', () => {
    const onSettingsChange = vi.fn();
    openSettingsTab('Translation', { providers: mockProviderStatuses, onSettingsChange });

    const effort = screen.getByLabelText('Thinking effort');
    expect(effort).toHaveValue('default');

    fireEvent.change(effort, { target: { value: 'high' } });
    expect(onSettingsChange).toHaveBeenLastCalledWith({
      aiConnector: expect.objectContaining({ textReasoningEffort: 'high' })
    });
  });

  it('shows Default as the stored effort and returns to it', () => {
    const onSettingsChange = vi.fn();
    openSettingsTab('Translation', {
      settings: withConnector({ textReasoningEffort: 'high' }),
      providers: mockProviderStatuses,
      onSettingsChange
    });

    const effort = screen.getByLabelText('Thinking effort');
    expect(effort).toHaveValue('high');

    fireEvent.change(effort, { target: { value: 'default' } });
    expect(onSettingsChange).toHaveBeenLastCalledWith({
      aiConnector: expect.objectContaining({ textReasoningEffort: 'default' })
    });
  });

  it('offers a button to the Connectors tab when no connected provider can translate', () => {
    openSettingsTab('Translation', { providers: [{ ...mockProviderStatuses[0], connected: false }] });

    expect(screen.getByText('No connected provider can translate text.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open Connectors' }));

    expect(screen.getByRole('heading', { level: 2, name: 'Connectors' })).toBeInTheDocument();
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
