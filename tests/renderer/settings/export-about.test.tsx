import '@testing-library/jest-dom/vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FfmpegStatus } from '../../../src/shared/types/media';
import { SettingsPage } from '../../../src/renderer/src/pages/SettingsPage';
import { mockSettings } from './mockSettings';
import { renderWithI18n } from '../renderWithI18n';
import { fullFfmpegStatus, installFakeApi, removeFakeApi, updateState } from './fixtures';

afterEach(() => {
  removeFakeApi();
});

const noFolderSettings = { ...mockSettings, defaultOutputFolder: undefined };

function openSection(name: string, props: Partial<Parameters<typeof SettingsPage>[0]> = {}): void {
  renderWithI18n(<SettingsPage settings={noFolderSettings} onLanguageChange={vi.fn()} {...props} />);
  fireEvent.click(screen.getByRole('button', { name }));
}

describe('export section', () => {
  it('shows that the original video is never modified', () => {
    openSection('Export');

    expect(screen.getByText('The original video is never modified.')).toBeInTheDocument();
    expect(screen.queryByLabelText('File name pattern')).not.toBeInTheDocument();
  });

  it('chooses an output folder and stores it', async () => {
    const selectOutputFolder = vi.fn().mockResolvedValue({ outputFolder: '/home/bojan/Exports' });
    installFakeApi({ export: { selectOutputFolder } });
    const onSettingsChange = vi.fn();
    openSection('Export', { onSettingsChange });

    expect(screen.getByText('Same folder as the video')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Choose folder' }));

    await waitFor(() => expect(onSettingsChange).toHaveBeenCalledWith({ defaultOutputFolder: '/home/bojan/Exports' }));
    expect(selectOutputFolder).toHaveBeenCalledTimes(1);
  });

  it('leaves the folder alone when the picker is cancelled', async () => {
    installFakeApi({ export: { selectOutputFolder: vi.fn().mockResolvedValue(null) } });
    const onSettingsChange = vi.fn();
    openSection('Export', { onSettingsChange });

    fireEvent.click(screen.getByRole('button', { name: 'Choose folder' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Choose folder' })).toBeEnabled());
    expect(onSettingsChange).not.toHaveBeenCalled();
  });

  it('clears a chosen folder back to same-folder by sending an empty string', () => {
    const onSettingsChange = vi.fn();
    renderWithI18n(
      <SettingsPage settings={mockSettings} onLanguageChange={vi.fn()} onSettingsChange={onSettingsChange} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));

    expect(screen.getByText('~/Videos/Tajtlisha exports')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(onSettingsChange).toHaveBeenCalledWith({ defaultOutputFolder: '' });
  });

  it('disables Clear when no folder is set', () => {
    openSection('Export');

    expect(screen.getByRole('button', { name: 'Clear' })).toBeDisabled();
  });

  it('patches the default outputs, burned-in track and overwrite policy', () => {
    const onSettingsChange = vi.fn();
    openSection('Export', { onSettingsChange });

    fireEvent.click(screen.getByLabelText('Original SRT'));
    expect(onSettingsChange).toHaveBeenLastCalledWith({
      exportDefaults: expect.objectContaining({ exportOriginalSrt: false })
    });

    fireEvent.click(screen.getByRole('button', { name: 'Original' }));
    expect(onSettingsChange).toHaveBeenLastCalledWith({
      exportDefaults: expect.objectContaining({ defaultBurnedInTrack: 'original' })
    });

    fireEvent.click(screen.getByRole('button', { name: 'Create copies' }));
    expect(onSettingsChange).toHaveBeenLastCalledWith({
      exportDefaults: expect.objectContaining({ overwritePolicy: 'create_copy' })
    });
  });
});

describe('about section', () => {
  function aboutApi(options: {
    info?: { isPackaged: boolean; platform?: string };
    state?: ReturnType<typeof updateState>;
    ffmpeg?: FfmpegStatus | Error;
    onDownload?: () => void;
    onInstall?: () => void;
    onCheck?: () => void;
    onOpenRepository?: () => void;
  }): Record<string, unknown> {
    const state = options.state ?? updateState({ status: 'idle' });
    const ffmpeg = options.ffmpeg ?? fullFfmpegStatus;
    return {
      app: {
        getInfo: async () => ({
          version: '0.2.0',
          platform: options.info?.platform ?? 'linux',
          isPackaged: options.info?.isPackaged ?? true
        }),
        setZoomFactor: () => undefined,
        openRepository: async () => {
          options.onOpenRepository?.();
        }
      },
      updates: {
        getState: async () => state,
        check: async () => {
          options.onCheck?.();
          return state;
        },
        download: async () => {
          options.onDownload?.();
          return state;
        },
        install: async () => {
          options.onInstall?.();
        },
        onState: () => () => undefined
      },
      media: {
        getFfmpegStatus: async () => {
          if (ffmpeg instanceof Error) {
            throw ffmpeg;
          }
          return ffmpeg;
        }
      }
    };
  }

  it('turns the automatic update check off through the switch without checking', async () => {
    const onCheck = vi.fn();
    installFakeApi(aboutApi({ onCheck }));
    const onSettingsChange = vi.fn();
    openSection('About', { onSettingsChange });

    const toggle = await screen.findByRole('switch', { name: 'Check for updates automatically' });
    expect(toggle).toBeChecked();
    fireEvent.click(toggle);

    expect(onSettingsChange).toHaveBeenCalledWith({ autoCheckUpdates: false });
    expect(onCheck).not.toHaveBeenCalled();
  });

  it('checks right away when the automatic update check is turned on', async () => {
    const onCheck = vi.fn();
    installFakeApi(aboutApi({ onCheck }));
    const onSettingsChange = vi.fn();
    openSection('About', { onSettingsChange, settings: { ...noFolderSettings, autoCheckUpdates: false } });

    const toggle = await screen.findByRole('switch', { name: 'Check for updates automatically' });
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);

    expect(onSettingsChange).toHaveBeenCalledWith({ autoCheckUpdates: true });
    await waitFor(() => expect(onCheck).toHaveBeenCalledTimes(1));
  });

  it('shows the version and a readable platform name', async () => {
    installFakeApi(aboutApi({}));
    openSection('About');

    expect(await screen.findByText('0.2.0')).toBeInTheDocument();
    expect(screen.getByText('Linux')).toBeInTheDocument();
  });

  it('shows the author and opens the repository through the app bridge', async () => {
    const onOpenRepository = vi.fn();
    installFakeApi(aboutApi({ onOpenRepository }));
    openSection('About');

    expect(await screen.findByText('Bojan')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /github\.com\/blonestar\/tajtlisha/ }));

    await waitFor(() => expect(onOpenRepository).toHaveBeenCalledTimes(1));
  });

  it('offers Download when an update is available and shows the release notes', async () => {
    const onDownload = vi.fn();
    installFakeApi(
      aboutApi({
        state: updateState({ status: 'available', availableVersion: '0.3.0', releaseNotes: 'Faster export.' }),
        onDownload
      })
    );
    openSection('About');

    expect(await screen.findByText('Version 0.3.0 is available.')).toBeInTheDocument();
    expect(screen.getByText('Faster export.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));

    await waitFor(() => expect(onDownload).toHaveBeenCalledTimes(1));
  });

  it('offers Install and restart once the update is downloaded', async () => {
    const onInstall = vi.fn();
    installFakeApi(aboutApi({ state: updateState({ status: 'downloaded', availableVersion: '0.3.0' }), onInstall }));
    openSection('About');

    fireEvent.click(await screen.findByRole('button', { name: 'Install and restart' }));

    await waitFor(() => expect(onInstall).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('button', { name: 'Download' })).not.toBeInTheDocument();
  });

  it('shows download progress as a progress bar', async () => {
    installFakeApi(aboutApi({ state: updateState({ status: 'downloading', availableVersion: '0.3.0', downloadProgress: 0.42 }) }));
    openSection('About');

    const bar = await screen.findByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '42');
    expect(screen.getByText('Downloading version 0.3.0… 42%')).toBeInTheDocument();
  });

  it('offers Check for updates when up to date and runs the check', async () => {
    const onCheck = vi.fn();
    installFakeApi(aboutApi({ state: updateState({ status: 'not_available' }), onCheck }));
    openSection('About');

    expect(await screen.findByText('You have the latest version.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Check for updates' }));

    await waitFor(() => expect(onCheck).toHaveBeenCalledTimes(1));
  });

  it('explains that a development build cannot update', async () => {
    installFakeApi(aboutApi({ info: { isPackaged: false }, state: updateState({ status: 'unsupported' }) }));
    openSection('About');

    expect(await screen.findByText('Updates are not available in a development build.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Check for updates' })).not.toBeInTheDocument();
  });

  it('explains that a .deb install must be reinstalled from the releases page', async () => {
    installFakeApi(aboutApi({ info: { isPackaged: true }, state: updateState({ status: 'unsupported' }) }));
    openSection('About');

    expect(await screen.findByText(/comes from a Debian package/)).toBeInTheDocument();
    expect(screen.getByText(/releases page/)).toBeInTheDocument();
  });

  it('lists the missing FFmpeg parts with a hint', async () => {
    installFakeApi(
      aboutApi({
        ffmpeg: {
          available: false,
          path: '/usr/bin/ffmpeg',
          version: 'ffmpeg version 6.1',
          missing: ['subtitles filter'],
          capabilities: { ffprobe: true, assFilter: false, libx264: true, aac: true, mp3: false }
        }
      })
    );
    openSection('About');

    expect(await screen.findByText(/^Missing: Subtitle burning, Audio encoder\./)).toBeInTheDocument();
    expect(screen.getByText('ffmpeg version 6.1')).toBeInTheDocument();
    expect(screen.getAllByText('Missing')).toHaveLength(2);
    expect(screen.getAllByText('Available')).toHaveLength(3);
  });

  it('re-checks FFmpeg when asked', async () => {
    const getFfmpegStatus = vi.fn(async () => fullFfmpegStatus);
    installFakeApi({
      ...aboutApi({}),
      media: { getFfmpegStatus }
    });
    openSection('About');

    expect(await screen.findByText('FFmpeg is ready for export.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }));

    await waitFor(() => expect(getFfmpegStatus).toHaveBeenCalledTimes(2));
  });

  it('says when FFmpeg status cannot be read', async () => {
    installFakeApi(aboutApi({ ffmpeg: new Error('timeout') }));
    openSection('About');

    expect(await screen.findByText('FFmpeg status could not be read.')).toBeInTheDocument();
  });
});
