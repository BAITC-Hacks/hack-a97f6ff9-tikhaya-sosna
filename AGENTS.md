# Repository instructions for Codex

## Role and scope

Codex is an execution agent. Read the full assigned task before editing. Implement only that task and follow its scope literally. Modify only its allowed files, never its forbidden files. Do not rename unrelated files, redesign unrelated architecture, or refactor opportunistically. Preserve unrelated user changes. Add dependencies only when the task allows them. If an out-of-scope change is required, stop and report the blocker.

## Security

Never add credentials, API keys, BasicAuth values, cookies, access tokens, or payment information. Never copy secrets from chat into source, documentation, reports, or ZIP artifacts. Never expose backend credentials to a browser extension. Never log cookies or Authorization headers. Never execute production cart mutation in automated tests.

## Git safety

Work only on the branch specified by the task. Require a clean working tree before starting unless the task says otherwise. Do not use `git reset --hard`, `git clean -fd`, or `git push --force`. Do not merge, rebase, push without explicit permission, or rewrite history. Create at most one task commit unless instructed otherwise, using the exact requested commit message.

## Testing and dependencies

Run only validation commands explicitly listed under Targeted validation. Do not run the full repository suite, unrelated package tests, or broad E2E tests. Make live network calls only if explicitly requested. Never mutate a real EKT basket during tests. Mock browser APIs, fetch, backend responses, and basket mutations. Record every executed validation command and exit code; never claim an unexecuted test passed.

Use the existing package manager and lockfile strategy. Do not update unrelated dependencies or regenerate lockfiles unless dependencies change. Do not add a production dependency when existing project or platform functionality suffices unless requested.

## Deliverables

Every implementation task should produce `artifacts/<TASK_ID>/<TASK_ID>-changed-files.zip`, `<TASK_ID>-manifest.json`, and `<TASK_ID>-report.md`. ZIP only files created or modified by that task, preserving repository-relative paths. List deleted files in the manifest and report; they cannot be archived. Exclude `.git`, `node_modules`, `.wxt`, `.output`, `dist`, `coverage`, `artifacts`, `__pycache__`, `.pytest_cache`, `.env`, and `.env.*`; `.env.example` is allowed.

The final response must state task status, concise summary, commit hash if created, exact validation commands and PASS/FAIL results, ZIP, report and manifest paths, and unresolved blockers or risks. Claim only supported results.
