# 🤝 Contributing to ProfileShift

Thank you for your interest in contributing to **ProfileShift**!

ProfileShift is a **Manifest V3 Chrome Extension** that converts Salesforce Profiles into minimal Permission Set metadata and optionally deploys them using the official Salesforce Metadata API.

Because this project interacts with Salesforce org metadata, **security, correctness, and user trust are top priorities.**

---

## 🧩 Ways to Contribute

### 🐞 Report Bugs

If you encounter a bug, please open an issue with:

* A clear description of the issue
* Steps to reproduce the problem
* Expected behavior vs actual behavior
* Screenshots or screen recordings (if applicable)
* Salesforce org type (Sandbox / Production)
* Browser version (Chrome version)
* Any relevant permission sections involved

⚠️ **Do NOT share:**

* Session IDs
* Org IDs
* Metadata files containing sensitive data
* Customer org details

Please redact sensitive information before posting.

---

### 💡 Suggest Enhancements

Have an idea to improve ProfileShift?

Open a feature request and explain:

* What problem it solves
* How it improves Salesforce security modernization
* Whether it affects Metadata API behavior
* Any performance considerations
* Screenshots or mockups (optional)

We especially welcome ideas related to:

* Permission diffing
* Metadata validation improvements
* UI clarity for large profiles
* Performance optimization
* Chrome Web Store compliance
* Accessibility improvements
* Developer workflow enhancements

---

### 💻 Submit Code

We accept pull requests for:

* Bug fixes
* Metadata parsing improvements
* XML generation fixes
* Deployment handling improvements
* UI/UX enhancements
* Performance optimizations
* Refactoring & modularization
* Documentation updates

All contributions must remain:

✔ Fully client-side
✔ No external servers
✔ No telemetry or tracking
✔ Chrome Web Store compliant
✔ Minimal-permission architecture

---

## 🚀 Getting Started

Clone the repository:

```bash
git clone https://github.com/YOUR_USERNAME/profileshift.git
cd profileshift
```

---

### Load the Extension in Chrome

1. Open Chrome and go to:

   ```
   chrome://extensions/
   ```

2. Enable **Developer Mode** (top-right)

3. Click **Load unpacked**

4. Select the project root folder (where `manifest.json` exists)

5. Log into a Salesforce org and launch ProfileShift from the extension icon

---

## ✅ Before Submitting a Pull Request

1. Fork the repository and create a feature branch:

```bash
git checkout -b feature/your-feature-name
```

2. Keep changes focused and well-scoped.

3. Test thoroughly:

   * Extract Profile metadata
   * Edit multiple permission sections
   * Generate Permission Set XML
   * Export XML
   * Deploy to Sandbox
   * Test deploy failure scenario
   * Toggle dark/light theme
   * Test with large profiles (many fields)

4. Submit a pull request with:

   * Clear title and description
   * Screenshots (if UI changes)
   * Explanation of Metadata API impact (if applicable)
   * Reference to related issues (e.g., `Closes #14`)

---

## 🧪 Testing Guidelines

If your change affects metadata parsing or deployment:

Please test with:

* Standard profiles
* Custom profiles
* Profiles with many FLS entries
* Profiles with custom permissions
* Profiles with Flow access
* Connected Apps (admin-approved only)
* Sandbox deployment
* Deployment failure scenarios

⚠️ Never hardcode org-specific values.

⚠️ Never log session IDs or authentication tokens.

---

## 🔐 Security Requirements

Because ProfileShift interacts with Salesforce Metadata API:

* Do NOT store session IDs
* Do NOT persist authentication data
* Do NOT introduce external API calls
* Do NOT add analytics or telemetry
* Do NOT introduce remote script loading
* Do NOT weaken Content Security Policy
* Do NOT expand permissions unnecessarily

Any change affecting authentication, cookies, or deployment logic will receive extra scrutiny.

---

## 📚 Code Style Guide

* Use modular ES modules
* Keep service worker logic isolated from UI
* Maintain clear message constants
* Avoid large monolithic files
* No inline scripts (MV3 CSP compliance)
* No `eval()` or dynamic execution
* Escape all XML properly
* Keep metadata conversion logic pure and testable

UI requirements:

* Must support light & dark theme
* Must remain responsive
* Must handle large metadata sets efficiently
* Avoid blocking main thread

---

## 🏗 Architectural Principles

ProfileShift follows:

* Manifest V3 only
* Service worker-based architecture
* Clear message routing
* Strict CSP compliance
* Client-side Metadata API communication
* ZIP generation using STORE method
* Transparent deployment confirmation

Contributors should preserve this architecture.

---

## 🙌 Code of Conduct

Please be respectful and inclusive.

We follow the [Contributor Covenant](https://www.contributor-covenant.org/version/2/1/code_of_conduct/) to maintain a professional and welcoming environment.

---

## 📬 Questions or Discussions?

* Open an issue for technical questions
* Architectural discussions are welcome
* Security concerns should be reported responsibly

---
