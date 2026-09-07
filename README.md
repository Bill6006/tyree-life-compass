# Tyree Life Compass

An installable, offline-capable personal app. Application records stay in the browser's IndexedDB database. The public repository and GitHub Pages host contain static application code only.

Phase 1 adds phrase-based morning, afternoon, and evening check-ins, resumable local drafts, a fixed four-ingredient reading, timestamped context, and comparisons with earlier recorded phrases. Saved readings support correction, deletion, JSON/CSV export, and additive JSON restore. It contains no sample personal records, recommendations, or learned claims.

Phase 2 adds optional evening notes and three-state context chips, an opt-in faith reflection, independent depth/frequency settings, quiet hours, and a low-demand override that preserves usual settings. Android alarms remain manually configured; the app neither schedules closed-PWA notifications nor escalates after silence. Draft depth stays fixed when settings change.

Private items and day-level entries use separate IndexedDB tables. They are named only in the app, hidden when disabled, and excluded from ordinary exports, including the enable flag. Explicit private JSON/CSV exports and additive private restore live inside the enabled private settings. Private entries save separately as tapped, distinguish explicit absence from no entry, and do not claim effects. Disabling visibility retains entries; deleting an item removes its entries. The visibility switch is not an encryption or authentication boundary.

Database version 3 preserves earlier readings and drafts. Ordinary backup version 2 accepts version 1 backups, includes evening context and optional settings, and never restores private visibility. Text fields are escaped for spreadsheet formula interpretation in CSV exports. Settings restore is separately opt-in.

The score equally averages mood, energy, reversed irritation, and reversed stress. Every ingredient is required; context never substitutes for a missing answer. A local worker calculates results. Draft writes and saved-record changes are transactional, and stale drafts cannot overwrite newer records. Restore validates the entire backup before writing and keeps existing records unchanged. Versioned, allowlisted exports include unfinished work and exclude unknown future fields.

## Development

Use Node.js 22.18 or later and npm. Install with `npm ci`, then run `npm run dev`. The application uses the `/tyree-life-compass/` base path and hash navigation so direct links also work on GitHub Pages.

## Verification

- `npm test`: score direction, missingness, chronological comparisons, database migration, interrupted drafts, stale writes, correction/deletion, backup privacy/restore, and deployment-integrity tests.
- `npm run build`: type checking, local icon generation, production build, and a SHA-256 manifest covering every deployed file except the manifest itself.
- `npx playwright install chromium`: browser setup.
- `npm run test:e2e`: Android-sized and desktop Chromium tests against the built directory, including complete check-ins, incomplete results, offline draft recovery, correction/deletion/export/restore, accessibility, installation, and release identity. Screenshots and measured save-to-result times are attached; emulation is not a physical-phone timing guarantee.
- `npm run verify:artifact`: ensure no built file changed after sealing and testing.
- `npm run verify:deployed`: compare the live manifest and every served file with a locally held tested manifest.

The Pages workflow builds once, tests the compiled directory, uploads it, and deploys that same artifact. A dependent job downloads the expected manifest from the build job and checks all live files without rebuilding. Source commit, workflow attempt, build time, and manifest fingerprint are available in About and the workflow summary. The fingerprint is an integrity check, not a signature or a claim that every future feature has been tested.

## Device boundaries

No accounts, telemetry, cloud synchronization, or personal API calls. External build-evidence links open only when selected. Service workers cache static application assets. Browser-managed storage can be erased; persistent storage is requested only through the About control and may be declined by the browser. A closed PWA does not guarantee scheduled local notifications; Android alarms provide reminders.

Source is public. Private planning instructions, phase state, exports, and backups are excluded from Git and deployment.
