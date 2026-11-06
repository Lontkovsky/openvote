# Frozen admission and replay verification

The current integration fixes the public credential roster and trustee keys before opening. Identity recovery delivers the same poll credential. Ballot acceptance invokes the unchanged Belenios verifier, while the application persists one final ballot per credential. These controls assume honest admission and authoritative storage; they do not prove the existence of a person from a valid signature.

## Reproduced boundaries

Before this test expansion, the native suite covered a damaged public credential and malformed proofs. It did not demonstrate rejection of a newly generated, internally valid credential from an unauthorized issuer or isolate environment/context binding while preserving the election UUID. The API already compared immutable registrations, but its credential-roster and trustee-key replacement paths had no dedicated regression evidence.

`tools/test_admission_variants.py` uses only the original credential generation, ballot generation and archive commands. Its temporary foreign private credential never leaves the helper; output consists of public archives and an encrypted ballot. It constructs a changed environment, changed official context, a fresh trustee set under the same UUID, another poll, and an expanded public roster. Each uncast archive independently passes native verification before use as a test fixture. No upstream format or voting primitive is changed.

`tools/test_reference.py` verifies that a genuine foreign credential is refused against the committed roster. An existing ballot is refused by another poll and by the same UUID with a changed environment, official context or trustee keys. Positive native tally, quorum and idempotency checks remain in the same run.

The live-service test suite also exercises the actual identity and ballot application factories against the separate PostgreSQL stores and real native verification transport:

- An identity service token cannot register a ballot election, and a ballot service token cannot register identity credentials.
- Byte-identical registration is idempotent; only one genesis checkpoint is created.
- Additional or reassigned private credentials and a changed manifest fingerprint are refused. The stored sealed credential rows remain identical.
- A valid native archive with an expanded public roster is refused for the registered election. A valid archive with changed context or trustee keys is also refused, and another environment cannot be registered.
- A genuine foreign ballot is refused without changing the registered archive. Identity cookies and user identifiers are refused at ballot intake.
- An authorized ballot is accepted; repeating the original setup does not roll back that accepted ballot. Replaying the ballot into another registered election is refused.

The application-factory checks use the same handlers, migrations and native bridge as the running application. They are API evidence, not browser interaction. The existing live HTTP scenario separately verifies concurrent delivery, cross-provider recovery, fixed deadlines and a complete threshold tally.

## Post-open admission baseline

Before the V030 test extension, a local development reproduction created an open Belenios election with the committed test roster `TEST-PERSON-0001`, `TEST-PERSON-0003` and `TEST-PERSON-0004`. `TEST-PERSON-0006` is an otherwise eligible adult Ukrainian test participant but was intentionally absent from that roster. The reproduction used provider A and the actual identity application factory.

- The committed participant authenticated and received HTTP 200 twice with the same credential and `SameCredentialOnly` recovery.
- The outside eligible participant authenticated successfully but the public credential endpoint returned HTTP 403 `NO_ACTIVE_CREDENTIAL`.
- An internal attempt to add that participant returned HTTP 409 `IMMUTABLE_ROSTER_MISMATCH`.
- The three-row count and stored person/manifest/deadline metadata were unchanged after the rejected extension.

The temporary roster rows, attempts and sessions were removed by the reproduction. This is observed unsupported behavior, not a dynamic-admission implementation or a production guarantee.

## V030 verification checklist

| Case | Prerequisite | Expected behavior | Current baseline |
|---|---|---|---|
| Committed participant | Open election and valid test provider session | Return the same committed credential | HTTP 200 twice; identical credential |
| New eligible participant | Successful provider authentication after the roster is committed | Refuse credential issuance because no committed credential exists | Automated HTTP 403 `NO_ACTIVE_CREDENTIAL` through the public identity flow |
| Identity roster extension | Same poll ID with an additional eligible subject | Preserve the original lock and rows | HTTP 409 `IMMUTABLE_ROSTER_MISMATCH`; three rows unchanged |
| Native archive replacement | Same registered election with an expanded public credential set | Preserve the registered archive | HTTP 409 `IMMUTABLE_ROSTER_MISMATCH` in the existing automated API regression |
| Foreign ballot | Valid ballot from a credential outside the committed native registry | Refuse without changing the election | HTTP 422 `REFERENCE_REJECTED` in the existing automated API regression |
| Existing accepted ballot | Original setup replayed after one accepted ballot | Preserve the accepted ballot and genesis state | Existing automated API regression passes |

The selected integration cannot satisfy dynamic post-open admission. Completion evidence for #41 must retain the requirement as explicitly unfulfilled; it must not claim that these refusals implement support for adding a new participant.

The focused V030 service regression passed in 31.61s. The aligned native suite passed all 27 checks in 57.123s, and the complete service/domain suite passed all 42 tests / seven files in 151.15s. No production source, schema, dependency or reference format changed. Because this is a test/evidence-only assessment with no changed web behavior, a new Browser E2E run is not part of this V030 verification.

## Trust-root limitation

An additional native test deliberately supplies an expanded roster as the trusted input. The foreign credential then produces a valid accepted ballot. Its outcome is recorded as `KnownLimitation`, not `Rejected` or `Prevented`. An independently approved roster commitment and honest admission authority remain necessary; a tally cannot establish whether the issuer created a fictitious person. The native test does not demonstrate that ordinary API clients can replace an already registered roster.

The application registration guards do not constrain an operator who bypasses the application and replaces its storage and signing history. Independently trusted roster provenance, complete role/collusion evidence and recovery/backup controls remain open in #20, #31 and #33. Frozen-roster credential recovery does not revoke a credential that its holder already exported. Adding genuinely new people after opening remains the explicit incompatibility in #41.

## Reproduction

After the README bootstrap and local service startup:

```sh
pnpm exec vitest run tests/services.test.ts -t 'keeps the frozen roster'
pnpm test:crypto
pnpm test
pnpm verify artifacts/reference/election.bel
```

Public results are recorded in `artifacts/reference/reference-report.json` and `artifacts/services/tests.json`. Final-source Browser run `dadf885395` separately passed all 14 stages / 38 assertions and offline verification of its downloaded native archive; `artifacts/e2e/README.md` and `docs/PROGRESS.md` record that compatibility evidence. Passing these checks is not an external review or completion of the development release.
