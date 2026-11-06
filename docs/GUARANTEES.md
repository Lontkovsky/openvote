# Guarantees and limits

OpenVote is a development system using test identities. These statements describe the implemented protocol and tests; they are not an external audit or a production certification.

## Prevented under the stated trust assumptions

- The ballot API rejects identity headers, cookies and user identifiers. It receives an upstream Belenios encrypted ballot, not a plaintext answer.
- One election credential can contribute one final ballot. A provider or device change does not create another right for the same deduplicated test person.
- The normal trustee client refuses an individual ballot, a selected subset, a different poll, an early tally and a second final set. Publication below the configured minimum group is blocked before decryption shares are created.
- A tracker and signed receipt prove only an inclusion claim. Their strict contract contains no answer, person identifier, private credential or encryption secret.

These properties assume the delivered client and reference core are the reviewed release, the trusted roster and signer are authentic, and enough trustee key holders follow the verified trustee procedure.

## Detected, not prevented

Signed checkpoints and an independent observer detect a rollback, a lost known acknowledgement, a changed manifest and incompatible histories after observers exchange evidence. Fully isolated observers can remain on separate internally consistent histories.

## Partially mitigated

Identity, ballot and management data use separate databases and origins. A breach of ballot storage alone does not expose a person identifier, and identity storage alone records issued rights rather than accepted ballots. This separation is not protection from an operator who obtains both stores and runtime key backups: the test compromise test demonstrates that such an operator can link a pseudonymous person to an accepted ciphertext and link that person's participation across polls. Mapping the pseudonym to a real person additionally depends on provider records, a known or enumerable provider subject, or provider collusion.

## Not guaranteed

- OpenVote does not provide receipt-freeness or coercion resistance. Credential transfer, supervised screens, disclosed ballot randomness or other secrets, and a compromised participant device can reveal or control a choice.
- A sufficient trustee-key collusion can bypass the honest trustee client. A unanimous published result can also reveal a participant's choice when their participation is already known.
- Tracker possession does not prove a particular choice, but it does not neutralize the risks above.
- Application request logging is disabled and the reference bridge does not log private input. Infrastructure, provider and backup systems remain separate trust boundaries that require production review.
- No self-review proves that every visitor received the reviewed client, that production identity providers are independent, or that external operators followed the documented procedure.

The detailed storage experiment and exact reproduction command are in [PRIVACY_COMPROMISE.md](PRIVACY_COMPROMISE.md).
