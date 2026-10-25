import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../src/renderer/src/App';
import { caption, makeProject, SOURCE } from './editor/fixtures';
import { createWindowApi, type FakeWindowApi } from './editor/fakeWindowApi';

function installApi(fake: FakeWindowApi): void {
  window.tajtlisha = fake.api;
}

/** The AI toolbar. Its buttons share names with the step indicator, so queries stay inside it. */
async function aiPanel(): Promise<HTMLElement> {
  return waitFor(() => {
    const panel = document.querySelector<HTMLElement>('.generate-panel');
    expect(panel).not.toBeNull();
    return panel as HTMLElement;
  });
}

afterEach(() => {
  delete (window as { tajtlisha?: unknown }).tajtlisha;
});

describe('App shell', () => {
  let fake: FakeWindowApi;

  beforeEach(() => {
    fake = createWindowApi();
    installApi(fake);
  });

  it('loads the last project and shows its captions and clip name', async () => {
    render(<App />);

    expect(await screen.findByDisplayValue('Zdravo svima')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Danas idemo na more')).toBeInTheDocument();
    expect(document.querySelector('.topbar-clip')?.textContent).toBe('intro.mp4');
  });

  it('keeps the project mounted while Settings is open', async () => {
    render(<App />);
    await screen.findByDisplayValue('Zdravo svima');

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(await screen.findByRole('dialog', { name: 'Settings' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close settings' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Settings' })).not.toBeInTheDocument());
    expect(screen.getByDisplayValue('Zdravo svima')).toBeInTheDocument();
  });

  it('shows the empty state with Open video and the FFmpeg status when no clip is open', async () => {
    fake = createWindowApi({ project: null });
    installApi(fake);
    render(<App />);

    const card = await waitFor(() => {
      const element = document.querySelector<HTMLElement>('.empty-card');
      expect(element).not.toBeNull();
      return element as HTMLElement;
    });
    expect(within(card).getByRole('button', { name: 'Open video' })).toBeInTheDocument();
    expect(within(card).getByText('or drag a video file here')).toBeInTheDocument();
    expect(within(card).getByText('FFmpeg is ready')).toBeInTheDocument();
  });

  it('shows a blocking error with retry when settings cannot load', async () => {
    fake.api.settings.get = () => Promise.reject(new Error('settings file is locked'));
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Settings could not be loaded' })).toBeInTheDocument();
    expect(screen.getByText('settings file is locked')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('asks for the video when the saved file is missing and relinks it without dropping captions', async () => {
    fake = createWindowApi();
    fake.loadLast.mockResolvedValueOnce({ project: makeProject(), sourceStatus: 'missing' });
    installApi(fake);
    fake.selectVideo.mockResolvedValueOnce({ ...SOURCE, inputPath: '/clips/moved.mp4', fileUrl: 'tajtlisha-media://moved' });
    render(<App />);

    expect(await screen.findByText('The video file was moved or changed.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Find video' }));

    await waitFor(() => expect(screen.queryByText('The video file was moved or changed.')).toBeNull());
    expect(screen.getByDisplayValue('Zdravo svima')).toBeInTheDocument();
    expect(document.querySelector('.topbar-clip')?.textContent).toBe('moved.mp4');
  });

  it('transcribes into empty captions and sends the line limit for the frame', async () => {
    fake = createWindowApi({ project: makeProject({ captions: [] }) });
    installApi(fake);
    fake.transcribe.mockResolvedValueOnce({
      language: 'sr-Latn',
      captions: [caption('t1', 0, 2000, 'Novi titl')],
      timingSource: 'word'
    });
    render(<App />);

    fireEvent.click(within(await aiPanel()).getByRole('button', { name: 'Transcribe' }));

    expect(await screen.findByDisplayValue('Novi titl')).toBeInTheDocument();
    expect(fake.transcribe).toHaveBeenCalledWith(
      expect.objectContaining({
        inputPath: SOURCE.inputPath,
        trim: { startMs: 0, endMs: 12000 },
        providerId: 'openai',
        modelId: 'whisper-1',
        language: 'sr-Latn',
        maxCharsPerLine: expect.any(Number),
        maxLinesPerCaption: 2
      })
    );
  });

  it('ignores a transcription that finished after the video was replaced', async () => {
    fake = createWindowApi({ project: makeProject({ captions: [] }) });
    installApi(fake);
    let finish: (value: unknown) => void = () => undefined;
    fake.transcribe.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    fake.selectVideo.mockResolvedValueOnce({ ...SOURCE, inputPath: '/clips/other.mp4', fileUrl: 'tajtlisha-media://other' });
    render(<App />);

    fireEvent.click(within(await aiPanel()).getByRole('button', { name: 'Transcribe' }));
    await waitFor(() => expect(fake.transcribe).toHaveBeenCalled());

    // The project has a video, so opening another one asks first.
    fireEvent.click(screen.getByRole('button', { name: 'Open video' }));
    const dialog = await screen.findByRole('dialog', { name: 'Open another video?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Open video' }));
    await waitFor(() => expect(fake.selectVideo).toHaveBeenCalled());

    finish({ language: 'sr-Latn', captions: [caption('t1', 0, 2000, 'Stari titl')], timingSource: 'word' });

    expect(
      await screen.findByText('The project or video changed while the job ran. The result was not applied.')
    ).toBeInTheDocument();
    expect(screen.queryByDisplayValue('Stari titl')).toBeNull();
  });

  it('shows the AppError message for a failed job and keeps the detail expandable', async () => {
    fake.transcribe.mockRejectedValueOnce(
      new Error("Error invoking remote method 'workflow:transcribe': Error: [PROVIDER_AUTH_FAILED] Invalid key")
    );
    render(<App />);
    await screen.findByDisplayValue('Zdravo svima');

    fireEvent.click(within(await aiPanel()).getByRole('button', { name: 'Transcribe again' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Transcribe' }));

    expect(
      await screen.findByText('The AI provider rejected the API key. Check it in Settings.')
    ).toBeInTheDocument();
    expect(screen.getByText('Details')).toBeInTheDocument();
    expect(screen.getByText('Invalid key')).toBeInTheDocument();
  });

  it('exports with the trim, languages and outputs from the project and shows the created files', async () => {
    render(<App />);
    await screen.findByDisplayValue('Zdravo svima');

    fireEvent.click(screen.getByTitle('Export (Ctrl+E)'));
    const dialog = await screen.findByRole('dialog', { name: 'Export subtitles' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Export' }));

    await waitFor(() =>
      expect(fake.exportProject).toHaveBeenCalledWith(
        expect.objectContaining({
          inputPath: SOURCE.inputPath,
          outputFolder: '/exports',
          baseName: 'intro',
          videoWidth: 720,
          videoHeight: 1280,
          trim: { startMs: 0, endMs: 12000 },
          sourceLanguage: 'sr-Latn',
          targetLanguage: 'en',
          outputs: { originalSrt: true, translationSrt: true, video: 'translation' },
          overwritePolicy: 'ask',
          jobId: expect.any(String)
        })
      )
    );
    const created = await within(dialog).findByRole('region', { name: 'Created files' });
    expect(within(created).getByText('intro.sr-Latn.srt')).toBeInTheDocument();
    expect(within(created).getByText('intro.en.srt')).toBeInTheDocument();
  });

  it('undoes with Ctrl+Z outside text fields but not inside a textarea', async () => {
    render(<App />);
    await screen.findByDisplayValue('Zdravo svima');

    fireEvent.click(screen.getAllByRole('button', { name: 'Delete caption' })[0]);
    await waitFor(() => expect(screen.queryByDisplayValue('Zdravo svima')).toBeNull());

    fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true });
    expect(await screen.findByDisplayValue('Zdravo svima')).toBeInTheDocument();

    // Inside a text field the native undo keeps working, so the project must not undo again.
    fireEvent.keyDown(screen.getByDisplayValue('Danas idemo na more'), { key: 'z', ctrlKey: true });
    expect(screen.getByDisplayValue('Zdravo svima')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Danas idemo na more')).toBeInTheDocument();
  });
});
