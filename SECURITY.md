# Security Policy

## Reporting a Vulnerability

Please **do not** open a public issue for security vulnerabilities.

Report privately through either channel:

- GitHub: [Security Advisories](https://github.com/Kedata-Indonesia/docflow/security/advisories/new)
- Email: **security@kedata.id**

Please include:

- A description of the vulnerability and its impact
- Steps to reproduce (or a proof of concept)
- Affected package(s) and version(s)
- Any suggested remediation

## What to expect

- We will acknowledge your report within **3 business days**.
- We will investigate and keep you updated on progress.
- Once a fix is ready, we will coordinate disclosure with you and credit you
  in the advisory unless you prefer to remain anonymous.

## Supported versions

DocFlow follows semantic versioning. Security fixes are applied to the latest
published minor release. Pre-1.0 versions (`0.x`) are supported on the latest
published version only.

## Scope

This policy covers the published packages under the `@kedataindo` npm scope and
the code in this repository. It does **not** cover third-party dependencies;
please report those upstream to their respective projects.

## Known dependency notices

Some optional features rely on copyleft-licensed components (for example,
`citeproc-js`, AGPL/CPAL, and the CC-BY-SA-3.0 CSL data files). See
[NOTICE](./NOTICE) for details.
