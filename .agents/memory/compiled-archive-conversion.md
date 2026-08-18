---
name: Compiled archive conversion
description: Limits and approach for turning production-only web archives into editable projects.
---

Production archives without source maps or original source files cannot be restored to the exact original React/TypeScript project. The reliable approach is to preserve supplied media and public content, then rebuild the visible frontend as readable source while clearly isolating any unrecoverable backend behavior.

**Why:** Bundled JavaScript preserves runtime behavior but loses original component boundaries, naming, comments, and project structure; beautifying it does not make it maintainable source.

**How to apply:** When a future archive contains only `dist`/`public/assets` bundles, inspect for source maps first, then choose between a source reconstruction and a reference-only compiled bundle. Do not claim an exact decompilation.