# Existing in-app Browser E2E

`pnpm test:e2e` is a local coordinator. It starts no browser, opens no CDP port and cannot pass from a previous report. Start `pnpm dev` first and keep the existing in-app Browser tab open. The command deletes only prior E2E poll IDs recorded in private `.runtime/e2e-polls.json`, after verifying their test-author marker. It does not delete the seed poll or arbitrary user content.

In the in-app Browser tool runtime, keep the existing tab binding and import the checked-in test module:

```js
const runConfiguration = JSON.parse(await (await import("node:fs/promises")).readFile("/absolute/checkout/.runtime/e2e-run.json", "utf8"));
const suite = await (await import("/absolute/checkout/tests/e2e/inapp.mjs")).createRunner(existingTab, runConfiguration);
```

Execute each stage with `await suite.step(name)` in this order:

1. `create`
2. `reviewStart`
3. `review` after the submitted review completes
4. `voteOne`
5. `voteTwo`
6. `voteThree`
7. `duplicate`
8. `tallyStart` after the fixed `suite.closesAt` time
9. `publish` after the requested tally completes
10. `exports`
11. `providerContracts`
12. `providerRetry`
13. `providerSwitch`
14. `providerBothUnavailable`

## Verification checklist

| Case | Prerequisite | Expected result | Baseline run `92387c0df2` | Verified run `6c9fa7afdf` |
|---|---|---|---|---|
| Create | Healthy local services and synthetic providers | Structured versioned draft enters Review | Passed | Passed |
| Review start | Moderator synthetic identity | Complete rubric and reason are submitted | Passed | Passed |
| Review completion | Finished provisioning ceremony | Immutable poll opens | Passed | Passed after the visible completion status appeared |
| First vote | Committed synthetic person | Browser ciphertext, signed receipt and inclusion succeed | Passed | Passed |
| Second vote | Different person through provider B | Opposing ciphertext is accepted once | Passed | Passed |
| Third vote | Third committed person | Abstention is accepted and included in N | Passed | Passed |
| Duplicate | First person through the other provider | Different final vote is rejected | Passed | Passed |
| Tally start | Fixed deadline reached | Poll closes without deadline change and threshold tally starts | Passed | Passed |
| Publication | Native tally completed | Published result is exactly 1/1/1 with N=3 | Passed | Passed |
| Exports | Signed-out published poll and Browser download event armed before each click | New JSON, CSV, SVG and audit files share one contract; archive is extracted unchanged | Failed: directory polling after an unarmed click produced no file; arming `waitForEvent("download")` before the same JSON click returned the actual saved path | Passed for JSON, CSV, SVG and audit; extracted archive passed separate native verification |
| Provider contracts | Signed-out identity page | Mock capabilities and disabled production adapters are keyboard-visible | Not run after export failure | Passed |
| Provider retry | Provider A controlled unavailable then restored | The same attempt recovers without duplication | Not run after export failure | Passed |
| Provider switch | A unavailable and B explicitly selected | The same person receives no second right | Not run after export failure | Passed |
| Both unavailable | A and B controlled unavailable | Participation remains unavailable and both statuses recover after reset | Not run after export failure | Passed |

Final integrated run `6c9fa7afdf` completed all 14 stages and 38 assertions in the retained in-app Browser session. Its initial and final source digests both equal `43c4f1e7fd2ea551720094af60d0012ea176df7b8d064517ffa7883323d0f782`; the downloaded archive separately passed the native Belenios 3.3.0 verifier with three ballots and exact `[[1,1,1]]`. The Browser console contained no warning or error. At 390×844 the catalogue and published poll had `scrollWidth === innerWidth === 390`, and the catalogue's primary create action remained visible; the temporary viewport override was reset.

Run `7df6bc507c` first exposed a real completion-state race: the success notice rendered before the approved item disappeared from the moderation queue. The API had completed and a later DOM snapshot showed the item absent. `ReviewQueue` now removes the successful poll or appeal from its local collection before rendering success. Runs `7d1e625ff9` and `91d4c13321` were interrupted by the Browser automation runtime while the application stages observed so far were passing; neither is treated as completed evidence.

Asynchronous review/tally start and completion are separate stages. Wait for real completion; do not change the fixed deadline or insert fabricated outcomes. Every browser action uses the supplied tab.playwright API. Public UI state is inspected after actions; no browser secrets or hidden application state are read. The native cryptographic tract is exercised, not mocked.

The four provider stages additionally use the private local coordinator to set A/B mock availability and count active attempts for the one fixed synthetic fixture. They do not authenticate through that control channel: login, error, retry, switching, capability disclosure and result navigation all execute through the UI. The attempt-count check returns only a count and proves that repeated failed deliveries did not create new attempts. Both mock processes are reset at setup and completion/interruption. Run live service tests before this suite, not concurrently, because they deliberately control the same synthetic providers.

The coordinator returns a nonzero exit code if a stage fails, sources change during the run, the run is interrupted, or it remains incomplete for 15 minutes. Safe outcomes are written to `artifacts/e2e/report.json` with run ID and initial/final source digests. The report starts as incomplete; an older successful report cannot survive a new failed attempt. A successful CLI/API test is not browser evidence. The regular GitHub workflow does not claim to run this suite because it does not have the existing in-app Browser session.

The export stage arms the existing Browser's download event before each real UI click and reads the completed path returned by that event. It validates the expected filename and compares the actual downloaded question/version/counts/deadline with the scenario, then extracts the unchanged native archive to `artifacts/e2e/election.bel`. Run `pnpm verify artifacts/e2e/election.bel` separately for native proof verification. This separation does not claim that JSON shape proves a tally. Run `92387c0df2` confirmed that an unarmed click followed by directory polling produced no file, while arming `waitForEvent("download")` before the same JSON click returned the saved file path. No production download code, alternate browser or direct API download is used to replace the UI action.

Exports are exercised after signing out. JSON, CSV, SVG and audit downloads must contain the same complete result contract. The test uses Python standard-library CSV/XML parsers on the actual downloaded files, checks the visible result question, opens/closes the share preview by keyboard, verifies that the SVG image loaded, and retains the CSV/SVG as safe public evidence.

The same stage visits the trust center and checks the observer disclosure: isolated, internally consistent forks require an explicit exchange and comparison of signed evidence. It then returns to the published poll through its public UI link.

Earlier development runs exposed exact-label locator issues on populated form controls, asynchronous review timing, and a concrete catalog hit-area defect. A wrapped inline heading link had a bounding-box center in the parent H2 outside its two inline rectangles, so a center click did not navigate. DOM hit testing confirmed this. Heading links now occupy a contiguous block. Assertions use accessible roles, exact expected navigation and fresh DOM checks. None of the failed runs represented an accepted duplicate ballot.
