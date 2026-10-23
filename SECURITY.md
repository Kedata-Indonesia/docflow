# Security Policy

DocFlow's editor packages are published publicly on npm
(`@kedataindo/docflow-*`), so security problems in them affect anyone who
installs them. Thank you for reporting them responsibly.

## Reporting a vulnerability

**Please do not open a public issue for a security problem.**

- Preferred: use GitHub's private vulnerability reporting —
  [open a draft advisory](https://github.com/Kedata-Indonesia/docflow/security/advisories/new).
  Only the maintainers and you can see it, and it becomes the eventual public
  advisory.
- If you cannot use that channel, open an issue titled
  "Security: request for a private channel" **without any detail**, and a
  maintainer will get in touch.

A useful report contains:

- the affected package and version (`npm view @kedataindo/docflow-<pkg> version`),
- what an attacker gains, and under which conditions (for example: the host
  renders an untrusted document, or a malicious `.docx`/HTML payload is pasted),
- a minimal reproduction — a snippet, a document JSON, or a paste payload,
- whether you intend to publish the finding, and by when.

## What to expect

- acknowledgement within **3 working days**;
- an initial assessment and severity within **10 working days**;
- a fix released as a **patch** on the affected package, with the advisory
  published alongside it (or as a GitHub Release note when the impact is low);
- credit in the advisory unless you ask to stay anonymous;
- coordinated disclosure: we ask for up to **90 days** — or until a fix ships,
  whichever comes first.

If a fix requires a breaking change, we will say so explicitly and publish a
prerelease (`next` dist-tag) first so consumers can test it before it reaches
`latest`.

## Supported versions

Each package is supported as: **the latest published patch** of the latest
published version, plus the version the app in
[`Kedata-Indonesia/docflow-app`](https://github.com/Kedata-Indonesia/docflow-app)
currently consumes while it is being bumped. Because every package is still
pre-1.0, we fix forward — we do not maintain release branches for older
versions unless a widely used consumer cannot move.

## Scope

In scope:

- the published packages in this repository (`packages/*`),
- this repository's build and publish pipeline (supply chain: release
  workflow, npm publishing, provenance),
- the bundled CSL style data and the patched publisher dependencies we ship.

Out of scope here:

- the DocFlow application and its server (`Kedata-Indonesia/docflow-app`) —
  a separate, closed-source product; report there instead,
- vulnerabilities in third-party dependencies. Report those upstream; we track
  them ourselves with Dependabot and ship the bump as soon as a patched
  version exists (that is how the TipTap advisory was closed).

## Hardening we already do

- dependencies are watched weekly by Dependabot, and security advisories are
  raised as pull requests the moment they land;
- the editor never fetches remote styles or assets at runtime — CSL styles ship
  in the package;
- the browser never holds LLM/API credentials in the library's default
  configuration (see `packages/core/src/ai/keyStorage.ts` and
  [docs/guides/AI_PROVIDERS.md](docs/guides/AI_PROVIDERS.md)).
