import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import CircleArrowUp from 'lucide-react/dist/esm/icons/circle-arrow-up.js';
import LoaderCircle from 'lucide-react/dist/esm/icons/loader-circle.js';
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw.js';
import RotateCw from 'lucide-react/dist/esm/icons/rotate-cw.js';
import { userFacingErrorMessage } from '../../utils/error-message';
import { useUpdateState } from '../settings/hooks';

/**
 * Top bar entry for an update that is offered, downloading or ready to install.
 * One button that walks through the flow: download, then restart to install.
 * A failed download offers a retry. Renders nothing in every other state.
 */
export function UpdateButton(): ReactElement | null {
  const { t } = useTranslation();
  const { state, busy, actionError, download, install } = useUpdateState();

  if (!state) {
    return null;
  }

  const version = state.availableVersion ?? '';
  const errorTitle = actionError ? userFacingErrorMessage(actionError, t('settings.about.updateFailed')) : null;

  switch (state.status) {
    case 'available':
      return (
        <button
          type="button"
          className="btn btn-sm btn-update"
          disabled={busy}
          title={errorTitle ?? t('shell.update.availableTitle', { version })}
          onClick={() => void download()}
        >
          <CircleArrowUp aria-hidden="true" size={14} />
          {t('shell.update.available', { version })}
        </button>
      );
    case 'downloading': {
      const percent = Math.round((state.downloadProgress ?? 0) * 100);
      return (
        <button type="button" className="btn btn-sm btn-update is-downloading" disabled>
          <LoaderCircle aria-hidden="true" size={14} />
          {t('shell.update.downloading', { percent })}
        </button>
      );
    }
    case 'downloaded':
      return (
        <button
          type="button"
          className="btn btn-sm btn-primary btn-update"
          disabled={busy}
          title={errorTitle ?? t('shell.update.restartTitle', { version })}
          onClick={() => void install()}
        >
          <RotateCw aria-hidden="true" size={14} />
          {t('shell.update.restart')}
        </button>
      );
    case 'error':
      // Only a failed download keeps the version; a failed check stays in Settings.
      if (!state.availableVersion) {
        return null;
      }
      return (
        <button
          type="button"
          className="btn btn-sm btn-update"
          disabled={busy}
          title={errorTitle ?? state.message ?? t('settings.about.updateFailed')}
          onClick={() => void download()}
        >
          <RefreshCw aria-hidden="true" size={14} />
          {t('shell.update.retry', { version })}
        </button>
      );
    default:
      return null;
  }
}
