# Contributing
+
+Thanks for helping improve ProfileShift.
+
+## Guiding principles
+- Privacy-first: no tracking, analytics, or third-party calls
+- Chrome Web Store compliant: minimal permissions, clear disclosure
+- No frameworks: keep UI vanilla JS + CSS
+- No polling: use `MutationObserver` for Lightning readiness
+
+## Local development
+1. Load unpacked in Chrome from the `profile-shift/` folder.
+2. Open a Salesforce Lightning Setup Profile page.
+3. Open the extension popup and click **Extract**.
+
+## Pull request checklist
+- [ ] No new remote endpoints added
+- [ ] No inline scripts
+- [ ] Permissions changes explained in PR description
+- [ ] Extraction changes tested on at least one Lightning Profile page
+
+## Reporting DOM breakages
+Salesforce Lightning markup changes over time.
+
+When filing an issue:
+- Include the Profile page URL pattern (not your org domain)
+- Include screenshots of the specific table/section that failed
+- Do not paste session IDs or cookies
+