# Branches, versions and releases

## Branches

| Branch | Purpose |
| --- | --- |
| `master` | Released code only. Every commit on `master` is a tagged release `vX.Y.Z`. |
| `develop` | Integration branch. Feature branches start here and merge back here. |
| `feat/<name>` | New functionality. |
| `fix/<name>` | Bug fixes. |
| `build/<name>` | Build, packaging, CI, auto-update. |
| `docs/<name>` | Documentation only. |
| `release/X.Y.Z` | Version bump and changelog for a release; merged into `master` and back into `develop`. |
| `hotfix/X.Y.Z` | Urgent fix from `master`; merged into `master` and `develop`. |

`master` is protected by the GitHub ruleset "Protect master": no direct pushes, no force pushes, no deletion.
Changes reach `master` only through a pull request that passes the `test` and `test-windows` checks and is merged
with a merge commit. Repository admins can bypass the checks only inside a pull request, never with a direct push.
`release/*` and `hotfix/*` branches therefore go into `master` through a pull request.

The ruleset "Protect develop" blocks force pushes and deletion of `develop`; normal pushes still work. The ruleset
"Protect release tags" blocks deleting or moving any `v*` tag; creating a new tag still works. A broken release is
fixed with a new patch version, not by re-tagging.

Merge feature branches with `git merge --no-ff` so each feature stays visible in history.
Work in separate worktrees (`git worktree add ../Tajtlisha-worktrees/<name> -b feat/<name> develop`) when
several branches are active at once.

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`,
`build:`, `docs:`, `test:`, `refactor:`, `chore:`. They make the changelog easy to write.

## Versions

- SemVer, starting at `0.1.0`. Before `1.0.0`: minor = new features (may break), patch = fixes.
- The version lives in `package.json`; the git tag is `v` + that version.
- `CHANGELOG.md` keeps an `[Unreleased]` section that every branch updates when it changes behavior.

## Release steps

1. `git switch -c release/X.Y.Z develop`
2. Move `[Unreleased]` entries in `CHANGELOG.md` under `## [X.Y.Z] - YYYY-MM-DD`, update the compare links.
3. `pnpm version X.Y.Z --no-git-tag-version` and commit `chore(release): vX.Y.Z`.
4. `pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e`.
5. Push `release/X.Y.Z` and open a pull request into `master`
   (`gh pr create --base master --head release/X.Y.Z`). Merge it with a merge commit once `test` and `test-windows`
   pass (`gh pr merge --merge`).
6. `git switch master && git pull`, tag the merge commit `vX.Y.Z`, push the tag, then merge `master` back into
   `develop` and push `develop`. The release workflow builds both platforms and publishes the GitHub Release
   (see [CI](#ci)). Installed builds pick it up through auto-update.
7. Smoke-test the published installers on real machines (see [Before a public release](#before-a-public-release)).

## Auto-update

- Packaged builds use `electron-updater` with the GitHub Releases provider (`blonestar/tajtlisha`, a public
  repository, so installed apps read releases without any token).
- Linux: the AppImage updates itself. The `.deb` package does not auto-update (status `unsupported`); users
  reinstall it from the release page.
- Windows: the NSIS installer updates itself. The update manifest is `latest.yml`, uploaded next to the installer.
- Development runs (`pnpm dev`) never check for updates.
- The app checks on startup and from Settings > About. Downloading and installing always need user action;
  updates are never installed on quit (`autoInstallOnAppQuit` is false).

## Packaging commands

Official installers are built ONLY by the GitHub release workflow (see [CI](#ci)) and are published as assets of
the GitHub Release for the tag. Nobody builds or uploads release installers from a local machine. The commands below
exist for debugging packaging problems locally; their output in `release/` is never committed or published.

Run these from the repository root. Each one fetches the bundled ffmpeg for its platform first (see
[Bundled ffmpeg](#bundled-ffmpeg)), then builds `out/` with `pnpm build` and packages with electron-builder.
Nothing is published.

| Command | Output in `release/<version>/` |
| --- | --- |
| `pnpm dist:linux` | `Tajtlisha-<version>-x86_64.AppImage`, `Tajtlisha-<version>-amd64.deb`, `latest-linux.yml` |
| `pnpm dist:win` | `Tajtlisha-Setup-<version>.exe`, `latest.yml` |
| `pnpm dist` | Both of the above |
| `pnpm dist:dir` | `linux-unpacked/` only, for quick checks |
| `pnpm fetch:ffmpeg` | Only the bundled ffmpeg into `vendor/ffmpeg/` |

Artifacts per release:

- `Tajtlisha-<version>-x86_64.AppImage`: Linux, self-updating. Contains the bundled ffmpeg.
- `Tajtlisha-<version>-amd64.deb`: Linux, no auto-update, no ffmpeg dependency (bundled).
- `Tajtlisha-Setup-<version>.exe`: Windows x64 NSIS installer, self-updating.
- `*.blockmap` files: used by electron-updater for smaller downloads. Upload them with their installer.
- `latest-linux.yml` and `latest.yml`: update manifests read by electron-updater. They must be uploaded with the matching installers.

The NSIS installer installs per user by default (no administrator rights needed), lets the user change the folder, and
creates a desktop and a Start menu shortcut named `Tajtlisha`.

## Windows

- **Unsigned for now.** Until a code-signing certificate is bought, Windows SmartScreen shows "Windows protected
  your PC" for the installer. Users choose **More info > Run anyway**. Auto-update still works unsigned.
  Adding a certificate later only needs `CSC_LINK` / `CSC_KEY_PASSWORD` in the release workflow; nothing in the
  app changes.
- Build locally with `pnpm dist:win`. On Linux this needs `wine` (electron-builder uses it to set the icon and
  version resources in the `.exe`). `build/icon.ico` is generated from `build/icon.png`:
  `magick build/icon.png -background none -define icon:auto-resize=256,128,64,48,32,16 build/icon.ico`.
- Wine is good for checking the build: the installer can be extracted, the bundled ffmpeg runs under Wine, and the
  ASS subtitle filter renders with Windows drive-letter paths. Wine does not prove the installer behaves on Windows.
  **Before a public release, smoke-test the installer on a real Windows machine:** install, first launch (SmartScreen
  path), open a video, export SRT and burned-in MP4, check shortcuts, update from the previous version, and uninstall.

## Bundled ffmpeg

Windows has no system ffmpeg, so the app ships its own ffmpeg and ffprobe. Linux ships them too, so the AppImage
does not depend on the host.

- Source: BtbN/FFmpeg-Builds, release `autobuild-2026-10-21-13-06`, FFmpeg `N-127900-ge2798d5cad`, `gpl-shared`
  variant. The shared build is about 40% smaller than the static `gpl` build, which repeats the codebase in ffmpeg
  and ffprobe. Linux installs ~206 MB; Windows ~195 MB.
- `scripts/fetch-ffmpeg.mjs` downloads the pinned archives, checks their sha256, and writes `vendor/ffmpeg/<platform>-x64/`
  (gitignored). Each platform folder has `manifest.json`, `LICENSE.txt` and `SOURCE.txt`. Re-running is a no-op.
- The app finds the bundled binaries in `resources/ffmpeg/` (see `src/main/ffmpeg/paths.ts`). The order is env override
  (`TAJTLISHA_FFMPEG_PATH` and `TAJTLISHA_FFPROBE_PATH`, both required), then the bundle, then `ffmpeg` on `PATH`.
- Licensing: the build is GPL-3.0-or-later (`--enable-gpl --enable-version3`, including libx264). Tajtlisha runs
  ffmpeg and ffprobe as separate programs and does not link them. The packaged app contains `resources/ffmpeg/LICENSE.txt`
  and `resources/ffmpeg/SOURCE.txt`, which name the exact release and the FFmpeg source. We ship the unmodified upstream
  build. If we ever patch ffmpeg, we must publish that source with the release.
- To update ffmpeg: pick a new `autobuild-*` release, update the tag, names and sha256 values in
  `scripts/fetch-ffmpeg.mjs`, run `pnpm fetch:ffmpeg`, and run `pnpm test:main:local` with the vendored binaries.
  See `vendor/README.md`.

## CI

- `.github/workflows/ci.yml` runs on pushes and pull requests to `develop` and `master`:
  - `test` (Linux): typecheck, all tests, build.
  - `test-windows`: fetches the Windows ffmpeg, puts it on `PATH` and in `TAJTLISHA_*` env vars, then runs typecheck
    and `pnpm test:main:local`. The real-ffmpeg tests skip when ffmpeg is missing and run here.
- `.github/workflows/release.yml` runs on `v*` tags:
  1. `draft`: checks the tag equals `v` + the `package.json` version, then creates a **draft** GitHub Release for the tag
     (only if none exists yet, so a re-run is safe).
  2. `build` (matrix): `ubuntu-latest` runs `pnpm dist:linux`; `windows-latest` runs `pnpm dist:win`. Each job checks the
     tag, builds, and uploads its installers, blockmaps and `latest*.yml` to the draft with `gh release upload --clobber`.
     Electron-builder does not publish (`--publish never`), so the two jobs cannot create competing releases.
  3. `publish`: runs after both builds succeed and turns the draft into a public release with `gh release edit --draft=false`.
     If a build fails, the release stays a draft and nothing is published.

Testing an update locally: auto-update only runs in a packaged build. The AppImage checks only when `APPIMAGE` is set,
and Windows only in a packaged installed build. `pnpm dev` never checks. A full end-to-end update needs two published
releases; until then, verify the `unsupported`/`idle`/`error` states from Settings and the unit tests in
`tests/main/local/updater.test.ts`.

## Before a public release

- `pnpm typecheck` passes, including the renderer. (`pnpm build` runs typecheck first.)
- Windows installer: smoke-tested on a real Windows machine (see [Windows](#windows)).
- Linux AppImage: started from a clean machine without ffmpeg installed; export works.
- The release notes name the bundled ffmpeg version (`ffmpeg -version` from `resources/ffmpeg`).
