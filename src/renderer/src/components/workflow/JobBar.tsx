import type { ReactElement } from 'react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import CircleCheck from 'lucide-react/dist/esm/icons/circle-check.js';
import CircleAlert from 'lucide-react/dist/esm/icons/circle-alert.js';
import Info from 'lucide-react/dist/esm/icons/info.js';
import X from 'lucide-react/dist/esm/icons/x.js';
import type { JobStage } from '../../../../shared/types/jobs';import './workflow.css';


export type JobBarJob = {
  kind: 'transcribe' | 'translate' | 'summarize' | 'export' | 'preview';
  stage?: JobStage;
  /** 0..1 when known; undefined renders an indeterminate bar. */
  progress?: number;
  startedAt: number;
};

export type JobBarResult = {
  kind: 'transcribe' | 'translate' | 'summarize' | 'export' | 'preview';
  status: 'done' | 'canceled' | 'error';
  message: string;
};

export type JobBarProps = {
  job: JobBarJob | null;
  result: JobBarResult | null;
  onCancel(): void;
  onDismiss(): void;
};

/** m:ss for the elapsed time; jobs longer than an hour are not expected. */
export function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

const RESULT_ICON = {
  done: CircleCheck,
  canceled: Info,
  error: CircleAlert
} as const;

const RESULT_CLASS = {
  done: 'job-bar-result-done',
  canceled: 'job-bar-result-canceled',
  error: 'job-bar-result-error'
} as const;

/** Slim status bar for the running AI or export job, and the outcome of the last one. */
export function JobBar({ job, result, onCancel, onDismiss }: JobBarProps): ReactElement | null {
  const { t } = useTranslation();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!job) return;

    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [job]);

  if (!job && !result) return null;

  if (job) {
    const hasProgress = job.progress !== undefined;
    const percent = Math.round(Math.min(1, Math.max(0, job.progress ?? 0)) * 100);
    const stageLabel = job.stage
      ? t(`captions.stages.${job.stage}`)
      : t(`captions.jobs.${job.kind}`);

    return (
      <div className="job-bar" role="status" aria-live="polite">
        <div className="job-bar-main">
          <span className="job-bar-stage">{stageLabel}</span>
          <div
            className={hasProgress ? 'job-bar-track' : 'job-bar-track is-indeterminate'}
            role="progressbar"
            aria-label={stageLabel}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={hasProgress ? percent : undefined}
            aria-valuetext={hasProgress ? t('captions.job.progress', { percent }) : t('captions.job.working')}
          >
            {hasProgress && <span className="job-bar-fill" style={{ width: `${percent}%` }} />}
          </div>
          <span className="job-bar-elapsed muted">
            {t('captions.job.elapsed', { time: formatElapsed(now - job.startedAt) })}
          </span>
        </div>
        <button type="button" className="btn btn-sm" onClick={onCancel}>
          {t('captions.job.cancel')}
        </button>
      </div>
    );
  }

  if (!result) return null;

  const ResultIcon = RESULT_ICON[result.status];
  return (
    <div
      className={`job-bar job-bar-result ${RESULT_CLASS[result.status]}`}
      role="status"
      aria-live="polite"
    >
      <ResultIcon aria-hidden="true" size={16} />
      <span className="job-bar-result-title">
        {t(`captions.result.${result.status}`)}
      </span>
      <span className="job-bar-message">{result.message}</span>
      <button
        type="button"
        className="btn-icon btn-sm"
        title={t('captions.job.dismiss')}
        aria-label={t('captions.job.dismiss')}
        onClick={onDismiss}
      >
        <X aria-hidden="true" size={14} />
      </button>
    </div>
  );
}
