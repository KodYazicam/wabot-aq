# Security policy

## Supported versions

| Version | Supported |
| --- | --- |
| 3.x | ✅ |
| < 3.0 | ❌ |

Security fixes land on `main` and the latest 3.x release. Older versions are not maintained.

## Reporting a vulnerability

**Do not open a public issue for a security problem.**

Use GitHub's private vulnerability reporting:

<https://github.com/KodYazicam/wabot-aq/security/advisories/new>

If you cannot use GitHub, email **batuhanaramaz@gmail.com** with `wabot-aq security` in the subject.

Please include:

- the affected version or commit;
- how you deployed the bot (local, Docker, Termux, VPS);
- a minimal reproduction and the impact;
- relevant logs with secrets removed.

### What not to send

Never send any of the following, even in a private report:

- the contents of `sessions/` (WhatsApp linked-device credentials);
- `.env` values, API keys, or bot tokens;
- QR codes or pairing codes;
- real phone numbers, JIDs, or private messages.

Redact them or replace them with placeholders. If a credential may have leaked, revoke it first, then report.

## Scope

In scope:

- exposure of sessions, credentials, or private user data;
- SSRF or requests to internal/private network addresses;
- permission or owner-check bypasses;
- command injection, path traversal, or unsafe file handling;
- secrets leaking through logs, error messages, `.exec` output, or the Docker image;
- dependency vulnerabilities with a concrete exploit path in this project.

Out of scope:

- WhatsApp account bans, blocks, or Terms of Service enforcement;
- spam/rate-limit behaviour on WhatsApp's side;
- outages or changes in third-party APIs (YouTube, AI providers, translation, weather);
- social engineering;
- reports that require a modified client, stolen credentials, or already-public secrets.

## Response

Reports are handled on a best-effort basis, usually within **7 days**. We will confirm the report, ask for anything missing, and coordinate a fix and disclosure timeline with you. Please give us reasonable time to release a fix before publishing details.

## Safe harbour

Good-faith research is welcome. Please:

- test only against your own instance and accounts;
- do not access, modify, or delete another person's data;
- do not disrupt the service or run destructive tests against public deployments;
- keep the report private until a fix is available.

We will not take legal action against researchers who follow this policy.
