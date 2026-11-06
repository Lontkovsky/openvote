# Trustee finality and partial-decryption intake

The native core is unchanged Belenios 3.3.0. The application supports one mandatory trustee plus any two of three Pedersen threshold trustees. Each local command reads its own key directory. These local processes simulate operator roles; they do not establish organizational independence.

## Before producing a share

The real CLI in `scripts/trustee.ts` calls `prepareTrusteeShare` in `scripts/trustee-client.ts`. The function first runs the original native archive verifier, then checks the pretrusted election hash and signing key, exact election parameters, fixed close time, unpublished final state, minimum group size, checkpoint signatures/sequence, exact final archive hash and tracker set. It persists the permitted final hash before reading a private key or producing a share. Later delivery reuses the stored share bytes; a different final set is refused. Losing local state does not authorize a reset of that binding.

The adversarial suite exercises this same function, without a private key file for rejected requests, and checks that no commitment or share file was created. Its public variants are assembled with original archive commands. In the individual-ciphertext attack, the archive hashes are consistent but the encrypted aggregate is replaced by one ballot's ciphertext. Original native verification rejects the aggregate. A four-ballot subset of the five-ballot final set remains above threshold and verifies cryptographically on its own, but fails comparison with the committed archive or receipt set.

The guard cannot prove that a self-consistent first history from a compromised signer contains every real acknowledgement it has never seen. A test deliberately constructs such a signed first fork and records that it passes without prior final binding. After binding to the original final set, the same alternative is refused. Independent retained acknowledgements and history comparison remain necessary; the durable acknowledgement journal and restoration work are still open. This is not a claim that a platform-owned signature prevents censorship.

## Before storing a share

The earlier API checked a share's two-line native structure, content hash and claimed owner, then stored it. A malformed or corrupted proof could occupy a trustee slot, making a valid replacement fail and preventing tally. Both a malformed share and a structurally valid corrupted proof reproduced HTTP 200 before the fix.

The endpoint now validates the complete final archive and invokes `openvote-share-verify` before insertion, inside the existing election transaction. This small native adapter links the pinned original library. It parses the original election/trustees/tally/share formats, verifies the trustee keys and payload binding, and calls Belenios `E.check_factor` for the exact owner's verification key and aggregate. It follows the original server's `post_partial_decryption` validation pattern. It implements no voting primitive and changes no upstream source. Invalid inputs return HTTP 422 without storing a share; genuine byte-identical delivery remains idempotent.

Adding a share event and invoking the original generic `election verify` would not provide this guard: that command checks partial decryption proofs when a result exists. Treating a missing-quorum error as successful proof validation would also be incorrect. The dedicated adapter directly invokes the required native proof check.

The adapter accepts no private key and performs no decryption. The internal `verify-share` transport is allowlisted separately from the ceremony service. The image includes the application and upstream license texts; source attribution is in `THIRD_PARTY_NOTICES.md`.

Native validation increases processing time. The former ten-second socket inactivity deadline closed a real tally connection during concurrent test load. An eleven-second handler on the actual application factory reproduced the same failure. The socket deadline now matches the existing 100-second request/client window; it remains finite. The incoming request/body limits and native subprocess limits are retained. The transport regression verifies that a response taking eleven seconds remains connected; it does not establish a production load capacity.

## Small groups and residual privacy

The trustee client, native share creation, native share validation and native finalization all refuse groups below the immutable publication threshold. The application refuses final-set access, share intake, tally and public result/audit exports for ResultsSuppressed. Tests use real groups of zero, one and two ballots, and check that no share is stored or result created.

Above the threshold, an unanimous tally is still permitted. A real five-ballot native tally demonstrates 5/0/0: a known participant's answer is then inferable. The poll page explains this limit. The threshold is not an absolute confidentiality guarantee. A sufficient malicious key coalition can bypass an honest client's guard; receipt-freeness, coercion resistance and protection from all key holders are not claimed.

## Reproduction and evidence

After the documented bootstrap, run:

```sh
pnpm exec vitest run tests/trustees.test.ts
pnpm exec vitest run tests/services.test.ts
pnpm test:crypto
pnpm test
```

`tests/trustees.test.ts` creates temporary test keys and removes them. `tools/test_reference.py` checks all three allowed threshold pairs with the mandatory trustee, corrupted shares, wrong owner/hash, early/late share intake and insufficient quorum. Its output in `artifacts/reference/` contains only public aggregate evidence. The service report in `artifacts/services/tests.json` records the API assertions. The Browser procedure is documented separately in `docs/BROWSER_TESTING.md`; a local native test is not a browser or independent audit result.
