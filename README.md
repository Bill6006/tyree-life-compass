# Tyree Life Compass

An installable, offline-capable personal app. Application records stay in the browser's IndexedDB database. The public repository and GitHub Pages host contain static application code only.

Phase 0 provides an empty Today screen, Android installation guidance, storage initialization, offline access, and a release evidence screen. It contains no sample personal records.

## Development

Use Node.js 22.18 or later and npm. Install with `npm ci`, then run `npm run dev`. The application uses the `/tyree-life-compass/` base path and hash navigation so direct links also work on GitHub Pages.

## Verification

- `npm test`: storage and deployment-integrity tests.
- `npm run build`: type checking, local icon generation, production build, and a SHA-256 manifest covering every deployed file except the manifest itself.
- `npx playwright install chromium`: browser setup.
- `npm run test:e2e`: Android-sized and desktop Chromium tests against the built directory, including offline reload, manifest/icon validation, accessibility, storage, and release identity.
- `npm run verify:artifact`: ensure no built file changed after sealing and testing.
- `npm run verify:deployed`: compare the live manifest and every served file with a locally held tested manifest.

The Pages workflow builds once, tests the compiled directory, uploads it, and deploys that same artifact. A dependent job downloads the expected manifest from the build job and checks all live files without rebuilding. Source commit, workflow attempt, build time, and manifest fingerprint are available in About and the workflow summary. The fingerprint is an integrity check, not a signature or a claim that every future feature has been tested.

## Device boundaries

No accounts, telemetry, cloud synchronization, or personal API calls. External build-evidence links open only when selected. Service workers cache static application assets. Browser-managed storage can be erased; persistent storage is requested only through the About control and may be declined by the browser. A closed PWA does not guarantee scheduled local notifications; Android alarms provide reminders.

Source is public. Private planning instructions, phase state, exports, and backups are excluded from Git and deployment.
