import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import CircleAlert from 'lucide-react/dist/esm/icons/circle-alert.js';
import CircleCheck from 'lucide-react/dist/esm/icons/circle-check.js';
import FolderOpen from 'lucide-react/dist/esm/icons/folder-open.js';
import { SUPPORTED_FORMATS } from '../../../../shared/video-formats';
import type { FfmpegStatusState } from '../../hooks/useFfmpegStatus';
import { withShortcut } from './TopBar';

export type EmptyStateProps = {
  onOpenVideo: () => void;
  ffmpeg: FfmpegStatusState;
};

function FfmpegStatusRow({ ffmpeg }: { ffmpeg: FfmpegStatusState }): ReactElement {
  const { t } = useTranslation();

  if (ffmpeg.phase === 'checking') {
    return <p className="empty-ffmpeg muted">{t('shell.ffmpeg.checking')}</p>;
  }
  if (ffmpeg.phase === 'unknown') {
    return <p className="empty-ffmpeg muted">{t('shell.ffmpeg.unknown')}</p>;
  }

  const { status } = ffmpeg;
  if (status.available) {
    return (
      <p className="empty-ffmpeg">
        <span className="badge badge-success">
          <CircleCheck aria-hidden="true" size={12} />
          {t('shell.ffmpeg.ready')}
        </span>
        {status.version && <span className="mono muted empty-ffmpeg-version">{status.version}</span>}
      </p>
    );
  }

  return (
    <div className="empty-ffmpeg empty-ffmpeg-missing message message-error" role="alert">
      <span className="badge badge-danger">
        <CircleAlert aria-hidden="true" size={12} />
        {t('shell.ffmpeg.unavailable')}
      </span>
      {status.missing && status.missing.length > 0 && (
        <span>{t('shell.ffmpeg.missing', { items: status.missing.join(', ') })}</span>
      )}
      <span>{t('shell.ffmpeg.hint')}</span>
    </div>
  );
}

/** Nothing is open yet: the one primary action, the flow in three steps, and whether FFmpeg is ready. */
export function EmptyState({ onOpenVideo, ffmpeg }: EmptyStateProps): ReactElement {
  const { t } = useTranslation();

  return (
    <div className="empty-state">
      <section className="empty-card" aria-labelledby="empty-title">
        <h1 id="empty-title" className="empty-title">
          {t('shell.empty.title')}
        </h1>
        <p className="muted empty-lead">{t('shell.empty.lead')}</p>

        <button
          type="button"
          className="btn btn-primary btn-lg empty-open"
          data-step-target="import"
          title={withShortcut(t('shell.top.openVideo'), 'Ctrl+O')}
          onClick={onOpenVideo}
        >
          <FolderOpen aria-hidden="true" size={18} />
          {t('shell.top.openVideo')}
        </button>
        <p className="empty-drop muted">{t('shell.empty.dropHint')}</p>

        <ol className="empty-steps">
          <li>{t('shell.empty.step1')}</li>
          <li>{t('shell.empty.step2')}</li>
          <li>{t('shell.empty.step3')}</li>
        </ol>

        <p className="empty-formats muted">
          {t('shell.empty.formats')}: <span className="mono">{SUPPORTED_FORMATS}</span>
        </p>

        <FfmpegStatusRow ffmpeg={ffmpeg} />
      </section>
    </div>
  );
}
