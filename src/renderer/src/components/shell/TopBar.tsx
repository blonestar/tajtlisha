import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import CircleCheck from 'lucide-react/dist/esm/icons/circle-check.js';
import CircleAlert from 'lucide-react/dist/esm/icons/circle-alert.js';
import Download from 'lucide-react/dist/esm/icons/download.js';
import FolderOpen from 'lucide-react/dist/esm/icons/folder-open.js';
import LoaderCircle from 'lucide-react/dist/esm/icons/loader-circle.js';
import Redo2 from 'lucide-react/dist/esm/icons/redo-2.js';
import Settings from 'lucide-react/dist/esm/icons/settings.js';
import Undo2 from 'lucide-react/dist/esm/icons/undo-2.js';
import { UpdateButton } from './UpdateButton';

export type SaveState = { kind: 'saved' } | { kind: 'saving' } | { kind: 'error'; message: string };

export type TopBarProps = {
  /** File name of the open clip, or null when no clip is open. */
  clipName: string | null;
  save: SaveState;
  onRetrySave: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onOpenVideo: () => void;
  /** True while the saved project is still loading. Opening a video then would be replaced by the load. */
  openVideoDisabled?: boolean;
  onOpenSettings: () => void;
  onExport: () => void;
  exportDisabled: boolean;
  exportDisabledReason?: string;
};

/** Shortcut hint appended to a button label. Key names stay in English in every language. */
export function withShortcut(label: string, keys: string): string {
  return `${label} (${keys})`;
}

/**
 * 48 px application bar: identity and clip name on the left, save status and
 * commands on the right. Export is the single primary action.
 */
export function TopBar({
  clipName,
  save,
  onRetrySave,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onOpenVideo,
  openVideoDisabled = false,
  onOpenSettings,
  onExport,
  exportDisabled,
  exportDisabledReason
}: TopBarProps): ReactElement {
  const { t } = useTranslation();
  const modifierKeys = 'Ctrl';

  return (
    <header className="topbar">
      <div className="topbar-identity">
        <span className="brand-mark" aria-hidden="true">
          T
        </span>
        <span className="topbar-app">{t('app.name')}</span>
        <span className="topbar-separator" aria-hidden="true" />
        <span className={clipName ? 'topbar-clip' : 'topbar-clip is-empty'} title={clipName ?? undefined}>
          {clipName ?? t('shell.top.noClip')}
        </span>
      </div>

      <div className="topbar-status" role="status" aria-live="polite">
        {save.kind === 'saved' && (
          <span className="save-status is-saved">
            <CircleCheck aria-hidden="true" size={14} />
            {t('shell.save.saved')}
          </span>
        )}
        {save.kind === 'saving' && (
          <span className="save-status is-saving">
            <LoaderCircle aria-hidden="true" size={14} />
            {t('shell.save.saving')}
          </span>
        )}
        {save.kind === 'error' && (
          <span className="save-status is-error" title={save.message}>
            <CircleAlert aria-hidden="true" size={14} />
            {t('shell.save.failed')}
            <button type="button" className="btn btn-sm" onClick={onRetrySave}>
              {t('shell.save.retry')}
            </button>
          </span>
        )}
      </div>

      <div className="topbar-actions">
        <UpdateButton />
        <button
          type="button"
          className="btn btn-sm"
          title={withShortcut(t('shell.top.openVideo'), `${modifierKeys}+O`)}
          onClick={onOpenVideo}
          disabled={openVideoDisabled}
        >
          <FolderOpen aria-hidden="true" size={14} />
          {t('shell.top.openVideo')}
        </button>
        <div className="topbar-group" role="group" aria-label={t('shell.top.history')}>
          <button
            type="button"
            className="btn btn-icon btn-ghost"
            aria-label={t('shell.top.undo')}
            title={withShortcut(t('shell.top.undo'), `${modifierKeys}+Z`)}
            disabled={!canUndo}
            onClick={onUndo}
          >
            <Undo2 aria-hidden="true" size={15} />
          </button>
          <button
            type="button"
            className="btn btn-icon btn-ghost"
            aria-label={t('shell.top.redo')}
            title={withShortcut(t('shell.top.redo'), `${modifierKeys}+Shift+Z`)}
            disabled={!canRedo}
            onClick={onRedo}
          >
            <Redo2 aria-hidden="true" size={15} />
          </button>
        </div>
        <button
          type="button"
          className="btn btn-icon"
          aria-label={t('shell.top.settings')}
          title={t('shell.top.settings')}
          onClick={onOpenSettings}
        >
          <Settings aria-hidden="true" size={15} />
        </button>
        <button
          type="button"
          className="btn btn-primary"
          data-step-target="export"
          title={exportDisabledReason ?? withShortcut(t('shell.top.export'), `${modifierKeys}+E`)}
          disabled={exportDisabled}
          onClick={onExport}
        >
          <Download aria-hidden="true" size={14} />
          {t('shell.top.export')}
        </button>
      </div>
    </header>
  );
}
