import type { ReactElement } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import ArrowRight from 'lucide-react/dist/esm/icons/arrow-right.js';
import CircleCheck from 'lucide-react/dist/esm/icons/circle-check.js';
import AudioLines from 'lucide-react/dist/esm/icons/audio-lines.js';
import NotebookPen from 'lucide-react/dist/esm/icons/notebook-pen.js';
import ScrollText from 'lucide-react/dist/esm/icons/scroll-text.js';
import Eye from 'lucide-react/dist/esm/icons/eye.js';
import Sparkles from 'lucide-react/dist/esm/icons/sparkles.js';
import TriangleAlert from 'lucide-react/dist/esm/icons/triangle-alert.js';
import { PROJECT_LANGUAGES } from '../../../../shared/types/project';
import { VideoContextDialog } from './VideoContextDialog';
import './workflow.css';

/** Localized name for a language code outside PROJECT_LANGUAGES, or the code itself. */
function detectedLanguageName(code: string, uiLanguage: string): string {
  try {
    return new Intl.DisplayNames([uiLanguage, 'en'], { type: 'language' }).of(code) ?? code;
  } catch {
    return code;
  }
}

export type GenerateProviderInfo = {
  id: string;
  displayName: string;
  connected: boolean;
  canTranscribe: boolean;
  canTranslate: boolean;
  canSummarize: boolean;
};

export type GeneratePanelProps = {
  hasSource: boolean;
  hasAudio: boolean;
  /** Provider for transcription. */
  transcriptionProvider: GenerateProviderInfo | null;
  /** Provider for translation and transcript correction. Shown only when it differs from the transcription provider. */
  textProvider: GenerateProviderInfo | null;
  /** Provider for the summary. Checked only when the summary is enabled. */
  summaryProvider: GenerateProviderInfo | null;
  sourceLanguage: string | 'auto';
  targetLanguage: string;
  captionCount: number;
  rowsNeedingTranslation: number;
  timingSource?: 'word' | 'segment' | 'speech_detection';
  busy: boolean;
  /** Summary is opt-in in Settings. The actions are hidden unless this is true. */
  summaryEnabled?: boolean;
  /** Caption rows inside the trim range that have text. Summary needs at least one. */
  summarizableRows?: number;
  hasSummary?: boolean;
  /** What the clip is about. '' = none. Shown on the Video context button and sent with transcription and translation. */
  videoContext: string;
  /** Saves the video context. '' clears it. */
  onVideoContextChange(text: string): void;
  onSourceLanguageChange(code: string | 'auto'): void;
  onTargetLanguageChange(code: string): void;
  onTranscribe(): void;
  onTranslate(): void;
  onSummarize?(): void;
  onShowSummary?(): void;
  onOpenSettings(): void;
};

type Reason = { key: string; values?: Record<string, string> };

/** Longest part of the context shown in the button tooltip. */
const CONTEXT_PREVIEW_CHARS = 120;

function contextPreview(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > CONTEXT_PREVIEW_CHARS ? `${flat.slice(0, CONTEXT_PREVIEW_CHARS)}...` : flat;
}

/** First reason that blocks an action, or null when it can run. */
/** Why one AI step cannot run with this provider, or null when it can. */
function providerBlock(
  provider: GenerateProviderInfo | null,
  capable: 'canTranscribe' | 'canTranslate' | 'canSummarize',
  cannotKey: string
): Reason | null {
  if (!provider) return { key: 'captions.generate.reason.noProvider' };
  if (!provider.connected) {
    return { key: 'captions.generate.reason.notConnected', values: { provider: provider.displayName } };
  }
  if (!provider[capable]) {
    return { key: cannotKey, values: { provider: provider.displayName } };
  }
  return null;
}

function transcribeBlock(props: GeneratePanelProps): Reason | null {
  if (props.busy) return { key: 'captions.generate.reason.busy' };
  if (!props.hasSource) return { key: 'captions.generate.reason.noVideo' };
  if (!props.hasAudio) return { key: 'captions.generate.reason.noAudio' };
  return providerBlock(props.transcriptionProvider, 'canTranscribe', 'captions.generate.reason.cannotTranscribe');
}

function translateBlock(props: GeneratePanelProps): Reason | null {
  if (props.busy) return { key: 'captions.generate.reason.busy' };
  if (props.captionCount === 0) return { key: 'captions.generate.reason.noCaptions' };
  return providerBlock(props.textProvider, 'canTranslate', 'captions.generate.reason.cannotTranslate');
}

function summarizeBlock(props: GeneratePanelProps): Reason | null {
  if (props.busy) return { key: 'captions.generate.reason.busy' };
  if ((props.summarizableRows ?? 0) === 0) return { key: 'captions.generate.reason.noTranscript' };
  return providerBlock(props.summaryProvider, 'canSummarize', 'captions.generate.reason.cannotSummarize');
}

/** Provider name with its connection state. */
function ProviderState({ provider, label }: { provider: GenerateProviderInfo; label?: string }): ReactElement {
  const { t } = useTranslation();

  return (
    <span className="generate-provider-name">
      {label ?? provider.displayName}
      {provider.connected ? (
        <span className="badge badge-success">
          <CircleCheck aria-hidden="true" size={12} />
          {t('captions.generate.providerConnected')}
        </span>
      ) : (
        <span className="badge badge-muted">{t('captions.generate.providerNotConnected')}</span>
      )}
    </span>
  );
}

/**
 * Compact toolbar for the AI steps. Every disabled action names the reason
 * next to it, so the user never has to guess why a button does nothing.
 */
export function GeneratePanel(props: GeneratePanelProps): ReactElement {
  const { t, i18n } = useTranslation();
  const {
    transcriptionProvider,
    textProvider,
    summaryProvider,
    sourceLanguage,
    targetLanguage,
    captionCount,
    rowsNeedingTranslation,
    timingSource,
    summaryEnabled = false,
    hasSummary = false,
    hasSource,
    videoContext,
    onVideoContextChange,
    onSourceLanguageChange,
    onTargetLanguageChange,
    onTranscribe,
    onTranslate,
    onSummarize,
    onShowSummary,
    onOpenSettings
  } = props;

  // Detected language that is not in the list (for example Malay), shown as its own option.
  const otherSourceLanguage =
    sourceLanguage !== 'auto' && !(PROJECT_LANGUAGES as readonly string[]).includes(sourceLanguage) ? sourceLanguage : null;
  const transcribeReason = transcribeBlock(props);
  const translateReason = translateBlock(props);
  const summarizeReason = summarizeBlock(props);
  // Settings is offered whenever a provider that an action needs is missing or not connected.
  const neededProviders = [transcriptionProvider, textProvider, ...(summaryEnabled ? [summaryProvider] : [])];
  const needsSettings = neededProviders.some((provider) => !provider?.connected);
  const [contextOpen, setContextOpen] = useState(false);
  const hasContext = videoContext.trim() !== '';
  const contextTitle = hasContext
    ? t('captions.context.buttonSetTitle', { text: contextPreview(videoContext) })
    : t('captions.context.buttonEmptyTitle');
  const translateLabel =
    rowsNeedingTranslation > 0
      ? t('captions.generate.translateCount', { count: rowsNeedingTranslation })
      : captionCount > 0
        ? t('captions.generate.translateAgain')
        : t('captions.generate.translate');

  return (
    <div className="generate-panel" role="toolbar" aria-label={t('captions.generate.toolbar')}>
      <div className="generate-languages">
        <div className="field generate-field">
          <span className="field-label" id="generate-source-language">
            {t('captions.generate.sourceLanguage')}
          </span>
          <select
            className="select"
            aria-labelledby="generate-source-language"
            value={sourceLanguage}
            onChange={(event) => onSourceLanguageChange(event.target.value)}
          >
            <option value="auto">{t('captions.languages.auto')}</option>
            {otherSourceLanguage ? (
              <option value={otherSourceLanguage}>{detectedLanguageName(otherSourceLanguage, i18n.language)}</option>
            ) : null}
            {PROJECT_LANGUAGES.map((code) => (
              <option key={code} value={code}>
                {t(`captions.languages.${code}`)}
              </option>
            ))}
          </select>
        </div>
        <ArrowRight aria-hidden="true" className="generate-arrow" size={16} />
        <div className="field generate-field">
          <span className="field-label" id="generate-target-language">
            {t('captions.generate.targetLanguage')}
          </span>
          <select
            className="select"
            aria-labelledby="generate-target-language"
            value={targetLanguage}
            onChange={(event) => onTargetLanguageChange(event.target.value)}
          >
            {PROJECT_LANGUAGES.map((code) => (
              <option key={code} value={code}>
                {t(`captions.languages.${code}`)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="generate-provider">
        <span className="field-label">{t('captions.generate.provider')}</span>
        {transcriptionProvider ? (
          <ProviderState provider={transcriptionProvider} />
        ) : (
          <span className="muted">{t('captions.generate.noProvider')}</span>
        )}
        {textProvider && textProvider.id !== transcriptionProvider?.id ? (
          <ProviderState
            provider={textProvider}
            label={t('captions.generate.textProviderLabel', { provider: textProvider.displayName })}
          />
        ) : null}
        {needsSettings && (
          <button type="button" className="btn btn-sm" onClick={onOpenSettings}>
            {t('captions.generate.openSettings')}
          </button>
        )}
      </div>

      <div className="generate-actions">
        <div className="generate-action">
          <button
            type="button"
            className={hasContext ? 'btn generate-context-set' : 'btn'}
            disabled={!hasSource}
            title={contextTitle}
            aria-haspopup="dialog"
            onClick={() => setContextOpen(true)}
          >
            <NotebookPen aria-hidden="true" size={14} />
            {t('captions.context.button')}
            {hasContext && <span className="generate-context-dot" aria-hidden="true" />}
          </button>
        </div>
        {timingSource === 'speech_detection' && (
          <span
            className="badge badge-warning"
            title={t('captions.generate.timingApproximateHint')}
          >
            <TriangleAlert aria-hidden="true" size={12} />
            {t('captions.generate.timingApproximate')}
          </span>
        )}
        <div className="generate-action">
          <button
            type="button"
            className="btn btn-primary"
            disabled={transcribeReason !== null}
            onClick={onTranscribe}
          >
            <AudioLines aria-hidden="true" size={14} />
            {captionCount > 0
              ? t('captions.generate.transcribeAgain')
              : t('captions.generate.transcribe')}
          </button>
          {transcribeReason && (
            <span className="generate-reason">{t(transcribeReason.key, transcribeReason.values)}</span>
          )}
        </div>
        <div className="generate-action">
          <button
            type="button"
            className="btn"
            disabled={translateReason !== null}
            title={
              translateReason === null && rowsNeedingTranslation === 0
                ? t('captions.generate.translateAgainHint')
                : undefined
            }
            onClick={onTranslate}
          >
            <Sparkles aria-hidden="true" size={14} />
            {translateLabel}
          </button>
          {translateReason && (
            <span className="generate-reason">{t(translateReason.key, translateReason.values)}</span>
          )}
        </div>
        {summaryEnabled && (
          <div className="generate-action">
            <div className="generate-button-row">
              <button
                type="button"
                className="btn"
                disabled={summarizeReason !== null}
                onClick={onSummarize}
              >
                <ScrollText aria-hidden="true" size={14} />
                {hasSummary ? t('captions.generate.summarizeAgain') : t('captions.generate.summarize')}
              </button>
              {hasSummary && (
                <button type="button" className="btn btn-ghost" onClick={onShowSummary}>
                  <Eye aria-hidden="true" size={14} />
                  {t('captions.generate.showSummary')}
                </button>
              )}
            </div>
            {summarizeReason && (
              <span className="generate-reason">{t(summarizeReason.key, summarizeReason.values)}</span>
            )}
          </div>
        )}
      </div>

      <VideoContextDialog
        open={contextOpen}
        onOpenChange={setContextOpen}
        value={videoContext}
        onSave={onVideoContextChange}
      />
    </div>
  );
}
