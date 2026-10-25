# Implementation tracker: editor redesign (target v0.2.0)

Orchestrator: Claude Opus 5.5. Implementation: Claude Haiku 5.5 workers in separate worktrees.
Reviews and design questions: GPT-6.1-Sol.
Status values: `todo`, `in progress`, `review`, `merged`, `blocked`.

Background: the audit of v0.1.0 (2026-10-21) found that burned-in subtitles do not match the preview,
OpenAI transcription asks for timestamps the default model cannot return, Settings discards the project,
original and translation have separate timing, generation is all-or-nothing, and there is no packaging
or update path.

## Wave 0: contracts (orchestrator)

| Task | Branch | Status |
| --- | --- | --- |
| Shared project, jobs, errors, style, geometry, IPC, updates contracts; preload; abortable ffmpeg; probe dimensions; bundled fonts | `develop` | merged |

## Wave 1: independent modules

| # | Task | Branch | Status |
| --- | --- | --- | --- |
| 1 | ASS generation, single-pass trim+burn export, SRT from caption rows, source protection, progress, cancel | `feat/export-ass` | merged |
| 2 | Transcription with word timestamps (whisper-1), caption builder, speech-detection fallback, strict translation, staged workflow | `feat/ai-transcription` | merged |
| 3 | Renderer project reducer: caption operations, undo/redo, validation, selectors | `feat/renderer-state` | merged |
| 3b | State follow-up: revision in document, stale translations, relink, load result, dirty flag, job context | `feat/renderer-state-followup` | merged |
| 4 | Serbian Latin diacritics in all UI strings | `fix/i18n-diacritics` | merged |
| 5 | electron-builder packaging, electron-updater, CI and release workflows | `build/packaging-autoupdate` | merged |
| 1b | Export follow-up: shared font factor, WrapStyle 2, SAR scaling, re-probe, paused-frame render, ffmpeg capability check | `feat/export-followup` | merged |
| 5b | Windows NSIS installer, bundled static ffmpeg/ffprobe for Windows and Linux, CI release matrix (ubuntu + windows) | `build/windows-installer` | merged |

## Wave 2: wiring and UI parts

| # | Task | Branch | Status |
| --- | --- | --- | --- |
| 6 | Main wiring: project store (autosave), job registry, IPC handlers, media protocol | `feat/main-wiring` | merged |
| 7 | Video preview with style overlay, trim bar, style drawer | `feat/editor-preview` | merged |
| 8 | Caption table, generate panel, job bar, export dialog | `feat/editor-captions` | merged |

## Hardening (from Sol review of develop at 181d4db)

| # | Task | Branch | Status |
| --- | --- | --- | --- |
| H1 | Export staging dir, destination validation, backup/rollback publish, no-clobber publish, per-folder mutex | `fix/export-staging` | merged |
| H2 | Quit handshake and job draining, trusted navigation and IPC senders, known-source checks, project schema validation, proxy fingerprint and even sizes | `fix/main-hardening` | merged |
| H3 | Pin pnpm version for CI (`packageManager`) | `develop` | merged |

## Wave 3: integration and release

| # | Task | Branch | Status |
| --- | --- | --- | --- |
| 9 | Editor page and app shell integration, keyboard shortcuts, quit flush, screenshots | `feat/editor-integration` | merged |
| 9b | Settings redesign: sections, provider/model choices with timing badges, export defaults, About with updates and ffmpeg diagnostics | `feat/settings-redesign` | merged |
| 10 | Sol review, E2E against a real clip, preview vs export frame comparison | `develop` | merged |
| 11 | Release v0.2.0 | `master` + tag `v0.2.0` | released |

## Pre-release (Sol renderer review of develop at 03d8be8)

| # | Task | Branch | Status |
| --- | --- | --- | --- |
| R1 | Manual translation overwrite, startup load race, overlapping failed saves, load failure blocking persistence, quit with unsaved data (Retry / Quit / Cancel), empty model id, Space on focused controls, export validation clipped to trim | `fix/pre-release-review` | merged |

## UI polish (after v0.2.1)

| # | Task | Branch | Status |
| --- | --- | --- | --- |
| U1 | Resizable editor panels: captions/preview splitter, preview/style-drawer splitter, keyboard, persisted in localStorage | `feat/resizable-panes` | merged |
| U2 | Whole-UI zoom 80-150% (Ctrl + / - / 0, Settings > General), `uiZoomPercent` setting, preload `webFrame` zoom | `feat/ui-zoom` | merged |
| U3 | Sol review fixes: settings response ordering, layout at 150% zoom on the minimum window, splitter focus vs playback keys | `fix/panes-zoom-review` | merged |

## Features after v0.3.1

| # | Task | Branch | Status |
| --- | --- | --- | --- |
| F1 | Optional transcript summary: own Settings tab (switch, system prompt, model per provider, thinking effort), `workflow:summarize` job, OpenAI + OpenRouter, Editor button and dialog | `feat/video-summary` | merged |

## Backlog for v0.2.1

- Exact-frame preview and preview-proxy recovery must be invalidated by content/source generation, not only path.
- Settings optimistic updates: show rejected updates (stale responses are ignored since U3).
- The "auto-detect spoken language" switch has no effect: implement or remove.
- Playback re-renders the whole caption table about 15 times per second; memoize rows, compute pending rows once.
- Preview shadow differs from ASS (opacity, no shadow with box).
- Provider connection messages are English in the Serbian UI: return codes and translate.
- Serbian plural forms for counts (i18next _one/_few/_other).
- Text-only (speech detection) captions can exceed 6 s.
- Translation prompt says "from und" when the source language is unknown.
- Export lock is in-process only.
- Real app icon; Windows code signing.

## Open decisions

- GitHub repository: `blonestar/tajtlisha`, PUBLIC (owner decision 2026-10-22). Installers are built only by the
  release workflow and attached to the GitHub Release. Before the first push, commit authors are rewritten from the
  personal email to the GitHub noreply address (owner decision); done after wave 3 merges to avoid stale branches.
- `whisper-1` (the only OpenAI model with word timestamps) shuts down 2027-02-26. The speech-detection
  fallback keeps the app working after that; revisit when OpenAI documents timestamps for `gpt-transcribe`.

- Windows installer is unsigned at first: SmartScreen shows a warning until a code-signing certificate is bought.
- Bundled ffmpeg builds that include libx264 are GPL. Shipping them as separate executables next to the app is
  normal practice, but the license text and a source link must ship with them.

## Log

- 2026-10-21: v0.1.0 tagged (baseline skeleton). `develop` created. Wave 0 contracts committed.
- 2026-10-21: Wave 1 started: five Haiku workers in worktrees under ../Tajtlisha-worktrees/. Sol reviewing contracts.
- 2026-10-21: Owner asked for Windows and Linux installers. Added task 5b (bundled ffmpeg, NSIS, CI matrix).
- 2026-10-21: Sol contract review applied on develop: project revision + translatedFrom/translationLanguage
  (stale translations are marked, not cleared), load result with sourceStatus (missing/changed source keeps
  captions), per-project save files with revision ordering, ASS font factor 1.519 for Noto Sans, explicit line
  breaks (ASS WrapStyle 2 / CSS pre), CSS stroke 2x outline, SAR folded into probe width, ffmpeg kill settles on
  process close, paused-frame ffmpeg preview IPC, updates require user action (no install on quit).
- 2026-10-21: feat/export-ass merged (frames verified: text inside frame, Noto Sans, Serbian letters OK). Follow-up 1b started.
- 2026-10-21: feat/ai-transcription (97 tests) and fix/i18n-diacritics merged. Renderer tests run sequentially
  (repo is on a bindfs FUSE mount; parallel jsdom workers timed out). Follow-ups noted: i18n plural forms for
  counts, text-only captions may exceed 6 s.
- 2026-10-21: feat/renderer-state merged (139 renderer tests); follow-up 3b started. Design tokens, UI primitives,
  per-area i18n files and timecode utils added on develop. Wave 2 UI workers (7, 8) started.
- 2026-10-22: feat/export-followup merged (68 main tests; export vs paused-frame preview PSNR 42.6 dB). Found that
  a 32-character line overflows a 720 px frame: added estimateMaxCharsPerLine (about 20 chars on 720x1280 with the
  default style); caption building and line_too_long must use effectiveMaxCharsPerLine. feat/main-wiring started.
- 2026-10-22: feat/editor-captions merged (66 tests). The worker ended without committing; the orchestrator verified
  tests and committed. Fixed an i18n test bug (only the first {{placeholder}} was stripped). Renderer tests now use
  the vmForks pool (jsdom start exceeded vitest's 60 s worker timeout on the FUSE mount under load).
- 2026-10-22: build/packaging-autoupdate merged (AppImage 114 MB, deb 88 MB, latest-linux.yml; 22 updater tests).
  Orchestrator fixes: autoInstallOnAppQuit false, maintainer uses a GitHub noreply address. pnpm now uses the
  hoisted linker (electron-builder stalled with the isolated one). Updater wiring in src/main/index.ts waits for
  feat/main-wiring. Task 5b (Windows NSIS + bundled ffmpeg) started.
- 2026-10-22: feat/main-wiring merged (137 main tests, 97 AI tests; main/preload/shared type-clean). Orchestrator
  wired the updater into src/main/index.ts and added a trailing flush for throttled job progress.
- 2026-10-22: feat/editor-preview merged (50 tests). Global Testing Library cleanup added to tests/setup.ts.
- 2026-10-22: Sol reviewed develop (main side) and reproduced: export temp-file collision/symlink overwrite of the
  source, replacement failure losing previous outputs, unreliable save on quit, file: navigation trusted, forged
  project paths, CI pnpm setup. Quit handshake contract added; H1 and H2 started.
- 2026-10-22: feat/renderer-state-followup merged (208 renderer tests); orchestrator fix: the first manual translation
  sets translationLanguage. Wave 3 started: editor integration (9) and settings redesign (9b) in parallel.
- 2026-10-22: fix/export-staging merged (150 main tests): private staging folder, lstat/realpath destination checks,
  backup+rollback for overwrite, hard-link no-clobber publish, per-folder lock. Residual: in-process lock only.
- 2026-10-22: fix/main-hardening merged (226 main tests): quit coordinator (renderer ack -> drain jobs -> flush ->
  cleanup), guarded IPC registration with trusted-sender checks, exact-entry navigation, probe-gated loads and a
  known-sources allowlist for ffmpeg inputs, full project schema validation, fingerprinted preview proxies with even
  sizes. Orchestrator: probe floors odd sizes to even (321x241 -> 320x240).
- 2026-10-22: build/windows-installer merged. Bundled BtbN ffmpeg (autobuild-2026-10-21-13-06, gpl-shared, sha256
  pinned) for Linux and Windows. Built locally: Tajtlisha-Setup-0.1.0.exe 137 MB (NSIS, latest.yml), AppImage 198 MB,
  deb 157 MB. Verified: Windows ffmpeg.exe runs under Wine with the ass filter; AppImage ffmpeg loads its own libs
  via RPATH $ORIGIN/../lib and has libx264/aac/libmp3lame. packageManager pinned to pnpm@11.10.0 for CI.
- 2026-10-22: feat/settings-redesign merged (43 tests, screenshots reviewed). Orchestrator: settings store treats ''
  as clearing optional text settings. Open: verify the header close icon in the integrated app.
- 2026-10-22: feat/editor-integration merged. Orchestrator fixes: single settings overlay header with onClose,
  font size relative to the video's shorter side (default 5.5%: about 29 chars per line on 720x1280), settings test
  fixtures moved to tests, e2e opens the clip through selectVideo. Full run: 235 local, 97 AI, 360 renderer tests,
  build and 2 e2e pass. Worktrees and merged branches removed.
- 2026-10-22: Commit authors and electron-builder.yml history rewritten to the GitHub noreply address; v0.1.0
  re-tagged. Public repo https://github.com/blonestar/tajtlisha created; master, develop and v0.1.0 pushed.
- 2026-10-22: First CI run: Linux job green; Windows job showed real ffmpeg export works on Windows but two tests
  assumed LF line endings and POSIX paths. Fixed (CRLF-safe parsing in ffmpeg helpers too).
- 2026-10-22: Owner tested the app and likes it. Sol reviewed the renderer: 6 must-fix (all reproduced) -> R1.
  Quit contract now reports whether pending work was saved.
- 2026-10-22: fix/pre-release-review merged (240 local, 97 AI, 375 renderer tests). Version bumped to 0.2.0.
- 2026-10-22: v0.2.0 released by the workflow (Linux and Windows builds green; publish step failed because the job had
  no checkout and gh had no repository - published manually, workflow fixed). Downloaded the released AppImage and
  launched it: version 0.2.0, packaged, bundled ffmpeg found, but the capability check wrongly reported the ass
  filter missing (ffmpeg 8 prints a two-character flag column). Fixed and released as v0.2.1.
- 2026-10-22: v0.2.1 released fully by the workflow (build Linux + Windows, publish). End-to-end update test: the
  released v0.2.0 AppImage found v0.2.1 (with release notes) and downloaded it. Release notes arrive as HTML;
  converted to plain text on develop (ships in the next release).
- 2026-10-22: U1 and U2 merged (Haiku workers), U3 from the Sol review. Checked in the built app with Playwright and
  capturePage at 100/125/150% on a 1100x700 window: splitters drag and persist, side column scrolls when short.
- 2026-10-22: v0.3.0 released (resizable panels, UI zoom, plain-text release notes).
- 2026-10-22: v0.2.x still shows raw HTML for the v0.3.0 notes (the cleanup ships in 0.3.0 itself). Tightened the
  0.3.0 conversion on develop: one line per item, `<br>` soft wraps joined, Downloads section dropped.
- 2026-10-25: v0.3.1 released (clean plain-text release notes).
- 2026-10-25: F1 video summary built by two Haiku workers (main, renderer) on shared contracts. Owner tested it live
  and asked for an own Settings tab where the switch only hides the editor button. Orchestrator fixes: dialogs
  stacked under the sticky caption header (z-index), REASONING_UNSUPPORTED message when a model rejects the
  thinking effort, prompt/model drafts saved when Settings closes with Esc. Sol review: no P0/P1; four P2/P3 fixed
  (summary of the previous video kept, blank-prompt double write, model draft lost on Esc, stale error after retry).
- 2026-10-25: Caption table follows the video: focusing a caption field seeks to it, a click on the video toggles
  playback, and a "shift all captions" bar moves every caption earlier or later (one undo step). 445 renderer tests.
- 2026-10-25: v0.4.0 released (caption click seeks, click-to-play, shift all captions, seeking fixed).
- 2026-10-25: Word highlight (karaoke) built on shared contracts (`src/shared/word-highlight.ts`) by two Haiku
  workers (main, renderer). Word times are kept from word-timestamp transcription in `CaptionRow.words`; preview
  and ASS export share the same lit-word logic; checked with libass that the highlighted word changes in the frame.
