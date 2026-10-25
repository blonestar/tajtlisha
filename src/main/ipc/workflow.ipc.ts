import type { PolishMode, SummarizeTranscriptRequest, TranscribeClipRequest, TranslateCaptionsRequest } from '../../shared/types/jobs';
import { REASONING_EFFORTS, type ReasoningEffort } from '../../shared/types/ai';
import { IPC_CHANNELS } from '../../shared/types/ipc';
import { MAX_SUMMARY_PROMPT_CHARS, MAX_SUMMARY_TRANSCRIPT_CHARS } from '../../shared/summary';
import type { SubtitleWorkflowService } from '../ai';
import { type JobRegistry, runJob } from '../jobs/job-registry';
import { requireKnownSource, type KnownSources } from '../project/known-sources';
import {
  invalidInput,
  requireArray,
  requireFiniteNumber,
  requireJobId,
  requireOneOf,
  requireProviderId,
  requireRecord,
  requireString,
  requireText,
  requireTimeRange
} from './validation';
import type { IpcRegistrar } from './types';

/** Segment count cap for summary requests; a clip has far fewer caption rows. */
const MAX_SUMMARY_SEGMENTS = 5000;

export type WorkflowIpcDeps = {
  ipc: IpcRegistrar;
  jobs: JobRegistry;
  workflow: Pick<SubtitleWorkflowService, 'transcribe' | 'translate' | 'summarize'>;
  sources: Pick<KnownSources, 'has'>;
};

export function registerWorkflowIpc({ ipc, jobs, workflow, sources }: WorkflowIpcDeps): void {
  ipc.handle(IPC_CHANNELS.workflowTranscribe, (event, payload: unknown) => {
    const request = toTranscribeRequest(payload);
    requireKnownSource(sources, request.inputPath);
    return runJob(jobs, event.sender, request.jobId, (context) => workflow.transcribe(request, context));
  });

  ipc.handle(IPC_CHANNELS.workflowTranslate, (event, payload: unknown) => {
    const request = toTranslateRequest(payload);
    return runJob(jobs, event.sender, request.jobId, (context) => workflow.translate(request, context));
  });

  // Text only: the transcript is already in the renderer, so no known-source check.
  ipc.handle(IPC_CHANNELS.workflowSummarize, (event, payload: unknown) => {
    const request = toSummarizeRequest(payload);
    return runJob(jobs, event.sender, request.jobId, (context) => workflow.summarize(request, context));
  });
}

function toTranscribeRequest(payload: unknown): TranscribeClipRequest {
  const input = requireRecord(payload, 'request');
  const maxLinesPerCaption = requireFiniteNumber(input.maxLinesPerCaption, 'maxLinesPerCaption');
  return {
    jobId: requireJobId(input.jobId),
    inputPath: requireString(input.inputPath, 'inputPath'),
    trim: requireTimeRange(input.trim, 'trim'),
    providerId: requireProviderId(input.providerId),
    modelId: optionalString(input.modelId, 'modelId'),
    language: optionalString(input.language, 'language'),
    maxCharsPerLine: requireFiniteNumber(input.maxCharsPerLine, 'maxCharsPerLine'),
    maxLinesPerCaption: maxLinesPerCaption === 1 ? 1 : 2
  };
}

function toTranslateRequest(payload: unknown): TranslateCaptionsRequest {
  const input = requireRecord(payload, 'request');
  const maxLinesPerCaption = requireFiniteNumber(input.maxLinesPerCaption, 'maxLinesPerCaption');
  return {
    jobId: requireJobId(input.jobId),
    providerId: requireProviderId(input.providerId),
    modelId: optionalString(input.modelId, 'modelId'),
    sourceLanguage: requireString(input.sourceLanguage, 'sourceLanguage'),
    targetLanguage: requireString(input.targetLanguage, 'targetLanguage'),
    captions: requireArray(input.captions, 'captions').map((caption, index) => {
      const row = requireRecord(caption, `captions[${index}]`);
      return { id: requireString(row.id, `captions[${index}].id`), text: requireText(row.text, `captions[${index}].text`) };
    }),
    polish: toPolishMode(input.polish),
    maxCharsPerLine: requireFiniteNumber(input.maxCharsPerLine, 'maxCharsPerLine'),
    maxLinesPerCaption: maxLinesPerCaption === 1 ? 1 : 2
  };
}

function toSummarizeRequest(payload: unknown): SummarizeTranscriptRequest {
  const input = requireRecord(payload, 'request');
  const systemPrompt = requireString(input.systemPrompt, 'systemPrompt');
  if (systemPrompt.length > MAX_SUMMARY_PROMPT_CHARS) {
    throw invalidInput('systemPrompt', `at most ${MAX_SUMMARY_PROMPT_CHARS} characters`);
  }

  const segments = requireArray(input.segments, 'segments');
  if (segments.length > MAX_SUMMARY_SEGMENTS) {
    throw invalidInput('segments', `at most ${MAX_SUMMARY_SEGMENTS} items`);
  }

  const parsedSegments = segments.map((segment, index) => toSummarySegment(segment, `segments[${index}]`));
  const transcriptChars = parsedSegments.reduce((total, segment) => total + segment.text.length, 0);
  if (transcriptChars > MAX_SUMMARY_TRANSCRIPT_CHARS) {
    throw invalidInput('segments', `a transcript of at most ${MAX_SUMMARY_TRANSCRIPT_CHARS} characters`);
  }

  return {
    jobId: requireJobId(input.jobId),
    providerId: requireProviderId(input.providerId),
    modelId: summaryModelId(input.modelId),
    reasoningEffort:
      input.reasoningEffort === undefined
        ? undefined
        : requireOneOf<ReasoningEffort>(input.reasoningEffort, REASONING_EFFORTS, 'reasoningEffort'),
    systemPrompt,
    language: requireString(input.language, 'language'),
    segments: parsedSegments
  };
}

function toSummarySegment(value: unknown, field: string): SummarizeTranscriptRequest['segments'][number] {
  const segment = requireRecord(value, field);
  const startMs = requireFiniteNumber(segment.startMs, `${field}.startMs`);
  const endMs = requireFiniteNumber(segment.endMs, `${field}.endMs`);
  if (startMs < 0) {
    throw invalidInput(`${field}.startMs`, 'a number >= 0');
  }
  if (endMs < startMs) {
    throw invalidInput(`${field}.endMs`, 'a number >= startMs');
  }
  return { startMs, endMs, text: requireText(segment.text, `${field}.text`) };
}

/** Empty means "provider default" in the settings, so it is accepted here as undefined. */
function summaryModelId(value: unknown): string | undefined {
  return value === undefined || value === '' ? undefined : requireString(value, 'modelId');
}

function toPolishMode(value: unknown): PolishMode {
  return requireOneOf<PolishMode>(value, ['none', 'conservative', 'social_caption'], 'polish');
}

function optionalString(value: unknown, field: string): string | undefined {
  return value === undefined ? undefined : requireString(value, field);
}
