import { xmlBool, xmlEl } from './xml.js';

function normalizePermissionSetTabVisibility(v) {
  const raw = String(v || '').trim();
  if (!raw) return null;
  // ProfileTabVisibility -> PermissionSetTabVisibility
  if (raw === 'DefaultOn') return 'Visible';
  if (raw === 'DefaultOff') return 'Available';
  if (raw === 'Hidden') return 'Hidden';

  // Already-in-permissionset values
  if (raw === 'Visible' || raw === 'Available') return raw;

  return raw;
}

export function generatePermissionSetXml(model) {
  const label = model?.permissionSetLabel || model?.permissionSetApiName || 'ProfileShift';
  const license = String(model?.userLicense || model?.license || '').trim();

  let out = '';
  out += '<?xml version="1.0" encoding="UTF-8"?>\n';
  out += '<PermissionSet xmlns="http://soap.sforce.com/2006/04/metadata">\n';
  out += xmlEl('label', label, '  ');
  if (license) out += xmlEl('license', license, '  ');

  for (const p of model?.objectPermissions || []) {
    const any = Boolean(p.allowRead || p.allowCreate || p.allowEdit || p.allowDelete || p.viewAllRecords || p.modifyAllRecords);
    if (!p?.object || !any) continue;
    out += '  <objectPermissions>\n';
    out += xmlEl('object', p.object, '    ');
    out += xmlBool('allowRead', Boolean(p.allowRead), '    ');
    out += xmlBool('allowCreate', Boolean(p.allowCreate), '    ');
    out += xmlBool('allowEdit', Boolean(p.allowEdit), '    ');
    out += xmlBool('allowDelete', Boolean(p.allowDelete), '    ');
    out += xmlBool('viewAllRecords', Boolean(p.viewAllRecords), '    ');
    out += xmlBool('modifyAllRecords', Boolean(p.modifyAllRecords), '    ');
    out += '  </objectPermissions>\n';
  }

  for (const f of model?.fieldPermissions || []) {
    const any = Boolean(f.readable || f.editable);
    if (!f?.field || !any) continue;
    out += '  <fieldPermissions>\n';
    out += xmlEl('field', f.field, '    ');
    out += xmlBool('readable', Boolean(f.readable), '    ');
    out += xmlBool('editable', Boolean(f.editable), '    ');
    out += '  </fieldPermissions>\n';
  }

  for (const up of model?.userPermissions || []) {
    if (!up?.name || !up?.enabled) continue;
    out += '  <userPermissions>\n';
    out += xmlEl('name', up.name, '    ');
    out += xmlBool('enabled', Boolean(up.enabled), '    ');
    out += '  </userPermissions>\n';
  }

  for (const a of model?.apexClassAccesses || []) {
    if (!a?.apexClass || !a?.enabled) continue;
    out += '  <classAccesses>\n';
    out += xmlEl('apexClass', a.apexClass, '    ');
    out += xmlBool('enabled', Boolean(a.enabled), '    ');
    out += '  </classAccesses>\n';
  }

  for (const v of model?.visualforcePageAccesses || []) {
    if (!v?.apexPage || !v?.enabled) continue;
    out += '  <pageAccesses>\n';
    out += xmlEl('apexPage', v.apexPage, '    ');
    out += xmlBool('enabled', Boolean(v.enabled), '    ');
    out += '  </pageAccesses>\n';
  }

  for (const t of model?.tabSettings || []) {
    const vis = normalizePermissionSetTabVisibility(t?.visibility);
    if (!t?.tab || !vis) continue;
    out += '  <tabSettings>\n';
    out += xmlEl('tab', t.tab, '    ');
    out += xmlEl('visibility', vis, '    ');
    out += '  </tabSettings>\n';
  }

  for (const rt of model?.recordTypeVisibilities || []) {
    if (!rt?.recordType || !rt?.visible) continue;
    out += '  <recordTypeVisibilities>\n';
    out += xmlEl('recordType', rt.recordType, '    ');
    out += xmlBool('visible', Boolean(rt.visible), '    ');
    out += xmlBool('default', Boolean(rt.default), '    ');
    out += '  </recordTypeVisibilities>\n';
  }

  out += '</PermissionSet>\n';
  return out;
}
