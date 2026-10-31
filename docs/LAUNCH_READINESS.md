# Launch readiness gate

Status at `7622b76ce88f68e5387d61dbadb75ef5efa92ebb`: **not approved for real identity-verified voting**. The public service at `https://openvote.com.ua` is the separate demand-validation landing. The full OpenVote platform remains synthetic, unavailable on the public domain and fail-closed for a `production` environment.

This gate is the authoritative boundary between the completed synthetic development work and a real launch. Documentation, self-review, local mock providers, one-owner hosting and test trustee keys cannot satisfy an external prerequisite.

## Current technical boundary

| Boundary | Current verified behavior | Launch implication |
|---|---|---|
| Runtime environment | `Environment` accepts only `development`, `test` and `demo`; the Render full runtime accepts only `demo`. Tests reject `OPENVOTE_ENVIRONMENT=production` | A real launch cannot start by changing one environment variable. A reviewed production configuration is required |
| Identity providers | Mock A/B accept only `TEST-PERSON-*`. Дія.Підпис, BankID НБУ and КЕП are `AwaitingProviderContract`, unavailable and unselectable | No real identity, RNOKPP ownership, age or citizenship claim is accepted |
| Public hosting | Render serves only the demand image and `openvote-demand`; direct catalogue routes still render the demand landing | The catalogue, identity, ballot, management and trustee flows are not public |
| Key custody | Local/demo keys simulate separate roles but one operator controls the repository, hosting and runtime | No organizational independence or production anonymity is claimed |
| External validation | Repository tests and self-review are public; no independent cryptographic, security, privacy or legal approval exists | Self-review cannot authorize a real politically sensitive launch |
| Repository security analysis | Dependabot vulnerability alerts and security updates, secret scanning with push protection, and extended CodeQL default setup are enabled. Initial CodeQL run `41212450725` passed and opened 36 retained findings | V039–V041 must reproduce and remediate the findings; a successful analysis job is not a clean security result |

## Required internal security remediation

| Gate | Owning issue | Evidence required to pass | Current state |
|---|---|---|---|
| Unbounded API route operations | [V039](https://github.com/Lontkovsky/openvote/issues/76) | Route-by-route reproduction, compatible bounded request control, positive and adversarial tests, and a subsequent extended CodeQL analysis closing alerts 1–28 without manual dismissal | 28 high-severity findings are open |
| Runtime configuration file race | [V040](https://github.com/Lontkovsky/openvote/issues/77) | Exact time-of-check/time-of-use reproduction, focused correction and tests, and a subsequent extended CodeQL analysis closing alert 36 without manual dismissal | One high-severity finding is open |
| File-data outbound request boundaries | [V041](https://github.com/Lontkovsky/openvote/issues/78) | Individual production/test data-path mapping, focused remediation and adversarial tests, and a subsequent extended CodeQL analysis closing alerts 29–35 without manual dismissal | Seven medium-severity findings are open; six are test-classified and one is in production API code |

## Required external readiness evidence

| Gate | Owning issue | Evidence required to pass | Current state |
|---|---|---|---|
| Provider contracts and verified attributes | [V026](https://github.com/Lontkovsky/openvote/issues/37) | Executed provider agreements; exact approved attribute sets; stable-subject and RNOKPP-owner semantics; freshness, signature, certificate and revocation rules; test-environment credentials; successful and adversarial integration reports; confirmed shared-upstream dependency map | Blocked on real provider contracts and access. The current dependency map is documented in [IDENTITY_PROVIDERS.md](IDENTITY_PROVIDERS.md) |
| Legal operator and public policies | [V027](https://github.com/Lontkovsky/openvote/issues/38) | Owner-approved responsible operator; participation and minors policy; legal basis; privacy notice and terms; retention, deletion and backup policy; hosting and international-transfer decision; moderation and appeal policy | No operator or legal approval has been supplied |
| Independent review | [V028](https://github.com/Lontkovsky/openvote/issues/39) | Named independent reviewers; explicit cryptographic, protocol-composition, application-security, privacy, infrastructure and client-delivery scope; actual reports; tracked findings; verified remediation or accepted residual risk | No external report exists; repository self-tests do not count |
| Independent trustees and operations | [V029](https://github.com/Lontkovsky/openvote/issues/40) | Identified independent operators; approved quorum; real key ceremony; separate custody and recovery; repository/release/hosting authority map; incident roles; disclosure, funding and support decisions | No independent operators or real ceremony exist |
| Hosted full-platform cutover | [#51](https://github.com/Lontkovsky/openvote/issues/51) | Owner-approved Blueprint diff and cost; resumed role databases; initialized persistent runtime; suspended demand database; actual wildcard DNS/TLS; exact-host API checks; hosted synthetic full flow; restart persistence; rollback and restore evidence | Explicitly deferred. The current domain must remain demand-only |

## Owner decisions required before implementation can continue

The following decisions require the repository owner and, where applicable, qualified external counsel or reviewers. They are not inferred from the demand landing or source code:

- responsible legal operator and jurisdiction;
- whether age, citizenship or another criterion is required in addition to verified RNOKPP ownership;
- participation by minors and the evidence used for age;
- legal basis, privacy notice, terms, retention, deletion, backup and data-subject procedures;
- hosting location and any international data transfer;
- selected production identity provider or allowed provider combination and the cross-provider deduplication rule;
- moderation, appeal, lawful-removal and transparency-report policy;
- independent review scope, reviewer independence and resolution authority;
- trustee identities, quorum, ceremony, custody, rotation, recovery and incident responsibilities;
- operational funding, support channel, vulnerability response and conflict-of-interest disclosure.

## Required implementation sequence

There is one launch path; a missing step blocks the steps after it.

1. Record the owner decisions above in the owning issues without personal credentials or private contract material.
2. Obtain and review the exact provider contracts before defining production payloads, endpoints, certificates or trust anchors.
3. Implement production adapters against those contracts. Keep mocks rejected and run positive, replay, expiry, invalid-signature, revocation, outage and cross-provider deduplication tests.
4. Approve and publish the legal/operator policies. Encode only the eligibility rules those approved provider attributes can actually prove.
5. Reproduce and remediate every tracked repository security finding on the candidate. Require the subsequent extended analysis to close it without manual dismissal.
6. Commission the independent cryptographic, security and privacy review on the exact candidate. Resolve findings through linked PRs and repeat the affected checks.
7. Complete a real independent trustee ceremony with separate custody. Publish only safe public keys, ceremony evidence and responsibilities.
8. Produce one exact release candidate with source commit, locked toolchain, SBOM, checksums, provenance and separately retained client-monitor configuration.
9. Exercise backup and restore in an isolated no-write environment and obtain recovery approval for every retained poll before reopening writes.
10. Apply the owner-approved full-platform Blueprint and DNS cutover described in [DEPLOYMENT.md](DEPLOYMENT.md). Do not delete or regenerate the reserved disk to recover a failed deployment.
11. Run the single final full-platform E2E in the retained in-app Browser on the exact production candidate, then verify restart persistence, public audit exports, unknown-host rejection and the independent archive verifier.
12. Complete a launch review that links every item above. The owner must make one explicit real-use decision; a passing CI run cannot make that decision.

## Verification checklist for this gate

Before a launch recommendation, each row must contain actual evidence rather than a planned document:

- provider agreements and test reports are linked from V026;
- approved operator/policy documents are linked from V027;
- independent reports and finding resolutions are linked from V028;
- trustee ceremony and operational responsibilities are linked from V029;
- the exact release commit, PR and successful CI runs are recorded;
- production configuration rejects mocks, test keys and unsafe defaults;
- Dependabot and secret-scanning results are read, and every confirmed CodeQL finding is closed by a subsequent analysis rather than manually dismissed;
- public-artifact, dependency and runtime-image gates pass on the exact candidate;
- the full hosted Browser run and actual restart/restore evidence pass;
- the public trust center matches the approved policies and reviewed guarantees;
- E10 is closed only after every linked issue is Done.

Until then, the correct public statement is: the demand poll is live, the full platform is a synthetic development system, and real production readiness remains open.
