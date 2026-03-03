import SalesforceConnector from '../salesforce/salesforce-connector.js';
import { MSG } from './constants.js';
import { generatePermissionSetXml } from '../shared/permissionset-xml.js';
import { deployPermissionSet } from '../shared/metadata-deploy.js';
import { soapListMetadata, soapReadMetadata } from '../shared/metadata-read.js';
import { profileRecordXmlToPermissionSetModel } from '../shared/profile-metadata.js';
import { xmlEscape } from '../shared/xml.js';

// Production logging gate. Keep errors visible, silence debug noise.
const DEBUG = false;
const dlog = (...args) => { if (DEBUG) console.log(...args); };
const dwarn = (...args) => { if (DEBUG) console.warn(...args); };

const connector = new SalesforceConnector({
  cacheTTL: 15_000,
  currentWindowOnly: true
});

// Cache of system permission API names per org (derived from Tooling API describe).
// Keyed by instanceUrl.
const systemPermNamesCache = new Map();

chrome.action.onClicked.addListener(async (tab) => {
  try {
    if (tab?.id) {
      // Pin the clicked tab as the org context so SalesforceConnector.checkAuth()
      // will prefer this org/session.
      await chrome.storage.local.set({ openerTabId: tab.id });
      connector.clearCache();
    }

    const url = chrome.runtime.getURL('src/app/app.html');
    await chrome.tabs.create({ url });
  } catch (e) {
    dwarn('[ProfileShift] Failed to open app tab:', e);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      if (!message || !message.type) {
        sendResponse({ ok: false, error: 'Missing message.type' });
        return;
      }

      switch (message.type) {
        case MSG.LOGIN: {
          const useSandbox = Boolean(message.payload?.useSandbox);
          const org = await connector.login(useSandbox);
          sendResponse({ ok: true, org });
          return;
        }

        case MSG.CLEAR_SESSION: {
          // "Logout" from ProfileShift: clear pinned context and stop scanning other tabs.
          // This does not log the user out of Salesforce; it only clears extension session context.
          await chrome.storage.local.set({ openerTabId: null, currentOrg: null });
          connector.clearCache();
          sendResponse({ ok: true });
          return;
        }

        case MSG.SWITCH_ORG: {
          // "Switch org": clear openerTabId so the connector will scan Salesforce tabs again.
          await chrome.storage.local.remove(['openerTabId', 'currentOrg']);
          connector.clearCache();
          sendResponse({ ok: true });
          return;
        }

        case MSG.CHECK_AUTH: {
          const org = await connector.checkAuth({
            skipCache: Boolean(message.payload?.skipCache)
          });
          sendResponse({ ok: true, org });
          return;
        }

        case MSG.LIST_PROFILES: {
          const org = await connector.checkAuth({ skipCache: true });
          if (!org?.isAuthenticated) {
            sendResponse({ ok: false, error: 'Not authenticated to Salesforce in this browser session.' });
            return;
          }

          const tabUrl = message.payload?.tabUrl || sender?.tab?.url || '';
          const instanceUrl = normalizeInstanceUrl(org.instanceUrl, tabUrl);
          const sessionId = org.sessionId;
          const apiVersion = '56.0';

          const profiles = await fetchProfilesList({ instanceUrl, sessionId, apiVersion });

          let metadataMap = new Map();
          try {
            const listed = await soapListMetadata({
              instanceUrl,
              sessionId,
              apiVersion,
              metadataType: 'Profile'
            });
            for (const r of listed.results || []) {
              const key = toId15(r.id);
              if (key && r.fullName) metadataMap.set(key, r.fullName);
            }
          } catch (e) {
            dwarn('[ProfileShift] listMetadata(Profile) failed while listing profiles.', e);
          }

          const out = profiles.map((p) => ({
            id: p.id,
            name: p.name,
            metadataFullName: metadataMap.get(toId15(p.id)) || null
          }));

          sendResponse({ ok: true, profiles: out, instanceUrl });
          return;
        }

        case MSG.LIST_APEX_CLASSES: {
          const org = await connector.checkAuth({ skipCache: true });
          if (!org?.isAuthenticated) {
            sendResponse({ ok: false, error: 'Not authenticated to Salesforce in this browser session.' });
            return;
          }

          const tabUrl = message.payload?.tabUrl || sender?.tab?.url || '';
          const instanceUrl = normalizeInstanceUrl(org.instanceUrl, tabUrl);
          const sessionId = org.sessionId;
          const apiVersion = '56.0';

          const names = await toolingQueryAllNames({
            instanceUrl,
            sessionId,
            apiVersion,
            soql: 'SELECT Name FROM ApexClass ORDER BY Name'
          });

          sendResponse({ ok: true, names });
          return;
        }

        case MSG.LIST_VF_PAGES: {
          const org = await connector.checkAuth({ skipCache: true });
          if (!org?.isAuthenticated) {
            sendResponse({ ok: false, error: 'Not authenticated to Salesforce in this browser session.' });
            return;
          }

          const tabUrl = message.payload?.tabUrl || sender?.tab?.url || '';
          const instanceUrl = normalizeInstanceUrl(org.instanceUrl, tabUrl);
          const sessionId = org.sessionId;
          const apiVersion = '56.0';

          const names = await toolingQueryAllNames({
            instanceUrl,
            sessionId,
            apiVersion,
            soql: 'SELECT Name FROM ApexPage ORDER BY Name'
          });

          sendResponse({ ok: true, names });
          return;
        }

        case MSG.EXTRACT_PROFILE: {
          const tabId = message.payload?.tabId;
          const explicitProfileId = message.payload?.profileId || null;
          const explicitProfileFullName = (message.payload?.profileFullName || '').trim() || null;

          // Metadata API extraction only (no UI scraping).
          let tabUrl = '';
          if (Number.isInteger(tabId)) {
            const tab = await chrome.tabs.get(tabId);
            tabUrl = tab?.url || '';
          } else {
            tabUrl = message.payload?.tabUrl || sender?.tab?.url || '';
          }

          const org = await connector.checkAuth({ skipCache: true });
          if (!org?.isAuthenticated) {
            sendResponse({ ok: false, error: 'Not authenticated to Salesforce in this browser session.' });
            return;
          }

          const instanceUrl = normalizeInstanceUrl(org.instanceUrl, tabUrl);
          const sessionId = org.sessionId;

          const profileId = explicitProfileId || parseProfileIdFromUrl(tabUrl);
          if (!profileId) {
            sendResponse({ ok: false, error: 'Could not detect Profile Id from the current tab URL.' });
            return;
          }

          // Resolve Profile metadata fullName via listMetadata.
          // Standard profiles often differ (e.g. UI label "System Administrator" => metadata fullName "Admin").
          let profileFullName = explicitProfileFullName;
          if (!profileFullName) {
            try {
              const listed = await soapListMetadata({
                instanceUrl,
                sessionId,
                apiVersion: '56.0',
                metadataType: 'Profile'
              });

              const pid15 = toId15(profileId);
              profileFullName = listed.results.find((r) => toId15(r.id) === pid15)?.fullName || null;
            } catch (e) {
              dwarn('[ProfileShift] listMetadata(Profile) failed, falling back to REST label.', e);
            }
          }

          // Fallback: REST label (may not match metadata fullName for standard profiles)
          const profileName = profileFullName || await fetchProfileNameById({
            instanceUrl,
            sessionId,
            apiVersion: '56.0',
            profileId
          });

          const read = await soapReadMetadata({
            instanceUrl,
            sessionId,
            apiVersion: '56.0',
            metadataType: 'Profile',
            fullNames: [profileName]
          });

          if (!read.recordXml) {
            // If we fell back to REST label and it didn't resolve, show a targeted error.
            sendResponse({
              ok: false,
              error: `Metadata readMetadata(Profile) returned no records for fullName "${profileName}". This usually means the metadata fullName differs from the UI label.`,
              details: {
                profileId,
                attemptedFullName: profileName,
                isNilRecord: Boolean(read.isNilRecord)
              }
            });
            return;
          }

          const extraction = profileRecordXmlToPermissionSetModel({
            recordXml: read.recordXml,
            sourceUrl: tabUrl,
            profileId,
            profileName
          });

          // Metadata often only includes enabled System Permissions; derive disabled ones by
          // enumerating all PermissionSet Permissions* fields and marking missing as enabled:false.
          try {
            const allSystemPermNames = await toolingDescribeSystemPermissionNames({
              instanceUrl,
              sessionId,
              apiVersion: '56.0'
            });
            extraction.userPermissions = mergeSystemPermissions(extraction.userPermissions, allSystemPermNames);
          } catch (e) {
            dwarn('[ProfileShift] Failed to derive disabled System Permissions via Tooling API describe.', e);
          }

          sendResponse({ ok: true, extraction });
          return;
        }

        case MSG.GENERATE_PERMISSIONSET_XML: {
          const model = message.payload?.model;
          if (!model) {
            sendResponse({ ok: false, error: 'payload.model is required' });
            return;
          }

          const xml = generatePermissionSetXml(model);
          sendResponse({ ok: true, xml });
          return;
        }

        case MSG.DEPLOY_PERMISSIONSET: {
          const model = message.payload?.model;
          const permissionSetApiName = message.payload?.permissionSetApiName;
          if (!model || !permissionSetApiName) {
            sendResponse({ ok: false, error: 'payload.model and payload.permissionSetApiName are required' });
            return;
          }

          const org = await connector.checkAuth({ skipCache: true });
          if (!org.isAuthenticated) {
            sendResponse({ ok: false, error: 'Not authenticated to Salesforce in this browser session.' });
            return;
          }

          const instanceUrl = normalizeInstanceUrl(org.instanceUrl, sender?.tab?.url || '');

          const connectedAppsToAssign = (model?.assignedConnectedApps || [])
            .map((r) => ({
              connectedApp: String(r?.connectedApp || '').trim(),
              enabled: Boolean(r?.enabled)
            }))
            .filter((r) => r.connectedApp && r.enabled)
            .map((r) => r.connectedApp);

          const extraFiles = connectedAppsToAssign.length
            ? await buildConnectedAppAssignmentFiles({
              instanceUrl,
              sessionId: org.sessionId,
              apiVersion: '56.0',
              permissionSetFullName: permissionSetApiName,
              connectedAppFullNames: connectedAppsToAssign
            })
            : [];

          const result = await deployPermissionSet({
            instanceUrl,
            sessionId: org.sessionId,
            permissionSetApiName,
            model,
            extraFiles,
            extraPackageTypes: connectedAppsToAssign.length ? { ConnectedApp: connectedAppsToAssign } : {}
          });

          if (!result?.done) {
            sendResponse({ ok: false, error: 'Deploy did not complete (timeout).', result });
            return;
          }
          if (!result?.success) {
            sendResponse({ ok: false, error: result?.errorMessage || 'Deploy failed.', result });
            return;
          }

          sendResponse({ ok: true, result });
          return;
        }

        default:
          sendResponse({ ok: false, error: `Unknown message.type: ${message.type}` });
      }
    } catch (err) {
      sendResponse({ ok: false, error: err?.message || String(err) });
    }
  })();

  return true;
});

function parseProfileIdFromUrl(url) {
  try {
    const u = new URL(url);
    // EnhancedProfiles/page?address=%2F00e...
    const addr = u.searchParams.get('address');
    const decoded = addr ? decodeURIComponent(addr) : '';

    const candidates = [decoded, u.pathname, u.hash, u.search].filter(Boolean).join(' ');
    const m = candidates.match(/\b00e[a-zA-Z0-9]{12,15}\b/);
    return m ? m[0] : null;
  } catch {
    return null;
  }
}

function toId15(id) {
  const s = String(id || '').trim();
  if (!s) return null;
  return s.length >= 15 ? s.slice(0, 15) : s;
}

function normalizeInstanceUrl(instanceUrl, tabUrl) {
  // Prefer using the connector’s instanceUrl, but avoid salesforce-setup domains for API endpoints.
  const pick = (value) => {
    try {
      return new URL(value);
    } catch {
      return null;
    }
  };

  const inst = pick(instanceUrl);
  const tab = pick(tabUrl);
  const base = inst || tab;
  if (!base) return instanceUrl;

  const host = base.hostname;
  if (host.includes('salesforce-setup.com')) {
    // e.g. kartikkp-dev-ed.develop.my.salesforce-setup.com -> kartikkp-dev-ed.develop.my.salesforce.com
    const normalized = host
      .replace('.my.salesforce-setup.com', '.my.salesforce.com')
      .replace('.salesforce-setup.com', '.salesforce.com');
    return `${base.protocol}//${normalized}`;
  }

  return `${base.protocol}//${host}`;
}

async function fetchProfileNameById({ instanceUrl, sessionId, apiVersion, profileId }) {
  // Strategy A: sObject GET
  const sobjectUrl = `${instanceUrl}/services/data/v${apiVersion}/sobjects/Profile/${profileId}`;
  const resA = await fetch(sobjectUrl, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${sessionId}`,
      'Content-Type': 'application/json'
    }
  });

  if (resA.ok) {
    const json = await resA.json();
    const name = String(json?.Name || json?.name || '').trim();
    if (name) return name;
  }

  // Strategy B: SOQL query fallback
  const soql = `SELECT Name FROM Profile WHERE Id = '${profileId}'`;
  const queryUrl = `${instanceUrl}/services/data/v${apiVersion}/query/?q=${encodeURIComponent(soql)}`;
  const resB = await fetch(queryUrl, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${sessionId}`,
      'Content-Type': 'application/json'
    }
  });

  const textB = await resB.text();
  if (!resB.ok) {
    throw new Error(`Failed to fetch Profile name (HTTP ${resB.status}). ${textB.slice(0, 200)}`);
  }

  const data = JSON.parse(textB);
  const name = String(data?.records?.[0]?.Name || '').trim();
  if (!name) throw new Error('Profile name not found in query response');
  return name;
}

async function fetchProfilesList({ instanceUrl, sessionId, apiVersion }) {
  const soql = 'SELECT Id, Name FROM Profile ORDER BY Name';
  const url = `${instanceUrl}/services/data/v${apiVersion}/query/?q=${encodeURIComponent(soql)}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${sessionId}`,
      'Content-Type': 'application/json'
    }
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Failed to list Profiles (HTTP ${res.status}). ${text.slice(0, 200)}`);
  }

  const data = JSON.parse(text);
  return (data.records || [])
    .map((r) => ({ id: String(r.Id || '').trim(), name: String(r.Name || '').trim() }))
    .filter((r) => r.id && r.name);
}

async function toolingQueryAllNames({ instanceUrl, sessionId, apiVersion, soql }) {
  const firstUrl = `${instanceUrl}/services/data/v${apiVersion}/tooling/query/?q=${encodeURIComponent(soql)}`;
  const names = [];

  // Follow nextRecordsUrl for larger orgs.
  let nextUrl = firstUrl;
  let safety = 0;
  while (nextUrl && safety < 10) {
    safety += 1;
    const res = await fetch(nextUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${sessionId}`,
        'Content-Type': 'application/json'
      }
    });

    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Tooling query failed (HTTP ${res.status}). ${text.slice(0, 200)}`);
    }

    const data = JSON.parse(text);
    for (const r of data.records || []) {
      const name = String(r.Name || '').trim();
      if (name) names.push(name);
    }

    const next = data.nextRecordsUrl ? String(data.nextRecordsUrl) : '';
    nextUrl = next ? `${instanceUrl}${next}` : null;
  }

  // De-dupe and sort (case-insensitive)
  const uniq = Array.from(new Set(names));
  uniq.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  return uniq;
}

async function toolingDescribeSystemPermissionNames({ instanceUrl, sessionId, apiVersion }) {
  const key = String(instanceUrl || '').trim();
  const cached = systemPermNamesCache.get(key);
  if (cached && Date.now() - cached.at < 60 * 60 * 1000 && Array.isArray(cached.names) && cached.names.length) {
    return cached.names;
  }

  const url = `${instanceUrl}/services/data/v${apiVersion}/tooling/sobjects/PermissionSet/describe`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${sessionId}`,
      'Content-Type': 'application/json'
    }
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Tooling describe(PermissionSet) failed (HTTP ${res.status}). ${text.slice(0, 200)}`);
  }

  const data = JSON.parse(text);
  const fields = Array.isArray(data?.fields) ? data.fields : [];

  const names = fields
    .filter((f) => f && typeof f.name === 'string' && f.name.startsWith('Permissions') && String(f.type || '').toLowerCase() === 'boolean')
    .map((f) => String(f.name).slice('Permissions'.length))
    .filter(Boolean);

  const uniq = Array.from(new Set(names));
  uniq.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

  systemPermNamesCache.set(key, { at: Date.now(), names: uniq });
  return uniq;
}

function mergeSystemPermissions(current, allNames) {
  const out = [];
  const map = new Map();

  for (const p of current || []) {
    const name = String(p?.name || '').trim();
    if (!name) continue;
    map.set(name.toLowerCase(), { name, enabled: Boolean(p?.enabled) });
  }

  for (const name of allNames || []) {
    const n = String(name || '').trim();
    if (!n) continue;
    const k = n.toLowerCase();
    if (!map.has(k)) map.set(k, { name: n, enabled: false });
  }

  for (const v of map.values()) out.push(v);
  out.sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { sensitivity: 'base' }));
  return out;
}

async function buildConnectedAppAssignmentFiles({
  instanceUrl,
  sessionId,
  apiVersion,
  permissionSetFullName,
  connectedAppFullNames
}) {
  const encoder = new TextEncoder();
  const permName = String(permissionSetFullName || '').trim();
  if (!permName) throw new Error('Missing permissionSetFullName for ConnectedApp assignment');

  // De-dupe, preserve order
  const apps = [];
  const seen = new Set();
  for (const n of connectedAppFullNames || []) {
    const s = String(n || '').trim();
    if (!s) continue;
    const k = s.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    apps.push(s);
  }

  const out = [];
  for (const appFullName of apps) {
    const read = await soapReadMetadata({
      instanceUrl,
      sessionId,
      apiVersion,
      metadataType: 'ConnectedApp',
      fullNames: [appFullName]
    });

    if (!read.recordXml) {
      throw new Error(`Metadata readMetadata(ConnectedApp) returned no records for fullName "${appFullName}".`);
    }

    const root = extractXmlRootBlock(read.recordXml, 'ConnectedApp');
    if (!root) {
      throw new Error(`Could not locate <ConnectedApp> metadata XML for "${appFullName}".`);
    }

    // permissionSetName/profileName only apply when admin-approved is enabled.
    if (!/<isAdminApproved>\s*true\s*<\/isAdminApproved>/i.test(root)) {
      throw new Error(`Connected App "${appFullName}" is not admin-approved (oauthConfig.isAdminApproved=true). It can't be assigned via permission sets in metadata.`);
    }

    const patched = addPermissionSetToConnectedAppXml(root, permName);
    const fileXml = `<?xml version="1.0" encoding="UTF-8"?>\n${patched.trim()}\n`;

    out.push({
      path: `connectedApps/${appFullName}.connectedApp-meta.xml`,
      data: encoder.encode(fileXml)
    });
  }

  return out;
}

function extractXmlRootBlock(xml, rootTag) {
  const s = String(xml || '');
  const re = new RegExp(`<${rootTag}\\b[\\s\\S]*?<\\/${rootTag}>`, 'i');
  const m = s.match(re);
  return m ? m[0] : null;
}

function addPermissionSetToConnectedAppXml(connectedAppXml, permissionSetFullName) {
  const xml = String(connectedAppXml || '');
  const perm = String(permissionSetFullName || '').trim();
  if (!perm) return xml;

  const tagRe = /<permissionSetName\b[^>]*>([\s\S]*?)<\/permissionSetName>/i;
  const m = xml.match(tagRe);

  if (m) {
    const existingRaw = String(m[1] || '');
    const existing = existingRaw
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);

    const exists = existing.some((s) => s.toLowerCase() === perm.toLowerCase());
    const next = exists ? existing : [...existing, perm];
    const nextText = next.join('\n');

    return xml.replace(tagRe, `<permissionSetName>${xmlEscape(nextText)}</permissionSetName>`);
  }

  // No existing <permissionSetName>; insert a new one.
  const insert = `    <permissionSetName>${xmlEscape(perm)}</permissionSetName>`;

  // Prefer inserting right after <label> if present.
  const labelRe = /(<label\b[^>]*>[\s\S]*?<\/label>)/i;
  if (labelRe.test(xml)) {
    return xml.replace(labelRe, `$1\n${insert}`);
  }

  // Fallback: insert before closing root.
  return xml.replace(/<\/ConnectedApp>/i, `${insert}\n</ConnectedApp>`);
}
