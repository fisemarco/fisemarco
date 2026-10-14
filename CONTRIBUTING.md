# Contributing

Start with an issue describing the problem, then open a focused pull request. Bug reports must include reproduction steps and expected/actual behavior with secrets and personal data removed.

Use Node.js 22.13+ and the committed lockfile. Follow README setup and run `npm run check` before submission. Changes to permissions, signing, privacy or PostgreSQL require relevant integration tests. Never weaken authentication or use production credentials in fixtures. Put database changes in both Drizzle and Supabase migrations; do not rewrite applied migrations.

Contributions are submitted under Apache-2.0. Preserve third-party notices and source provenance. Do not contribute keys, customer records, scraped datasets without redistribution rights, or code you are not authorized to license. Do not imply external certification or legal compliance from cryptographic verification.

Public-source releases and the managed live service are maintained separately. A merged pull request is not automatically deployed to fisemarco.com.
