# Full Render test demo environment

Issue [#51](https://github.com/Lontkovsky/openvote/issues/51) owns this future cutover. The single repository Blueprint at [`render.yaml`](../render.yaml) currently runs the smaller demand-validation launch from [#53](https://github.com/Lontkovsky/openvote/issues/53) on one `openvote` service and keeps the three full-platform databases declared but suspended. Switching that same service to the full **test demo** requires a later Blueprint change and does not complete the Production Readiness epic.

## Declared resources

The current `production` environment contains:

- one Docker web service, `openvote`, currently running the demand image on plan `0.5c-512mb`;
- `openvote-demand` plus three PostgreSQL 18 databases for identity, ballot and management;
- one attached 1 GB disk reserved for the future runtime and unused by demand storage;
- the apex domain `openvote.com.ua` on the same service.

During demand collection, suspend the identity, ballot and management databases and leave `openvote` plus `openvote-demand` active. The later full cutover must scale the same service to `1c-2g`, switch it to `infra/crypto.Dockerfile`, initialize the existing disk at `/app/.runtime-disk`, resume the three role databases and suspend `openvote-demand`. The earlier full-stack Dashboard review was USD 44.15/month before VAT and usage overages; the future Dashboard review remains authoritative.

## Runtime and trust boundaries

Nginx is the only process bound to `0.0.0.0:$PORT`. It routes by exact host rather than collapsing browser origins:

| Host | Internal destination |
|---|---|
| `openvote.com.ua` | built SPA only |
| `identity.openvote.com.ua` | `127.0.0.1:4301` |
| `ballot.openvote.com.ua` | `127.0.0.1:4302` |
| `management.openvote.com.ua` | `127.0.0.1:4303` |

Unknown hosts return HTTP 421. Providers A/B and both Belenios transports remain loopback-only. Browser CORS accepts exactly `https://openvote.com.ua`; requests without `Origin` remain available to the authenticated internal service calls. Identity, ballot and management use different databases and role credentials. The identity session is never sent to the ballot host.

This separation does not create independent operators: one Render service, disk and account remain under one owner. It is a development deployment boundary, not evidence of organizational independence, production anonymity or external review.

## Startup contract

The startup process has one fail-closed path:

1. Validate `demo`, the exact public origin, Render `$PORT` and all three private database URLs.
2. If no runtime marker exists, require an empty OpenVote state subdirectory and three databases with no application tables. Provider-owned mount entries outside that subdirectory, such as `lost+found`, are never treated as application state.
3. Generate separate role tokens/keys/configuration once with private file permissions.
4. Apply repository migrations to all three databases.
5. Write the ready marker only after migrations succeed.
6. On every later start, verify the marker, file permissions, cross-role bindings, exact database credentials and existing migration tables before applying any newer migration.
7. Start both crypto bridges, then five application roles, then Nginx. A child exit terminates the service.

A missing marker with any disk content, a nonempty database with an empty disk, a changed database binding, a missing migration table or an origin mismatch stops startup. There is no key regeneration or alternate workflow over existing state.

## Future custom-domain verification

The demand configuration declares only `openvote.com.ua`. A complete hosted Browser run for the full configuration will require adding `*.openvote.com.ua` because the built client and exact Nginx host routing require `identity.openvote.com.ua`, `ballot.openvote.com.ua` and `management.openvote.com.ua`; the service's `onrender.com` hostname proves health only and returns HTTP 421 for the full application flow.

For that future cutover, use only the actual targets shown in Render's Custom Domains panel:

1. Export the existing Ukraine.com.ua DNS zone before replacing records.
2. Preserve MX, SPF TXT, `mail` and every unrelated record.
3. Replace the parked apex destination with Render's actual apex target.
4. Point wildcard `*` to the actual service `.onrender.com` hostname.
5. Add Render's exact `_acme-challenge` and `_cf-custom-hostname` verification CNAME records for the wildcard certificate.
6. Return to Render and verify both domain entries.
7. Run the complete hosted Browser flow and restart-persistence check.

Do not guess the service or verification hostnames. Replacing the existing apex/`www` records is a destructive DNS action and requires confirmation immediately before it is performed. The required post-change checks are apex HTTPS, HTTP-to-HTTPS redirect, `www` redirect to apex, each exact API host, and rejection of an unknown wildcard host.

## Verification and rollback boundary

Before the future cutover merge, verify the focused origin/runtime tests, final image build, Nginx host-routing fixture, affected service/native tests, the complete retained in-app Browser flow and exact-head CI. After deployment, repeat the test Browser flow through HTTPS and verify an accepted ballot and runtime/key hashes survive an actual Render service restart. None of that full-runtime hosted evidence is claimed by the current demand configuration with an uninitialized reserved disk.

Render can redeploy a prior application image, but database migrations and persistent runtime state are not automatically rolled back. Never delete or replace the disk to roll back code. The local fail-closed recovery gate is documented in [RECOVERY.md](RECOVERY.md): restore into an isolated no-write environment and compare every poll with separately retained observation/receipt evidence before opening traffic. The stale test restore is detected, but the complete private Render backup set and an actual hosted restore have not been exercised, so production backup/restore acceptance remains pending.
