import { normalizeApiName } from './text.js';

export function profileRecordXmlToPermissionSetModel({
  recordXml,
  sourceUrl,
  profileId,
  profileName
}) {
  if (!recordXml) throw new Error('Missing recordXml');

  const fullName = profileName || getTagValue(recordXml, 'fullName') || 'Profile';
  const userLicense = getTagValue(recordXml, 'userLicense') || getTagValue(recordXml, 'license') || null;

  const objectPermissions = parseObjectPermissions(recordXml);
  const fieldPermissions = parseFieldPermissions(recordXml);
  const userPermissions = parseUserPermissions(recordXml);
  const apexClassAccesses = parseClassAccesses(recordXml);
  const visualforcePageAccesses = parsePageAccesses(recordXml);
  const tabSettings = parseTabVisibilities(recordXml);
  const recordTypeVisibilities = parseRecordTypeVisibilities(recordXml);
  const flowAccesses = parseFlowAccesses(recordXml);
  const externalDataSourceAccesses = parseExternalDataSourceAccesses(recordXml);
  const externalCredentialPrincipalAccesses = parseExternalCredentialPrincipalAccesses(recordXml);
  const customPermissions = parseCustomPermissions(recordXml);

  return {
    source: {
      url: sourceUrl || null,
      capturedAt: new Date().toISOString(),
      via: 'metadata'
    },
    debug: {
      via: 'metadata',
      profileId: profileId || null,
      profileFullName: fullName
    },
    profileName: fullName,
    userLicense,
    permissionSetApiName: normalizeApiName(`${fullName}_Delta`),
    objectPermissions,
    fieldPermissions,
    userPermissions,
    apexClassAccesses,
    visualforcePageAccesses,
    tabSettings,
    recordTypeVisibilities,
    flowAccesses,
    externalDataSourceAccesses,
    externalCredentialPrincipalAccesses,
    // Connected app assignments are not represented on Profile/PermissionSet metadata.
    // This list is user-managed in the UI and applied (optionally) during deploy by
    // updating ConnectedApp metadata.
    assignedConnectedApps: [],
    customPermissions
  };
}

function parseFlowAccesses(xml) {
  return extractBlocks(xml, 'flowAccesses')
    .map((b) => {
      const flow = getTagValue(b, 'flow');
      const enabled = getBool(b, 'enabled');
      if (!flow) return null;
      return { flow, enabled: Boolean(enabled) };
    })
    .filter(Boolean)
    .sort((a, b) => String(a.flow).localeCompare(String(b.flow), undefined, { sensitivity: 'base' }));
}

function parseExternalDataSourceAccesses(xml) {
  return extractBlocks(xml, 'externalDataSourceAccesses')
    .map((b) => {
      const externalDataSource = getTagValue(b, 'externalDataSource');
      const enabled = getBool(b, 'enabled');
      if (!externalDataSource) return null;
      return { externalDataSource, enabled: Boolean(enabled) };
    })
    .filter(Boolean)
    .sort((a, b) => String(a.externalDataSource).localeCompare(String(b.externalDataSource), undefined, { sensitivity: 'base' }));
}

function parseExternalCredentialPrincipalAccesses(xml) {
  return extractBlocks(xml, 'externalCredentialPrincipalAccesses')
    .map((b) => {
      const externalCredentialPrincipal = getTagValue(b, 'externalCredentialPrincipal');
      const enabled = getBool(b, 'enabled');
      if (!externalCredentialPrincipal) return null;
      return { externalCredentialPrincipal, enabled: Boolean(enabled) };
    })
    .filter(Boolean)
    .sort((a, b) => String(a.externalCredentialPrincipal).localeCompare(String(b.externalCredentialPrincipal), undefined, { sensitivity: 'base' }));
}

function parseCustomPermissions(xml) {
  // Seen in PermissionSet as <customPermissions><name>..</name><enabled>..</enabled></customPermissions>
  // Profile metadata can vary; we accept either <customPermissions> or <customPermissionAccesses> blocks.
  const blocks = [
    ...extractBlocks(xml, 'customPermissions'),
    ...extractBlocks(xml, 'customPermissionAccesses')
  ];

  const out = [];
  const seen = new Set();

  for (const b of blocks) {
    const name = getTagValue(b, 'name') || getTagValue(b, 'customPermission');
    if (!name) continue;
    const enabled = getBool(b, 'enabled');
    const key = String(name).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, enabled: Boolean(enabled) });
  }

  out.sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { sensitivity: 'base' }));
  return out;
}

function parseObjectPermissions(xml) {
  return extractBlocks(xml, 'objectPermissions')
    .map((b) => {
      const object = getTagValue(b, 'object');
      const allowRead = getBool(b, 'allowRead');
      const allowCreate = getBool(b, 'allowCreate');
      const allowEdit = getBool(b, 'allowEdit');
      const allowDelete = getBool(b, 'allowDelete');
      const viewAllRecords = getBool(b, 'viewAllRecords');
      const modifyAllRecords = getBool(b, 'modifyAllRecords');

      if (!object) return null;
      if (!(allowRead || allowCreate || allowEdit || allowDelete || viewAllRecords || modifyAllRecords)) return null;

      return {
        object,
        allowRead,
        allowCreate,
        allowEdit,
        allowDelete,
        viewAllRecords,
        modifyAllRecords
      };
    })
    .filter(Boolean);
}

function parseFieldPermissions(xml) {
  return extractBlocks(xml, 'fieldPermissions')
    .map((b) => {
      const field = getTagValue(b, 'field');
      const readable = getBool(b, 'readable');
      const editable = getBool(b, 'editable');
      if (!field) return null;
      if (!readable && !editable) return null;
      return { field, readable, editable };
    })
    .filter(Boolean);
}

function parseUserPermissions(xml) {
  return extractBlocks(xml, 'userPermissions')
    .map((b) => {
      const name = getTagValue(b, 'name');
      const enabled = getBool(b, 'enabled');
      if (!name) return null;
      return { name, enabled: Boolean(enabled) };
    })
    .filter(Boolean);
}

function parseClassAccesses(xml) {
  return extractBlocks(xml, 'classAccesses')
    .map((b) => {
      const apexClass = getTagValue(b, 'apexClass');
      const enabled = getBool(b, 'enabled');
      if (!apexClass || !enabled) return null;
      return { apexClass, enabled: true };
    })
    .filter(Boolean);
}

function parsePageAccesses(xml) {
  return extractBlocks(xml, 'pageAccesses')
    .map((b) => {
      const apexPage = getTagValue(b, 'apexPage');
      const enabled = getBool(b, 'enabled');
      if (!apexPage || !enabled) return null;
      return { apexPage, enabled: true };
    })
    .filter(Boolean);
}

function parseTabVisibilities(xml) {
  // Profile metadata uses <tabVisibilities>, PermissionSet uses <tabSettings>
  return extractBlocks(xml, 'tabVisibilities')
    .map((b) => {
      const tab = getTagValue(b, 'tab');
      const visibility = getTagValue(b, 'visibility');
      if (!tab || !visibility) return null;
      if (visibility === 'Hidden') return null; // minimal/delta
      return { tab, visibility };
    })
    .filter(Boolean);
}

function parseRecordTypeVisibilities(xml) {
  return extractBlocks(xml, 'recordTypeVisibilities')
    .map((b) => {
      const recordType = getTagValue(b, 'recordType');
      const visible = getBool(b, 'visible');
      const def = getBool(b, 'default');
      if (!recordType || !visible) return null;
      return { recordType, visible: true, default: Boolean(def) };
    })
    .filter(Boolean);
}

function extractBlocks(xml, tagName) {
  const s = String(xml || '');
  const re = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'gi');
  const out = [];
  let m;
  while ((m = re.exec(s)) !== null) {
    out.push(m[0]);
  }
  return out;
}

function getTagValue(xml, tagName) {
  const s = String(xml || '');
  const re = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const m = s.match(re);
  return m ? decodeXmlText(m[1].trim()) : null;
}

function getBool(xml, tagName) {
  const v = (getTagValue(xml, tagName) || '').toLowerCase();
  return v === 'true';
}

function decodeXmlText(s) {
  return String(s || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}
