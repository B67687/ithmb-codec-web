# Upload Handling (admin)

**Scope:** triage of opted-in `fullfile_` payloads from workers/telemetry KV
(`fullfile_<uuid>` keys, base64, max 8 MiB raw). Never handle user files any
other way.

Every shared file is treated as untrusted. The routine below is designed so a
malicious payload has no path to the maintainer's host or to any third party
without explicit per-file consent.

## Routine

**1) Fetch to quarantine — never open.**
Download the file from the telemetry dashboard into a dedicated quarantine
location only. Do not open, render, or preview it on the host. (Residual,
unavoidable: the download itself touches the host — mitigate by saving
straight to quarantine, disabling previews, and clearing browser cache after
triage. Isolation starts at step 3.)

**2) Size check (≤ 8 MiB).**
Reject anything larger — it cannot be a valid `fullfile_` payload.

**3) Scan locally FIRST, log the result.**
Scan with an up-to-date malware scanner run containerized, so the host never
parses the payload. Refresh scanner definitions before every triage session
and keep the scan log with the file's UUID.

**4) Inspect only inside an offline sandbox.**
Bring exactly one file into a network-isolated sandbox, inspect it there
(headers, structure, decoder behavior), then destroy the sandbox. Nothing
persists; nothing leaves the sandbox.

**5) Third-party scanners — only with noted submitter consent.**
The sandbox has no network, so external submission is always a separate,
deliberate step: hash first, file only if needed, and only when the
submitter consented to third-party sharing. Record the consent evidence.
No consent → skip.

**6) Delete everything. Note the retention rule.**
KV auto-expires at 365 days; the operator deletes the key right after triage
and never keeps analyst local copies past the triage session.

## Sign-off checklist

- [ ] Date:
- [ ] File UUID (`fullfile_<uuid>`):
- [ ] Size ≤ 8 MiB confirmed:
- [ ] Local scan result (clean / flagged + scan log reference):
- [ ] Offline sandbox used (isolated, single file in, destroyed):
- [ ] Third-party submission (yes/no + consent evidence if yes):
- [ ] Local copy deleted + KV key deleted/confirmed:

Sign-off is mandatory BEFORE KV delete — complete all checklist lines, then
delete the KV key and confirm it is gone.
