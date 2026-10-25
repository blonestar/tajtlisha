import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../../src/renderer/src/App';
import { createWindowApi, type FakeWindowApi } from '../editor/fakeWindowApi';

// Drops are dispatched on window, where useFileDrop listens. Events bubble there from any element.
function dropFiles(files: File[]): void {
  fireEvent.drop(window, { dataTransfer: { files, types: ['Files'] } });
}

function dragFilesOver(): void {
  fireEvent.dragEnter(window, { dataTransfer: { files: [], types: ['Files'] } });
}

function confirmDialog(): HTMLElement | null {
  return screen.queryByRole('dialog', { name: 'Open another video?' });
}

function clipName(): string | null | undefined {
  return document.querySelector('.topbar-clip')?.textContent;
}

afterEach(() => {
  delete (window as { tajtlisha?: unknown }).tajtlisha;
});

describe('drag and drop to open a video', () => {
  let fake: FakeWindowApi;

  beforeEach(() => {
    fake = createWindowApi();
    window.tajtlisha = fake.api;
  });

  it('opens a dropped video without asking when no project is open', async () => {
    fake = createWindowApi({ project: null });
    window.tajtlisha = fake.api;
    render(<App />);
    await screen.findByText('Start with a clip');

    const file = new File([''], 'clip.mp4');
    dropFiles([file]);

    await waitFor(() => expect(fake.openDroppedVideo).toHaveBeenCalledWith(file));
    await waitFor(() => expect(clipName()).toBe('clip.mp4'));
    expect(confirmDialog()).toBeNull();
  });

  it('asks before replacing a loaded project and keeps it on Cancel', async () => {
    render(<App />);
    await screen.findByDisplayValue('Zdravo svima');

    dropFiles([new File([''], 'next.mp4')]);

    const dialog = await screen.findByRole('dialog', { name: 'Open another video?' });
    expect(
      within(dialog).getByText('The current video, its 2 captions and their translations will be discarded.')
    ).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(confirmDialog()).toBeNull());
    expect(fake.openDroppedVideo).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue('Zdravo svima')).toBeInTheDocument();
    expect(clipName()).toBe('intro.mp4');
  });

  it('opens the dropped video after the user confirms replacing the project', async () => {
    render(<App />);
    await screen.findByDisplayValue('Zdravo svima');

    const file = new File([''], 'next.mp4');
    dropFiles([file]);
    const dialog = await screen.findByRole('dialog', { name: 'Open another video?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Open video' }));

    await waitFor(() => expect(fake.openDroppedVideo).toHaveBeenCalledWith(file));
    await waitFor(() => expect(clipName()).toBe('next.mp4'));
    expect(screen.queryByDisplayValue('Zdravo svima')).toBeNull();
  });

  it('shows an error for a file that is not a video and does not ask or open anything', async () => {
    render(<App />);
    await screen.findByDisplayValue('Zdravo svima');

    dropFiles([new File(['text'], 'notes.txt')]);

    expect(await screen.findByText('Only video files can be opened (MP4, M4V, MOV, MKV, WebM).')).toBeInTheDocument();
    expect(confirmDialog()).toBeNull();
    expect(fake.openDroppedVideo).not.toHaveBeenCalled();
    expect(clipName()).toBe('intro.mp4');
  });

  it('shows the drop overlay while files are dragged over the window and hides it on drop', async () => {
    render(<App />);
    await screen.findByDisplayValue('Zdravo svima');
    expect(screen.queryByText('Drop the video to open it')).toBeNull();

    // A drag of plain text is not a file drop and shows nothing.
    fireEvent.dragEnter(window, { dataTransfer: { files: [], types: ['text/plain'] } });
    expect(screen.queryByText('Drop the video to open it')).toBeNull();

    dragFilesOver();
    expect(await screen.findByText('Drop the video to open it')).toBeInTheDocument();
    expect(screen.getByText('The current project will be replaced after you confirm.')).toBeInTheDocument();

    dropFiles([new File([''], 'next.mp4')]);
    await waitFor(() => expect(screen.queryByText('Drop the video to open it')).toBeNull());
    const dialog = await screen.findByRole('dialog', { name: 'Open another video?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  });

  it('shows no overlay while the empty state has no project and the drop is enabled', async () => {
    fake = createWindowApi({ project: null });
    window.tajtlisha = fake.api;
    render(<App />);
    await screen.findByText('Start with a clip');

    dragFilesOver();

    expect(await screen.findByText('Drop the video to open it')).toBeInTheDocument();
    expect(screen.queryByText('The current project will be replaced after you confirm.')).toBeNull();
  });
});
