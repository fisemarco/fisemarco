# Security reporting

Report suspected vulnerabilities privately to **hello@fisemarco.com**, with subject "Fisemarco security report". Include a minimal reproduction, affected version/commit and impact. Do not send private keys, credentials or customer records. Do not disclose exploit details in a public issue before coordination.

Use a local instance for testing. Do not run destructive tests or scan the managed service without explicit authorization. The project does not promise response deadlines or an accredited security certification.

## Deployment boundaries

Public source contains no production credentials or signing identity. Generate a distinct Ed25519 signing key for each independent registry and preserve it securely. Never impersonate the official registry's issuer. A private JWK must never reach browsers, model context or Git history.

The local loopback sign-in shim is for development only. A production identity gateway must strip incoming `oai-authenticated-user-*` headers and inject independently authenticated identity. Hosting this code behind an arbitrary reverse proxy without that boundary is unsafe. Do not publish the local development server.

Supabase private tables stay server-only. Only the signed HTTPS gateway may use the restricted runtime database role. Do not expose its secret connection string, disable TLS verification, substitute the service role in browsers or open direct client RLS policies to make the application work.
