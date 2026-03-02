# ProfileShift

ProfileShift is a privacy-first Chrome Extension that helps Salesforce Admins and Developers modernize their org security model by converting **Profile** permissions (from Salesforce Setup UI) into a deployable **Permission Set**.

This project is:
- 100% client-side (no external servers)
- Open source (MIT)
- Built for Manifest V3

## What it does (MVP)
- Lists Profiles from your org and lets you pick one to convert
- Reads Profile permissions via Salesforce **Metadata API** (`listMetadata(Profile)` + `readMetadata(Profile)`)
- Generates a Permission Set XML (`.permissionset-meta.xml`)
- (Optional in MVP) Deploys the Permission Set via Metadata API using your existing browser session

## Privacy
- No analytics
- No tracking
- No third-party requests
- No data is sent anywhere except to **your Salesforce org** (when you choose to deploy)

## How it works
- Click the extension icon to open the Profile Picker in a new tab.
- The app loads all Profiles from your org and resolves the correct metadata `fullName` (important for standard profiles like “System Administrator”).
- Select a Profile to extract permissions via Metadata API.
- Review/edit permissions in the tables, set a Permission Set API Name, then export or deploy.

## Installation (unpacked)
1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `profile-shift/` folder (the one containing `manifest.json`)

## Permissions rationale
ProfileShift requests only what it needs:
- `tabs`: open the Profile Picker and (optionally) read the active tab URL for convenience
- `cookies`: read the current Salesforce session cookie to authenticate API calls
- `storage`: cache auth/session checks briefly
- Host permissions: Salesforce domains required to read cookies and call your org endpoints

## Development notes
- UI is vanilla JS + CSS (no frameworks)
- No inline scripts (CSP-friendly)

## License
MIT — see [LICENSE](LICENSE)