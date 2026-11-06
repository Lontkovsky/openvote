# Test privacy-compromise evidence

This report uses two separate test polls, two authors, one voter, the real identity and ballot APIs, original Belenios ballot generation and the three local PostgreSQL role stores. No credential, token, person pseudonym, ballot, tracker, key or database dump is written to the repository or test output.

## Observed storage matrix

| Available evidence | Person | Fact of accepted participation | Cross-poll participation link | Person to ciphertext | Specific choice |
|---|---|---|---|---|---|
| Identity database only | Internal pseudonym and verified attributes; real-person mapping is not stored | Not recoverable: credential rows show issued rights for the frozen roster, not which rights were used | Issued rights share the same pseudonym, but accepted participation is unknown | Not recoverable; no tracker, ballot or ciphertext column | Not stored |
| Ballot database only | Not stored | Directly visible per election as a public credential and tracker | No person or shared election credential; the two tested credentials and trackers differed | Ciphertext is linked to its public election credential, not to a person | Not stored in plaintext; reference verification before tally returned `result: null` |
| Management database only | Poll authors and moderation actors only | Participant data is not stored | Not available | Not available | Not available |
| Identity + ballot databases, plus runtime sealing-key backup | Pseudonym is available; provider mapping or enumeration is still required for a real identity | Recoverable: deriving the public election credential from each sealed private credential matched the accepted ballot row | Recoverable through the stable identity pseudonym; the test linked the same test voter in both polls | Recoverable for the matched accepted ciphertext | Not recoverable from these stores alone |
| Public receipt/result artifacts only | Not stored | A known tracker can prove inclusion; published results expose aggregate counts | No participant link | No person link | Receipt has no choice; aggregate unanimity can reveal a choice when participation is known |
| Public artifacts plus all internal stores and runtime backup | Same conditional person mapping as the combined private stores | Recoverable | Recoverable | Recoverable | Still encrypted without participant secrets or enough trustee keys; compromised devices, disclosed randomness, trustee collusion and unanimity remain separate known limitations |

The combined-store match is not a column-name or name-regex search. The test unseals the exact election-scoped private credential with the runtime backup key, asks the unchanged Belenios tool to derive a ballot credential, and confirms that public credential equals the accepted ballot row without printing either value. Each poll uses a different private credential, public credential and tracker; the identity pseudonym is the cross-poll join.

## Logs and backups

Fastify request logging is disabled, and the private core bridge returns bounded error codes rather than upstream input. This reduces application-log exposure; it does not establish that hosting, proxy, provider or backup systems collect no metadata. A backup containing identity rows and the runtime sealing key has the combined-store capability shown above. Production log retention, provider access and backup custody still require external operational evidence.

## Coercion assessment

| Scenario | Actual property |
|---|---|
| Transfer the private election credential | Known limitation: another person can use the transferred right before its final ballot is accepted |
| Supervise the participant screen | Known limitation: the observer can see or direct the selected answer |
| Disclose ballot randomness or other participant secrets | Known limitation: the platform does not claim receipt-freeness |
| Use the tracker as proof of a choice | The tracker proves an inclusion claim only and contains no answer; it is not proof of a specific choice |
| Compromise the participant device or delivered client | Known limitation: malicious code can observe or replace the choice before encryption |
| Collude with enough trustee key holders | Known limitation: honest-client subset guards do not constrain compromised key owners |

## Reproduction

With the documented local test services running on Node 24.20.0:

```sh
pnpm exec vitest run tests/services.test.ts -t "measures identity, participation and ciphertext linkage"
```

The focused run must create and clean only test data. A passing run is evidence for the matrix above, not a privacy audit, proof of production operations or proof of cryptographic secrecy against the declared collusion cases.
