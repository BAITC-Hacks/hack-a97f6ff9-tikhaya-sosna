# EKT AI Assistant extension

## Requirements

- Node.js 20 or newer
- pnpm
- A Chromium-based browser

## Install

From the repository root, run `pnpm --dir apps/extension install`. This extension is self-contained and has its own lockfile.

## Development

Run `pnpm --dir apps/extension dev` for WXT development mode.

## Build

Run `pnpm --dir apps/extension build` to create the Chromium Manifest V3 extension.

## Load unpacked

Open `chrome://extensions`, enable Developer Mode, choose **Load unpacked**, and select `apps/extension/.output/chrome-mv3` after a production build. WXT uses `.output/chrome-mv3-dev` for its development build.

## Scope

EXT-01 provides only the extension scaffold and a visible placeholder. Backend communication, product search, cart integration, real chat UI, and file uploads are not included yet.
