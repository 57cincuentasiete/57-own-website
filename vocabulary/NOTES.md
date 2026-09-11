# Vocabulary Studio

Public route: /vocabulary/. Registration is shown to first-time visitors; returning visitors can log in with a case-insensitive nickname and password. Sessions last seven days and logout revokes them. Each account owns its settings, cards, daily usage, and review events. Existing anonymous IndexedDB data is left untouched and is not assigned automatically to any account.

## Account storage and deployment

The Worker requires a D1 binding named VOCAB_DB and secret VOCAB_ENCRYPTION_KEY. Until configured, account endpoints return 503 and study remains locked.

1. Create a Cloudflare D1 database named vocabulary-accounts; enable the commented d1_databases block in wrangler.toml using its real ID. For Pages, configure the same binding in the dashboard.
2. Execute worker/vocabulary-schema.sql on that database.
3. Generate 32 cryptographically random bytes encoded as base64, and store as the Worker/Pages secret VOCAB_ENCRYPTION_KEY. Keep this key securely backed up. Losing or replacing it makes existing accounts unreadable. Do not commit it.
4. Deploy the Worker and assets together, then verify registration and login over HTTPS.

Nicknames and salted PBKDF2-SHA-256 password verifiers (100,000 iterations, the Workers Web Crypto limit) are encrypted with AES-256-GCM using fresh nonces. Original passwords are never stored. Nickname lookup uses domain-separated HMAC-SHA-256; the database contains no plaintext nickname index. Progress is encrypted as well. Session tokens are random, stored only as SHA-256 digests, and delivered in HttpOnly, Secure, SameSite=Strict cookies. Writes require same-origin JSON requests. Authentication attempts are limited to 20 per IP per 15-minute window. Unique database constraints prevent duplicate registrations; revision checks prevent silent cross-tab overwrites. A conflicting tab must reload before continuing.

Local development: Node 24+ with node:sqlite; run node worker/test-local.mjs --https. Local accounts persist in worker/.local-vocabulary (excluded from git and deployment); a local-only key is generated there. The existing .dev.vars may override VOCAB_ENCRYPTION_KEY. Production keys must be managed separately. HTTP cannot authenticate because secure cookies and HTTPS are required.

Tests: node worker/vocabulary-test.mjs checks registration, duplicate names, bad passwords, login, encrypted records, independent progress, revision conflicts, origin enforcement, logout, expiry, throttling, and missing configuration. node worker/test-local.mjs --selftest covers the existing CMS.

## Study engine

112 entries from IELTS_Advanced_Vocabulary_Study_List.md. Vendored ts-fsrs 5.4.2 (MIT), FSRS-6, 90% target retention. Forgotten words return after at least ten minutes, with at most two attempts per day. Saved IANA timezone defines daily usage. Account data syncs on login; a stale tab cannot overwrite a newer revision. Exports contain unencrypted study progress, without account credentials. Keep word IDs stable. Password recovery and anonymous-progress import are not implemented.
