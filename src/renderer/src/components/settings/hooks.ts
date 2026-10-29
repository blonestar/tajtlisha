import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type {
  AiProviderCapabilities,
  AiProviderId,
  ProviderModelDescriptor
} from '../../../../shared/types/ai';
import type { FfmpegStatus } from '../../../../shared/types/media';
import type { UpdateState } from '../../../../shared/types/updates';

export type AppInfo = {
  version: string;
  platform: string;
  isPackaged: boolean;
};

export function useAppInfo(): AppInfo | null {
  const [info, setInfo] = useState<AppInfo | null>(null);

  useEffect(() => {
    let active = true;

    window.tajtlisha?.app
      ?.getInfo()
      .then((next) => {
        if (active) {
          setInfo(next);
        }
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, []);

  return info;
}

export function useUpdateState(): {
  state: UpdateState | null;
  busy: boolean;
  actionError: unknown;
  check: () => Promise<void>;
  download: () => Promise<void>;
  install: () => Promise<void>;
} {
  const [state, setState] = useState<UpdateState | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<unknown>(null);

  useEffect(() => {
    const updates = window.tajtlisha?.updates;
    if (!updates) {
      return undefined;
    }

    let active = true;
    const unsubscribe = updates.onState((next) => {
      if (active) {
        setState(next);
      }
    });

    void updates.getState().then(
      (next) => {
        if (active) {
          setState((current) => current ?? next);
        }
      },
      (error: unknown) => {
        if (active) {
          setActionError(error);
        }
      }
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const run = useCallback(async (action: () => Promise<UpdateState | void>): Promise<void> => {
    setBusy(true);
    setActionError(null);
    try {
      const next = await action();
      if (next) {
        setState(next);
      }
    } catch (error) {
      setActionError(error);
    } finally {
      setBusy(false);
    }
  }, []);

  const check = useCallback(() => run(() => window.tajtlisha.updates.check()), [run]);
  const download = useCallback(() => run(() => window.tajtlisha.updates.download()), [run]);
  const install = useCallback(() => run(() => window.tajtlisha.updates.install()), [run]);

  return { state, busy, actionError, check, download, install };
}

export function useFfmpegStatus(): {
  status: FfmpegStatus | null;
  loading: boolean;
  error: boolean;
  check: () => Promise<void>;
} {
  const [status, setStatus] = useState<FfmpegStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const check = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(false);
    try {
      setStatus(await window.tajtlisha.media.getFfmpegStatus());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  return { status, loading, error, check };
}

/**
 * Calls `flush` with the latest draft when the component unmounts. The callback
 * is read at unmount time, so it sees the latest props. Used for text fields
 * that commit on blur, because Esc closes Settings without a blur.
 */
export function useCommitOnUnmount(draft: string, flush: (draft: string) => void): void {
  const latest = useRef({ draft, flush });
  useLayoutEffect(() => {
    latest.current = { draft, flush };
  });
  useEffect(() => () => latest.current.flush(latest.current.draft), []);
}

export type ModelsState = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Model list of one provider for one capability. Idle unless the provider is
 * connected and a list function is given. A failed load is an error state, and
 * the picker still accepts a saved model id.
 */
export function useProviderModels(
  providerId: AiProviderId | undefined,
  capability: keyof AiProviderCapabilities,
  connected: boolean,
  onListModels?: (providerId: AiProviderId, capability: keyof AiProviderCapabilities) => Promise<ProviderModelDescriptor[]>
): { models: ProviderModelDescriptor[]; state: ModelsState } {
  // Results are tagged with the provider and capability they belong to, so a
  // provider switch never shows (or lets the user save) the previous provider's models.
  const key = providerId && connected && onListModels ? `${providerId}:${capability}` : '';
  const [loaded, setLoaded] = useState<{ key: string; models: ProviderModelDescriptor[]; state: ModelsState }>({
    key: '',
    models: [],
    state: 'idle'
  });

  useEffect(() => {
    if (!key || !providerId || !onListModels) {
      return undefined;
    }

    let active = true;
    onListModels(providerId, capability).then(
      (next) => {
        if (active) setLoaded({ key, models: next, state: 'ready' });
      },
      () => {
        if (active) setLoaded({ key, models: [], state: 'error' });
      }
    );

    return () => {
      active = false;
    };
  }, [key, providerId, capability, onListModels]);

  if (!key) return { models: [], state: 'idle' };
  if (loaded.key !== key) return { models: [], state: 'loading' };
  return { models: loaded.models, state: loaded.state };
}
