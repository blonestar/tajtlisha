import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UpdateState } from '../../../src/shared/types/updates';
import { UpdateButton } from '../../../src/renderer/src/components/shell/UpdateButton';
import { installFakeApi, removeFakeApi, updateState } from '../settings/fixtures';
import { renderWithI18n } from '../renderWithI18n';

afterEach(() => {
  cleanup();
  removeFakeApi();
});

type Listener = (state: UpdateState) => void;

/** Installs an updates API whose state can be pushed from the test through onState. */
function installUpdates(initial: UpdateState) {
  let listener: Listener = () => undefined;
  const updates = {
    getState: vi.fn(async () => initial),
    check: vi.fn(async () => initial),
    download: vi.fn(async () => initial),
    install: vi.fn(async () => undefined),
    onState: vi.fn((next: Listener) => {
      listener = next;
      return () => undefined;
    })
  };
  installFakeApi({ updates });
  return {
    updates,
    push: (state: UpdateState) => act(() => listener(state))
  };
}

/** Waits until the hook has read the initial state. */
async function settle(updates: { getState: ReturnType<typeof vi.fn> }): Promise<void> {
  await waitFor(() => expect(updates.getState).toHaveBeenCalled());
  await act(async () => undefined);
}

describe('UpdateButton', () => {
  it('renders nothing when no update is pending', async () => {
    const { updates } = installUpdates(updateState({ status: 'not_available' }));
    const { container } = renderWithI18n(<UpdateButton />);

    await settle(updates);

    expect(container).toBeEmptyDOMElement();
  });

  it('offers the available version and starts the download on click', async () => {
    const { updates } = installUpdates(updateState({ status: 'available', availableVersion: '0.3.0' }));
    renderWithI18n(<UpdateButton />);

    const button = await screen.findByRole('button', { name: 'Update 0.3.0' });
    expect(button).toHaveAttribute('title', 'Version 0.3.0 is available. Click to download it.');
    expect(button).toBeEnabled();

    fireEvent.click(button);

    await waitFor(() => expect(updates.download).toHaveBeenCalledTimes(1));
  });

  it('shows the download percentage and cannot be clicked while downloading', async () => {
    const { updates } = installUpdates(
      updateState({ status: 'downloading', availableVersion: '0.3.0', downloadProgress: 0.42 })
    );
    renderWithI18n(<UpdateButton />);

    const button = await screen.findByRole('button', { name: 'Downloading 42%' });
    expect(button).toBeDisabled();

    fireEvent.click(button);
    expect(updates.download).not.toHaveBeenCalled();
    expect(updates.install).not.toHaveBeenCalled();
  });

  it('restarts and installs once the update is downloaded', async () => {
    const { updates } = installUpdates(updateState({ status: 'downloaded', availableVersion: '0.3.0' }));
    renderWithI18n(<UpdateButton />);

    const button = await screen.findByRole('button', { name: 'Restart to update' });
    expect(button).toHaveAttribute('title', 'Version 0.3.0 is downloaded. Click to restart and install it.');

    fireEvent.click(button);

    await waitFor(() => expect(updates.install).toHaveBeenCalledTimes(1));
    expect(updates.download).not.toHaveBeenCalled();
  });

  it('follows state pushed through onState from hidden to available to downloaded', async () => {
    const { updates, push } = installUpdates(updateState({ status: 'not_available' }));
    renderWithI18n(<UpdateButton />);
    await settle(updates);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    push(updateState({ status: 'available', availableVersion: '0.4.0' }));
    expect(await screen.findByRole('button', { name: 'Update 0.4.0' })).toBeInTheDocument();

    push(updateState({ status: 'downloaded', availableVersion: '0.4.0', downloadProgress: 1 }));
    expect(await screen.findByRole('button', { name: 'Restart to update' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Update 0.4.0' })).not.toBeInTheDocument();
  });

  it('offers a retry after a failed download and hides after a failed check', async () => {
    const { updates, push } = installUpdates(
      updateState({ status: 'error', availableVersion: '0.3.0', message: 'socket hang up' })
    );
    renderWithI18n(<UpdateButton />);

    const button = await screen.findByRole('button', { name: 'Retry update 0.3.0' });
    expect(button).toHaveAttribute('title', 'socket hang up');
    fireEvent.click(button);
    await waitFor(() => expect(updates.download).toHaveBeenCalledTimes(1));

    push(updateState({ status: 'error', message: 'offline' }));
    await waitFor(() => expect(screen.queryByRole('button')).not.toBeInTheDocument());
  });
});
