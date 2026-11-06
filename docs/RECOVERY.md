# Backup, restore and acknowledgement recovery

This is the single supported recovery procedure for the full test platform. It is local development evidence, not proof that Render backups or production operators have completed the exercise.

## Required private backup set

Keep these materials segregated from public artifacts:

1. one mutually consistent snapshot of identity, ballot and management PostgreSQL databases;
2. the matching private runtime state and trustee material;
3. observer trust/configuration, the last accepted observation and every retained signed participant receipt, stored outside the platform backup.

Database dumps, runtime keys, private credentials, trustee material and receipt collections must never be committed or uploaded as CI artifacts. A database snapshot without its matching runtime state is not a recoverable set.

## Restore gate

1. Restore the private set into an isolated environment with public routing and all write traffic disabled.
2. Start only the restored services needed for read-only public endpoints. Do not accept identity, authoring, incident or ballot mutations.
3. For every known poll, use the separately retained configuration and prior observation:

```sh
pnpm recovery:verify .runtime/recovery/trust.json .runtime/recovery/prior-observation.json .runtime/recovery/approval.json
```

4. The command performs only public GETs, verifies signed history and every retained receipt, and runs the native verifier when the result is published. It writes a new exclusive `openvote-recovery-approval-v1` file only when the restored state is compatible.
5. If any poll reports rollback, missing acknowledgement, changed manifest/content, hidden poll, invalid result or unavailable evidence, keep all public/write routing disabled. Do not delete retained receipts, initialize a new history, regenerate keys or clear ballot rows. Select a newer mutually consistent backup and repeat the same procedure.
6. Open write traffic only after every required approval exists and the private runtime/database bindings pass the normal startup validation.

An approval is evidence for one poll and one exact observation. It is not a command to modify or repair data, and it cannot establish that an acknowledgement which nobody retained ever existed. Skipping the gate is an operator-policy violation; software running under an operator who controls code, hosting and all backups cannot force that operator to follow the procedure.

## Verified failure modes

The baseline experiment accepted one ballot, restored the ballot database to its exact pre-acceptance archive and deleted the ballot row. Replaying the same encrypted ballot was accepted again as new (`idempotent: false`). This confirms a stale ballot database cannot identify its own age.

The implemented tests then retain the signed receipt and prior observation before simulating the same stale restore. Recovery verification fails with `ACKNOWLEDGED_BALLOT_MISSING` before any retry is sent. The independent fixture also proves that a shorter retained checkpoint chain fails with `OBSERVER_HISTORY_ROLLBACK`, an existing approval is not overwritten, and neither failure creates an approval file.

## Reproduction

With Node 24.20.0 and the documented local services:

```sh
pnpm exec vitest run tests/services.test.ts -t "blocks stale recovery approval"
pnpm exec vitest run tests/observer.test.ts -t "creates recovery approval"
```

The procedure still requires an actual private backup/restore exercise on the selected hosting before production cutover. Normal restart persistence and a recovery from a stale backup are different checks.
