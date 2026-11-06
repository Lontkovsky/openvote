# Відкритий голос — engineering instructions

Read `docs/REQUIREMENTS.md`, `docs/REQUIREMENTS-A15.md`, `docs/PROGRESS.md`, and the linked GitHub issue before implementation. The user supplied requirements are authoritative. Use `rtk` for every shell command.

Build only test development scenarios. Never accept real identity data in development. No custom voting cryptography, fabricated guarantees, hidden fallback, credential reset, revoting, or client plaintext sent to the ballot box. Preserve reference cryptographic formats. Keep identity and ballot storage, origins, sessions and keys separate. Production must fail closed until readiness work is completed.

Reproduce current behavior, audit the complete flow, implement a small vertical change, run its positive and adversarial tests, inspect browser behavior, review the diff, and wait for actual CI success before merging. Use small PRs after bootstrap. Do not fabricate review approvals. Use the existing in-app Browser and its tab.playwright API only; never launch another browser. Do not close the tab automatically.

GitHub Issues and Projects own execution status. Repository docs own requirements and evidence. Keep `docs/PROGRESS.md`, `docs/DECISIONS.md`, traceability and attack coverage accurate. An analyzed limitation is not an implemented control. Never mark development release complete with unfulfilled implementable acceptance criteria. Do not mention the assistant product name in branches, PR titles, logs or test payloads.

Own code is AGPL-3.0-only. Preserve upstream licenses and attribution. Scan secrets, private keys, personal data and licenses before every public push. Never publish credentials, private trustee material or unsafe privacy-test artifacts.
