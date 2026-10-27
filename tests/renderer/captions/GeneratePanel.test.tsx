import { fireEvent, screen, cleanup, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GeneratePanel,
  type GeneratePanelProps
} from '../../../src/renderer/src/components/workflow/GeneratePanel';
import { renderWithI18n } from '../renderWithI18n';

const connectedProvider = {
  id: 'openai',
  displayName: 'OpenAI',
  connected: true,
  canTranscribe: true,
  canTranslate: true,
  canSummarize: true
};

function props(overrides: Partial<GeneratePanelProps> = {}): GeneratePanelProps {
  return {
    hasSource: true,
    hasAudio: true,
    videoContext: '',
    onVideoContextChange: vi.fn(),
    provider: connectedProvider,
    sourceLanguage: 'auto',
    targetLanguage: 'sr-Latn',
    captionCount: 0,
    rowsNeedingTranslation: 0,
    busy: false,
    onSourceLanguageChange: vi.fn(),
    onTargetLanguageChange: vi.fn(),
    onTranscribe: vi.fn(),
    onTranslate: vi.fn(),
    onOpenSettings: vi.fn(),
    ...overrides
  };
}

afterEach(cleanup);

describe('GeneratePanel', () => {
  it('offers the added Asian languages for source and target', () => {
    renderWithI18n(<GeneratePanel {...props()} />);

    const [source, target] = screen.getAllByRole('combobox');
    for (const select of [source, target]) {
      const labels = Array.from((select as HTMLSelectElement).options).map((option) => option.text);
      expect(labels).toEqual(expect.arrayContaining(['Indonesian', 'Japanese', 'Chinese (Simplified)', 'Korean', 'Thai', 'Hindi']));
    }
  });

  it('shows a detected language that is not in the list instead of auto-detect', () => {
    renderWithI18n(<GeneratePanel {...props({ sourceLanguage: 'ms' })} />);

    const source = screen.getAllByRole('combobox')[0] as HTMLSelectElement;
    expect(source.value).toBe('ms');
    expect(source.options[source.selectedIndex].text).toBe('Malay');
  });

  it('enables transcription when the video, audio and provider are ready', () => {
    const onTranscribe = vi.fn();
    renderWithI18n(<GeneratePanel {...props({ onTranscribe })} />);

    const button = screen.getByRole('button', { name: 'Transcribe' });
    expect(button).toBeEnabled();
    expect(screen.getByText('OpenAI')).toBeTruthy();
    expect(screen.getByText('Connected')).toBeTruthy();

    fireEvent.click(button);
    expect(onTranscribe).toHaveBeenCalledTimes(1);
  });

  it('explains why transcription is disabled when there is no video', () => {
    renderWithI18n(<GeneratePanel {...props({ hasSource: false, hasAudio: false })} />);

    expect(screen.getByRole('button', { name: 'Transcribe' })).toBeDisabled();
    expect(screen.getByText('Open a video first')).toBeTruthy();
  });

  it('explains when the video has no audio track', () => {
    renderWithI18n(<GeneratePanel {...props({ hasAudio: false })} />);

    expect(screen.getByRole('button', { name: 'Transcribe' })).toBeDisabled();
    expect(screen.getByText('This video has no audio track')).toBeTruthy();
  });

  it('asks for a provider and offers Open Settings when none is selected', () => {
    const onOpenSettings = vi.fn();
    renderWithI18n(<GeneratePanel {...props({ provider: null, onOpenSettings })} />);

    expect(screen.getByText('No AI provider selected')).toBeTruthy();
    expect(screen.getByText('Choose an AI provider in Settings')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Open Settings' }));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it('names a provider that is not connected and offers Open Settings', () => {
    const onOpenSettings = vi.fn();
    renderWithI18n(
      <GeneratePanel
        {...props({
          provider: { ...connectedProvider, connected: false },
          captionCount: 2,
          rowsNeedingTranslation: 2,
          onOpenSettings
        })}
      />
    );

    expect(screen.getByText('Not connected')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Transcribe again' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Translate 2 rows' })).toBeDisabled();
    expect(screen.getAllByText('Connect OpenAI in Settings first')).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Open Settings' }));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it('explains when the provider cannot transcribe', () => {
    renderWithI18n(
      <GeneratePanel {...props({ provider: { ...connectedProvider, displayName: 'OpenRouter', canTranscribe: false } })} />
    );

    expect(screen.getByRole('button', { name: 'Transcribe' })).toBeDisabled();
    expect(screen.getByText('OpenRouter cannot transcribe audio')).toBeTruthy();
  });

  it('switches the transcribe label once captions exist', () => {
    renderWithI18n(<GeneratePanel {...props({ captionCount: 3 })} />);

    expect(screen.getByRole('button', { name: 'Transcribe again' })).toBeEnabled();
  });

  it('asks to transcribe first when translating without captions', () => {
    renderWithI18n(<GeneratePanel {...props({ captionCount: 0 })} />);

    expect(screen.getByRole('button', { name: 'Translate' })).toBeDisabled();
    expect(screen.getByText('Transcribe the clip first')).toBeTruthy();
  });

  it('shows the number of rows that need translation', () => {
    const onTranslate = vi.fn();
    renderWithI18n(<GeneratePanel {...props({ captionCount: 12, rowsNeedingTranslation: 12, onTranslate })} />);

    const button = screen.getByRole('button', { name: 'Translate 12 rows' });
    expect(button).toBeEnabled();

    fireEvent.click(button);
    expect(onTranslate).toHaveBeenCalledTimes(1);
  });

  it('disables translate again when every row is up to date and says so', () => {
    renderWithI18n(<GeneratePanel {...props({ captionCount: 4, rowsNeedingTranslation: 0 })} />);

    expect(screen.getByRole('button', { name: 'Translate again' })).toBeDisabled();
    expect(screen.getByText('Every row is translated and up to date')).toBeTruthy();
  });

  it('disables both actions while a job runs and says why', () => {
    renderWithI18n(<GeneratePanel {...props({ busy: true, captionCount: 2, rowsNeedingTranslation: 2 })} />);

    expect(screen.getByRole('button', { name: 'Transcribe again' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Translate 2 rows' })).toBeDisabled();
    expect(screen.getAllByText('Wait for the current job to finish')).toHaveLength(2);
  });

  it('warns that timing is approximate for speech detection', () => {
    renderWithI18n(<GeneratePanel {...props({ timingSource: 'speech_detection' })} />);

    expect(screen.getByText('Timing is approximate')).toBeTruthy();
  });

  it('does not show the approximate warning for word timing', () => {
    renderWithI18n(<GeneratePanel {...props({ timingSource: 'word' })} />);

    expect(screen.queryByText('Timing is approximate')).toBeNull();
  });

  it('reports language changes for source and target', () => {
    const onSourceLanguageChange = vi.fn();
    const onTargetLanguageChange = vi.fn();
    renderWithI18n(
      <GeneratePanel {...props({ onSourceLanguageChange, onTargetLanguageChange })} />
    );

    const source = screen.getByRole('combobox', { name: 'Spoken language' });
    const target = screen.getByRole('combobox', { name: 'Translation language' });
    expect(source).toHaveValue('auto');
    expect(target).toHaveValue('sr-Latn');

    fireEvent.change(source, { target: { value: 'de' } });
    fireEvent.change(target, { target: { value: 'en' } });

    expect(onSourceLanguageChange).toHaveBeenCalledWith('de');
    expect(onTargetLanguageChange).toHaveBeenCalledWith('en');
  });

  describe('summary action', () => {
    const summaryProps = (overrides: Partial<GeneratePanelProps> = {}) =>
      props({ summaryEnabled: true, summarizableRows: 2, ...overrides });

    it('is hidden while the video summary is off', () => {
      renderWithI18n(<GeneratePanel {...props({ summaryEnabled: false, summarizableRows: 2 })} />);

      expect(screen.queryByRole('button', { name: 'Summarize' })).not.toBeInTheDocument();
    });

    it('runs the summary when the provider can summarize', () => {
      const onSummarize = vi.fn();
      renderWithI18n(<GeneratePanel {...summaryProps({ onSummarize })} />);

      const button = screen.getByRole('button', { name: 'Summarize' });
      expect(button).toBeEnabled();

      fireEvent.click(button);
      expect(onSummarize).toHaveBeenCalledTimes(1);
    });

    it('relabels the action and offers Show summary once a summary exists', () => {
      const onShowSummary = vi.fn();
      renderWithI18n(<GeneratePanel {...summaryProps({ hasSummary: true, onShowSummary })} />);

      expect(screen.getByRole('button', { name: 'Summarize again' })).toBeEnabled();
      fireEvent.click(screen.getByRole('button', { name: 'Show summary' }));
      expect(onShowSummary).toHaveBeenCalledTimes(1);
    });

    it('does not offer Show summary before a summary exists', () => {
      renderWithI18n(<GeneratePanel {...summaryProps()} />);

      expect(screen.queryByRole('button', { name: 'Show summary' })).not.toBeInTheDocument();
    });

    it('explains when there is no caption text in the trim range', () => {
      renderWithI18n(<GeneratePanel {...summaryProps({ summarizableRows: 0 })} />);

      expect(screen.getByRole('button', { name: 'Summarize' })).toBeDisabled();
      expect(screen.getByText('No caption text inside the trim range')).toBeTruthy();
    });

    it('explains when the provider cannot summarize', () => {
      renderWithI18n(
        <GeneratePanel
          {...summaryProps({ provider: { ...connectedProvider, displayName: 'OpenRouter', canSummarize: false } })}
        />
      );

      expect(screen.getByRole('button', { name: 'Summarize' })).toBeDisabled();
      expect(screen.getByText('OpenRouter cannot summarize')).toBeTruthy();
    });

    it('names a provider that is not connected', () => {
      renderWithI18n(<GeneratePanel {...summaryProps({ provider: { ...connectedProvider, connected: false } })} />);

      expect(screen.getByRole('button', { name: 'Summarize' })).toBeDisabled();
      expect(screen.getAllByText('Connect OpenAI in Settings first').length).toBeGreaterThan(0);
    });

    it('is disabled while another job runs, with the busy reason', () => {
      renderWithI18n(<GeneratePanel {...summaryProps({ busy: true })} />);

      expect(screen.getByRole('button', { name: 'Summarize' })).toBeDisabled();
      expect(screen.getAllByText('Wait for the current job to finish').length).toBeGreaterThan(0);
    });
  });
});

describe('GeneratePanel video context', () => {
  const contextProps = (overrides: Partial<GeneratePanelProps> = {}) => props(overrides);

  it('is disabled only when there is no video', () => {
    renderWithI18n(<GeneratePanel {...contextProps({ hasSource: false, hasAudio: false })} />);

    expect(screen.getByRole('button', { name: 'Video context' })).toBeDisabled();
  });

  it('is enabled while a job runs', () => {
    renderWithI18n(<GeneratePanel {...contextProps({ busy: true })} />);

    expect(screen.getByRole('button', { name: 'Video context' })).toBeEnabled();
  });

  it('shows an accent state and the start of the text when a context is set', () => {
    const text = `Parking attendants in Jakarta. ${'Extra detail. '.repeat(20)}`;
    const { container } = renderWithI18n(<GeneratePanel {...contextProps({ videoContext: text })} />);

    const button = screen.getByRole('button', { name: 'Video context' });
    expect(button).toHaveClass('generate-context-set');
    expect(button.getAttribute('title')).toMatch(/^Video context: Parking attendants in Jakarta\. Extra detail/);
    expect(button.getAttribute('title')?.endsWith('...')).toBe(true);
    expect(container.querySelector('.generate-context-dot')).not.toBeNull();
  });

  it('has no accent state and a hint tooltip when empty', () => {
    const { container } = renderWithI18n(<GeneratePanel {...contextProps()} />);

    const button = screen.getByRole('button', { name: 'Video context' });
    expect(button).not.toHaveClass('generate-context-set');
    expect(button).toHaveAttribute('title', 'Describe what the video is about');
    expect(container.querySelector('.generate-context-dot')).toBeNull();
  });

  it('opens a dialog with the explanation, placeholder and counter', () => {
    renderWithI18n(<GeneratePanel {...contextProps()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Video context' }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('AI uses it to recognize words during transcription, correction and translation.');
    expect(dialog).toHaveTextContent('It is never copied into the captions.');
    expect(screen.getByRole('textbox', { name: 'Video context text' })).toHaveAttribute(
      'placeholder',
      'Example: Street in Jakarta, Indonesia. A parking attendant (tukang parkir) guides drivers and collects parking fees.'
    );
    expect(screen.getByRole('textbox', { name: 'Video context text' })).toHaveAttribute('maxlength', '2000');
    expect(screen.getByText('0 / 2000')).toBeInTheDocument();
  });

  it('counts characters while typing', () => {
    renderWithI18n(<GeneratePanel {...contextProps()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Video context' }));

    fireEvent.change(screen.getByRole('textbox', { name: 'Video context text' }), { target: { value: 'Parking' } });

    expect(screen.getByText('7 / 2000')).toBeInTheDocument();
  });

  it('saves the typed text through the handler and closes', async () => {
    const onVideoContextChange = vi.fn();
    renderWithI18n(<GeneratePanel {...contextProps({ onVideoContextChange })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Video context' }));

    fireEvent.change(screen.getByRole('textbox', { name: 'Video context text' }), {
      target: { value: 'Parking attendants in Jakarta' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onVideoContextChange).toHaveBeenCalledTimes(1);
    expect(onVideoContextChange).toHaveBeenCalledWith('Parking attendants in Jakarta');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('Cancel discards the draft and the next open shows the stored text', async () => {
    const onVideoContextChange = vi.fn();
    renderWithI18n(<GeneratePanel {...contextProps({ videoContext: 'Stored text', onVideoContextChange })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Video context' }));

    fireEvent.change(screen.getByRole('textbox', { name: 'Video context text' }), { target: { value: 'Discarded' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onVideoContextChange).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: 'Video context' }));
    expect(screen.getByRole('textbox', { name: 'Video context text' })).toHaveValue('Stored text');
  });

  it('Esc discards the draft like Cancel', async () => {
    const onVideoContextChange = vi.fn();
    renderWithI18n(<GeneratePanel {...contextProps({ onVideoContextChange })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Video context' }));

    const textarea = screen.getByRole('textbox', { name: 'Video context text' });
    fireEvent.change(textarea, { target: { value: 'Discarded' } });
    fireEvent.keyDown(textarea, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(onVideoContextChange).not.toHaveBeenCalled();
  });

  it('offers Clear only when a context is stored, and clearing saves blank text', async () => {
    const onVideoContextChange = vi.fn();
    const { unmount } = renderWithI18n(<GeneratePanel {...contextProps({ onVideoContextChange })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Video context' }));
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    unmount();

    renderWithI18n(<GeneratePanel {...contextProps({ videoContext: 'Stored text', onVideoContextChange })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Video context' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(onVideoContextChange).toHaveBeenCalledWith('');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
