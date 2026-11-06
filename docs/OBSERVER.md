# Independent public observer

The observer runs as a separate Node process. It needs the pinned workspace dependencies, Docker reference image and a trusted configuration for one known poll. It does not import application configuration, connect to PostgreSQL, call identity endpoints, send authorization/cookies or accept ballots. Every network call is a public GET. Responses have a ten-second deadline and an eight-MiB limit; redirects fail. Native verification runs with Docker networking disabled and only reference tools mounted.

## Trust input

Prepare a JSON file matching `ObserverConfig` in `packages/domain/src/observer.ts`:

| Field | Required meaning |
|---|---|
| `ballotOrigin` | Exact HTTP/HTTPS public ballot origin, without path, credentials or trailing slash |
| `managementOrigin` | Exact public management origin |
| `trust.pollId` | Fourteen-character native election ID |
| `trust.manifestHash` | SHA-256 of the exact native election JSON bytes, independently pinned |
| `trust.publicKey` | Previously authenticated checkpoint-signing public key in PEM form |
| `receipts` | Array of signed public receipt envelopes held by this observer; an empty array explicitly means no individual acknowledgement evidence |

Do not learn the trusted key/hash solely from the endpoint being checked and then treat the comparison as independent authentication. Obtain and compare them through the declared ceremony/release channel. The local evidence used a previously retained public signing key and browser-exported manifest from this test development deployment. It was not an independent organizational ceremony or external audit.

Keep previously observed receipts in the configuration when adding more. The command rejects removal of known receipt evidence. There are no person identifiers, identity sessions or private voting credentials in this input. A receipt shows an acknowledgement/inclusion claim, not the participant's choice or cast-as-intended verification.

## Commands and persistence

The observer takes an action (`init`, `check` or `compare`), followed by the trusted configuration path and state path. `compare` requires a second state path. The audit exporter takes the trusted configuration path and output path. The read-only mirror exporter takes the trusted configuration path and a new output-directory path. Recovery verification takes trusted configuration, a separately retained prior observation and a new approval path. All file arguments are required.

The following commands were executed successfully against the locally retained test poll `bWR6QtTPMZawJd`. Their configuration is private local runtime input, not a universal configuration for another checkout:

```sh
pnpm observer init .runtime/observer-live-trust.json .runtime/observer-live-state.json
pnpm observer check .runtime/observer-live-trust.json .runtime/observer-live-state.json
pnpm audit:export .runtime/observer-live-trust.json .runtime/observer-live-audit.json
pnpm mirror:export .runtime/observer-live-trust.json .runtime/observer-live-mirror
pnpm recovery:verify .runtime/observer-live-trust.json .runtime/observer-live-state.json .runtime/recovery-approval.json
```

`init` creates a new observation file exclusively. It cannot replace an existing history. `check` requires that history to exist and be valid; missing/corrupt state never causes implicit initialization. Successful writes use a temporary file, fsync, atomic link/rename and a directory fsync. Failures leave the prior history unchanged. A per-state lock rejects concurrent writers. A lock left by a killed process is not automatically removed: inspect the process and evidence before explicitly removing the stale lock. This fail-closed maintenance condition is not an alternate observer workflow.

State contains the trusted configuration, signed checkpoints, management ID and verification/hash status. It does not persist the question, native archive or other full content. `audit:export` separately writes the complete allowed public audit only after successful native verification. It creates its output exclusively; it does not overwrite an existing package.

`ReferenceVerified` means the current published archive passed the original Belenios verifier and application contract/checkpoint comparisons. `CheckpointsOnly` means signed history was checked but no public native tally was available. Neither means independent audit of the deployed platform. An unpublishable, removed or missing resource fails the relevant check/export instead of creating a replacement result.

`mirror:export` is the single recovery path for another hosting provider. It performs the same current public checks and native verification, then creates a new directory containing `index.html`, `result.json` and `audit.json`. The page has no script, form, identity connection, session or write endpoint. The output directory must not already exist, and a failed export is removed. Serve the directory as immutable static files. The command does not synchronize, refresh or republish an earlier snapshot; a lawful withdrawal requires the separately hosted copy to be withdrawn by its operator.

`recovery:verify` is the restore gate described in `docs/RECOVERY.md`. It compares a restored public view with the prior signed history and every receipt retained in the configuration. It creates a strict approval file exclusively; rollback, missing acknowledgement, changed content or verification failure creates no approval. The restored environment must remain isolated from write traffic until every required poll passes. This gate cannot recover evidence that was never retained or force a malicious host operator to run it.

## Detection and limitations

The observer verifies signatures, poll/manifest binding, legal checkpoint transitions, fixed receipt membership after closure, immutable history prefixes, known receipt responses, visible content/version and catalogue membership. For published results it additionally compares the public result API with the audit result and checks native proofs, exact archive hash and ballot set, threshold, close time and every result-contract field. Receipt disappearance, a shorter history, an incompatible prefix, changed manifest/content or a previously known poll absent from the catalogue makes the command fail without saving a successful observation.

`compare` validates both histories against the supplied trust anchor and compares their common signed prefix. Different lengths can be compatible extensions. Incompatible signed entries yield `OBSERVER_SPLIT_VIEW_DETECTED`. Fully isolated observers can each hold an internally consistent fork; detection requires actually exchanging and comparing evidence. Tests demonstrate both the isolated observations and the subsequent detection.

The observer covers configured, previously known polls. It cannot prove the existence of a poll it never learned about, recover an observer's own rolled-back state without an external reference, or establish the honesty of an issuer/host. Its local state, trusted key distribution, clock and software require protection. An early closure is detectable if observed before the deadline; checkpoints contain no per-ballot timestamps. Inconsistent responses during a concurrent publication can also fail a check, so an error identifies inconsistent/unavailable evidence, not malicious intent. There is no automatic retry or weaker check.

For `LegalContentRemoval`, management replaces the stored public document with a strict tombstone containing only poll ID, final state, removed status and removal kind. It removes the poll from catalogue and author lists while retaining the reasoned incident journal separately. The observer and both exporters refuse the removed resource. A previously exported audit remains a snapshot, not permission to ignore later withdrawal or invalidation; no automatic republication or writable mirror exists.

## Reproduction

After building the pinned reference image and installing locked dependencies, run:

```sh
pnpm exec vitest run tests/observer.test.ts
```

This suite serves a committed real browser audit through a local read-only fixture server and uses a newly generated test envelope signer. The native archive is unchanged and verified by Belenios; the fixture signer is explicitly test. The suite tests public GET-only access, rollback, missing acknowledgement, ballot additions after closure, signature/manifest substitution, hidden/removed poll, split views, response limits/redirects, atomic persistence, verified export and static mirror hosting. It does not require an identity database. The full `pnpm test` also runs the live application suites.
