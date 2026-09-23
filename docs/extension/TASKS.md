# Extension tasks

| Task | Objective | Status | Dependencies | Allowed scope | Targeted validation |
|---|---|---|---|---|---|
| EXT-00 | Establish Codex workflow, documentation, and artifact packaging. | completed | None | Instructions, docs, packaging script, script tests, ignore rule | Packaging unittest; CLI help |
| EXT-01 | Bootstrap WXT React TypeScript extension. | completed | EXT-00 | Extension scaffold; necessary workspace files | Extension typecheck, scaffold test, build |
| EXT-02 | Add typed runtime contracts and messaging. | completed | EXT-01 | Extension contracts and messaging | Task-specified contract tests and typecheck |
| EXT-03 | Implement Shadow DOM chat widget shell. | completed | EXT-02 | Extension UI and styles | Task-specified component tests |
| EXT-04 | Implement extension session storage and EKT page context. | completed | EXT-02 | Extension storage and page context | Task-specified storage/context tests |
| EXT-05 | Implement background-to-backend transport. | pending | EXT-02, EXT-04 | Extension background and service | Task-specified transport tests |
| EXT-06 | Implement chat flow and product cards. | pending | EXT-03, EXT-05 | Extension chat UI and services | Task-specified chat tests |
| EXT-07 | Implement explicit cart confirmation state machine. | pending | EXT-05, EXT-06 | Extension cart state and UI | Task-specified state tests |
| EXT-08 | Implement EKT basket adapter. | pending | EXT-07 | Extension basket adapter | Mocked basket adapter tests |
| EXT-09 | Implement attachment upload UI and transport. | pending | EXT-05, EXT-06 | Extension upload UI and service | Task-specified upload tests |
| EXT-10 | Improve responsive UI, accessibility, and localization structure. | pending | EXT-06, EXT-07 | Extension UI, styles, localization | Task-specified UI checks |
| EXT-11 | Add targeted critical integration scenarios. | pending | EXT-08, EXT-09, EXT-10 | Extension integration tests | Task-specified integration tests |
| EXT-12 | Create release build, permissions review, README, and extension package. | pending | EXT-11 | Extension release files | Task-specified release build and review |
