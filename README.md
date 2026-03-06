# 📄 ProfileShift – Salesforce Profile to Permission Set Converter

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/Version-1.0.0-blue.svg)](#)
[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-green.svg?logo=google-chrome)](#)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-blueviolet.svg)](#)

> **Tagline**: *Modernize Salesforce security — convert Profiles into minimal Permission Sets.*

---

## ✨ Overview

**ProfileShift** is a modern, privacy-first **Chrome Extension (Manifest V3)** that helps Salesforce Admins and Developers convert legacy **Profiles** into clean, deployable **Permission Set metadata**.

It works entirely in your browser using your existing authenticated Salesforce session.

📌 **No external servers**
📌 **No OAuth setup required**
📌 **No data collection**
📌 **Full Metadata API support**

ProfileShift is designed to help teams transition from profile-based access control to modern permission-set architecture.

---

## 🚀 Key Features

### 🔄 Convert Profile → Permission Set

* Reads Profile metadata via Salesforce Metadata API
* Converts into editable in-browser model
* Generates minimal (“delta-style”) Permission Set XML
* Only enabled permissions are emitted
* SFDX-ready output

---

### 🧩 Supported Permission Sections

ProfileShift extracts and converts:

✔ Object Permissions (CRUD, View All, Modify All)
✔ Field-Level Security (Read / Edit)
✔ System Permissions
✔ Apex Class Access
✔ Visualforce Page Access
✔ Tab Settings
✔ Record Type Visibility
✔ Flow Access
✔ External Data Source Access
✔ Named Credential Access (External Credential Principals)
✔ Custom Permissions

---

### 🧠 Editable In-Browser Model

* Clean section-based UI
* Tab navigation by permission type
* Direct editing before XML generation
* Toggle-based permission controls
* Accurate metadata-to-model mapping

---

### 📤 Export Permission Set

* Generate valid `<PermissionSet>` XML
* Download as `permissionSet-meta.xml`
* SFDX-compatible structure
* Copy XML to clipboard (planned)

---

### 🚀 Optional Metadata Deploy

* Deploy generated Permission Set directly to org
* Uses official Salesforce Metadata API
* ZIP packaging handled internally
* Deployment confirmation modal
* Real-time deploy status polling
* Error transparency

---

### 🔗 Connected App Assignment (Optional)

* Assign generated Permission Set to Admin-approved Connected Apps
* Metadata patch handled safely
* Explicit confirmation before deployment
* Clear error handling for non-admin-approved apps

---

## 🖥️ UI Philosophy

ProfileShift is designed for developers and administrators:

* Full-page workspace (not popup-only)
* Minimal distraction UI
* Dark / Light theme toggle
* Professional enterprise styling
* Clear deploy confirmation modal
* Loading overlays for long operations
* Toast-based status notifications

---

## 🔐 Privacy & Security

ProfileShift is **100% client-side**.

* No external servers
* No analytics
* No telemetry
* No data transmission
* No metadata storage outside your browser
* Uses existing Salesforce session (cookie-based authentication)
* Does not store or log session IDs

All Metadata API calls are made directly from your browser to Salesforce.

---

## 🏗 Architecture

Built using:

* Manifest V3 (Service Worker architecture)
* HTML5, CSS3, Vanilla JavaScript
* Salesforce SOAP Metadata API
* Salesforce REST & Tooling API
* Modular ZIP generator (STORE method)
* Secure session reuse via cookies
* Strict CSP compliance

---

## 📸 Screenshots

### 🟦 Main Screen

**Light Theme**

![Main Screen - Light Theme](src/assets/screenshots/Main%20Screen%20-%20Light%20Theme.png)

**Dark Theme**

![Main Screen - Dark Theme](src/assets/screenshots/Main%20Screen%20-%20Dark%20Theme.png)

### 🔷 Profile Selection

**Light Theme**

![Profile Screen - Light Theme](src/assets/screenshots/Profile%20Screen%20-%20Light%20Theme.png)

**Dark Theme**

![Profile Screen - Dark Theme](src/assets/screenshots/Profile%20Screen%20-%20Dark%20Theme.png)

### 🚀 Deploy Confirmation

![Confirm Deploy - Light Theme](src/assets/screenshots/Comfirmation%20Window%20-%20Light%20Theme.png)

---

## 🛠 Installation

### 🌐 Install from Chrome Web Store (Recommended)

*(Add store link once published)*

1. Visit Chrome Web Store
2. Click **Add to Chrome**
3. Log into your Salesforce org
4. Open ProfileShift from the extension icon

---

### 🔧 Load Manually (Developer Mode)

1. Clone repository:

```bash
git clone https://github.com/YOUR_USERNAME/profileshift.git
```

2. Open:

```
chrome://extensions/
```

3. Enable **Developer Mode**
4. Click **Load unpacked**
5. Select the project root folder

Done 🎉

---

## 🧪 Current Capabilities

✔ Profile metadata extraction
✔ Metadata API read
✔ In-browser permission editing
✔ Delta-style Permission Set generation
✔ Direct Metadata API deployment
✔ Connected App metadata patching (optional)
✔ Dark / Light theme
✔ Busy overlay & status handling

---

## ⚠️ Important Notes

* “Delta-style” output emits only enabled permissions.
* Does not compute a full org-diff against existing Permission Sets.
* Connected App updates require Admin-approved apps.
* Deployment modifies your org metadata — always review before confirming.

---

## 🛣️ Roadmap

Planned enhancements:

* Compare Profile vs Existing Permission Set
* True diff mode
* CSV export for audit
* Bulk profile analysis
* Dependency validation warnings
* Git-ready multi-metadata package export
* Improved permission search/filter
* Undo/Redo editing support

---

## 🤝 Contributing

Contributions are welcome!

Please ensure:

* No external dependencies added
* Maintain client-side-only architecture
* Keep permissions minimal
* Follow MV3 best practices
* Do not introduce telemetry

---

## 🧠 Author

Built by **Kartik Patkar**
Salesforce Consultant & Developer
GitHub • LinkedIn

---

## 📜 License

This project is licensed under the **MIT License**.

---

> **ProfileShift** — Modernize Salesforce security architecture, safely and locally.

---
