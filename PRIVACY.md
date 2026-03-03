# 🔒 Privacy Policy – ProfileShift

*Last updated: February 2026*

**ProfileShift** is built with transparency, minimal permissions, and security-first principles.

ProfileShift operates entirely within your browser and communicates only with your authenticated Salesforce org using official Salesforce APIs.

---

## 🛡️ What This Extension Does

ProfileShift allows users to:

* Read Salesforce Profile metadata via the Metadata API
* Convert Profiles into editable in-browser models
* Generate minimal (“delta-style”) Permission Set XML
* Export Permission Set metadata locally
* Optionally deploy generated Permission Sets back to the org
* Optionally update Admin-approved Connected Apps

All metadata operations occur directly between your browser and Salesforce.

ProfileShift does not use any external servers.

---

## 🔐 Data Collection

ProfileShift **does not collect, store, transmit, or share any personal or organizational data** outside your Salesforce environment.

Specifically:

* ❌ No analytics or tracking
* ❌ No telemetry
* ❌ No external API calls
* ❌ No third-party data processing
* ❌ No background data harvesting

All Metadata API calls are made directly to your authenticated Salesforce org.

ProfileShift does not monitor or access unrelated browsing activity.

---

## 🔑 Authentication & Session Handling

ProfileShift uses your existing authenticated Salesforce browser session.

This means:

* The extension reads Salesforce session cookies only to authenticate Metadata API requests.
* Session IDs are never stored persistently.
* Session IDs are never logged.
* Session IDs are never transmitted to third-party services.
* Authentication data is used only in memory for active API calls.

The extension does not collect usernames or passwords.

---

## 💾 Local Storage Usage

ProfileShift may use Chrome’s local storage only for non-sensitive data such as:

* Theme preference (light / dark mode)
* UI state (selected tabs or filters)
* Pinned org context (hostname reference only)

This data:

* Is stored locally in your browser
* Is not transmitted externally
* Can be cleared via browser settings

Profile metadata and session tokens are not stored persistently.

---

## 🚀 Metadata Deployment

If you choose to deploy a generated Permission Set:

* Deployment occurs directly via Salesforce Metadata API.
* You must explicitly confirm before deployment.
* No deployment occurs automatically.
* No metadata changes are made without user action.

If Connected App updates are enabled, those modifications are clearly disclosed before deployment.

---

## 🌐 Remote Code & External Services

ProfileShift:

* ✅ Does not load remote scripts
* ❌ Does not execute third-party code from external servers
* ❌ Does not embed trackers or analytics SDKs
* ❌ Does not communicate with non-Salesforce domains

All code is bundled within the extension and fully auditable in the open-source repository.

---

## 🧱 Permissions Explanation

ProfileShift requests only the minimum permissions required:

### `tabs`

Used to detect and identify an authenticated Salesforce org tab.

### `cookies`

Used only to access Salesforce session cookies for Metadata API authentication.

### `storage`

Used for non-sensitive UI preferences.

### Salesforce host permissions

Restricted to:

* `https://*.salesforce.com/*`
* `https://*.lightning.force.com/*`

No `<all_urls>` permission is requested.

ProfileShift does not access unrelated websites.

---

## 🔍 Data Retention

ProfileShift:

* Does not retain metadata outside active session
* Does not store Salesforce org configuration data
* Does not maintain background sync processes
* Does not create external backups

All metadata exists only in memory during usage.

---

## 🛠 Open Source Transparency

ProfileShift is open source.

All logic related to:

* Metadata reading
* XML generation
* ZIP packaging
* Deployment
* Connected App updates

is publicly auditable in the GitHub repository.

---

## 📬 Contact

If you have questions or concerns regarding this privacy policy:

**Author:** Kartik Patkar
**GitHub:** [https://github.com/YOUR_USERNAME/profileshift](https://github.com/YOUR_USERNAME/profileshift)
**LinkedIn:** [https://www.linkedin.com/in/kartik-patkar](https://www.linkedin.com/in/kartik-patkar)

---

Thank you for using **ProfileShift** 🚀

ProfileShift is designed to help modernize Salesforce security architecture while respecting privacy, transparency, and user control.

---
