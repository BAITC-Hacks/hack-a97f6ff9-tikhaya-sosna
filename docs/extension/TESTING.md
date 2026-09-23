# Extension testing policy

Run only validation commands listed in each task. Do not run the repository-wide suite or backend tests from extension tasks unless explicitly requested. Do not make production network mutations or mutate a real EKT cart. Mock external services, browser APIs, backend responses, and basket requests.

Record every executed validation command and its exit code in the task report. Manual browser verification is separate from automated tests and must not be claimed unless actually performed.
