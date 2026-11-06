# Development release candidate

Status: no public OpenVote release exists yet. This document defines the single release path for the test development candidate. It does not authorize a production launch or a deployment.

## Release boundary

The candidate contains the full test OpenVote application, the demand landing, the unmodified Belenios 3.3.0 reference cryptography, public verification tools and public test evidence. It supports only the declared `TEST-PERSON` fixtures and separately generated test trustee keys.

The candidate is not approved for real politically sensitive participation. Production identity-provider contracts, the legal operator and policies, independent cryptographic/security/privacy review, and independent trustees/governance remain the separate open Production Readiness issues V026–V029. Their required evidence and the only permitted launch sequence are defined by the [launch readiness gate](LAUNCH_READINESS.md).

## Verification checklist

| Case | Prerequisite | Expected result | Current evidence |
|---|---|---|---|
| Clean checkout | Recursive clone, Node 24.20.0, pnpm 10.33.0, Docker and Python 3 | Locked install, bootstrap and migrations complete without private material in Git | Implementation PR #69 merge workflow `41207664468` passed every required job on merged commit `282ec0e4c4ef6502027b36f6483eb2a5cdeca934` |
| Documented commands | Local test services and the exact inputs documented below | `bootstrap`, `dev`, `seed`, `test`, `test:e2e`, `verify`, `audit:export` and `smoke` follow their documented contracts | Passed locally: 103/103 tests, 27/27 native checks, retained Browser 14/14 stages and 38/38 assertions, native archive verification and current-poll audit export; workflow `41207664468` passed every non-Browser contract on the merged implementation |
| Full browser journey | Existing retained in-app Browser and healthy local services | Create, review, three choices, duplicate rejection, close, tally, exports and provider failure/recovery all pass | Retained exact-source run `6c9fa7afdf` passed with identical initial/final source hash; the single final run on the exact production candidate remains deferred until the full-platform cutover |
| Negative and adversarial cases | Test fixtures only | Declared rejections and detections in A01–A11 retain evidence | Complete local suite passed 103/103; workflow `41207664468` repeated the non-Browser contracts successfully |
| Dependency and runtime-image hygiene | Locked production graph and the three built runtime images | Public secret scan and dependency gate pass; all high/critical image findings are reported and fixable findings fail the job | Public scan positive/negative cases and dependency gate passed locally; corrected crypto, full and demand images passed the exact local fixable gate and both CI image gates in workflow `41207664468` |
| Reproducible clients | Clean committed source and pinned crypto image | Two fresh full and demand builds are byte-identical; manifests, checksums, SBOM and provenance are generated | Passed locally and generated again by workflow `41207664468` on merged implementation commit `282ec0e4c4ef6502027b36f6483eb2a5cdeca934` |
| Public evidence hygiene | Candidate source and generated public artifacts | No known credential/private-key pattern, private trustee material or real identity is published | Local pre/post-evidence scans and both workflow `41207664468` hygiene steps passed; documentation reconciliation workflow `41209184691` also passed on merged commit `004289f5e9ba95c571e62869cc851247b35ab7e2` |
| Public RC | All implementable rows above passed on the exact PR head and required CI is green | One GitHub prerelease points to the merged exact commit and links the remaining open Production Readiness work | Not published |

No row becomes complete from documentation alone. The issue, board and final report must link the actual run, exact commit, PR and CI result.

## Exact local verification path

From a recursive clean checkout, build the pinned reference image, install the locked workspace and initialize the isolated test services:

```sh
docker build --platform linux/amd64 --target crypto-runtime -f infra/crypto.Dockerfile -t openvote-crypto:3.3.0 .
pnpm install --frozen-lockfile
pnpm bootstrap
pnpm dev
```

Keep `pnpm dev` running. In another terminal, exercise the documented non-browser entrypoints:

```sh
pnpm smoke
pnpm seed
pnpm test
pnpm types
pnpm build
pnpm build:demand
pnpm release:verify .runtime/release
```

Run `pnpm test:e2e` once and complete every stage through the existing in-app Browser exactly as described in [BROWSER_TESTING.md](BROWSER_TESTING.md). Then independently verify the archive downloaded by that Browser:

```sh
pnpm verify artifacts/e2e/election.bel
```

The `audit:export` command requires the exact pretrusted observer configuration described in [OBSERVER.md](OBSERVER.md). Its successful local contract is recorded there with the actual retained test configuration and exclusive output path; the focused observer suite reproduces both successful export and rejected evidence cases.

Finally run the bounded public scan and inspect the diff:

```sh
python3 scripts/scan-public.py
git diff --check
```

## Public candidate contents

The GitHub source archive supplies the exact reviewed source. Required CI attaches two public evidence artifacts:

- `release-public-evidence`: full and demand clients, strict manifests, `SHA256SUMS`, CycloneDX SBOM and build provenance;
- `reference-public-evidence`: the public Belenios archive and reference verification report.

The source archive also contains the final retained-Browser report and public exports under `artifacts/e2e`, the observer evidence under `artifacts/observer`, the bounded load report and the A01–A11 registry. Database dumps, runtime configuration, identity sessions, private credentials, trustee secrets, receipt collections and `.runtime` never belong in a public release.

## Publication gate

Publish exactly one GitHub prerelease only after the final integrated Browser report is committed, the implementation PR is approved for merge, required CI is successful on that exact head, the merged commit is known, and the public-artifact scan is repeated. The release notes must link this checklist, the exact commit and CI run, and must list V026–V029 as open external prerequisites.

Deployment is a separate owner-approved action. The demand-only homepage is live and Browser-verified; that deployment is not evidence that the full platform is hosted or production-ready. Full-platform cutover remains blocked by [LAUNCH_READINESS.md](LAUNCH_READINESS.md) and issue [#51](https://github.com/Lontkovsky/openvote/issues/51).
