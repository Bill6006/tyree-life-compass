# Builder entry point

Read `../tyree-life-compass.plan.md` and `.local/phase-ledger.json` before making changes. The plan and ledger are local, private build instructions: never copy them into this public repository or deployment.

Implement one phase per conversation. Phase 0 was authorized by the user's request to implement the plan. A shipped phase stays unapproved until the user says `Green - next phase`. `Yellow - ...` fixes the current phase. Do not advance phases, run a separate review round, invent observations, or ask extra questions. If scope grows, stop and identify the addition.

Honor the plan's approved Vite/React/plain-CSS/IndexedDB stack and GitHub Pages deployment, even when an optional skill suggests another scaffold or host. Keep every personal record on the device. Never commit exports, backups, local instructions, credentials, or private names. Do not add telemetry or remote fonts.

On Windows, a certificate error from npm can be resolved using the existing Windows trust store for that command: append `--use-system-ca` to the process's `NODE_OPTIONS`. Never disable TLS verification. Do not write that machine-specific option into the package configuration or CI.

Run the production build, browser tests against that exact output, and artifact verification. Commit and push the tested source; GitHub Actions builds one artifact, tests it, deploys it without a rebuild, and verifies all served files. Confirm the complete workflow and live site before delivery. Finish with the live link and three lines: Open / Do / Look for. Wait for Green or Yellow.

Treat the user's explicit instructions as authoritative. Do not inspect or reuse neighboring projects.
