const DEFAULT_API_VERSION = '56.0';

export async function soapReadMetadata({
  instanceUrl,
  sessionId,
  apiVersion = DEFAULT_API_VERSION,
  metadataType,
  fullNames
}) {
  if (!instanceUrl || !sessionId) throw new Error('Missing instanceUrl/sessionId');
  if (!metadataType) throw new Error('Missing metadataType');
  if (!Array.isArray(fullNames) || fullNames.length === 0) throw new Error('fullNames must be a non-empty array');

  const url = `${instanceUrl}/services/Soap/m/${apiVersion}`;
  const fullNamesXml = fullNames
    .map((n) => `      <met:fullNames>${escapeXml(n)}</met:fullNames>`)
    .join('\n');

  const body = `<?xml version="1.0" encoding="utf-8"?>\n` +
    `<env:Envelope xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:env="http://schemas.xmlsoap.org/soap/envelope/" xmlns:met="http://soap.sforce.com/2006/04/metadata">\n` +
    `  <env:Header>\n` +
    `    <met:SessionHeader>\n` +
    `      <met:sessionId>${escapeXml(sessionId)}</met:sessionId>\n` +
    `    </met:SessionHeader>\n` +
    `  </env:Header>\n` +
    `  <env:Body>\n` +
    `    <met:readMetadata>\n` +
    `      <met:type>${escapeXml(metadataType)}</met:type>\n` +
    `${fullNamesXml}\n` +
    `    </met:readMetadata>\n` +
    `  </env:Body>\n` +
    `</env:Envelope>`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml',
      'SOAPAction': 'readMetadata'
    },
    body
  });

  const xml = await res.text();
  if (!res.ok) {
    throw new Error(`Metadata readMetadata error: HTTP ${res.status} ${res.statusText} - ${xml.slice(0, 300)}`);
  }

  const fault = matchTag(xml, 'faultstring') || matchTag(xml, 'Fault') || matchTag(xml, 'message');
  if (fault) {
    throw new Error(`Metadata readMetadata fault: ${fault}`);
  }

  const rec = extractFirstRecords(xml);
  return { xml, recordXml: rec.recordXml, isNilRecord: rec.isNilRecord };
}

export async function soapListMetadata({
  instanceUrl,
  sessionId,
  apiVersion = DEFAULT_API_VERSION,
  metadataType
}) {
  if (!instanceUrl || !sessionId) throw new Error('Missing instanceUrl/sessionId');
  if (!metadataType) throw new Error('Missing metadataType');

  const url = `${instanceUrl}/services/Soap/m/${apiVersion}`;
  const body = `<?xml version="1.0" encoding="utf-8"?>\n` +
    `<env:Envelope xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:env="http://schemas.xmlsoap.org/soap/envelope/" xmlns:met="http://soap.sforce.com/2006/04/metadata">\n` +
    `  <env:Header>\n` +
    `    <met:SessionHeader>\n` +
    `      <met:sessionId>${escapeXml(sessionId)}</met:sessionId>\n` +
    `    </met:SessionHeader>\n` +
    `  </env:Header>\n` +
    `  <env:Body>\n` +
    `    <met:listMetadata>\n` +
    `      <met:queries>\n` +
    `        <met:type>${escapeXml(metadataType)}</met:type>\n` +
    `      </met:queries>\n` +
    `      <met:asOfVersion>${escapeXml(apiVersion)}</met:asOfVersion>\n` +
    `    </met:listMetadata>\n` +
    `  </env:Body>\n` +
    `</env:Envelope>`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml',
      'SOAPAction': 'listMetadata'
    },
    body
  });

  const xml = await res.text();
  if (!res.ok) {
    throw new Error(`Metadata listMetadata error: HTTP ${res.status} ${res.statusText} - ${xml.slice(0, 300)}`);
  }

  const fault = matchTag(xml, 'faultstring') || matchTag(xml, 'Fault') || matchTag(xml, 'message');
  if (fault) {
    throw new Error(`Metadata listMetadata fault: ${fault}`);
  }

  const results = [];
  const re = /<result\b[^>]*>([\s\S]*?)<\/result>/gi;
  let m;
  while ((m = re.exec(String(xml))) !== null) {
    const block = m[0];
    const id = matchTag(block, 'id');
    const fullName = matchTag(block, 'fullName');
    const fileName = matchTag(block, 'fileName');
    if (!id && !fullName) continue;
    results.push({ id: id || null, fullName: fullName || null, fileName: fileName || null });
  }

  // De-dupe by id/fullName
  const uniq = [];
  const seen = new Set();
  for (const r of results) {
    const key = `${r.id || ''}|${r.fullName || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(r);
  }

  return { xml, results: uniq };
}

function extractFirstRecords(xml) {
  const s = String(xml || '');

  // Self-closing records block (often with xsi:nil="true")
  const selfClosing = s.match(/<records\b[^>]*\/>/i);
  if (selfClosing) {
    const tag = selfClosing[0];
    const isNilRecord = /xsi:nil\s*=\s*"true"/i.test(tag);
    return { recordXml: null, isNilRecord };
  }

  // Normal records block
  const m = s.match(/<records\b[^>]*>([\s\S]*?)<\/records>/i);
  return { recordXml: m ? m[0] : null, isNilRecord: false };
}

function matchTag(xml, tagName) {
  const re = new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`, 'i');
  const m = String(xml || '').match(re);
  return m ? m[1].trim() : null;
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
