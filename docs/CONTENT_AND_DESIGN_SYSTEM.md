# OpenVote content and design system

This is the shared product language for the demand landing and the full OpenVote application. The public demand landing is the visual and editorial reference. New screens extend this system instead of inventing a second style.

## Product voice

OpenVote speaks directly, calmly and in plain Ukrainian. The interface explains what a person can do, what happens next and which limits affect the decision. It does not narrate storage, transport or implementation details unless the person opens a technical disclosure.

Use:

- direct verbs: `Створіть`, `Оберіть`, `Підтвердьте`, `Перевірте`;
- short active sentences;
- `ви` and `ваш` when the action belongs to the participant;
- concrete outcomes instead of broad promises;
- the canonical brand descriptor `Чесно. Прозоро. Анонімно.`;
- `учасники цього голосування`, never a claim about all Ukrainians or the population.

Avoid in normal visible copy:

- database, storage, transport, request, payload and service terminology;
- the word `browser`; use `на вашому пристрої` when the client boundary matters;
- internal identifiers, protocol names and provider implementation details before they are needed;
- repeated warnings on the same screen;
- generic welcome copy, slogans without an action or claims stronger than verified evidence.

Technical names, identifiers and evidence remain available in explicit sections such as `Технічні відомості`, `Межі гарантій`, audit exports and operator controls. Progressive disclosure changes hierarchy, not facts.

## Text budget

| Element | Limit | Rule |
|---|---:|---|
| Eyebrow | 4 words | Names the section; never a sentence |
| H1 | 12 words | One idea and one purpose |
| Lead | 2 sentences / 220 characters | Explains value or the next decision |
| Card heading | 2–7 words | Starts with a noun or action |
| Card explanation | 2 sentences / 240 characters | Keeps one consequence or limit |
| Button | 4 words | Describes the immediate result |
| Notice | 2 short paragraphs | First sentence is the decision-critical fact |
| Empty/error state | 1 cause + 1 next action | No stack, transport or database wording |

Forms may use longer labels and help only where the contract requires exact input. Trust, eligibility, privacy, coercion and representativeness limits are never removed to meet a text budget.

## Information hierarchy

Each screen has:

1. one purpose in the H1;
2. one short lead when context is needed;
3. one primary action;
4. the minimum facts needed before that action;
5. secondary controls and technical evidence below or inside disclosures.

The catalogue prioritizes discovery and creation. A poll prioritizes understanding the proposal, then the participation decision. Identity prioritizes confirming the right to participate. Results prioritize counts, base and verification status. Trust and help explain limits in short cards before technical detail.

## Visual tokens

| Token | Value | Use |
|---|---|---|
| Accent | `#4B3FC3` | Primary action, links, focus accents |
| Dark surface | `#25234F` | High-emphasis action or principle card |
| Ink | `#18192F` | Primary text |
| Muted | `#5D6078` | Supporting text |
| Field | `#F8F8FC` | Page background |
| Surface | `#FFFFFF` | Cards and forms |
| Soft violet | `#EEECFF` | Brand mark and quiet emphasis |
| Line | `#DEDFEB` | Structural borders |
| Font | `Manrope Variable`, then system sans-serif fallback | All OpenVote interfaces |
| Control radius | `12px`; `999px` for primary actions | Fields and buttons |
| Card radius | `24px` | Primary surfaces |
| Focus | `3px #BCB7F2` | Keyboard-visible focus |

Layout uses a 1180 px maximum content width, generous whitespace, a 76 px landing header, an 80 px application header, 18–30 px card gaps and one-column mobile flow. Shadows are soft and only separate interactive or primary surfaces.

The demand landing is the visual reference for the complete application. Both surfaces use self-hosted Manrope Variable, the same light radial gradient, `#4B3FC3` actions, the shared `#25234F` dark surface, pill actions and 24 px primary-card radii. The landing success acknowledgement centers the check and message with a 30 px gap and uses one 780 ms eight-particle confetti burst. The landing does not suppress this one-shot effect through a reduced-motion override.

## Components

- Header: OpenVote mark, descriptor, three stable destinations and one contextual action.
- Primary button: violet on light surfaces, white on the dark surface.
- Card: white, 24 px radius, subtle line or shadow, no nested decoration without purpose.
- Principle card: dark surface for one important rule, never a list of unrelated warnings.
- Notice: neutral for integrity/methodology, red only for actionable errors.
- Analytics consent: compact, non-blocking, generic cookie-permission wording and demand-landing-only; it never appears in the full platform.
- Local demo link: visible in the landing header only during local development and opens the full platform without changing the public landing.
- Status: short human label; technical state remains available in evidence.
- Disclosure: a visible human summary with optional technical detail.

## Accessibility and responsive behavior

- Use semantic headings in order and one H1 per route.
- Keep the skip link, visible keyboard focus and 46 px minimum controls.
- Do not encode state by color alone.
- At 390×844, the document must not overflow horizontally; primary actions and decision-critical notices remain readable without zoom.
- Loading, disabled, empty and error states use the same hierarchy and identify the next available action.
- Motion is optional and must not be required to understand or complete a flow.

## Evidence boundary

This system may simplify language but cannot strengthen guarantees. OpenVote continues to distinguish implemented behavior, trust assumptions, required external validation and unsupported properties. A visually confident interface is not evidence of an independent audit, legal readiness, provider integration or organizational independence.
