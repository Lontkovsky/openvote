# ADR 0001: Belenios 3.3.0 reference core

Status: selected for test development; integration validation in progress. Date: 2026-09-06.

Use unchanged Belenios 3.3.0 at `337887bd1862c7cd057080b530fd80941bfc3c69`: native OCaml `belenios-tool` for setup, ballot verification, archive events, aggregate, threshold decryption and public verification; its compiled `belenios_jslib.js` for client encryption. Three equally weighted answers, one selection, Ed25519 group, election format 1. Original code remains AGPL-3.0-or-later with its OpenSSL exception; our integration is AGPL-3.0-only.

## Comparison grounded in implementation

| Property | Belenios 3.3.0 | Helios server | ElectionGuard |
|---|---|---|---|
| License | AGPL v3 or later + OpenSSL exception | Apache-2.0 | MIT |
| Browser ballot encryption and proofs | Existing compiled OCaml JS library | Existing JS voting booth | SDK integration required |
| Threshold tally | Official `tests/tool/demo-threshold.sh`, 2-of-3 plus mandatory trustee | Standard server combines all trustee contributions; no matching standard threshold flow established | Guardian quorum; eligibility is outside SDK |
| Eligibility | Election-scoped signing credentials and fixed public credential set | Account/voter roster and server authentication | External admission layer required |
| Offline verification | `belenios-tool election verify` on `.bel` archive | Election/ballot verifier | Election record verification |
| Reference restrictions needing analysis | Revoting, fixed roster, issuer-to-credential linkage | Revoting, identity/ballot association | Remote identity/credential composition remains unprovided |

Belenios supplies a runnable native threshold reference scenario and browser encryption sharing the same protocol implementation. Semaphore supplies anonymous membership/nullifier proofs, not a complete encrypted verifiable tally; it is not composed into this protocol.

## Product compatibility and explicit changes at the service boundary

The original cryptographic code and artifact formats are unchanged. The standard Belenios web server is not used: application services wrap the reference core. This integration is a new composition requiring external cryptographic/privacy review. It does **not** inherit an audit of the whole application.

| Requirement | Actual treatment |
|---|---|
| New participant in already open poll | A fixed test roster is committed before opening. Existing roster members can claim their credential during voting. Adding a new person after opening is **not supported** and remains an open product requirement; no dynamic cryptographic registry is invented. |
| Final, unchangeable vote | Ballot box enforces one ciphertext per reference signing credential with a database uniqueness constraint; byte-identical resubmission is idempotent. Offline wrapper rejects all repeated credential events, although upstream permits revoting. |
| Identity/ciphertext unlinkability | Ballot box receives no identity session or user ID. Issuer sees person→credential and can associate it with public ciphertext. This is a known limitation distinct from learning plaintext. |
| Authentication and recovery | Test providers attest the same stable test person. Credential re-delivery returns the same election credential, never resets the voting identity. Credential holder can transfer it; credential secrecy and honest issuer remain required. |
| Revocation and rotation | Revoke before opening. Frozen roster/key changes require cancellation/new poll. Active-poll revocation is not claimed. |
| Small groups | No interim counts or distribution. Before any decryption, require the manifest publication threshold. Suppressed packages contain no decryption shares/results. |
| Environment / manifest binding | Election UUID and exact official context, environment, participation policy, deadline, release identity and publication threshold are included in the reference election description, covered by its fingerprint and ballot proofs. |
| Threshold | Official 2-of-3 Pedersen flow **plus one mandatory trustee**, as implemented upstream. Do not describe it as merely 2-of-3. Local keys simulate operators and are never production keys. |

## Trust, exact guarantees and limits

Correct encryption and proof verification require a trustworthy client/device and uncompromised reference build. Tally confidentiality requires the mandatory trustee or enough threshold trustees to remain uncompromised; a sufficient key coalition can decrypt individual ballots. Honest issuer and independent roster oversight are needed to establish real eligibility. Cryptographic validity never proves that a test or issuer-controlled roster represents real people.

Reference verification detects invalid proofs and incorrect aggregate/decryption/result relationships; a tracker verifies inclusion only. The current browser integration does not claim cast-as-intended verification, receipt-freeness, coercion resistance, global metadata anonymity or representativeness. An issuer can retain credentials; a compromised client can exfiltrate a choice. Observer comparisons detect equivocation only after incompatible evidence is exchanged.

Honest trustee wrappers must validate a final signed checkpoint, entire archive, manifest, close time and minimum group before producing a share, and persist the one allowed final ballot set. Wrappers cannot constrain malicious key holders bypassing them.

## External validation plan

Commission protocol-composition review (admission boundary, fixed roster, final-vote semantics, recovery, archive finality and signing), browser/code-delivery audit, privacy/collusion analysis, dependency/build review and an operational key ceremony with genuinely independent people before real use. These are Production Readiness tasks; runnable test controls are development work.

## Sources inspected

- https://www.belenios.org/documentation.html and https://www.belenios.org/instructions.html
- https://github.com/glondu/belenios/tree/3.3.0 — `src/web/clients/jslib/belenios_jslib.ml`, `src/tool/tool_election.ml`, `src/lib/core/credential.ml`, `tests/tool/demo-threshold.sh`, `RELEASE_NOTES.md`, licenses.
- https://github.com/benadida/helios-server and https://vote.heliosvoting.org/faq
- https://github.com/Election-Tech-Initiative/electionguard and https://electionguard.vote/spec/
- https://docs.semaphore.pse.dev/
