# Minimal demand-validation deployment

Issue [#53](https://github.com/Lontkovsky/openvote/issues/53) owns the initial public launch. The single [`render.yaml`](../render.yaml) declares one `openvote` web service, four databases and one 1 GB persistent disk in one `production` environment. The service currently runs only the demand application; the disk is reserved for the future full runtime.

## Declared resources and cost boundary

The active demand configuration contains:

- one Docker web service, `openvote`, on plan `0.5c-512mb`;
- one PostgreSQL 18 database, `openvote-demand`, on plan `0.1c-256mb` with 1 GB storage;
- the apex custom domain `openvote.com.ua`;
- no demand data on the attached disk, wildcard domain, API subdomains, identity service, ballot service, management service or cryptographic runtime in the running container.

The expected steady base is approximately USD 14.45 per month: USD 13.30 for the active web service and demand database, USD 0.25 for the persistent disk, and USD 0.90 for 1 GB storage on each of the three suspended role databases. This is not a billing cap. Bandwidth, build-minute, tax or other usage-based charges can be additional. The Render review screen is authoritative immediately before deployment.

The owner approved creating the unified resources. Render suspension is an operational action rather than a Blueprint field: after creation, suspend the identity, ballot and management databases and leave only `openvote` plus `openvote-demand` active. Suspended database storage remains billable.

## Product and data boundary

The launch serves one Ukrainian landing page and one versioned demand poll. It does not expose the full catalogue, user-created polls, identity verification, Belenios, trustees or the formal closing/publication workflow of the full platform. The landing publicly shows the total number of accepted responses and the exact count for each established answer, including zeros. It must not claim that a response represents a unique person, a Ukrainian citizen or the population of Ukraine.

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

The same environment also declares the three role databases from issue [#51](https://github.com/Lontkovsky/openvote/issues/51). During demand collection they remain suspended. The full Docker runtime is not active and the attached disk remains uninitialized in this phase.

The future full-platform cutover reuses the same `openvote` service and disk: switch the Dockerfile/environment variables and compute plan, resume the three role databases, add the wildcard domain, and suspend `openvote-demand`. Do not start the full runtime without the attached persistent key state.

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

## Action-first landing and synthetic walkthrough

Issue [#59](https://github.com/Lontkovsky/openvote/issues/59) and [PR #60](https://github.com/Lontkovsky/openvote/pull/60) are a presentation-only follow-up to the verified launch in #53. They keep the exact demand API, database, cookie and aggregate contracts, but move the confirmed question and vote action ahead of product explanation. The page retains one concise visible notice that participation is voluntary and identity, citizenship and participant uniqueness are not checked, so the result is not the opinion of Ukrainians generally.

The separate `Як працюватиме платформа` section uses one repository-owned, silent H.264 MP4 with a local poster and native controls. Its three frames were captured in the retained in-app Browser from the existing local synthetic interface at source revision `18869231e2728da393cb4c6c63eb5dec98b195ba`: a populated create form, a selected final vote before submission, and a Published `1/1/1` result. The asset contains no identity selection, credential, key, production response, browser storage, console, local path, narration or third-party media. It is explicitly labeled as a synthetic prototype whose interface may change.

Focused verification for this follow-up is:

- inspect the source frames and encoded asset; use `ffprobe` to confirm H.264, 1280×720, 30 fps, limited-range `yuv420p`, no audio and bounded size;
- run the demand contract test, types, both web builds, lint/public scan and demand Docker image build;
- in the retained in-app Browser, verify the first viewport, anchor, three answers, explicit confirmation, local submission and reload, exact aggregate sum, one paused video, play/pause/seek, keyboard focus and 390×844 layout;
- after exact-head CI and merge, verify the same page and media over HTTPS without submitting a production response, and record the unchanged live aggregate separately.

PR #60 exact-head workflow `41130447936` passed and the PR merged as `130b03c2c12127dfa209af0296da173307b03b7a`. The standard `Deploy latest commit` action created Render deploy `dep-dbigolek1f9s73d59n30` for that exact commit after no automatic deploy appeared during the observed post-merge interval; it reached `live` in 1m34s. The retained in-app Browser verified the apex over HTTPS without submitting a response: the live aggregate was `30 = 26/0/4`, the form still had exactly three unselected answers and a disabled submit action, the same-origin video began paused and passed keyboard play/pause, the console was clean, and the 390×844 layout had no horizontal overflow. The hosted MP4 returned `video/mp4`, `Accept-Ranges: bytes`, HSTS and a correct `206` byte-range response.

## OpenVote brand and persistent poll action

Issue [#62](https://github.com/Lontkovsky/openvote/issues/62) supersedes the bilingual display name with one exact `OpenVote` brand. The demand and full synthetic interfaces reuse one repository-owned open-ring vote mark. The landing keeps exactly one `Проголосувати` link in a sticky header, offsets the `#poll` anchor below that header, and replaces normal browser/storage messages with one nontechnical integrity notice and a concise acknowledgment. The demand API, confirmation gate, immutable response, database, Blueprint and Render resources are unchanged.

The walkthrough was re-captured in the retained in-app Browser after the shared branding change, using the same established synthetic create form, selected unsubmitted choice and Published `1/1/1` result. The silent local H.264 asset remains 1280×720, 30 fps, limited-range `yuv420p`, 10.6 seconds and contains no real identity, production response, key, credential, browser-storage message, console or local path.

## Grounded FAQ assistant

Issue [#65](https://github.com/Lontkovsky/openvote/issues/65) adds one floating demand-page dialog named `Тарас`. It uses the same nine FAQ entries rendered on the page as its only approved knowledge context. The browser sends a strict question to the same-origin demand API; the server requires the existing demand credential and exact Origin and forwards only that question plus the static FAQ context. OpenVote does not store questions, answers or conversation history. The page keeps only the current conversation in memory.

The server call disables response storage and tools, pins the model snapshot, and bounds input, output, timeout, per-credential requests, global requests and concurrency. The required `OPENAI_API_KEY` has no default and is declared `sync: false`; for the existing Blueprint it must be populated manually on the `openvote` service before merging a startup that requires it. The value must never be committed, rendered into the client bundle or printed in release evidence.

Local release evidence requires the focused demand/chat tests, types, both web builds and lint/public scan, plus retained in-app Browser checks for the closed launcher, opening/focus, immediate user bubble, typing state, real grounded answer, fixed off-topic boundary, request limit, close/reopen history, clean console and 390×844 geometry. Hosted evidence must then confirm the same behavior over `https://openvote.com.ua` without submitting a production poll response.

PR [#66](https://github.com/Lontkovsky/openvote/pull/66) exact-head workflow `41157331585` passed and the PR squash-merged as `3eccbcc64cd3c91d5522488f260791a6b6f9abea`; exact merge workflow `41157743677` also passed. The required secret was configured on the existing `openvote` service before merge without entering the repository or client bundle. Automatic Render deploy `dep-dbiko3jm8hqs73ev6p20` reached `live` for that exact commit.

The retained in-app Browser verified the apex over HTTPS without submitting a poll response. The authoritative aggregate remained `38 = 34/0/4`, with one CTA, three unselected radios and disabled submit. The page started with one floating launcher and no inline form. Opening focused the composer and showed only the name `Тарас`; a real question produced an immediate user bubble, typing state and grounded answer. Closing returned focus to the launcher and reopening retained the conversation. The removed subtitle and service note stayed absent. At 390×844 the 355×520 dialog, composer and 54 px launcher remained within `clientWidth = scrollWidth = 375`; the viewport was reset and console warnings/errors were empty. `https://www.openvote.com.ua/` redirected to the HTTPS apex.
