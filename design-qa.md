# Demand landing design QA

## Evidence

- Source visual truth: `/var/folders/bz/j9jvl7sj32b_h21ddmgwp9xc0000gn/T/TemporaryItems/NSIRD_screencaptureui_RchVF5/Screenshot 2026-11-05 at 14.15.20.png` for the Taras greeting, `/var/folders/bz/j9jvl7sj32b_h21ddmgwp9xc0000gn/T/TemporaryItems/NSIRD_screencaptureui_mIHc1J/Screenshot 2026-11-05 at 13.57.28.png` for FAQ/chat and `/var/folders/bz/j9jvl7sj32b_h21ddmgwp9xc0000gn/T/TemporaryItems/NSIRD_screencaptureui_GkxCwP/Screenshot 2026-11-05 at 13.56.38.png` for the accepted-response state.
- Local implementation: `http://localhost:5174/` on branch `v046-demand-landing-refresh`.
- Final desktop screenshot: `/tmp/openvote-v046-final-desktop.png`.
- Final mobile screenshot: `/tmp/openvote-v046-final-mobile.png`.
- Final Taras greeting desktop screenshot: `/tmp/openvote-v046-taras-greeting-desktop.png`.
- Final Taras greeting mobile screenshot: `/tmp/openvote-v046-taras-greeting-mobile.png`.
- Final active-confetti desktop screenshot: `/tmp/openvote-v046-confetti-desktop.png`.
- Final active-confetti mobile screenshot: `/tmp/openvote-v046-confetti-mobile.png`.
- Focused source/implementation comparison: `/tmp/openvote-v046-confetti-comparison.png`, source on the left and implementation on the right.
- Poll-state source visuals: `/var/folders/bz/j9jvl7sj32b_h21ddmgwp9xc0000gn/T/TemporaryItems/NSIRD_screencaptureui_Ie5Mh5/Screenshot 2026-11-05 at 14.17.31.png` before voting and `/var/folders/bz/j9jvl7sj32b_h21ddmgwp9xc0000gn/T/TemporaryItems/NSIRD_screencaptureui_jj2FpW/Screenshot 2026-11-05 at 14.22.27.png` after voting.
- Final poll screenshots: `/tmp/openvote-v046-poll-fresh-final.png`, `/tmp/openvote-v046-poll-final-desktop.png`, `/tmp/openvote-v046-poll-fresh-mobile.png` and `/tmp/openvote-v046-poll-post-vote-mobile.png`.
- Poll-state source/implementation comparison: `/tmp/openvote-v046-poll-comparison.png`; source visuals are on the left and the corresponding local implementation is on the right.
- Comparison viewports: desktop `1280 × 720` and mobile `390 × 844` CSS px.
- Palette source visuals: `/var/folders/bz/j9jvl7sj32b_h21ddmgwp9xc0000gn/T/TemporaryItems/NSIRD_screencaptureui_l3m8SI/Screenshot 2026-11-05 at 16.06.07.png` for the poll surface and `/var/folders/bz/j9jvl7sj32b_h21ddmgwp9xc0000gn/T/TemporaryItems/NSIRD_screencaptureui_OrqYEV/Screenshot 2026-11-05 at 16.06.21.png` for the dark privacy surface.
- Palette baseline and final evidence: `/tmp/openvote-v046-palette-before.png`, `/tmp/openvote-v046-palette-after-desktop.png`, `/tmp/openvote-v046-palette-after-mobile.png`, `/tmp/openvote-v046-palette-how-desktop.png`, `/tmp/openvote-v046-palette-privacy-desktop.png`, `/tmp/openvote-v046-palette-goal-desktop.png` and `/tmp/openvote-v046-palette-privacy-mobile.png`.
- Focused palette comparison: `/tmp/openvote-v046-palette-comparison.png`; supplied source captures are on the left and the local implementation is on the right. Palette verification used desktop `1280 × 900` and mobile `390 × 844` CSS px at device pixel ratio `1`.
- Hero-label source visual: `/var/folders/bz/j9jvl7sj32b_h21ddmgwp9xc0000gn/T/TemporaryItems/NSIRD_screencaptureui_F4Ph77/Screenshot 2026-11-05 at 16.21.04.png`.
- Hero-copy baseline and implementation: `/tmp/openvote-v046-hero-copy-before.png`, `/tmp/openvote-v046-hero-copy-after-desktop.png` and `/tmp/openvote-v046-hero-copy-after-mobile.png`.
- Focused Hero comparison: `/tmp/openvote-v046-hero-copy-comparison.png`; the same `1280 × 900` viewport is shown before on the left and after on the right. The mobile implementation used `390 × 844` CSS px at device pixel ratio `1`.

## Confirmed target

The FAQ answer must use the full FAQ container width. Taras's avatar must appear in the one-time greeting and chat header, never beside individual messages. The established round violet launcher must remain visible for ten seconds, then change into the single greeting; neither launcher form may remain while the chat is open, and closing must restore only the round launcher. The composer must not render an outer focus ring. The success state must play one confetti burst after voting, never an infinite loop, must not be disabled by reduced-motion preference, and must leave more space between the confirmation mark and heading. The original twenty FAQ items must remain unchanged, three approved CAWI/Lemur comparison entries must be appended, and the same confirmed facts must be available to Taras without changing his 250-character or OpenVote-only answer boundaries.

Before voting, the poll card must expose exactly three answers and the disabled `Проголосувати` action without totals or answer counts. Positive, negative and neutral choices must be visually distinct in green, red and gray. After a recorded response, the card must show the acknowledgement, total and all three aggregate rows without the visible `Поточні результати` heading. The desktop card must retain the approved hero alignment with more space between the question, choices and action, and the mobile card must remain in bounds.

The landing must use exactly three section-surface roles: the established hero light gradient, pure white and one dark indigo treatment. The hero, how, goal and FAQ sections share the light gradient; problem, open-source, demo and footer surfaces are white; privacy, final CTA and poll card share the dark treatment. The established violet remains the single brand action color, while green, red and gray remain limited to the three semantic poll choices.

The Hero must not contain a volunteer/open-source label. Its lead must position OpenVote as an open and free civic space with a clear source, transparent tally and private personal choice. The later code-transparency section may state the verifiable open-code fact and retain the GitHub link, but must not use volunteer/open-source status as the primary marketing proposition.

## Visual and interaction verification

- The expanded `Як OpenVote підтверджуватиме особу?` disclosure and its answer each measured `1,138.5` px on desktop. The answer computed `max-width` was `none`, so the width delta was `0`.
- The page rendered exactly twenty-three FAQ disclosures. The three comparison answers each matched their disclosure width with computed `max-width: none` and introduced no horizontal overflow.
- Before ten seconds, the page contained one round SVG launcher and no greeting. After ten seconds, it contained one greeting with one Taras avatar and no round launcher.
- Opening the greeting produced one dialog, no greeting or launcher, exactly one image in the chat header and no image in any assistant message. Closing restored the focused round launcher and the greeting did not recur. Opening the round launcher before the timer also prevented a later greeting.
- The composer received focus when the chat opened. Its computed outline style and box shadow were both `none`.
- On mobile, the greeting measured `355 × 84.625` px from `x = 10` to `x = 365`, and the dialog measured `355 × 520` px over the same horizontal bounds. The document reported `clientWidth = scrollWidth = 375`.
- With `prefers-reduced-motion: reduce` active, all eight particles used `demand-confetti-burst`, `0.78s` duration and iteration count `1`. During the burst they occupied eight distinct transforms; afterward all eight reached opacity `0`.
- The settled gap between the 64 px confirmation mark and `Дякуємо за ваш голос.` measured exactly `30` px on desktop and mobile.
- At `390 × 844`, the active burst remained inside the accepted-response card and the document retained `clientWidth = scrollWidth = 375`.
- The focused comparison confirms that the final card preserves the established color, centered hierarchy and restrained particle palette while creating visibly more separation between the mark and heading.
- In the fresh desktop state the card exposed three radios, zero checkboxes, no `.demand-results` region, no total and a disabled `Проголосувати` action. Selecting any answer enabled the action directly while results remained absent. The selected positive, negative and neutral states computed distinct green, red and gray backgrounds and borders.
- In the recorded desktop state the card exposed one accessible `Результати голосування` region, `Всього відповідей: 1` and the exact `1/0/0` rows. The visible `Поточні результати` heading and editable form controls were absent after reload.
- The fresh desktop card remained exactly `457` px tall. The question-to-first-choice gap measured `44` px, the last-choice-to-action gap measured `55.08` px and the answer-center delta was `0.02` px, preserving the approved two-column alignment while opening the internal spacing.
- At `390 × 844`, the fresh card measured `337.5 × 417.06` px with `20` px between the question and first choice and `32` px between the last choice and action. `clientWidth = scrollWidth = 375`, so no horizontal overflow was introduced.
- After the local demand process reloaded the reviewed knowledge snapshot, Taras answered the CAWI/Lemur comparison in 224 characters and still returned the exact 61-character scope boundary for an unrelated weather question.
- The existing local test response was restored after the fresh-state check. Reload returned the same recorded `1 = 1/0/0` state, and the Browser console contained no warning or error.
- Desktop and mobile Browser consoles contained no warning or error.
- The baseline reproduced six distinct section-background recipes: the hero gradient, plain lavender, warm off-white, two different dark recipes and pure white. The final CSS exposes three shared surface tokens and introduces no additional color literal.
- Computed desktop backgrounds matched exactly within each role: hero/how/goal/FAQ used one light gradient; problem/open-source/demo/footer used white; privacy/final/poll used one dark indigo background. Primary actions retained the established `#4b3fc3` violet.
- At `390 × 844`, the document retained `clientWidth = scrollWidth = 375`, twenty-three FAQ disclosures, three radios and zero checkboxes. Selecting each answer still produced distinct green, red and gray backgrounds and borders without submitting a response.
- Desktop and mobile visual inspection confirmed readable dark-on-light and white-on-dark text, clean transitions between the three surface roles and no new overlap or overflow.
- The pre-change Hero visibly contained the `Волонтерський open source проєкт` pill and repeated the same positioning in its lead. The post-change DOM contained zero `.demand-label`, `волонтерськ` or `open source` marketing matches.
- At `1280 × 900`, removing the pill kept the headline and 457 px poll card aligned in the approved two-column Hero. The longer approved lead wrapped cleanly without colliding with the poll or Taras greeting.
- At `390 × 844`, the lead occupied `337.5 × 192.61` px, the poll remained `337.5 × 417.06` px, `clientWidth = scrollWidth = 375`, and the page retained twenty-three FAQ disclosures, three radios and zero checkboxes.
- The dedicated transparency section now states only that the code, decisions and development process are open; its GitHub action remains visible and the mobile layout stays in bounds.

## Findings

No actionable P0, P1 or P2 visual or interaction finding remains for this refinement.

final result: passed

# Poll editor text-field refinement

## Evidence

- Source visual truth: `/var/folders/bz/j9jvl7sj32b_h21ddmgwp9xc0000gn/T/TemporaryItems/NSIRD_screencaptureui_xMXYRW/Screenshot 2026-11-06 at 11.44.07.png` (`670 × 409` px focused drawer crop).
- Browser-rendered implementation: `/tmp/openvote-editor-fields-after.png` (`1207 × 679` px) and `/tmp/openvote-editor-fields-mobile.png` (`368 × 796` px).
- Browser state: authenticated local `http://localhost:5174/#/new`, clean new-poll drawer, device pixel ratio `1`.
- Desktop viewport content area: `1208 × 679` CSS px. Mobile override: `390 × 844`, yielding a `368 × 796` content viewport.
- Full-view comparison: the supplied source and the desktop implementation were opened in one comparison input. The source shows two resizable multiline controls; the implementation shows one compact single-line question field and one visibly taller description field while preserving the existing drawer hierarchy.
- Focused-region comparison: the field labels, borders, widths, heights and resize affordances are readable in the supplied crop and the corresponding upper form region, so no additional crop was needed.

## Verification

- Typography: existing Manrope family, label weight and control typography remain unchanged.
- Spacing and layout: question height is `50.7` px; description height is `200` px; both remain full width. Desktop and mobile document client widths equal their scroll widths.
- Colors and tokens: fields retain the established white surface, shared border and violet focused state.
- Image quality: this form contains no image asset, so no source asset was replaced or approximated.
- Copy and content: `Питання`, `Опис` and all form contracts remain unchanged.
- Interaction: the question accepts one-line text, the description preserves two-line text, and the description computes `resize: none` with fixed 200 px minimum and maximum heights.
- Runtime: the retained in-app Browser warning/error log is empty.

## Findings

No actionable P0, P1 or P2 visual or interaction finding remains for this refinement.

final result: passed

# Catalogue multi-category filter and content pass

## Baseline and target

- Baseline: one category could be selected, no chips represented the active filter, the catalogue was limited to 900 px and the local list contained only the internal verification question.
- Target: support simultaneous categories, removable chips, the full 1180 px design container and five readable local questions in each of eight categories while preserving the existing poll flow.

## Verification checklist

| Case | Expected | Actual |
|---|---|---|
| Community plus education | Two categories remain selected and both groups render | Passed with two chips and ten cards |
| Remove one chip | The remaining category stays active | Passed with education and five cards |
| Search within selection | Search and selected categories combine | Passed with one matching education card |
| Clear selection | All chips disappear and the complete catalogue returns | Passed with forty cards |
| Desktop layout | Tools and results match the 1180 px platform container | Passed; both measured 1180 px |
| Radius system | 24 px containers, 14 px controls and pill chips | Passed by computed-style inspection |
| Mobile layout | No horizontal overflow at 390×844 | Passed with `clientWidth = scrollWidth = 375` and 338 px content regions |
| Example detail | A card opens readable content without a voting action | Passed on the scheduled education question |

## Evidence

- Desktop: `/tmp/openvote-ui-review/catalogue-multiselect.png`.
- Mobile: `/tmp/openvote-ui-review/catalogue-multiselect-mobile.png`.
- The retained in-app Browser console contained no warning or error.

No actionable P0, P1 or P2 visual or interaction finding remains for this pass.

final result: passed

# Catalogue category-control refinement

## Evidence

- Source visual truth: `/var/folders/bz/j9jvl7sj32b_h21ddmgwp9xc0000gn/T/TemporaryItems/NSIRD_screencaptureui_ltJIB8/Screenshot 2026-11-05 at 21.04.58.png` (`411 × 432` px).
- Browser-rendered implementation: `/tmp/openvote-ui-review/category-filter-after-open.png` (`1521 × 945` px).
- Browser viewport: `1536 × 954` CSS px at device pixel ratio `1`; document client and scroll widths both measured `1521` px.
- State: catalogue route with the category menu open and `Усі категорії` selected.
- Full-view comparison: the supplied source and current implementation were opened together. The source showed a browser-native menu and a double violet focus ring; the implementation shows one rounded OpenVote trigger and one rounded white option panel without an outer ring.
- Focused comparison: the category trigger, selected row, option spacing, border radius and shadow were readable in the implementation capture, so no additional crop was required.

## Interaction verification

- The catalogue contains no native `select` element.
- The search field computed `outline-style: none` and `box-shadow: none` while focused.
- Selecting `Освіта` updated the trigger, marked that option selected and closed the menu.
- Selecting `Усі категорії` restored the original filter value.
- Escape closed the open menu and returned focus to its trigger.
- The Browser console contained no warning or error.

## Fidelity review

- Typography: the existing Manrope treatment and control weight remain unchanged.
- Spacing and layout: the established two-column filter container, 46 px control height and catalogue width remain unchanged.
- Colors and tokens: the control reuses the existing violet action color, soft violet surface, white panel and shared line color.
- Image quality: this control contains no image asset, so no source asset was replaced or approximated.
- Copy: all category names and the search placeholder remain unchanged.

## Comparison history

- Earlier P1: browser-native category menu and double violet ring did not match the approved interface. Fixed by replacing only that control with the established disclosure pattern and removing form-control outlines.
- Post-fix evidence: the open menu uses the brand palette, the chosen option is clear, the focus ring is absent, interactions pass and the page has no horizontal overflow.

No actionable P0, P1 or P2 finding remains for this refinement.

final result: passed

# Full-platform design-system migration

## Baseline and target

- Baseline: the local full platform used Inter, smaller rectangular controls, 18 px cards and a blue-gray application palette that no longer matched the approved landing.
- Target: reuse the landing's exact Manrope typography, `#4b3fc3` action color, shared light radial gradient, white surface, `#25234f` dark surface, 24 px primary cards and pill actions without changing established product flows.
- Integration point: extend the existing global application stylesheet and font entry. Keep every current route/component and add only one local-development entry from the landing header.
- Scope boundary: no API, database, migration, identity, ballot, reference-cryptography, analytics or public-deployment change. No replacement video before owner approval.

## Verification checklist

| Case | Expected | Actual |
|---|---|---|
| Landing entry | `Демо платформи` appears only in local development and opens the full demo | Passed in the retained in-app Browser; a new local platform tab opened |
| Catalogue | Approved typography, light heading surface, 24 px poll cards and dark principle card | Passed by visual and computed-style inspection |
| Identity | Existing provider and test-person controls remain usable in the new visual system | Passed; login as `TEST-PERSON-0002` completed |
| Editor and poll | Existing question editor/detail surfaces remain readable; selected answer has a semantic state | Passed by retained-Browser inspection; positive selection displayed green |
| Trust/help | Reading cards and technical disclosures remain readable | Passed by retained-Browser inspection |
| Analytics boundary | Full platform contains no GTM script or data layer | Passed by DOM inspection |
| Desktop bounds | No horizontal document overflow | Passed at the retained desktop viewport |
| Mobile bounds | Established routes remain in bounds at the documented mobile viewport | Passed at 390×844 for catalogue, question detail and trust; client and scroll widths both measured 375 px |

## Current result

Desktop, responsive and focused functional checks pass. Final local design approval remains with the owner. No public release or video is claimed.

final result: passed

# Shared platform FAQ and support

## Visual target and evidence

- Target: the current local landing FAQ at `http://localhost:5175/#faq`, using the shared twenty-three-item source.
- Implementation: the full-platform FAQ at `http://localhost:5174/#/help`.
- Target capture: `/tmp/openvote-faq-source-20261106.png`.
- Implementation captures: `/tmp/openvote-faq-platform-top-20261106.png` and `/tmp/openvote-faq-support-20261106.png`.
- The comparison used the same retained in-app Browser and the same desktop viewport. A separate 390×844 override covered the responsive state and was reset after inspection.

## Fidelity review

- Typography and copy: the platform renders the same approved question source, weight hierarchy, row rhythm and plus/minus disclosure treatment. The FAQ answers were not rewritten.
- Layout: the first implementation constrained the FAQ list and support card to approximately `920` px inside a `1074.06` px main container. Both were corrected to `1074.06` px, exactly matching the container edges. At the mobile override, main, list and support were all `318.40` px and the document had no horizontal overflow.
- Color and surfaces: the FAQ stays on the established light platform surface. The support block reuses the existing dark indigo surface and white secondary action rather than introducing another palette.
- Assets: Taras uses the existing approved avatar and chat presentation; no replacement or approximation was introduced.
- Interaction: the first FAQ row opened and exposed its unchanged answer. The support action opened Taras with input focus, a real grounded answer returned, close/reopen preserved history, and the launcher remained available on the catalogue route.
- Boundaries: the full platform contained zero Google Tag Manager scripts, and the Browser warning/error log was empty.

No actionable P0, P1 or P2 visual or interaction finding remains for this pass.

final result: passed

# Development lifecycle scenarios and completed-result bars

## Visual target and evidence

- Target: make active, completed and scheduled poll states inspectable in the local catalogue while keeping the established OpenVote layout and published-result contract.
- Completed result evidence: `/tmp/openvote-demo-result-100.png` at `http://localhost:5174/#/poll/10000000-0000-4000-8000-000000000001`.
- The retained in-app Browser verified the active Tarantino poll, the completed bicycle-route poll and the scheduled school-shelter poll in the same session.

## Fidelity review

- Typography and layout: the existing result heading, metadata and card structure are unchanged. Each answer adds one aligned count row and one 46 px horizontal bar using the established 12 px secondary radius.
- Color: positive reuses the platform green, negative reuses the platform red and neutral uses the existing neutral gray treatment. No new palette or decorative treatment was introduced.
- Information hierarchy: counts remain explicit above the bars; percentages are centered inside the bars and are also present in each progress bar's accessible name.
- Data fidelity: the visible `57/28/15` distribution matches the 100 accepted ballots returned by the result API and verified by the reference path.
- Bounds and runtime: the completed page measured `clientWidth = scrollWidth = 1124`; the Browser warning/error log was empty.

No actionable P0, P1 or P2 visual or interaction finding remains for this focused pass.

final result: passed
