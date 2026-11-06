# Recorded test observer evidence

`observation.json` is the actual minimal state saved by the public observer for native poll `bWR6QtTPMZawJd`. `audit.json` is the separately exported public package after Belenios verification. Both came from the real local application and the earlier Browser voting run, not the mock observer HTTP server used by unit tests.

The public signer and exact manifest hash were pinned from previously retained test development artifacts. This is local evidence, not an external ceremony or audit. The subsequent observer comparison confirmed three compatible checkpoints.

The E2E coordinator then intentionally deleted this old test poll while preparing its next scenario. Checking the known poll returned `PUBLIC_RESOURCE_MISSING` with exit 1 and retained the observation bytes unchanged, SHA-256 `a9e8a219d9cb2ce3ab22d420979912b5662cb8b7486344fc45e6a7fd6c119efe`. The recorded snapshot is therefore historical; its embedded localhost origins are not a current hosted service for another checkout. The deletion was authorized test-fixture cleanup, not evidence of malicious intent.

No identity identifier, identity session, credential or trustee private key is included. See `docs/OBSERVER.md` and the machine-readable service test report for scope and reproduction.
