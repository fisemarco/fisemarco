# FTAI Runtime Identity certification — version 1

FTAI is the issuer and defines this voluntary technical scheme. This is an FTAI product certificate, not accredited certification, an EU conformity assessment, a CE mark, an ISO certificate, or a professional qualification.

## Scope and criteria

FTAI Runtime Identity v1 certifies that, at assessment time:

1. The assigned passport is active in FTAI.
2. It has an enrolled, non-revoked runtime key whose possession was proven during registration.
3. Its enrollment policy is active.
4. Its authenticated runtime contacted FTAI within the last five minutes.
5. Its registry-signed record chain validates, with the expected revision count.

All five must pass. An organisation administrator can request an assessment and issuance; the server evaluates the criteria. Administrators cannot upload a fabricated passing result. This is an automated technical assessment by the registry issuer, not independent human review. Declared capabilities, legal ownership, work quality, model safety, organisational ISMS controls and regulatory conformity are outside this certificate's scope. There are no unearned FTAI-0–5 levels.

## Lifecycle

The organisation workspace provides assessment, issuance, credential download and revocation with a reason. Certificates expire after 24 hours. A fresh assessment is required for reissue. Only one unexpired unrevoked certificate per agent and organisation may be issued. A certificate's signed scope is immutable; status may become revoked, expired or requirements-no-longer-met. Key changes and passport revisions invalidate current applicability, even before expiry. Removal from the organisation or a stale heartbeat also stops current applicability. Erasure deletes the live certificate with its identity.

The credential is an Ed25519 VC-JWT containing issuer, subject, unique ID, issue and expiry times, scheme version, checks, key thumbprint, passport revision and authenticated status endpoint. Download does not publish the private passport.

## Verification

Verify the signature against the registry key you trust, exact issuer, expected agent, scheme and expiry. Obtain current status through an authorised organisation connection; require current. If the verifier cannot obtain status, do not treat the credential as currently valid. Issuance alone is not current status. This scheme does not provide anonymous certificate-status publication. Verification does not authorize tool execution.

## What external assessment means

FTAI can issue its own certificates under this published scheme. Independent certification of FTAI's management system to standards such as ISO/IEC 27001 or ISO/IEC 42001 is a different claim: it requires an external certification body's audit and its decision. An accredited certification claim additionally depends on the certification body's accreditation and scope. The existing 14-control readiness workspace helps prepare evidence; completing it does not confer such certification.

An independent legal-operator attestation is another separate evidence source. FTAI can develop its own documented operator-checking programme, but must actually perform the checks and identify itself as the verifier. Incorporation and complete controller details remain pending and are not supplied by code.

Questions, contested results and certificate concerns: hello@fisemarco.com.

Source for the distinction between standards and external certification: [ISO certification guidance](https://www.iso.org/certification.html).
