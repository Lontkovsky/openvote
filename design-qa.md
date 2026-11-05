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

## Confirmed target

The FAQ answer must use the full FAQ container width. Taras's avatar must appear in the one-time greeting and chat header, never beside individual messages. The established round violet launcher must remain visible for ten seconds, then change into the single greeting; neither launcher form may remain while the chat is open, and closing must restore only the round launcher. The composer must not render an outer focus ring. The success state must play one confetti burst after voting, never an infinite loop, must not be disabled by reduced-motion preference, and must leave more space between the confirmation mark and heading. The original twenty FAQ items must remain unchanged, three approved CAWI/Lemur comparison entries must be appended, and the same confirmed facts must be available to Taras without changing his 250-character or OpenVote-only answer boundaries.

Before voting, the poll card must expose exactly three answers and the disabled `Проголосувати` action without totals or answer counts. Positive, negative and neutral choices must be visually distinct in green, red and gray. After a recorded response, the card must show the acknowledgement, total and all three aggregate rows without the visible `Поточні результати` heading. The desktop card must retain the approved hero alignment with more space between the question, choices and action, and the mobile card must remain in bounds.

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
- The existing local synthetic response was restored after the fresh-state check. Reload returned the same recorded `1 = 1/0/0` state, and the Browser console contained no warning or error.
- Desktop and mobile Browser consoles contained no warning or error.

## Findings

No actionable P0, P1 or P2 visual or interaction finding remains for this refinement.

final result: passed
