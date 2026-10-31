# Bounded resource use and measured local load

Status: local development evidence for [V023](https://github.com/Lontkovsky/openvote/issues/34) and [V039](https://github.com/Lontkovsky/openvote/issues/76). This is not a production capacity claim and is not extrapolated to national-scale participation.

## Baseline reproduction

Before the shared request gate was added, forty concurrent `auth/finish` requests for one synthetic attempt were held for three seconds by mock provider A. All forty reached the provider concurrently and all returned HTTP 200 in 3.091 seconds (`maxProviderPending: 40`). The test then restored the provider to zero delay, removed the temporary attempt and deleted the one resulting session. A JSON request above 1 MiB already returned HTTP 413 `INVALID_INPUT`; request-body size was not the missing boundary.

The same forty-request burst after the change returned eight HTTP 200 responses and thirty-two explicit HTTP 503 `SERVER_BUSY` responses in 3.093 seconds. The focused transport test independently measures a maximum of eight active handlers, sixteen queued requests, immediate rejection of the next request and expiration of a queued request after two seconds. The provider finished with `delayMs: 0` and `pending: 0`.

## Temporal request-rate reproduction

On exact `main` commit `4845f5519120e129acbb14d4e495eebae924163c`, one synthetic provider-A login created a real PostgreSQL-backed identity session. All 1,100 sequential authorized `GET /v1/session` requests returned HTTP 200 in 972.526 ms, and the session cleanup returned 200. The existing gate released every completed request and therefore bounded concurrency and queueing but not the number of short operations in a time window.

The shared application factory now registers the official Fastify rate-limit middleware before any service route is added. Each service process has one aggregate key based on its fixed service role, not a client IP or person. This avoids treating an Nginx loopback address as an identity and keeps the author publication quotas separate. The fixed window admits 1,024 application requests in 5,000 ms; the next request returns HTTP 429 `RATE_LIMITED`. `/health` is excluded so application traffic cannot consume liveness checks. The existing active/queue gate remains unchanged.

The initially tested 1,000 ms window was rejected after the real identity route completed 1,025 sequential requests in 3,733.870 ms and therefore rolled into later windows. With the final 5,000 ms window, the same actual authorization and storage path returned exactly 1,024 HTTP 200 responses and one 429 in 4,017.133 ms. After the window, the next authorized request and session cleanup both returned 200.

CodeQL alerts 1–28 map to the following established routes and expensive operations. The full service suite exercises their actual service-token/session, PostgreSQL, reference-core and local ceremony conditions; the shared transport test proves the one guard installed before all of them.

| Alert | Route | Confirmed operation |
|---:|---|---|
| 1 | ballot `POST /internal/register` | Service authorization, reference verification and ballot DB transaction |
| 2 | provider `GET /control` | Service authorization and provider process state read |
| 3 | provider `POST /control` | Service authorization and provider process state update |
| 4 | identity `POST /v1/auth/start` | Expired-attempt cleanup and attempt insert |
| 5 | provider `POST /attest` | Service authorization and signed synthetic attestation |
| 6 | identity `POST /v1/auth/finish` | Attempt/person/session DB access, provider call and transaction |
| 7 | ballot `GET /v1/elections/:id/tracker` | Receipt DB lookup |
| 8 | ballot `POST /internal/close/:id` | Service authorization, locked DB transition and reference close |
| 9 | ballot `POST /internal/final/:id` | Service authorization and final-set/checkpoint DB reads |
| 10 | identity `DELETE /v1/session` | Session authorization and DB deletion |
| 11 | ballot `POST /internal/share/:id` | Service authorization, locked DB transaction and native share verification |
| 12 | identity `POST /internal/introspect` | Service authorization and DB-backed session lookup |
| 13 | identity `POST /internal/roster` | Service authorization and revoked-person DB read |
| 14 | identity `POST /internal/register-roster` | Service authorization and locked roster/credential DB transaction |
| 15 | ballot `POST /internal/tally/:id` | Service authorization, locked DB transaction and reference tally |
| 16 | ballot `POST /internal/state/:id` | Service authorization and locked DB state transition |
| 17 | identity `POST /v1/credentials/:pollId` | Session authorization and credential DB lookup |
| 18 | ballot `GET /v1/elections/:id/checkpoints` | Checkpoint DB read |
| 19 | ballot `GET /v1/elections/:id/audit` | Election and checkpoint DB reads |
| 20 | management `GET /v1/polls` | Catalogue DB read |
| 21 | management `GET /v1/polls/:id` | Poll/event DB reads and conditional session authorization |
| 22 | management `GET /v1/similar` | PostgreSQL full-text query |
| 23 | management `GET /v1/my-drafts` | Session authorization and author DB query |
| 24 | management `GET /v1/review-queue` | Moderator authorization and poll/appeal DB queries |
| 25 | management `POST /v1/polls/:id/review` | Moderator authorization, locked DB transaction, ceremony files and internal services |
| 26 | management `POST /v1/polls/:id/close` | Moderator authorization, ballot service call and DB update |
| 27 | management `POST /v1/polls/:id/demo-tally` | Moderator authorization, DB writes, bounded tally child and ballot service call |
| 28 | management `POST /v1/polls/:id/appeals` | Session authorization and appeal DB insert |

## Declared bounds

| Resource | Bound | Enforcement |
|---|---:|---|
| Public request body | 1,048,576 bytes | Fastify and Nginx; excess returns 413 |
| Active requests | 8 per service process | Shared FIFO request gate before route handling |
| Waiting requests | 16 per service process | The seventeenth waiting request returns 503 |
| Queue wait | 2,000 ms | Expired request returns 503; it is not promoted later |
| Request / connection input timeout | 100,000 ms | Fastify server configuration |
| URL parameter | 100 characters | Fastify router configuration |
| Accepted application requests | 1,024 per fixed 5,000 ms per service process | Shared Fastify rate limiter; excess returns 429 `RATE_LIMITED` |
| PostgreSQL pool | 8 connections; 5,000 ms connect; 10,000 ms statement | Shared database factory |
| Internal JSON call | 90,000 ms | Abort signal on the exact internal request |
| Provider status / authentication | 2,000 / 5,000 ms | Provider adapter abort signals |
| Gateway connect / read | 5,000 / 105,000 ms | Nginx proxy configuration |
| Native tally child | 120,000 ms | Child-process timeout |

The gate and temporal counter are process-local. The full synthetic runtime has separate identity, ballot, management and mock-provider processes, so these figures are not a deployment-wide admission quota and do not replace upstream DDoS protection. A request that receives `SERVER_BUSY` or `RATE_LIMITED` is not processed in the background.

## Measured read profile

The committed [report](../artifacts/load/report.json) was produced on 2026-10-31 with Node 24.20.0 on Darwin arm64, Apple M3 Pro (12 logical CPUs) and 38,654,705,664 bytes of RAM. The local PostgreSQL catalogue contained two public synthetic polls (one Open, one Closed); the response body was 8,590 bytes.

The fixed profile warmed the route with 16 requests, then sent 1,000 `GET /v1/polls` requests at concurrency 8. All 1,000 succeeded in 284.339 ms: 3,516.926 requests/second measured at the client, mean 2.268 ms, p50 2.043 ms, p95 3.432 ms, p99 4.473 ms and maximum 16.611 ms.

After the temporal boundary was added, the same profile made 1,017 total requests including its sample and warm-up. All 1,000 measured requests again succeeded with zero failures in 280.375 ms: 3,566.657 requests/second, mean 2.232 ms, p95 3.276 ms, p99 4.448 ms and maximum 11.546 ms. The exact report is [v039-rate-limit-report.json](../artifacts/load/v039-rate-limit-report.json).

Exact command:

```sh
pnpm load:test http://127.0.0.1:4303 .runtime/load-report.json
```

The output path must not already exist. The script accepts only a loopback HTTP management origin, performs anonymous catalogue reads, records no identity or ballot material and exits nonzero if any measured response fails.

This result covers one small read-heavy local dataset. It does not measure encrypted ballot generation, write contention, native tallying, public Internet latency, Render resources, DDoS absorption or millions of participants. Those require separate profiles on the selected deployment and must report their own hardware and data sizes.
