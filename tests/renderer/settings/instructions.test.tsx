import '@testing-library/jest-dom/vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_AI_INSTRUCTIONS_CHARS } from '../../../src/shared/ai-instructions';
import { SettingsPage } from '../../../src/renderer/src/pages/SettingsPage';
import type { AppSettings } from '../../../src/shared/types/settings';
import { mockProviderStatuses, mockSettings } from './mockSettings';
import { renderWithI18n } from '../renderWithI18n';
import { removeFakeApi } from './fixtures';

afterEach(() => {
  removeFakeApi();
});

function withConnector(overrides: Partial<AppSettings['aiConnector']>): AppSettings {
  return { ...mockSettings, aiConnector: { ...mockSettings.aiConnector, ...overrides } };
}

function renderTab(tab: string, settings: AppSettings, onSettingsChange = vi.fn()) {
  const view = renderWithI18n(
    <SettingsPage settings={settings} providers={mockProviderStatuses} onLanguageChange={vi.fn()} onSettingsChange={onSettingsChange} />
  );
  fireEvent.click(screen.getByRole('button', { name: tab }));
  return { onSettingsChange, view };
}

describe('Settings tabs', () => {
  it('lists Connectors, Transcription and Translation in order, after General', () => {
    renderWithI18n(<SettingsPage settings={mockSettings} onLanguageChange={vi.fn()} />);

    const nav = screen.getByRole('navigation', { name: 'Settings sections' });
    expect(within(nav).getAllByRole('button').map((button) => button.textContent)).toEqual([
      'General',
      'Connectors',
      'Transcription',
      'Translation',
      'Summary',
      'Export',
      'Logo',
      'About'
    ]);
  });

  it('shows the transcription controls on the Transcription tab only', () => {
    renderTab('Transcription', mockSettings);

    expect(screen.getByRole('heading', { level: 2, name: 'Transcription' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Auto-detect spoken language' })).toBeInTheDocument();
    expect(screen.getByLabelText('Max characters per line')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'AI correction after transcription' })).toBeInTheDocument();
    expect(screen.getByLabelText('Correction instructions')).toBeInTheDocument();
    expect(screen.queryByLabelText('Translation instructions')).not.toBeInTheDocument();
  });

  it('shows the translation controls on the Translation tab only', () => {
    renderTab('Translation', mockSettings);

    expect(screen.getByRole('heading', { level: 2, name: 'Translation' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Social captions' })).toBeInTheDocument();
    expect(screen.getByLabelText('Translation instructions')).toBeInTheDocument();
    expect(screen.queryByLabelText('Correction instructions')).not.toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: 'AI correction after transcription' })).not.toBeInTheDocument();
  });
});

describe('AI correction after transcription', () => {
  it('shows the switch off by default and the correction instructions editable while it is off', () => {
    renderTab('Transcription', withConnector({ correctTranscript: false, transcriptCorrectionInstructions: 'Keep names' }));

    expect(screen.getByRole('switch', { name: 'AI correction after transcription' })).not.toBeChecked();
    const instructions = screen.getByLabelText('Correction instructions');
    expect(instructions).toBeEnabled();
    expect(instructions).toHaveValue('Keep names');
    expect(instructions).toHaveAttribute('maxLength', String(MAX_AI_INSTRUCTIONS_CHARS));
  });

  it('turns correction on with a patch that carries the whole aiConnector object', () => {
    const { onSettingsChange } = renderTab('Transcription', withConnector({ correctTranscript: false }));

    fireEvent.click(screen.getByRole('switch', { name: 'AI correction after transcription' }));

    expect(onSettingsChange).toHaveBeenCalledWith({
      aiConnector: { ...mockSettings.aiConnector, correctTranscript: true }
    });
  });

  it('keeps typed correction instructions local until blur, then commits them in one patch', () => {
    const { onSettingsChange } = renderTab('Transcription', withConnector({ transcriptCorrectionInstructions: '' }));
    const instructions = screen.getByLabelText('Correction instructions');

    fireEvent.change(instructions, { target: { value: 'Write AI' } });
    expect(onSettingsChange).not.toHaveBeenCalled();

    fireEvent.blur(instructions);
    expect(onSettingsChange).toHaveBeenCalledTimes(1);
    expect(onSettingsChange).toHaveBeenCalledWith({
      aiConnector: expect.objectContaining({ transcriptCorrectionInstructions: 'Write AI', correctTranscript: false, maxCharsPerLine: 42 })
    });
  });

  it('commits unsaved correction instructions when Settings closes without a blur (Esc)', () => {
    const { onSettingsChange, view } = renderTab('Transcription', withConnector({ transcriptCorrectionInstructions: 'Old' }));

    fireEvent.change(screen.getByLabelText('Correction instructions'), { target: { value: 'Do not censor swear words.' } });
    view.unmount();

    expect(onSettingsChange).toHaveBeenCalledTimes(1);
    expect(onSettingsChange).toHaveBeenCalledWith({
      aiConnector: expect.objectContaining({ transcriptCorrectionInstructions: 'Do not censor swear words.' })
    });
  });

  it('stores blank instructions as an empty string, not a default', () => {
    const { onSettingsChange } = renderTab('Transcription', withConnector({ transcriptCorrectionInstructions: 'Old' }));
    const instructions = screen.getByLabelText('Correction instructions');

    fireEvent.change(instructions, { target: { value: '   ' } });
    fireEvent.blur(instructions);

    expect(onSettingsChange).toHaveBeenCalledWith({
      aiConnector: expect.objectContaining({ transcriptCorrectionInstructions: '' })
    });
    expect(screen.getByLabelText('Correction instructions')).toHaveValue('');
  });

  it('does not write again on unmount after a blur already saved the text', () => {
    const { onSettingsChange, view } = renderTab('Transcription', withConnector({ transcriptCorrectionInstructions: '' }));
    const instructions = screen.getByLabelText('Correction instructions');

    fireEvent.change(instructions, { target: { value: 'Saved once' } });
    fireEvent.blur(instructions);
    view.unmount();

    expect(onSettingsChange).toHaveBeenCalledTimes(1);
  });

  it('shows a character counter against the shared maximum', () => {
    renderTab('Transcription', withConnector({ transcriptCorrectionInstructions: 'Abc' }));

    expect(screen.getByText(`3 / ${MAX_AI_INSTRUCTIONS_CHARS} characters`)).toBeInTheDocument();
  });

  it('shows the correction hint that names the Connectors text model', () => {
    renderTab('Transcription', mockSettings);

    expect(screen.getByText(/uses the text model chosen under Connectors and keeps the timing/)).toBeInTheDocument();
  });
});

describe('Translation instructions', () => {
  it('commits translation instructions on blur in one patch', () => {
    const { onSettingsChange } = renderTab('Translation', withConnector({ translationInstructions: '' }));
    const instructions = screen.getByLabelText('Translation instructions');

    fireEvent.change(instructions, { target: { value: "Use informal 'ti'." } });
    expect(onSettingsChange).not.toHaveBeenCalled();
    fireEvent.blur(instructions);

    expect(onSettingsChange).toHaveBeenCalledWith({
      aiConnector: expect.objectContaining({ translationInstructions: "Use informal 'ti'.", conservativePolish: true })
    });
  });

  it('commits translation instructions when Settings closes without a blur (Esc)', () => {
    const { onSettingsChange, view } = renderTab('Translation', withConnector({ translationInstructions: '' }));

    fireEvent.change(screen.getByLabelText('Translation instructions'), { target: { value: 'Keep brand names in English.' } });
    view.unmount();

    expect(onSettingsChange).toHaveBeenCalledWith({
      aiConnector: expect.objectContaining({ translationInstructions: 'Keep brand names in English.' })
    });
  });

  it('keeps the polish choice and the instructions in one patch each', () => {
    const { onSettingsChange } = renderTab('Translation', withConnector({ translationInstructions: 'Old' }));

    fireEvent.click(screen.getByRole('button', { name: 'Social captions' }));
    expect(onSettingsChange).toHaveBeenLastCalledWith({
      aiConnector: expect.objectContaining({ socialCaptionPolish: true, translationInstructions: 'Old' })
    });
  });
});
