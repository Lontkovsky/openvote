# Third-party notices

## Belenios 3.3.0

Upstream: https://github.com/glondu/belenios (mirror of https://gitlab.com/vcast.vote/belenios).
Pinned source: `337887bd1862c7cd057080b530fd80941bfc3c69`, Git submodule `vendor/belenios`.
Copyright © Inria and other upstream contributors, as recorded in each source file. Licensed under GNU Affero General Public License version 3 or later, with the upstream OpenSSL exception. Preserve `vendor/belenios/COPYING`, `LICENSE` and all embedded notices. Source files are unmodified. Generated native and JavaScript artifacts are built from this exact source.

The build environment `glondu/beleniosbase:20260425-1` is maintained by the upstream author and pinned by SHA-256 digest in `infra/crypto.Dockerfile`. It remains a supply-chain trust input, not an independently audited artifact. Release reproducibility must explicitly record this dependency.

The upstream browser distribution includes `vendor/belenios/vendor/libsodium/libsodium.wasm` and its ISC license. Bootstrap copies this license next to the original wrapped JavaScript and the Belenios COPYING file; the WebAssembly binary is unchanged from the pinned upstream source.

The AGPL-3.0-only adapter in `tools/native/share_verify.ml` links the unchanged Belenios library to expose its `check_factor` validation before share persistence, following the upstream server's partial-decryption validation order. It implements no voting cryptographic primitive and changes no upstream source or format. Its source and the pinned upstream library source are included in the repository; the Docker image includes their corresponding license notices.

The installed application/build dependency license inventory is in `artifacts/dependencies/licenses.json`: MIT, Apache-2.0, BSD-3-Clause, ISC, BlueOak-1.0.0 and MPL-2.0. MPL-2.0 applies to the unmodified Lightning CSS build tool, whose source is linked in that inventory. Preserve package license notices in distributions. `release:verify` generates the release CycloneDX SBOM and executable provenance. This inventory is not an external legal opinion.

CI invokes Aqua Security setup-trivy v0.2.6 from commit `3fb12ec12f41e471780db15c232d5dd185dcb514` to install Trivy v0.70.0 under Apache-2.0 and scan the three runtime images. The action and scanner are fetched by GitHub Actions and are not distributed as OpenVote application code.

## Manrope Variable 5.3.0

The demand landing self-hosts Manrope Variable through `@fontsource-variable/manrope` 5.3.0. Manrope is Copyright 2018 The Manrope Project Authors and is licensed under the SIL Open Font License 1.1. The package's license notice and font files must remain available in distributed dependency material. The full test application continues to use its existing Inter typography.
