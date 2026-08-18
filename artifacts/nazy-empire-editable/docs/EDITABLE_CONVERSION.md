# Nazy Empire editable conversion

## What this project contains

This project is a clean, editable React + TypeScript reconstruction of the
public-facing Nazy Empire Digital website found in the supplied archive.

- Page content is kept in normal source files and React components.
- Branding media from the archive is stored in `public/media/`.
- Navigation, forms, mobile behavior, and the royalty estimate calculator are
  implemented in source.
- The site does not claim to send messages, authenticate users, process
  payments, or persist account data because the original source code and
  service credentials were not included.

## Why the original archive could not be directly uncompiled

The archive contains production bundles such as `public/assets/index-*.js`,
`public/assets/index-*.css`, and `server-bundle.cjs`. It does not contain the
original React/TypeScript files or source maps. A minified production bundle
does not retain the original component boundaries, variable names, comments,
or build-time project structure, so it cannot be converted back into the exact
original source automatically.

The frontend has therefore been rebuilt as readable source instead of merely
renaming or beautifying the compiled files. The original deployment archive
should be kept separately as a behavior reference when restoring backend
features.

## Editing

Run the project with the workspace's normal web workflow, then edit files under
`src/`. Start with `src/App.tsx` for routing and page composition, and the
source files it imports for individual sections and content.