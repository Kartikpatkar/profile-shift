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
    recordTypeVisibilities
  };
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
