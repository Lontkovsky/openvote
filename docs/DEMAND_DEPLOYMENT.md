# Minimal demand-validation deployment

Issue [#53](https://github.com/Lontkovsky/openvote/issues/53) owns the initial public launch. The proposed [`render.yaml`](../render.yaml) declares one `openvote` web service and four databases in one `production` environment, without a disk on the demand service. The current service still has the previously reserved disk attached until an explicitly authorized removal is completed.

## Declared resources and cost boundary

The active demand configuration contains:

- one Docker web service, `openvote`, on plan `0.5c-512mb`;
- one PostgreSQL 18 database, `openvote-demand`, on plan `0.1c-256mb` with 1 GB storage;
- the apex custom domain `openvote.com.ua`;
- no demand data on the existing attached disk, wildcard domain, API subdomains, identity service, ballot service, management service or cryptographic runtime in the running container.

The previously documented steady base was approximately USD 14.45 per month including USD 0.25 for the persistent disk. Removing the disk would remove that disk charge. This is not a billing cap. Bandwidth, build-minute, tax or other usage-based charges can be additional. The Render review screen is authoritative immediately before deployment.

The owner approved creating the unified resources. Render suspension is an operational action rather than a Blueprint field: after creation, suspend the identity, ballot and management databases and leave only `openvote` plus `openvote-demand` active. Suspended database storage remains billable.

## Product and data boundary

The launch serves one Ukrainian landing page, one versioned demand poll and one explicitly marked browser-only demo at `/demo/`. The demo exposes the approved platform interface and fixed test catalogue but does not start identity verification, ballot or management services, Belenios, trustees, formal closing or publication infrastructure. Demo polls, votes, comments, reactions and vote IDs created by a visitor stay only in that browser's local storage and are not public platform records. The landing publicly shows the total number of accepted responses and the exact count for each established answer, including zeros. It must not claim that a demand response represents a unique person, a Ukrainian citizen or the population of Ukraine.

The browser credential is a host-only HttpOnly SameSite=Strict cookie with a one-year maximum age and the Secure flag on HTTPS. Each response row contains only the poll ID and version, the credential hash and the final selected answer; it has no identity, contact, IP address, User-Agent or response timestamp field. The public page must disclose voluntary self-selection and the lack of identity, citizenship and uniqueness verification without exposing cookie implementation details; the technical limitation remains documented here.

## Local verification before approval

Run the affected checks with the repository-pinned Node and pnpm versions:

```sh
pnpm test tests/demand.test.ts tests/render-start.test.ts tests/transport.test.ts
pnpm types
pnpm build
pnpm build:demand
pnpm migrate
pnpm smoke
pnpm lint
pnpm audit --prod
render blueprints validate render.yaml --output json
docker build --platform linux/amd64 -f infra/demand.Dockerfile -t openvote-demand:local .
```

In the retained in-app Browser session, open the local demand page and verify the three answers, explicit final confirmation, successful receipt, reload persistence, absence of editable controls after submission, the zero state, exact public counts before and after submission, equality of the total with the three-count sum, and a 390×844 layout without horizontal overflow. Keep this local evidence separate from the hosted checks below.

## Unified full-stack environment

The same environment also declares the three role databases from issue [#51](https://github.com/Lontkovsky/openvote/issues/51). During demand collection and browser-only demo access they remain suspended. The static demo uses no platform database. The full Docker runtime is not active. The previously reserved disk remains attached pending its separately authorized removal; its current contents have not been inspected.

The future full-platform cutover reuses the same `openvote` service: provision and attach a persistent disk, switch the Dockerfile/environment variables and compute plan, resume the three role databases, add the wildcard domain, and suspend `openvote-demand`. Do not start the full runtime without its attached persistent key state.

## Deployed resources and DNS

The approved Blueprint is deployed in the `OpenVote` project as one `openvote` web service. `openvote-demand` is active; `openvote-identity`, `openvote-ballot` and `openvote-management` are suspended. The 1 GB disk is attached at `/app/.runtime-disk` but the demand application does not use it.

The Ukraine.com.ua zone was exported before the approved DNS change. The apex uses Render's `216.24.57.1`; `www` is a CNAME to `openvote-launch.onrender.com.` because Render service slugs are immutable even after a display-name change. Mail, SPF and the unrelated wildcard record remain unchanged. Render serves a valid certificate for the apex and redirects `https://www.openvote.com.ua/` to the canonical apex over HTTPS.

The service's `openvote-launch.onrender.com` hostname is a health-only endpoint, not an alternate public origin. A direct document navigation can receive the static HTML shell because it has no `Origin` header, but the shell's module request carries `Origin: https://openvote-launch.onrender.com`. The shared exact-origin hook rejects that request with `403 ORIGIN_REJECTED` before static delivery; the identical request with the configured `Origin: https://openvote.com.ua` returns 200. The retained in-app Browser therefore keeps the Render-host root unmounted while `/health` returns `{"state":"ok","role":"demand","environment":"demo"}`. The apex renders the demand landing normally, and `www` redirects to the apex before application delivery. Do not weaken the exact-origin boundary to make the Render hostname a second application origin.

## Evidence-only merge boundary

The active service uses `autoDeployTrigger: checksPass`, so a successful commit on `main` normally creates a Render deploy even when the diff changes only repository evidence. An evidence-only squash merge that must not redeploy the unchanged demand image therefore requires the exact marker `[skip render]` in the final squash subject that reaches `main`. A marker only in the source-branch commit is insufficient when the squash subject replaces that commit message.

This behavior was reproduced directly. PR #85 had `[skip render]` in its source commit, but the marker was absent from merge commit `91584862b05e8daba2aff4e88b15e8083d99d11d`; Render auto-deploy `dep-dbj1unlg1s2s73fgviq0` consequently reached Live. PR #86 retained the marker in merge commit `3f7f05d940baa332ed1f3503bc2b8faa4a496ee1`; no new deploy appeared, and the last successfully deployed commit remained `91584862b05e8daba2aff4e88b15e8083d99d11d`.

Use the marker only when the reviewed diff cannot alter the built image, application, assets, dependencies, Blueprint, runtime configuration or deployment behavior. It does not replace exact-head or merge-commit CI.

## Hosted verification evidence

PR #57 exact-head CI passed and merged as `33042ef83209a290cc1df6ee450ee15405a0eb94`; the exact `main` workflow also passed. Render deploy `dep-dbifsjqvcj2c73fan370` reached `live`. In the retained in-app Browser, the apex displayed two accepted responses as `Підтримую 2`, `Не підтримую 0`, `Утримуюсь 0`, with the representativeness warning and no console warnings/errors. The same values remained readable without horizontal overflow at 390×844.

An actual Render restart made both the page and API temporarily return 502, then recover to 200. Reloading the same retained Browser tab after recovery showed the same `2/0/0` aggregate, proving that the two existing production rows survived the restart. No additional production response was submitted for verification.

## Action-first landing and test walkthrough

Issue [#59](https://github.com/Lontkovsky/openvote/issues/59) and [PR #60](https://github.com/Lontkovsky/openvote/pull/60) are a presentation-only follow-up to the verified launch in #53. They keep the exact demand API, database, cookie and aggregate contracts, but move the confirmed question and vote action ahead of product explanation. The page retains one concise visible notice that participation is voluntary and identity, citizenship and participant uniqueness are not checked, so the result is not the opinion of Ukrainians generally.

The separate `Як працюватиме платформа` section uses one repository-owned, silent H.264 MP4 with a local poster and native controls. Its three frames were captured in the retained in-app Browser from the existing local test interface at source revision `18869231e2728da393cb4c6c63eb5dec98b195ba`: a populated create form, a selected final vote before submission, and a Published `1/1/1` result. The asset contains no identity selection, credential, key, production response, browser storage, console, local path, narration or third-party media. It is explicitly labeled as a test prototype whose interface may change.

Focused verification for this follow-up is:

- inspect the source frames and encoded asset; use `ffprobe` to confirm H.264, 1280×720, 30 fps, limited-range `yuv420p`, no audio and bounded size;
- run the demand contract test, types, both web builds, lint/public scan and demand Docker image build;
- in the retained in-app Browser, verify the first viewport, anchor, three answers, explicit confirmation, local submission and reload, exact aggregate sum, one paused video, play/pause/seek, keyboard focus and 390×844 layout;
- after exact-head CI and merge, verify the same page and media over HTTPS without submitting a production response, and record the unchanged live aggregate separately.

PR #60 exact-head workflow `41130447936` passed and the PR merged as `130b03c2c12127dfa209af0296da173307b03b7a`. The standard `Deploy latest commit` action created Render deploy `dep-dbigolek1f9s73d59n30` for that exact commit after no automatic deploy appeared during the observed post-merge interval; it reached `live` in 1m34s. The retained in-app Browser verified the apex over HTTPS without submitting a response: the live aggregate was `30 = 26/0/4`, the form still had exactly three unselected answers and a disabled submit action, the same-origin video began paused and passed keyboard play/pause, the console was clean, and the 390×844 layout had no horizontal overflow. The hosted MP4 returned `video/mp4`, `Accept-Ranges: bytes`, HSTS and a correct `206` byte-range response.

## OpenVote brand and persistent poll action

Issue [#62](https://github.com/Lontkovsky/openvote/issues/62) supersedes the bilingual display name with one exact `OpenVote` brand. The demand and full test interfaces reuse one repository-owned open-ring vote mark. The landing keeps exactly one `Проголосувати` link in a sticky header, offsets the `#poll` anchor below that header, and replaces normal browser/storage messages with one nontechnical integrity notice and a concise acknowledgment. The demand API, confirmation gate, immutable response, database, Blueprint and Render resources are unchanged.

The walkthrough was re-captured in the retained in-app Browser after the shared branding change, using the same established test create form, selected unsubmitted choice and Published `1/1/1` result. The silent local H.264 asset remains 1280×720, 30 fps, limited-range `yuv420p`, 10.6 seconds and contains no real identity, production response, key, credential, browser-storage message, console or local path.

## Grounded FAQ assistant

Issue [#65](https://github.com/Lontkovsky/openvote/issues/65) adds one floating demand-page dialog named `Тарас`. It uses the same nine FAQ entries rendered on the page as its only approved knowledge context. The browser sends a strict question to the same-origin demand API; the server requires the existing demand credential and exact Origin and forwards only that question plus the static FAQ context. OpenVote does not store questions, answers or conversation history. The page keeps only the current conversation in memory.

The server call disables response storage and tools, pins the model snapshot, and bounds input, output, timeout, per-credential requests, global requests and concurrency. The required `OPENAI_API_KEY` has no default and is declared `sync: false`; for the existing Blueprint it must be populated manually on the `openvote` service before merging a startup that requires it. The value must never be committed, rendered into the client bundle or printed in release evidence.

Local release evidence requires the focused demand/chat tests, types, both web builds and lint/public scan, plus retained in-app Browser checks for the closed launcher, opening/focus, immediate user bubble, typing state, real grounded answer, fixed off-topic boundary, request limit, close/reopen history, clean console and 390×844 geometry. Hosted evidence must then confirm the same behavior over `https://openvote.com.ua` without submitting a production poll response.

PR [#66](https://github.com/Lontkovsky/openvote/pull/66) exact-head workflow `41157331585` passed and the PR squash-merged as `3eccbcc64cd3c91d5522488f260791a6b6f9abea`; exact merge workflow `41157743677` also passed. The required secret was configured on the existing `openvote` service before merge without entering the repository or client bundle. Automatic Render deploy `dep-dbiko3jm8hqs73ev6p20` reached `live` for that exact commit.

The retained in-app Browser verified the apex over HTTPS without submitting a poll response. The authoritative aggregate remained `38 = 34/0/4`, with one CTA, three unselected radios and disabled submit. The page started with one floating launcher and no inline form. Opening focused the composer and showed only the name `Тарас`; a real question produced an immediate user bubble, typing state and grounded answer. Closing returned focus to the launcher and reopening retained the conversation. The removed subtitle and service note stayed absent. At 390×844 the 355×520 dialog, composer and 54 px launcher remained within `clientWidth = scrollWidth = 375`; the viewport was reset and console warnings/errors were empty. `https://www.openvote.com.ua/` redirected to the HTTPS apex.

## Public project knowledge

Issue [#97](https://github.com/Lontkovsky/openvote/issues/97) supersedes the nine-FAQ-only knowledge boundary without giving Taras live access to the repository. `docs/PUBLIC_KNOWLEDGE.md` is the one reviewed public snapshot. It separates what is live on the demand surface, what exists only in the test development system, what the owner has decided or planned, and what remains open. The visible FAQ is maintained separately and is not copied verbatim into the assistant prompt; confirmed OpenVote facts approved for the FAQ must also be represented in the reviewed snapshot.

The demand process reads and validates the fixed snapshot once during startup. The production image copies that exact file; missing content, a missing required section or an invalid size stops startup. Each chat request reuses the existing validated demand-poll query and supplies the model only the public poll ID, version, immutable question, total and three labeled counts alongside the fixed snapshot and typed question. The visible FAQ, current browser response, credential, credential hash, rows and request metadata are not supplied. The model has no direct filesystem, GitHub or database access, no tools, no repository write capability and no conversation history.

The snapshot may disclose repository-backed behavior, decisions, current stage, limitations and public source paths. It must not contain credentials, private keys, personal data, private vulnerability details or unsupported assurances. Any reviewed change to public behavior or a product decision must update this file in the same change. V044's rationale is therefore explicit: the landing removed stronger trust wording because no external auditors or separate real-world operators currently substantiate it, while the immutable poll version, database and existing responses stayed unchanged.

V045 follow-up verification requires exactly twenty unique approved visible FAQ questions; absence of the removed wording-history question, internal service vocabulary and long dashes; startup refusal for a missing or malformed snapshot; a stateless provider request containing the snapshot, exact question and current validated public aggregate but no visible FAQ, tool, secret, browser response or credential; exact current-count and factual answers in ordinary language and at no more than 250 characters including spaces; rejection of longer provider output; the unchanged fixed off-topic response; a clean console; and desktop plus 390×844 retained in-app Browser checks. Hosted verification must repeat the FAQ and Taras boundaries on the exact deployed revision without submitting a production poll response.

PR #98 exact-head Verification run `41883589639` and CodeQL run `41883505268` passed, and the PR squash-merged as `f6957fe3ed56c0726383eb32825efb0381d99c52`. Merge Verification run `41884899294` and CodeQL run `41884899268` passed. Render auto-deploy `dep-dblne6mc6qcc738k300g` reached `live` for that exact commit in `44.5s`. The retained in-app Browser verified eighteen FAQ entries, repository-grounded current-stage/tally and V044 answers, the exact off-topic boundary, latest-message auto-scroll, a clean console and an in-bounds 390×844 dialog. The prior-response poll aggregate remained `144 = 133/4/7`; no production poll response was submitted.

The hosted screenshot subsequently showed that the question `скільки зараз голосів за відкриття платформи?` still returned the unsupported-question boundary. V045 was reopened. The corrected request path reads the same validated public aggregate used by the landing and supplies only the poll metadata plus total and three counts to Taras. Local focused checks passed `33/33`; pinned types, demand build, public scan and demand image passed; and retained-Browser zero/nonzero, factual, off-topic, auto-scroll and 390×844 checks passed.

PR #101 exact-head Verification `41913424373` and CodeQL `41913418565` passed, and the PR squash-merged as `e2976ae8c535462bca021167408c0d0d5b5ad041`. Merge Verification `41914538335` and CodeQL `41914536996` passed. Render auto-deploy `dep-dblq44nb9u1s73dmstig` reached `Live` for that exact commit in `1m 2s`. The retained in-app Browser verified exactly twenty unique approved FAQ entries, no removed wording-history question, known service copy or long dash, matching desktop client and scroll widths and a clean console. Taras returned a 235-character current-stage answer, the live `146 = 135/4/7` aggregate in 90 characters, the exact 61-character off-topic boundary and the permanent-free answer with `завжди` in 109 characters. At 390×844, a 177-character answer remained in an in-bounds 355×520 dialog and composer, latest-message auto-scroll passed, `clientWidth = scrollWidth = 375` and the console remained clean. The viewport was reset and no production poll response was submitted.

## Local V046 demand-landing candidate

Issue [#103](https://github.com/Lontkovsky/openvote/issues/103) refreshes only the demand landing. The candidate uses the owner-approved narrative, self-hosted Manrope Variable, the refined existing mark, label-free content sections, centered numberless outline-icon cards, one header vote action, full-width FAQ answers, a shared-width footer, restrained one-shot motion, static initial HTML, canonical and social metadata, JSON-LD, a sitemap, robots policy, manifest, favicons and a repository-owned social preview. Its section palette has exactly three shared roles: the established hero light gradient, pure white and one dark indigo treatment; `#4b3fc3` remains the single brand-action violet, while green, red and gray remain semantic poll colors. The fresh poll form contains only the immutable question, three semantically colored answers and `Проголосувати`; selecting one answer enables the action directly without a second confirmation checkbox. The accepted-response state centers the check and message with a 30 px gap and runs one 780 ms eight-particle confetti burst regardless of the browser's reduced-motion preference; the burst has one iteration and ends with hidden particles. The existing chat starts with its violet launcher. After ten seconds without interaction, that launcher changes once into one clickable greeting pill with Taras's avatar. Opening the chat hides both launcher forms; closing restores only the round launcher. The dialog retains Taras's avatar in its header and no assistant message avatar. The immutable demand poll identifier, version, question, answers and responses remain unchanged. The original twenty FAQ items remain unchanged, three approved CAWI/Lemur comparison entries are appended, and the same confirmed comparison facts are added to Taras's reviewed snapshot without changing the 250-character answer contract or off-topic boundary.

The owner supplied GTM container `GTM-K2V4DRSD`. When the demand landing mounts, it first pushes the canonical `gtm.start` / `gtm.js` bootstrap object and then creates the exact asynchronous `https://www.googletagmanager.com/gtm.js?id=GTM-K2V4DRSD` script without a cookie-consent banner. This activates the container's configured GA4 destination and its automatic `page_view`. OpenVote's custom events contain only stable identifiers for CTA location, section, video start/completion, FAQ index and Taras opening. Poll choices, vote payloads, chat questions and chat answers are not custom-event parameters. The demand-only content security policy admits the required Google endpoints, while the public demo, full services policy and full client contain no analytics loader. The GTM container is remotely configured and therefore remains an external operational trust input.

The owner completed the local visual review and authorized [PR #104](https://github.com/Lontkovsky/openvote/pull/104) for production. Exact-head Verification `42268493722` and CodeQL `42268487092` passed; the PR squash-merged as `c6ac016ec841f0308661ba6357e0278f638dc7a3`, and merge Verification `42269447704` plus CodeQL `42269447677` passed. Render deploy `dep-dbn1mf5g1s2s73damvsg` reached `Live` for that exact merge commit. The retained in-app Browser verified the refreshed landing over HTTPS without submitting a production response; the existing aggregate remained `149 = 138 / 4 / 7`.

## Browser-only public demo candidate

The owner expanded issue [#103](https://github.com/Lontkovsky/openvote/issues/103) and [PR #104](https://github.com/Lontkovsky/openvote/pull/104) to include the approved public demo and authorized its production deployment. The demand header links to `/demo/`; `/demo` redirects to that canonical trailing-slash document. Nested routes such as `/demo/mine`, `/demo/poll/:id`, `/demo/trust` and `/demo/help` return the same static demo client without URL fragments. `demo.html` is built into the same demand image and marked `noindex,nofollow`.

The demo reuses the approved full-platform React components and the forty established development questions. One completed example shows the verified development fixture's `100 = 57 / 28 / 15` result, one example is open and the remaining examples demonstrate scheduled state. Visitor-created polls, votes, comments, replies, reactions and vote IDs use one versioned browser-local store. Reloading the same browser preserves them; another browser does not receive them. Clearing site data removes them. They are never sent to identity, ballot or management services and are not copied into `openvote-demand`.

The demo notice states that actions stay only in the current browser. It accepts no document, tax number, BankID response or other real identity input. Demo voting does not use Belenios and makes no claim of production ballot verification. The demo does not load the landing's Google Tag Manager integration. Taras remains the existing same-origin demand assistant, with the same public knowledge and answer boundary.

Local release evidence covers the landing link, forty-item catalogue, scheduled/open/completed states, creation, one-vote behavior, the shared success result card, vote-ID lookup, comments, replies, reactions, reload persistence, a fresh-browser boundary, mobile geometry and empty warning/error logs in the retained in-app Browser. Hosted verification repeated the public navigation and one browser-local scenario without submitting another demand response or enabling the suspended role databases.

PR #104 exact-head Verification `42268493722` and CodeQL `42268487092` passed. It squash-merged as `c6ac016ec841f0308661ba6357e0278f638dc7a3`; merge Verification `42269447704` and CodeQL `42269447677` also passed. Render deploy `dep-dbn1mf5g1s2s73damvsg` reached `Live` for the exact merge commit. In the retained in-app Browser, the landing linked to `/demo/`, and direct hosted loads of `/demo/mine`, `/demo/poll/:id`, `/demo/trust` and `/demo/help` remained fragment-free. The forty-item catalogue exposed completed `100 = 57 / 28 / 15`, open and scheduled examples. A new browser-local poll accepted one `Підтримую` vote as `1 / 0 / 0`; its vote ID resolved to the same poll, and its comment plus `Мої` entry survived direct reloads. The FAQ exposed twenty-three entries. At 390×844, `clientWidth = scrollWidth = 375`, the mobile menu was present and no horizontal overflow occurred. The warning/error console was empty, and no GTM script or identity, ballot or management API resource loaded in the demo. No production demand response was submitted.

## Canonical GTM production evidence

The pre-change hosted landing downloaded `gtm.js?id=GTM-K2V4DRSD` but emitted no Google Analytics collection request because the loader did not create the container's `gtm.js` event. PR #108 replaced that command with the canonical `gtm.start` and `event: gtm.js` bootstrap object without changing the established custom-event interface or the landing-only analytics boundary. Exact-head Verification and CodeQL passed; the PR squash-merged as `f8b703e6ec8ebe3c73a6e2f64495d4217c5c6463`, and merge Verification `42632121055` plus CodeQL `42632121229` passed. Render deploy `dep-dbotbalg1s2s738veqi0` reached `live` for that exact commit.

The retained in-app Browser then loaded `https://openvote.com.ua/` and observed the exact GTM script followed by a real `region1.google-analytics.com/g/collect` request containing `tid=G-8TVPBMKS6X`, `en=page_view` and the production document URL. No cookie-consent banner or dialog was present. A separate hosted `https://openvote.com.ua/demo/` tab displayed the demo catalogue and loaded zero GTM, Google Analytics or collection resources. Warning/error logs were empty in both tabs, and no production demand response was submitted.

The demand CSP also permits the exact GTM image path `https://www.googletagmanager.com/td`, observed in a later Lighthouse report. This is a path-limited image permission, not a wildcard, a change to `script-src`, or a permission for other platform services. The request is controlled by the existing external GTM container and can include the page URL and diagnostic parameters; its full contents are outside the application-owned custom-event contract.

## Public search and answer-engine discovery

Issue [#110](https://github.com/Lontkovsky/openvote/issues/110) owns the repository-controlled SEO and answer-engine surface. The same demand image builds and serves five direct, trailing-slash public routes: `/about/`, `/how-it-works/`, `/methodology/`, `/privacy/` and `/faq/`. Every route contains pre-rendered Ukrainian content, one H1, a unique title and description, a canonical URL, Open Graph and Twitter metadata, and Organization, WebSite, WebPage and BreadcrumbList structured data. The FAQ route additionally contains the same twenty-three approved FAQ entries in visible HTML and FAQPage structured data.

The landing and all information pages link to the canonical route set. `sitemap.xml` lists the root plus the five information pages and excludes `/demo/`. `robots.txt` permits Googlebot and OAI-SearchBot and references the sitemap. `llms.txt` identifies this Ukrainian OpenVote project, states the current live and test boundaries, links to the canonical pages and public repository, and warns against confusing the project with unrelated products that share the name.

Only the root landing imports demand analytics. The information pages are static informational surfaces and do not import the GTM loader. The browser-only demo remains `noindex,nofollow`, absent from the sitemap and free of GTM or Google Analytics resources. These controls make the intended public material available to crawlers; they do not guarantee recrawl timing, indexing, ranking, snippet selection or an answer-engine citation.

PR [#111](https://github.com/Lontkovsky/openvote/pull/111) passed exact-head Verification `42645883004` and CodeQL `42645878894`, then squash-merged as `5c4b106847ec677593516aecfe3a825a0cfd114c`. Merge Verification `42646845591` and CodeQL `42646845541` passed. Render deploy `dep-dboul3m8bjmc73bnc3qg` reached `live` for that exact commit. The retained in-app Browser verified all five hosted routes, FAQ parity, structured data, root-only analytics, the demo noindex boundary and the 390×844 layout. Direct hosted requests confirmed the canonical redirect and HTTP 200 crawler access to the public page and `llms.txt`; no production response was submitted.
