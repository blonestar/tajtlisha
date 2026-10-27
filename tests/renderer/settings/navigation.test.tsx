import '@testing-library/jest-dom/vitest';
import { fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingsPage } from '../../../src/renderer/src/pages/SettingsPage';
import { mockProviderStatuses, mockSettings } from './mockSettings';
import { renderWithI18n } from '../renderWithI18n';
import { installFakeApi, removeFakeApi, fullFfmpegStatus, updateState } from './fixtures';

afterEach(() => {
  removeFakeApi();
});

describe('SettingsPage navigation', () => {
  it('shows one section at a time and marks the current nav item', () => {
    renderWithI18n(<SettingsPage settings={mockSettings} onLanguageChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'General' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByLabelText('Interface language')).toBeInTheDocument();
    expect(screen.queryByText('Default output folder')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Export' }));

    expect(screen.getByRole('heading', { level: 2, name: 'Export' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('Default output folder')).toBeInTheDocument();
    expect(screen.queryByLabelText('Interface language')).not.toBeInTheDocument();
  });

  it('shows the Connectors section with its provider cards, and no caption options', () => {
    renderWithI18n(<SettingsPage settings={mockSettings} providers={mockProviderStatuses} onLanguageChange={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Connectors' }));

    expect(screen.getByRole('heading', { level: 2, name: 'Connectors' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /OpenAI/ })).toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: 'Auto-detect spoken language' })).not.toBeInTheDocument();
  });

  it('has its own Summary section, separate from Connectors', () => {
    renderWithI18n(<SettingsPage settings={mockSettings} providers={mockProviderStatuses} onLanguageChange={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Connectors' }));
    expect(screen.queryByRole('switch', { name: 'Show Summarize in the editor' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Summary' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Summary' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Show Summarize in the editor' })).toBeInTheDocument();
    expect(screen.getByLabelText('System prompt')).toBeInTheDocument();
    expect(screen.getByLabelText('Summary model')).toBeInTheDocument();
    expect(screen.getByLabelText('Thinking effort')).toBeInTheDocument();
  });

  it('loads the About section and shows the app version', async () => {
    installFakeApi({
      app: { getInfo: async () => ({ version: '0.2.0', platform: 'linux', isPackaged: true }), setZoomFactor: () => undefined },
      updates: {
        getState: async () => updateState({ status: 'idle' }),
        onState: () => () => undefined
      },
      media: { getFfmpegStatus: async () => fullFfmpegStatus }
    });
    renderWithI18n(<SettingsPage settings={mockSettings} onLanguageChange={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'About' }));

    expect(await screen.findByText('0.2.0')).toBeInTheDocument();
    expect(screen.getByText('Linux')).toBeInTheDocument();
  });
});

describe('SettingsPage header and general section', () => {
  it('calls onClose from the header close button', () => {
    const onClose = vi.fn();
    renderWithI18n(<SettingsPage settings={mockSettings} onLanguageChange={vi.fn()} onClose={onClose} />);

    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close settings' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('hides the close button when no onClose is given', () => {
    renderWithI18n(<SettingsPage settings={mockSettings} onLanguageChange={vi.fn()} />);

    expect(screen.queryByRole('button', { name: 'Close settings' })).not.toBeInTheDocument();
  });

  it('passes the chosen interface language to onLanguageChange', () => {
    const onLanguageChange = vi.fn();
    renderWithI18n(<SettingsPage settings={mockSettings} onLanguageChange={onLanguageChange} />);

    fireEvent.change(screen.getByLabelText('Interface language'), { target: { value: 'sr-Cyrl' } });

    expect(onLanguageChange).toHaveBeenCalledWith('sr-Cyrl');
  });

  it('patches the default translation language with localized names', () => {
    const onSettingsChange = vi.fn();
    renderWithI18n(<SettingsPage settings={mockSettings} onLanguageChange={vi.fn()} onSettingsChange={onSettingsChange} />);

    const select = screen.getByLabelText('Default translation language');
    expect(select).toHaveValue('sr-Latn');
    expect(screen.getByRole('option', { name: 'Serbian (Latin)' })).toBeInTheDocument();

    fireEvent.change(select, { target: { value: 'de' } });

    expect(onSettingsChange).toHaveBeenCalledWith({
      aiConnector: expect.objectContaining({ defaultTargetLanguage: 'de' })
    });
  });
});
