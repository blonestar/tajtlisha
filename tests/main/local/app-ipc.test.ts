/* @vitest-environment node */
import { describe, expect, it, vi } from 'vitest';
import { registerAppIpc } from '../../../src/main/ipc/app.ipc';
import type { IpcEvent } from '../../../src/main/ipc/types';
import { REPOSITORY_URL } from '../../../src/shared/app-links';
import { IPC_CHANNELS } from '../../../src/shared/types/ipc';

vi.mock('electron', () => ({ app: {} }));

type Handler = (event: IpcEvent, ...args: unknown[]) => unknown;

describe('app IPC', () => {
  it('opens only the fixed repository URL, whatever the renderer sends', async () => {
    const handlers = new Map<string, Handler>();
    const openExternal = vi.fn(async () => undefined);
    registerAppIpc({
      ipc: { handle: (channel, listener) => handlers.set(channel, listener) },
      quit: { acknowledge: vi.fn() },
      openExternal
    });

    const handler = handlers.get(IPC_CHANNELS.appOpenRepository);
    expect(handler).toBeDefined();
    await handler?.({ sender: { id: 1, send: vi.fn() } }, 'https://example.com/evil');

    expect(openExternal).toHaveBeenCalledTimes(1);
    expect(openExternal).toHaveBeenCalledWith(REPOSITORY_URL);
  });
});
