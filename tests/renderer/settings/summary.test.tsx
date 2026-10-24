import '@testing-library/jest-dom/vitest';
import { fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SUMMARY_PROMPT, MAX_SUMMARY_PROMPT_CHARS } from '../../../src/shared/summary';
import type { AppSettings } from '../../../src/shared/types/settings';
import { SummarySettings } from '../../../src/renderer/src/components/settings/SummarySettings';
import { mockSettings } from './mockSettings';
import { renderWithI18n } from '../renderWithI18n';

afterEach(() => {
  vi.restoreAllMocks();
});

function withSummary(overrides: Partial<AppSettings['summary']>): AppSettings {
  return { ...mockSettings, summary: { ...mockSettings.summary, ...overrides } };
}

function renderSummary(settings: AppSettings, onSettingsChange = vi.fn()) {
  renderWithI18n(<SummarySettings settings={settings} onSettingsChange={onSettingsChange} />);
  return { onSettingsChange };
}

describe('SummarySettings', () => {
  it('turns the feature on with a patch that carries the whole summary object', () => {
    const { onSettingsChange } = renderSummary(withSummary({ enabled: false }));

    fireEvent.click(screen.getByRole('switch', { name: 'Enable video summary' }));

    expect(onSettingsChange).toHaveBeenCalledWith({
      summary: { ...mockSettings.summary, enabled: true }
    });
  });

  it('hides the prompt and effort fields while the feature is off', () => {
    renderSummary(withSummary({ enabled: false }));

    expect(screen.queryByLabelText('System prompt')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Thinking effort')).not.toBeInTheDocument();
  });

  it('shows the prompt, its counter and the effort select when enabled', () => {
    renderSummary(withSummary({ enabled: true, systemPrompt: 'Summarize the clip.' }));

    expect(screen.getByLabelText('System prompt')).toHaveValue('Summarize the clip.');
    expect(screen.getByText(`${'Summarize the clip.'.length} / ${MAX_SUMMARY_PROMPT_CHARS} characters`)).toBeInTheDocument();
    expect(screen.getByLabelText('Thinking effort')).toHaveValue('default');
  });

  it('caps the prompt at the shared maximum length', () => {
    renderSummary(withSummary({ enabled: true }));

    expect(screen.getByLabelText('System prompt')).toHaveAttribute('maxLength', String(MAX_SUMMARY_PROMPT_CHARS));
  });

  it('keeps typed prompt text local until the field loses focus', () => {
    const { onSettingsChange } = renderSummary(withSummary({ enabled: true, systemPrompt: 'Old prompt' }));
    const prompt = screen.getByLabelText('System prompt');

    fireEvent.change(prompt, { target: { value: 'New' } });
    fireEvent.change(prompt, { target: { value: 'New prompt' } });
    expect(onSettingsChange).not.toHaveBeenCalled();
    expect(prompt).toHaveValue('New prompt');

    fireEvent.blur(prompt);
    expect(onSettingsChange).toHaveBeenCalledTimes(1);
    expect(onSettingsChange).toHaveBeenCalledWith({
      summary: expect.objectContaining({ systemPrompt: 'New prompt', enabled: true })
    });
  });

  it('does not write settings on blur when the prompt is unchanged', () => {
    const { onSettingsChange } = renderSummary(withSummary({ enabled: true, systemPrompt: 'Same' }));

    fireEvent.focus(screen.getByLabelText('System prompt'));
    fireEvent.blur(screen.getByLabelText('System prompt'));

    expect(onSettingsChange).not.toHaveBeenCalled();
  });

  it('shows the default prompt again after a blank prompt is committed', () => {
    const { onSettingsChange } = renderSummary(withSummary({ enabled: true, systemPrompt: 'Custom' }));
    const prompt = screen.getByLabelText('System prompt');

    fireEvent.change(prompt, { target: { value: '   ' } });
    fireEvent.blur(prompt);

    expect(onSettingsChange).toHaveBeenCalledWith({
      summary: expect.objectContaining({ systemPrompt: '' })
    });
    expect(screen.getByLabelText('System prompt')).toHaveValue(DEFAULT_SUMMARY_PROMPT);
  });

  it('resets the prompt to the default with one patch', () => {
    const { onSettingsChange } = renderSummary(withSummary({ enabled: true, systemPrompt: 'Custom prompt' }));

    fireEvent.click(screen.getByRole('button', { name: 'Reset to default' }));

    expect(onSettingsChange).toHaveBeenCalledWith({
      summary: expect.objectContaining({ systemPrompt: DEFAULT_SUMMARY_PROMPT })
    });
  });

  it('disables reset when the prompt already is the default', () => {
    renderSummary(withSummary({ enabled: true, systemPrompt: DEFAULT_SUMMARY_PROMPT }));

    expect(screen.getByRole('button', { name: 'Reset to default' })).toBeDisabled();
  });

  it('patches the thinking effort, and sends Default as its own choice', () => {
    const { onSettingsChange } = renderSummary(withSummary({ enabled: true, reasoningEffort: 'default' }));

    fireEvent.change(screen.getByLabelText('Thinking effort'), { target: { value: 'high' } });

    expect(onSettingsChange).toHaveBeenCalledWith({
      summary: expect.objectContaining({ reasoningEffort: 'high', enabled: true })
    });
  });

  it('offers every reasoning level with its translated label', () => {
    renderSummary(withSummary({ enabled: true }));

    const options = Array.from(screen.getByLabelText('Thinking effort').querySelectorAll('option')).map(
      (option) => option.textContent
    );
    expect(options).toEqual([
      'Default (not sent)',
      'None',
      'Minimal',
      'Low',
      'Medium',
      'High',
      'Extra high',
      'Maximum'
    ]);
  });
});
