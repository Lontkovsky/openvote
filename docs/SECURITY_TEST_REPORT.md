# Security adversarial test report

Status: local development evidence. No external review or production certification is claimed.

## Baseline reproduction

Before the focused test was added, one temporary synthetic draft stored a script-shaped question and an unreachable `https://127.0.0.1:1/private` source as data. The current APIs returned: other-user read `404`, other-user edit `403`, SQL-shaped catalogue query `200` without exposing the draft, and foreign-origin mutation `403`. The draft and sessions were removed. The behavior existed, but there was no single reproducible test/report and no executable validation of the A01–A11 registry.

## Focused cases

| Case | Input and prerequisite | Expected | Actual local result | Remaining boundary |
|---|---|---|---|---|
| Machine registry | `docs/attack-coverage.json` | Exactly A01–A11; strict, unique IDs; defense outcome and evidence state are separate; tested entries have evidence | Passed | Registry evidence is still self-review unless marked otherwise |
| SQL/path injection | Catalogue query and poll ID contain `' OR 1=1 --` | Query is data; draft remains hidden; invalid UUID is rejected | Passed: catalogue `200` without draft, path `400 INVALID_INPUT` | PostgreSQL/source compromise is outside input validation |
| Stored XSS transport and DOM | Script and event-handler shaped text in question/argument | API stores and returns exact text only as JSON; React renders the literal text; no executable element or handler is created | Passed: API JSON retained the text and final retained-Browser fixture showed the exact `<script>`/`<img ... onerror>` strings with zero `main script`, `[onerror]` or injected image nodes and no executed marker | A compromised reviewed client or dependency remains a separate supply-chain boundary |
| CSRF/cross-origin mutation | Valid bearer token with `Origin: https://attacker.invalid` | Exact-origin hook rejects before mutation | Passed: `403 ORIGIN_REJECTED` | A compromised allowed origin or stolen bearer token is a different threat |
| SSRF | Unreachable HTTPS loopback source URL, then an HTTP loopback URL | HTTPS source is stored without server fetch; non-HTTPS source is rejected | Passed: draft created with unreachable HTTPS URL; HTTP URL returned `400 INVALID_INPUT` | Users may later open external links in their own client; the platform does not archive or fetch them |
| IDOR read | Authenticated participant requests another author's Draft | Resource is not disclosed | Passed: `404 POLL_NOT_FOUND` | Moderator access is an explicit role capability |
| IDOR write | Authenticated participant edits another author's Draft | Author check rejects | Passed: `403 AUTHOR_REQUIRED` | Compromised author session remains an account-security risk |
| Privilege escalation | Participant calls review and incident routes | Moderator check rejects | Passed: both returned `403 MODERATOR_REQUIRED` | Compromised moderator credentials retain moderator powers |
| Oversized request | JSON body exceeds 1 MiB | Reject before route handling | Passed: `413 INVALID_INPUT` | Gateway/provider limits still require deployment-specific monitoring |
| Resource burst | More than 8 active plus 16 waiting requests; more than 1,024 short operations in 5,000 ms | Bound active work and queue; bound sequential operation rate; recover after the fixed window | Passed: maximum 8 active; overflow and two-second expiry returned `503 SERVER_BUSY`; request 1,025 returned `429 RATE_LIMITED`, then recovered | Process-local controls do not replace upstream DDoS protection or deployment-wide admission control |
| Client JavaScript substitution | Trusted local manifest, then changed JavaScript served at the same path | Independent monitor rejects changed bytes | Passed: trusted pair verified; changed response returned `CLIENT_ARTIFACT_MISMATCH` | One monitor cannot prove identical delivery to every user; manifest custody is external |

All fixtures are synthetic. The test removes its draft and sessions and stores no token, credential, tracker, identity or malicious HTML artifact.

## Reproduction

With the documented local services running on Node 24.20.0:

```sh
pnpm exec vitest run tests/security.test.ts
pnpm exec vitest run tests/services.test.ts -t "rejects injection, CSRF, SSRF, IDOR"
```

The latest V039 affected-service run passed 17/17 cases, and the focused transport run passed 14/14. Final retained-Browser run `6c9fa7afdf` passed 14/14 stages and 38/38 assertions with identical initial/final source hashes; the additional exact DOM fixture verified literal script-shaped text without an executable node or handler and was then removed by its exact synthetic ID. A focused retained in-app Browser check prepared 1,024 read-only requests, visibly observed `RATE_LIMITED` on reload, waited five seconds and visibly observed the normal provider catalogue again. Type checking passed. This remains self-test evidence, not an external review or the owner-deferred final production-candidate E2E.
