# Changelog

All notable changes to Tajtlisha are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: [SemVer](https://semver.org/)
(before 1.0.0, a minor bump may contain breaking changes).

## [Unreleased]

### Added
- Logo watermark: a badge with letters (T by default) and a text (tajtliša by default) is drawn into the exported MP4 and the preview, in the corner you choose.
  On by default. Its own Settings > Logo tab sets the letters, the text (up to 30 characters), content, background, colours, corner roundness, position, size, margin and opacity, with a live preview. Turn it off there, or for a single export with the "Add logo" checkbox.
- Languages: Arabic, Hindi, Indonesian, Thai, Vietnamese, Chinese (Simplified), Japanese and Korean for the spoken
  language and the translation.
- AI correction after transcription (Settings > Transcription, off by default): a second AI pass fixes misheard
  words, names and punctuation, using your own correction instructions. Caption timing and word timing are kept; if
  the correction fails, the raw transcript is kept and the result says so.
- Translation instructions (Settings > Translation): your own rules for the translation and its polish pass.
- Video context: a button next to Transcribe opens a short description of the clip (topic, place, names, terms),
  stored in the project. It guides transcription when the spoken language is known, and the AI correction and
  translation always.

### Changed
- AI settings are split into Connectors, Transcription and Translation tabs.

### Fixed
- When the system language is Serbo-Croatian (`sh`), file dialogs and warnings are now in Serbian Latin like the rest
  of the app, instead of English.
- A language Whisper detects is now shown after transcription, also when it is not in the list (for example Malay),
  instead of "Detect automatically". Before, only the listed languages were recognized.
- Chinese, Japanese and Thai captions are no longer split by spaces between every character; their words are
  joined as written, and ideographs count as double width when lines wrap.

## [0.6.1] - 2026-10-25

### Fixed
- Word highlight: when the trim cuts a caption, the exported highlight now matches the preview; translucent
  background boxes no longer show dark seams around the highlighted word; merging captions no longer gives a word
  the time of a word deleted from the text.

## [0.6.0] - 2026-10-25

### Added
- Drag and drop: drop a video file onto the app window to open it. When a video or captions are already open, the app
  asks first, because the current video, captions and translations are replaced.
- Word highlight (karaoke): the word being spoken is drawn in a highlight color, in the preview and in the burned-in
  MP4. Two modes: only the current word, or every word spoken so far, plus a new Karaoke preset. Timing is exact for
  the original text when the transcription model returns word timestamps (whisper-1); the translation, edited text
  and older projects are highlighted approximately. SRT files are unchanged.

### Changed
- Open video asks for confirmation whenever a video is open, not only when captions exist, because the current video and
  its trim are replaced too.

## [0.5.1] - 2026-10-25

### Fixed
- Serbian captions came out in Cyrillic when Serbian (Latin) was selected. Transcription models often write Serbian
  in Cyrillic, so transcripts, translations and polished text for Serbian (Latin) are now converted to Latin script.
  A transcript whose language was not detected is treated as Serbian when it contains the letters ђ or ћ.

## [0.5.0] - 2026-10-25

### Added
- Video summary (optional, Settings > Summary): a Summarize button in the editor sends the transcript to the active AI
  provider with your own system prompt, for example to get the point of a clip for a post. Choose the model per
  provider and the thinking effort; the result opens in a dialog where you can edit and copy it.

## [0.4.0] - 2026-10-25

### Added
- Shift all captions: a bar above the caption table moves every caption earlier or later by a typed number of
  seconds (0.5 s by default). Durations and gaps stay the same, and one Undo reverts the shift.
- Clicking into a caption's text or time field moves the video to that caption.
- Clicking the video plays or pauses it.

### Fixed
- The video could not be moved to another position (clicking a caption, the trim bar or seek shortcuts left it
  where it was): local video files are now served with byte-range support, so seeking works.
- Clicking the icon of a caption row button no longer moves the video.

## [0.3.1] - 2026-10-25

### Fixed
- Update release notes read cleanly: no blank line after every item, wrapped sentences stay on one line, and the
  GitHub download table is left out.

## [0.3.0] - 2026-10-22

### Added
- Interface size: Ctrl + / Ctrl - / Ctrl 0 zoom the whole window (80% to 150%). The level is also set in Settings > General.
- Editor panels can be resized: drag the line between captions and preview, and the line between the video and
  the subtitle style panel. Arrow keys move a focused line, double-click restores the default. Sizes are remembered.

### Fixed
- Release notes in Settings > About are shown as plain text instead of raw HTML from GitHub.

## [0.2.1] - 2026-10-22

### Fixed
- The ffmpeg check reported the subtitle filter (libass) as missing with ffmpeg 8, so the start screen and
  Settings showed a false warning. Export itself was not affected.
- The release workflow now publishes the GitHub Release by itself.

## [0.2.0] - 2026-10-22

Rebuilt editor and export pipeline. Highlights: subtitles in the exported video now look exactly like the
preview, AI transcription returns proper per-word timing, the project is saved automatically and survives
Settings and restarts, and there are Windows and Linux installers with in-app updates.

### Added
- Shared project model: one caption row holds a single timing pair with original and translated text.
- Resolution-independent subtitle style (sizes relative to the video's shorter side) with one geometry helper shared by preview and export.
- Bundled Noto Sans fonts (SIL OFL 1.1) so preview and burned-in export use the same font.
- Job model for long operations: progress events and cancellation.
- Auto-update contract (GitHub Releases via electron-updater) and app info IPC.
- Burned-in export renders a generated ASS file at the video's own resolution with the bundled font; trim and
  burn happen in one ffmpeg pass; outputs are written to temp files and renamed only when everything succeeded;
  export refuses to overwrite the source video.
- Transcription with word timestamps (`whisper-1`), caption building with line/duration limits and balanced
  lines, and a speech-detection fallback (ffmpeg silencedetect) for models that return text only.
- Translation and polish validate every caption and retry missing ones once; they never fall back to the source text.
- Settings redesigned: General, AI, Export and About sections; model choices show whether they give word timing;
  About shows updates and an ffmpeg capability check; controls that did nothing were removed.
- Windows installer (NSIS, per-user, choose folder, desktop and Start menu shortcuts) with auto-update.
- ffmpeg and ffprobe ship with the app on Windows and Linux (pinned GPL build, license and source link included).
- Linux packages (AppImage, deb) built with electron-builder; auto-update for the AppImage through GitHub
  Releases (check on startup and from Settings; download and install only on user action).
- Projects autosave to the app data folder (one file per project, revision-ordered, atomic writes) and reopen on
  start; captions survive a moved or deleted video.
- Export asks Replace / Create copies / Cancel in the UI language when files already exist.
- GitHub Actions: CI (typecheck, tests, build) and a release workflow for version tags.
- UI language "System" follows the OS language (Serbian, Croatian, Bosnian -> Serbian Latin).

### Fixed
- Export never writes through links or predictable temp files, keeps previous outputs when a replacement fails,
  and never overwrites the source video.
- Quitting saves the last edit and waits for running jobs to stop.
- Serbian Latin UI strings now use proper letters (č, ć, š, ž, đ); Serbian Cyrillic no longer mixes in English words.
- Audio for transcription is mono 16 kHz 64 kbps MP3, well below the 25 MB API limit.

### Security
- IPC only answers the app's own window; navigation away from the app is blocked; saved projects are
  validated and can only point the media tools at files you opened.

### Changed
- IPC surface reduced to project, workflow, jobs, export, media status, updates and app info.
- ffmpeg runs are cancellable and can report progress; probe returns display width/height.

## [0.1.0] - 2026-10-21

### Added
- First Electron/Vite/React skeleton: import MP4, trim, AI transcription and translation (OpenAI), manual editing,
  style controls, SRT and burned-in MP4 export, Settings with encrypted API key storage, UI in en / sr-Latn / sr-Cyrl.

### Known issues
- Burned-in subtitle size does not match the preview (text covers the whole frame on vertical video).
- Default OpenAI transcription model does not return timestamps.
- Opening Settings discards the current project.

[Unreleased]: https://github.com/blonestar/tajtlisha/compare/v0.6.1...develop
[0.6.1]: https://github.com/blonestar/tajtlisha/compare/v0.6.0...v0.6.1
[0.6.0]: https://github.com/blonestar/tajtlisha/compare/v0.5.1...v0.6.0
[0.5.1]: https://github.com/blonestar/tajtlisha/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/blonestar/tajtlisha/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/blonestar/tajtlisha/compare/v0.3.1...v0.4.0
[0.3.1]: https://github.com/blonestar/tajtlisha/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/blonestar/tajtlisha/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/blonestar/tajtlisha/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/blonestar/tajtlisha/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/blonestar/tajtlisha/releases/tag/v0.1.0
