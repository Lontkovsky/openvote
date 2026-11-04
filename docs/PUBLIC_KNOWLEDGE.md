# OpenVote public knowledge

Snapshot: V045, 2026-11-04. This file is the public, read-only knowledge source for the Taras assistant. It contains no secrets, credentials, private keys, personal data or private review material. A deployed assistant knows only this snapshot and the validated current public demand aggregate supplied with each question; the visible FAQ is separate presentation copy and does not change the assistant context. Taras cannot browse GitHub, read arbitrary files, call tools, run commands or change the repository.

Status labels are part of the meaning of every statement:

- **Live now** means observable on the public `https://openvote.com.ua` demand surface.
- **Implemented synthetically** means present and tested in the repository with synthetic people and test keys, but not available as a real public voting service.
- **Owner decision / planned** means explicitly selected product direction that is not necessarily implemented.
- **Open** means not decided, not integrated or not evidenced. Taras must describe it as open rather than inventing an answer.

## Plain-language overview / Коротко для користувача

OpenVote є волонтерським проєктом із відкритим кодом, у розробці якого може взяти участь будь-хто. Майбутня платформа дозволить людям створювати питання й опитування на різні теми, обговорювати їх, голосувати та переглядати результати, щоб розуміти думку учасників.

Наразі працює перша публічна сторінка OpenVote. На ній можна проголосувати за потребу в платформі, переглянути її задум, прочитати відповіді на поширені питання та поспілкуватися з Тарасом. Повна платформа ще розробляється, а реальні громадські голосування поки не запущені.

OpenVote завжди буде безкоштовною та відкритою платформою. На платформі не буде реклами, продажу користувацьких даних, платних функцій або інших способів монетизації.

## Live now / Працює зараз

- `openvote.com.ua` serves a demand-validation landing, not the full voting platform. It asks one versioned question with the three fixed answers «Підтримую», «Не підтримую» and «Утримуюсь» and publishes their current counts.
- For every Taras request, the OpenVote server supplies the same validated public poll identifier, version, immutable question, total response count and three labeled counts that the landing exposes. Taras receives no browser credential, credential hash, current user's answer or row-level response.
- The demand poll is voluntary and self-selected. It does not verify identity, citizenship, age or one-person uniqueness and must not be presented as the opinion of Ukraine, an official election or a legally binding referendum.
- A browser receives a random HttpOnly credential. The demand database stores the poll identifier and version, a SHA-256 hash of that browser credential and the selected answer. It has no name, document, email, phone, IP, User-Agent or response timestamp column.
- The public landing contains a synthetic walkthrough, a twenty-item owner-approved user FAQ and the Taras assistant. The FAQ is not inserted into the assistant prompt. OpenVote does not store chat questions, answers or conversation history. The page keeps the current conversation only in browser memory.
- The source code, requirements, decisions, progress evidence, issues and pull requests are public in `github.com/Lontkovsky/openvote` under AGPL-3.0-only for OpenVote-owned code. Secrets and private security material are deliberately excluded from public artifacts.
- OpenVote is a volunteer, open-source initiative. The owner selected a permanently free and open platform with no advertising, sale of user data, paid feature or other monetization.

## Implemented synthetically / Реалізовано на тестових даних

- The repository contains a full development system for cataloguing questions, synthetic eligibility, encrypted ballots, final vote intake, fixed deadlines, closing, tally, publication, result exports and public verification. This system is not deployed as the public platform.
- The development system uses unchanged Belenios 3.3.0 formats and original browser cryptography. The browser encrypts one of three answers before the ballot service receives it. The ballot service is designed not to receive an identity session, name, email, tax number or plaintext answer.
- One election-scoped credential can produce one final accepted ballot. Exact redelivery is idempotent; a different later ballot for the same right is rejected. Recovery through another synthetic provider returns the same right rather than a second vote.
- The implemented lifecycle is Draft, Review, Scheduled, Open, Closed, Tallying and Published, with separate rejection, cancellation, invalidation and suppressed-result states. Official question content, participation rules, cryptographic parameters and deadline become immutable when a poll opens.
- The development system does not publish the answer distribution while a formal poll is open. Published results include exact counts, the participant base, methodology warnings and downloadable verification material. Empty and configured small-group results can be suppressed before decryption.
- A participant receives a tracker and signed acknowledgement for an inclusion claim. They do not receive an in-product certificate proving a particular choice.
- Identity, ballot and management services use separate origins and databases in the synthetic architecture. This limits a single-store leak but does not make the combined operator unable to link data. The repository test shows that an operator with both stores and the runtime sealing key can link a pseudonymous person to accepted ciphertexts across polls.
- The development trustee flow uses test keys and a simulated mandatory trustee plus a two-of-three threshold. This proves the reference path works on synthetic data; it does not prove separate real-world operators, production anonymity or an external audit.
- Signed checkpoints, retained acknowledgements, an observer and an offline native verifier can detect the tested rollback, missing-known-ballot, changed-manifest and forged-result cases. A self-consistent first fork or fully isolated observers remain documented limits.
- The current synthetic application still contains a human review/moderation workflow inherited from the original development requirements. That implementation is not the owner's selected target publication model and must not be described as a final product decision.

## Owner decision / planned / Рішення власника та запланований продукт

- The target is a civic, informational platform. Its polls are not legally binding. The owner plans a Ukrainian operator named ТОВ «ОПЕН ВОУТ», but the entity is not registered and no legal/operator policy is approved yet.
- The working implementation budget named by the owner is 100,000 UAH. It is a planning boundary, not proof of secured funding or a launch date.
- The public launch goal is 10,000 «Підтримую» responses in the current demand poll. The owner selected launch only after both reaching that goal and completing the core functions, identity connection and security checks; there is no committed date.
- For a real initial version, participation is planned for citizens of Ukraine from age 14. The selected initial identity direction is BankID NBU only. Дія is not planned for the initial version; qualified electronic signature may be considered later.
- Other identity methods remain development work and are not available now.
- No passport photo or copy is to be uploaded. Manual entry of tax number, date of birth or similar attributes is not a fallback for unavailable BankID. A participant may retry or choose another available bank. If BankID as a whole is unavailable, identity-verified participation is unavailable and the poll deadline does not move.
- The identity zone is intended to derive only a pseudonymous internal identifier needed for eligibility and duplicate prevention. Raw tax number, birth date, citizenship and other BankID attributes are not intended to be retained after the required checks. The exact production attribute and deletion contract remains open until an approved provider contract exists.
- The planned authenticated session duration is configurable and defaults to one day. A shorter 15-minute or longer one-week value may be considered later. Idle extension or automatic renewal is allowed only if the security design supports it; it is not yet a production contract.
- Every target poll has a fixed deadline and closes automatically then. Only its author may close it earlier, with a reason of at least 50 characters. BankID outages do not extend it. The answer distribution is not shown before closure. After deadline or authorized early closure, the final result may be published.
- There is no minimum turnout or quorum for an informational poll. A result with one accepted participant can exist, but the participant base and privacy limitation must be visible.
- Every poll has exactly three semantic choices: positive, neutral and negative. The current development labels are «Підтримую», «Утримуюсь» and «Не підтримую». The target author may customize the visible wording only while preserving the unambiguous three-way meaning.
- Any authenticated participant is intended to be able to create a question. The author chooses whether a public pseudonym is shown. A real name is not published automatically; context such as a building, address or affected place belongs in the description only when the author chooses to include it lawfully.
- The owner does not want a human moderator role in the target system. The exact lawful publication and automated safety boundary is not implemented and remains open. The current synthetic review queue must not be mistaken for the final target.
- Text-only comments, nested replies, likes and dislikes are planned. No files or attachments are planned. Anonymous participation on the demand landing and the exact delete/ownership rules are not implemented yet.
- The simplified first public version does not promise external auditors, separate real-world key holders or an organization outside the platform that controls publication. The production tally/key-custody design is still open. The synthetic Belenios threshold path remains engineering evidence, not a promise about the first public operating model.
- V044 removed stronger trust wording from the demand landing because the public service currently has no external auditors or separate real-world operators to substantiate it. The change affected presentation only: it did not relabel the immutable demand question, change its version, migrate data or alter existing responses. Current copy promises openness and public verification material without claiming unavailable organizational guarantees.
- Product and engineering decisions are intended to remain public through repository documents, issues, pull requests, test evidence and this knowledge snapshot. Each deployed change that affects public behavior or a product decision must update the snapshot in the same reviewed change.

## Open / Відкриті питання та межі

- There is no real BankID contract, production adapter, approved attribute set or production identity credential. The full platform therefore remains synthetic and fail-closed for real identity-verified voting.
- There is no approved privacy notice, terms, retention policy, minors policy, incident policy or registered responsible operator.
- No external cryptographic, privacy, security or legal report exists. Repository tests and self-review are public evidence, not an external certification. A later review may be commissioned, but it is not presented as a V1 guarantee.
- The final production tally, key custody and early-result access model for the simplified V1 is not settled. Until it is implemented and tested, Taras must not claim that platform operators are technically unable to see, decrypt, delay or alter results.
- Absolute anonymity is not guaranteed. Network timing, provider records, combined stores, a compromised browser, disclosed ballot secrets, sufficient key-holder collusion and unanimous results remain separate risks. Stronger anonymity research is backlog work.
- The target no-human-moderator publication model, automated safety gate and lawful-removal process are not implemented or reconciled with the current synthetic review workflow.
- Comments, replies, reactions and deletion rules are planned but not live.
- There is no committed launch date. The public demand goal measures interest; reaching it does not by itself complete provider, legal, security, deployment or operational work.

## How a target vote is intended to work

1. A visitor can read public questions and already published results without signing in.
2. To vote or create a question in the target real version, the participant completes the approved BankID eligibility flow. No manual identity fallback is used.
3. The participant reads the immutable question, context, rules, deadline and three choices, then confirms one final choice.
4. In the current synthetic cryptographic design, the browser encrypts the choice before delivery and the ballot service accepts at most one final ballot for that poll-scoped right.
5. While the poll is open, the answer distribution is hidden. The deadline remains fixed; only the author may close early under the planned reason rule.
6. After closure, the system verifies the accepted final set, performs the configured tally, publishes the exact participant base and counts, and exposes safe verification material.
7. Public verification can detect the tested forms of corruption, but its guarantees depend on the delivered client, trusted eligibility source, retained evidence, key custody and operator behavior. Unsupported guarantees remain visible rather than being replaced by a slogan.

## Public source map

- Current implementation evidence: `docs/PROGRESS.md` and `docs/TRACEABILITY.md`.
- Current technical and launch boundary: `docs/LAUNCH_READINESS.md`.
- Security properties and limits: `docs/GUARANTEES.md`, `docs/THREAT_MODEL.md`, `docs/ATTACK_COVERAGE.md` and `docs/PRIVACY_COMPROMISE.md`.
- Demand deployment and assistant contract: `docs/DEMAND_DEPLOYMENT.md`.
- Product and architecture decisions: `docs/DECISIONS.md` and `docs/adr/0001-reference-core.md`.
- Public execution history: GitHub Issues, pull requests and Actions in `github.com/Lontkovsky/openvote`.

Older requirements and evidence remain in the repository for traceability. When an owner decision supersedes an earlier target direction, this snapshot must say so explicitly; it must never rewrite historical evidence or claim that a planned decision is already implemented.
