# Public result contract v1

The public ballot API requires no researcher account or identity token. For a native election ID, it exposes:

| GET route | Representation |
|---|---|
| `/v1/elections/{id}/result` | ResultContract JSON |
| `/v1/elections/{id}/result.csv` | UTF-8 CSV attachment |
| `/v1/elections/{id}/share.svg` | SVG attachment with visible methodology and embedded contract |
| `/v1/elections/{id}/audit` | Native archive, election, signed checkpoints and the same result |

All result representations require `Published`. Open, closed-but-unpublished, suppressed and invalidated states return HTTP 409. Suppressed results return `RESULTS_SUPPRESSED`; no counts are exported. The audit route has its own equivalent publication gate. No demographic slices or per-participant choices are exposed by these exports.

`packages/domain/src/index.ts` owns the strict result schema. The exact question, positive content version, native poll ID, versioned eligibility policy, accepted vote count, three integer counts, UTC bounds, publication/verification states and voluntary self-selection warning are mandatory. Counts must sum to N; opening must precede closing. Count positions are fixed in v1: `Підтримую`, `Не підтримую`, `Утримуюсь`. All three contribute to N. Display percentages round to one decimal; independently rounded percentages may not sum to 100%. Zero is supported by the renderer, but the real publication gate suppresses groups below the committed minimum of at least three.

The native finalize command supplies the counts. Publication also checks their sum against recorded accepted ballots. UI, CSV and SVG use that stored contract; there is no second identity-derived counter. The UI shows the exact question, policy, version and UTC timestamps from this result beside its counts.

## CSV encoding

CSV has exactly two columns, `field,json_value`, with one row per result field. Each `json_value` is a JSON literal. Read the file with a CSV parser, then JSON-decode each value. This preserves nested policy/counts, boolean and numeric types, quotes, commas, whitespace and line breaks without modifying the original question. It is one documented export format, not a spreadsheet-specific sanitized copy.

The serializer uses quoted fields, doubled embedded quotes and CRLF row endings as described by [RFC 4180](https://www.rfc-editor.org/rfc/rfc4180). Import both columns as text in spreadsheet software. String values retain their enclosing JSON quotes after CSV parsing; user-supplied formula text therefore does not become a formula-leading cell in this format. We do not strip characters or add an apostrophe/tab to the question. Removing JSON quotes, decoding values into a spreadsheet or resaving through another application changes this safety boundary. [OWASP documents spreadsheet interpretation and the limits of CSV sanitization](https://owasp.org/www-community/attacks/CSV_Injection); the tests do not claim universal spreadsheet compatibility.

The downloaded CSV evidence is stored byte-for-byte. A scoped Git attribute preserves its CRLF and recognizes that carriage return as a line ending while retaining trailing-space checks; the artifact is not rewritten to satisfy a text-file whitespace rule.

`tests/support/read-exports.py` uses Python's standard CSV and JSON parsers to reconstruct the contract independently of the TypeScript serializer. The property test includes punctuation, Unicode, line breaks, tabs and formula-leading text.

## Share card

The downloadable SVG shows the complete question, content and policy versions, native ID, N, all three counts and percentages, eligibility, exact UTC bounds, publication and verification status, and self-selection warning. It explicitly labels test test data. It does not claim external audit, population representativeness or control over third-party copies. It contains no scripts, event handlers, external fonts, images or links.

SVG `metadata#result-contract` carries the unchanged JSON contract. Text is XML-escaped and laid out with bounded monospace lines; long content increases card height. The question schema rejects characters outside [XML 1.0's character repertoire](https://www.w3.org/TR/xml/#charsets), including NUL and unpaired surrogates, at input rather than deleting or replacing them at export. Existing valid questions and stored result fields require no database migration.

The browser preview is an image, with the same accessible textual result directly above it and a keyboard-operated disclosure/download. Python ElementTree checks the actual SVG structure and metadata. The existing in-app Browser checks actual rendering and downloads.

Neither the JSON schema nor an SVG metadata field proves a tally. Download the native audit archive and run `pnpm verify artifacts/e2e/election.bel` against the browser test export. The reference verifier checks Belenios proofs without identity storage or network. An external observer must additionally compare trusted manifests/checkpoints; that separate work remains open.
