import type { FocusEvent, KeyboardEvent, MouseEvent, ReactElement, ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import GitMerge from 'lucide-react/dist/esm/icons/git-merge.js';
import Plus from 'lucide-react/dist/esm/icons/plus.js';
import Scissors from 'lucide-react/dist/esm/icons/scissors.js';
import Trash2 from 'lucide-react/dist/esm/icons/trash-2.js';
import type { CaptionRow } from '../../../../shared/types/project';
import { formatSeconds } from '../../utils/time';
import { AutoGrowTextarea } from './AutoGrowTextarea';
import { TimecodeField } from './TimecodeField';
import { isBlockingIssue, issueLabelKey } from './issues';
import './captions.css';

export type CaptionIssue = { code: string; overlapMs?: number };
export type CaptionIssues = Record<string, CaptionIssue[]>;
export type CaptionEdge = 'start' | 'end';
export type CaptionPatch = Partial<Pick<CaptionRow, 'startMs' | 'endMs' | 'original' | 'translation'>>;
type TextColumn = 'original' | 'translation';

export type CaptionTableProps = {
  captions: CaptionRow[];
  /** Keyed by caption id. Blocking codes render as danger badges, the rest as warnings. */
  issues: CaptionIssues;
  /** Captions whose translation was made from an older original text. */
  staleIds: ReadonlySet<string>;
  /** Caption under the playhead. */
  activeCaptionId: string | null;
  selectedCaptionId: string | null;
  maxCharsPerLine: number;
  trimStartMs: number;
  showTranslation: boolean;
  originalLabel: string;
  translationLabel: string;
  onSelect(id: string): void;
  /** Source-absolute ms, the start of the clicked caption. */
  onSeek(ms: number): void;
  onUpdate(id: string, patch: CaptionPatch): void;
  onInsertAfter(id: string): void;
  onSplit(id: string): void;
  onMerge(id: string): void;
  onDelete(id: string): void;
  onNudge(id: string, deltaMs: number, edge: CaptionEdge): void;
  emptyState?: ReactNode;
};

const CONTROL_SELECTOR = 'input, textarea, button, select';

/** Table cell an issue belongs to. Text issues sit under their field, the rest under the times. */
type IssueCell = 'time' | TextColumn;

function issueCell(code: string, showTranslation: boolean): IssueCell {
  if (code === 'empty_original') return 'original';
  if (code === 'empty_translation') return showTranslation ? 'translation' : 'time';
  return 'time';
}

function overlongLines(text: string, maxChars: number): Array<{ line: number; length: number }> {
  return text.split('\n').flatMap((line, index) =>
    line.length > maxChars ? [{ line: index + 1, length: line.length }] : []
  );
}

/**
 * One row per caption: index, editable timing, original and translation text,
 * issue badges and row actions. Presentational; all changes go through callbacks.
 */
export function CaptionTable({
  captions,
  issues,
  staleIds,
  activeCaptionId,
  selectedCaptionId,
  maxCharsPerLine,
  trimStartMs,
  showTranslation,
  originalLabel,
  translationLabel,
  onSelect,
  onSeek,
  onUpdate,
  onInsertAfter,
  onSplit,
  onMerge,
  onDelete,
  onNudge,
  emptyState
}: CaptionTableProps): ReactElement {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const pendingCount = captions.filter(
    (caption) => staleIds.has(caption.id) || caption.translation.trim() === ''
  ).length;

  // Keep the playing caption visible, but never pull the view away from a field the user is editing.
  useEffect(() => {
    if (!activeCaptionId) return;

    const focused = document.activeElement;
    if (focused instanceof HTMLInputElement || focused instanceof HTMLTextAreaElement) {
      if (scrollRef.current?.contains(focused)) return;
    }

    findRow(activeCaptionId)?.scrollIntoView?.({ block: 'nearest' });
  }, [activeCaptionId]);

  function findRow(id: string): HTMLElement | undefined {
    return Array.from(scrollRef.current?.querySelectorAll<HTMLElement>('tr[data-row-id]') ?? []).find(
      (row) => row.dataset.rowId === id
    );
  }

  function handleRowClick(caption: CaptionRow, event: MouseEvent<HTMLTableRowElement>): void {
    // Controls handle their own clicks; fields seek through focus instead.
    if (event.target instanceof Element && event.target.closest(CONTROL_SELECTOR)) return;

    onSelect(caption.id);
    onSeek(caption.startMs);
  }

  function handleRowFocus(caption: CaptionRow, event: FocusEvent<HTMLTableRowElement>): void {
    onSelect(caption.id);

    // Entering a caption's text or time field moves the video to that caption. Moving between
    // fields of the same row, or editing the caption already under the playhead, keeps the position.
    const from = event.relatedTarget;
    if (from instanceof Node && event.currentTarget.contains(from)) return;
    if (caption.id === activeCaptionId) return;

    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      onSeek(caption.startMs);
    }
  }

  function handleTextKeyDown(
    caption: CaptionRow,
    column: TextColumn,
    event: KeyboardEvent<HTMLTextAreaElement>
  ): void {
    if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;

    event.preventDefault();
    const index = captions.findIndex((item) => item.id === caption.id);
    const nextIndex = event.key === 'ArrowUp' ? index - 1 : index + 1;
    const next = captions[nextIndex];
    if (!next) return;

    onSelect(next.id);
    findRow(next.id)?.querySelector<HTMLTextAreaElement>(`textarea[data-column="${column}"]`)?.focus();
  }

  if (captions.length === 0) {
    return (
      <div className="caption-empty-state">
        {emptyState ?? t('captions.empty')}
      </div>
    );
  }

  return (
    <div className="caption-table-scroll" ref={scrollRef}>
      <table className="caption-table" aria-label={t('captions.table.label')}>
        <thead>
          <tr>
            <th className="caption-col-index" scope="col">
              {t('captions.columns.index')}
            </th>
            <th className="caption-col-time" scope="col">
              <span>{t('captions.columns.time')}</span>
              <span className="caption-head-count">{t('captions.count', { count: captions.length })}</span>
            </th>
            <th className="caption-col-text" scope="col">
              <span>{originalLabel}</span>
            </th>
            {showTranslation && (
              <th className="caption-col-text" scope="col">
                <span>{translationLabel}</span>
                {pendingCount > 0 && (
                  <span className="badge badge-warning">
                    {t('captions.translationPending', { count: pendingCount })}
                  </span>
                )}
              </th>
            )}
            <th className="caption-col-actions" scope="col">
              <span className="visually-hidden">{t('captions.columns.actions')}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {captions.map((caption, index) => {
            const isActive = caption.id === activeCaptionId;
            const isSelected = caption.id === selectedCaptionId;
            const isLast = index === captions.length - 1;
            const isStale = staleIds.has(caption.id);
            const originalLong = overlongLines(caption.original, maxCharsPerLine);
            const translationLong = overlongLines(caption.translation, maxCharsPerLine);
            // Per-field line warnings already say which line is too long, so the summary badge
            // only shows when those warnings are not visible.
            const lineWarningsShown =
              originalLong.length > 0 || (showTranslation && translationLong.length > 0);
            const captionIssues = (issues[caption.id] ?? []).filter(
              (issue) =>
                issue.code !== 'stale_translation' && !(issue.code === 'line_too_long' && lineWarningsShown)
            );
            const issuesIn = (cell: IssueCell) =>
              captionIssues.filter((issue) => issueCell(issue.code, showTranslation) === cell);
            const hasIssue = (code: string) => captionIssues.some((issue) => issue.code === code);
            const renderBadges = (cellIssues: CaptionIssue[], extra?: ReactNode) =>
              cellIssues.length > 0 || extra ? (
                <div className="caption-badges">
                  {extra}
                  {cellIssues.map((issue, issueIndex) => (
                    <span
                      key={`${issue.code}-${issueIndex}`}
                      className={`badge ${isBlockingIssue(issue.code) ? 'badge-danger' : 'badge-warning'}`}
                    >
                      {t(issueLabelKey(issue.code), { ms: issue.overlapMs ?? 0 })}
                    </span>
                  ))}
                </div>
              ) : null;
            const rowClass = [
              'caption-row',
              isActive ? 'is-active' : '',
              isSelected ? 'is-selected' : ''
            ]
              .filter(Boolean)
              .join(' ');

            return (
              <tr
                key={caption.id}
                className={rowClass}
                data-row-id={caption.id}
                aria-current={isActive ? 'true' : undefined}
                onClick={(event) => handleRowClick(caption, event)}
                onFocus={(event) => handleRowFocus(caption, event)}
              >
                <td className="caption-col-index">
                  <span className="caption-index">{index + 1}</span>
                  <span className="caption-duration">
                    {t('captions.time.duration', { seconds: formatSeconds(caption.endMs - caption.startMs) })}
                  </span>
                </td>
                <td className="caption-col-time">
                  <TimecodeField
                    label={t('captions.time.start')}
                    valueMs={caption.startMs}
                    trimStartMs={trimStartMs}
                    earlierLabel={t('captions.nudge.startEarlier')}
                    laterLabel={t('captions.nudge.startLater')}
                    onCommit={(startMs) => onUpdate(caption.id, { startMs })}
                    onNudge={(deltaMs) => onNudge(caption.id, deltaMs, 'start')}
                  />
                  <TimecodeField
                    label={t('captions.time.end')}
                    valueMs={caption.endMs}
                    trimStartMs={trimStartMs}
                    earlierLabel={t('captions.nudge.endEarlier')}
                    laterLabel={t('captions.nudge.endLater')}
                    onCommit={(endMs) => onUpdate(caption.id, { endMs })}
                    onNudge={(deltaMs) => onNudge(caption.id, deltaMs, 'end')}
                  />
                  {renderBadges(
                    issuesIn('time'),
                    isStale && !showTranslation ? (
                      <span className="badge badge-warning">{t('captions.stale')}</span>
                    ) : undefined
                  )}
                </td>
                <td className="caption-col-text">
                  <AutoGrowTextarea
                    aria-label={originalLabel}
                    data-column="original"
                    className={hasIssue('empty_original') ? 'caption-text is-missing' : 'caption-text'}
                    placeholder={t('captions.issues.empty_original')}
                    value={caption.original}
                    onValueChange={(original) => onUpdate(caption.id, { original })}
                    onKeyDown={(event) => handleTextKeyDown(caption, 'original', event)}
                  />
                  {renderBadges(issuesIn('original').filter((issue) => issue.code !== 'empty_original'))}
                  {originalLong.length > 0 && (
                    <ul className="caption-line-warnings">
                      {originalLong.map((line) => (
                        <li key={line.line}>
                          {t('captions.line.tooLong', { detail: `${line.line}: ${line.length}/${maxCharsPerLine}` })}
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
                {showTranslation && (
                  <td className="caption-col-text">
                    <AutoGrowTextarea
                      aria-label={translationLabel}
                      data-column="translation"
                      className={hasIssue('empty_translation') ? 'caption-text is-missing' : 'caption-text'}
                      placeholder={t('captions.issues.empty_translation')}
                      value={caption.translation}
                      onValueChange={(translation) => onUpdate(caption.id, { translation })}
                      onKeyDown={(event) => handleTextKeyDown(caption, 'translation', event)}
                    />
                    {translationLong.length > 0 && (
                      <ul className="caption-line-warnings">
                        {translationLong.map((line) => (
                          <li key={line.line}>
                            {t('captions.line.tooLong', { detail: `${line.line}: ${line.length}/${maxCharsPerLine}` })}
                          </li>
                        ))}
                      </ul>
                    )}
                    {renderBadges(
                      issuesIn('translation').filter((issue) => issue.code !== 'empty_translation'),
                      isStale ? <span className="badge badge-warning">{t('captions.stale')}</span> : undefined
                    )}
                  </td>
                )}
                <td className="caption-col-actions">
                  <div className="caption-row-actions">
                    <button
                      type="button"
                      className="btn btn-icon btn-sm"
                      title={t('captions.actions.insertAfter')}
                      aria-label={t('captions.actions.insertAfter')}
                      onClick={() => onInsertAfter(caption.id)}
                    >
                      <Plus aria-hidden="true" size={14} />
                    </button>
                    <button
                      type="button"
                      className="btn btn-icon btn-sm"
                      title={t('captions.actions.split')}
                      aria-label={t('captions.actions.split')}
                      onClick={() => onSplit(caption.id)}
                    >
                      <Scissors aria-hidden="true" size={14} />
                    </button>
                    <button
                      type="button"
                      className="btn btn-icon btn-sm"
                      title={t(isLast ? 'captions.actions.mergeUnavailable' : 'captions.actions.merge')}
                      aria-label={t('captions.actions.merge')}
                      disabled={isLast}
                      onClick={() => onMerge(caption.id)}
                    >
                      <GitMerge aria-hidden="true" size={14} />
                    </button>
                    <button
                      type="button"
                      className="btn btn-icon btn-sm btn-icon-danger"
                      title={t('captions.actions.delete')}
                      aria-label={t('captions.actions.delete')}
                      onClick={() => onDelete(caption.id)}
                    >
                      <Trash2 aria-hidden="true" size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
