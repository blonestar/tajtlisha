import '@testing-library/jest-dom/vitest';
import type { ComponentProps } from 'react';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ProviderStatus } from '../../../src/shared/types/ai';
import type { AppSettings } from '../../../src/shared/types/settings';
import { SettingsPage } from '../../../src/renderer/src/pages/SettingsPage';
import { mockProviderStatuses, mockSettings } from './mockSettings';
import { renderWithI18n } from '../renderWithI18n';

const LOCAL_CAPABILITIES = {
  detectLanguage: false,
  transcription: false,
  segmentTimestamps: false,
  wordTimestamps: false,
  translation: true,
  subtitlePolish: true,
  textToSpeech: false,
  summary: true
};

/** Claude Code as main reports it when it is off (the default): no detection ran. */
const claudeOff: ProviderStatus = {
  id: 'claude_code_cli',
  displayName: 'Claude Code (local)',
  authModes: ['local_cli'],
  experimental: true,
  enabled: false,
  connected: false,
  message: 'Claude Code (local) is turned off.',
  capabilities: LOCAL_CAPABILITIES
};

const codexOn: ProviderStatus = {
  ...claudeOff,
  id: 'codex_cli',
  displayName: 'Codex CLI (local)',
  enabled: true,
  connected: true,
  cliVersion: 'codex-cli 0.165.0',
  cliPath: '/home/user/.local/bin/codex'
};

const openRouterOff: ProviderStatus = {
  ...mockProviderStatuses[0],
  id: 'openrouter',
  displayName: 'OpenRouter',
  authModes: ['api_key'],
  enabled: false,
  connected: false,
  maskedCredential: undefined
};

const openAiOn = mockProviderStatuses[0];

function withConnector(overrides: Partial<AppSettings['aiConnector']>): AppSettings {
  return { ...mockSettings, aiConnector: { ...mockSettings.aiConnector, ...overrides } };
}

type PageProps = Partial<ComponentProps<typeof SettingsPage>>;

/** Renders Settings on the Connectors tab. `providers` are the turned-on connectors, `allProviders` every one. */
function openConnectors(props: PageProps): void {
  renderWithI18n(<SettingsPage settings={mockSettings} onLanguageChange={vi.fn()} {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Connectors' }));
}

describe('Enabled connectors section', () => {
  it('lists every connector with a checkbox, Claude Code off and OpenAI on by default', () => {
    openConnectors({
      settings: withConnector({ enabledProviders: { openrouter: false } }),
      providers: [openAiOn, codexOn],
      allProviders: [openAiOn, openRouterOff, codexOn, claudeOff]
    });

    expect(screen.getByRole('heading', { name: 'Enabled connectors' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'OpenAI' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'OpenRouter' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Codex CLI (local)' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Claude Code (local)' })).not.toBeChecked();
  });

  it('shows the Claude Code warning under its checkbox, whether it is on or off', () => {
    openConnectors({ providers: [openAiOn], allProviders: [openAiOn, claudeOff] });

    const checkbox = screen.getByRole('checkbox', { name: 'Claude Code (local)' });
    const note = screen.getByRole('note');
    expect(note).toHaveTextContent("Anthropic's terms may not allow subscription use from third-party apps");
    expect(note).toHaveTextContent('Tajtlisha takes no responsibility for any consequences.');
    expect(checkbox.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('keeps the warning visible when Claude Code is turned on', () => {
    const claudeOn: ProviderStatus = { ...claudeOff, enabled: true };
    openConnectors({
      settings: withConnector({ enabledProviders: { claude_code_cli: true } }),
      providers: [openAiOn, claudeOn],
      allProviders: [openAiOn, claudeOn]
    });

    expect(screen.getByRole('checkbox', { name: 'Claude Code (local)' })).toBeChecked();
    expect(screen.getByRole('note')).toBeVisible();
  });

  it('saves a toggle as an enabledProviders patch, then reloads the statuses', async () => {
    const onSettingsChange = vi.fn().mockResolvedValue(undefined);
    const onRefreshProviders = vi.fn().mockResolvedValue(undefined);
    openConnectors({
      providers: [openAiOn],
      allProviders: [openAiOn, claudeOff],
      onSettingsChange,
      onRefreshProviders
    });

    fireEvent.click(screen.getByRole('checkbox', { name: 'Claude Code (local)' }));

    await waitFor(() => expect(onRefreshProviders).toHaveBeenCalledTimes(1));
    expect(onSettingsChange).toHaveBeenCalledWith({
      aiConnector: expect.objectContaining({ enabledProviders: { claude_code_cli: true } })
    });
    expect(onSettingsChange.mock.invocationCallOrder[0]).toBeLessThan(onRefreshProviders.mock.invocationCallOrder[0]);
  });

  it('keeps the other connectors choices when one is toggled off', async () => {
    const onSettingsChange = vi.fn().mockResolvedValue(undefined);
    openConnectors({
      settings: withConnector({ enabledProviders: { codex_cli: true } }),
      providers: [openAiOn, codexOn],
      allProviders: [openAiOn, codexOn],
      onSettingsChange,
      onRefreshProviders: vi.fn().mockResolvedValue(undefined)
    });

    fireEvent.click(screen.getByRole('checkbox', { name: 'OpenAI' }));

    await waitFor(() => expect(onSettingsChange).toHaveBeenCalledTimes(1));
    expect(onSettingsChange).toHaveBeenCalledWith({
      aiConnector: expect.objectContaining({ enabledProviders: { codex_cli: true, openai: false } })
    });
  });

  it('hides a turned-off connector from the cards and from every provider choice', () => {
    openConnectors({ providers: [openAiOn, codexOn], allProviders: [openAiOn, codexOn, claudeOff] });

    expect(screen.queryByRole('button', { name: /Claude Code/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /OpenAI/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Translation' }));
    const translationOptions = within(screen.getByLabelText('Translation provider')).queryAllByRole('option');
    expect(translationOptions.map((option) => option.textContent)).not.toContain('Claude Code (local)');
  });

  it('shows no provider chosen when the transcription provider is turned off', () => {
    renderWithI18n(
      <SettingsPage
        settings={withConnector({ activeProviderId: 'claude_code_cli' })}
        providers={[openAiOn]}
        allProviders={[openAiOn, claudeOff]}
        onLanguageChange={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Connectors' }));
    fireEvent.click(screen.getByRole('button', { name: 'Transcription' }));

    expect(screen.getByLabelText('Transcription provider')).toHaveValue('');
    expect(within(screen.getByLabelText('Transcription provider')).queryByRole('option', { name: /Claude/ })).not.toBeInTheDocument();
  });

  it('still lists every connector, with the no-providers text, when none is turned on', () => {
    openConnectors({ providers: [], allProviders: [openAiOn, claudeOff] });

    expect(screen.getByText('No AI providers are available in this version.')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'OpenAI' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Claude Code (local)' })).toBeInTheDocument();
  });
});
