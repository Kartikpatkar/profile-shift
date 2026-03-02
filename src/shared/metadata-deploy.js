import { generatePermissionSetXml } from './permissionset-xml.js';
import { bytesToBase64, zipStore } from './zip.js';
import { normalizeApiName } from './text.js';

const DEFAULT_API_VERSION = '56.0';

export async function deployPermissionSet({
    instanceUrl,
    sessionId,
    permissionSetApiName,
    model,
    apiVersion = DEFAULT_API_VERSION,
    extraFiles = [],
    extraPackageTypes = {}
}) {
    if (!instanceUrl || !sessionId) throw new Error('Missing instanceUrl/sessionId');

    const fullName = normalizeApiName(permissionSetApiName);
    const permissionSetXml = generatePermissionSetXml({
        ...model,
        permissionSetApiName: fullName,
        permissionSetLabel: model?.permissionSetLabel || fullName
    });

    const encoder = new TextEncoder();
    const packageXml = buildPackageXml({
        apiVersion,
        typesToMembers: {
            PermissionSet: [fullName],
            ...(extraPackageTypes || {})
        }
    });

    const files = [
        {
            path: 'package.xml',
            data: encoder.encode(packageXml)
        },
        {
            path: `permissionsets/${fullName}.permissionset-meta.xml`,
            data: encoder.encode(permissionSetXml)
        },
        ...(Array.isArray(extraFiles) ? extraFiles : [])
    ];

    const zipBytes = zipStore(files);
    const zipBase64 = bytesToBase64(zipBytes);

    const asyncProcessId = await soapDeploy({
        instanceUrl,
        sessionId,
        apiVersion,
        zipBase64
    });

    const final = await pollDeployStatus({
        instanceUrl,
        sessionId,
        apiVersion,
        asyncProcessId,
        timeoutMs: 120_000,
        intervalMs: 2000
    });

    return final;
}

function buildPackageXml({ apiVersion, typesToMembers }) {
    const types = typesToMembers && typeof typesToMembers === 'object' ? typesToMembers : {};
    const typeNames = Object.keys(types);
    typeNames.sort((a, b) => a.localeCompare(b));

    let out = '';
    out += `<?xml version="1.0" encoding="UTF-8"?>\n`;
    out += `<Package xmlns="http://soap.sforce.com/2006/04/metadata">\n`;

    for (const typeName of typeNames) {
        const membersRaw = Array.isArray(types[typeName]) ? types[typeName] : [];
        const members = membersRaw
            .map((m) => String(m || '').trim())
            .filter(Boolean);
        if (members.length === 0) continue;

        // De-dupe members, stable-ish
        const uniq = Array.from(new Set(members));

        out += `  <types>\n`;
        for (const m of uniq) {
            out += `    <members>${escapeXml(m)}</members>\n`;
        }
        out += `    <name>${escapeXml(typeName)}</name>\n`;
        out += `  </types>\n`;
    }

    out += `  <version>${escapeXml(apiVersion)}</version>\n`;
    out += `</Package>\n`;
    return out;
}

async function soapDeploy({ instanceUrl, sessionId, apiVersion, zipBase64 }) {
    const url = `${instanceUrl}/services/Soap/m/${apiVersion}`;
    const body = `<?xml version="1.0" encoding="utf-8"?>\n` +
        `<env:Envelope xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:env="http://schemas.xmlsoap.org/soap/envelope/" xmlns:met="http://soap.sforce.com/2006/04/metadata">\n` +
        `  <env:Header>\n` +
        `    <met:SessionHeader>\n` +
        `      <met:sessionId>${escapeXml(sessionId)}</met:sessionId>\n` +
        `    </met:SessionHeader>\n` +
        `  </env:Header>\n` +
        `  <env:Body>\n` +
        `    <met:deploy>\n` +
        `      <met:ZipFile>${zipBase64}</met:ZipFile>\n` +
        `      <met:DeployOptions>\n` +
        `        <met:allowMissingFiles>false</met:allowMissingFiles>\n` +
        `        <met:autoUpdatePackage>false</met:autoUpdatePackage>\n` +
        `        <met:checkOnly>false</met:checkOnly>\n` +
        `        <met:ignoreWarnings>false</met:ignoreWarnings>\n` +
        `        <met:performRetrieve>false</met:performRetrieve>\n` +
        `        <met:purgeOnDelete>false</met:purgeOnDelete>\n` +
        `        <met:rollbackOnError>true</met:rollbackOnError>\n` +
        `        <met:singlePackage>true</met:singlePackage>\n` +
        `      </met:DeployOptions>\n` +
        `    </met:deploy>\n` +
        `  </env:Body>\n` +
        `</env:Envelope>`;

    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'text/xml',
            'SOAPAction': 'deploy'
        },
        body
    });

    const xml = await res.text();
    if (!res.ok) {
        throw new Error(`Metadata deploy error: HTTP ${res.status} ${res.statusText} - ${xml.slice(0, 200)}`);
    }

    const id = matchTag(xml, 'id');
    if (!id) {
        throw new Error(`Metadata deploy did not return an async id. Response preview: ${xml.slice(0, 200)}`);
    }
    return id;
}

async function pollDeployStatus({ instanceUrl, sessionId, apiVersion, asyncProcessId, timeoutMs, intervalMs }) {
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
        const status = await soapCheckDeployStatus({ instanceUrl, sessionId, apiVersion, asyncProcessId });
        if (status.done) return status;
        await sleep(intervalMs);
    }

    return { done: false, success: false, status: 'timeout', asyncProcessId };
}

async function soapCheckDeployStatus({ instanceUrl, sessionId, apiVersion, asyncProcessId }) {
    const url = `${instanceUrl}/services/Soap/m/${apiVersion}`;
    const body = `<?xml version="1.0" encoding="utf-8"?>\n` +
        `<env:Envelope xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:env="http://schemas.xmlsoap.org/soap/envelope/" xmlns:met="http://soap.sforce.com/2006/04/metadata">\n` +
        `  <env:Header>\n` +
        `    <met:SessionHeader>\n` +
        `      <met:sessionId>${escapeXml(sessionId)}</met:sessionId>\n` +
        `    </met:SessionHeader>\n` +
        `  </env:Header>\n` +
        `  <env:Body>\n` +
        `    <met:checkDeployStatus>\n` +
        `      <met:asyncProcessId>${escapeXml(asyncProcessId)}</met:asyncProcessId>\n` +
        `      <met:includeDetails>true</met:includeDetails>\n` +
        `    </met:checkDeployStatus>\n` +
        `  </env:Body>\n` +
        `</env:Envelope>`;

    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'text/xml',
            'SOAPAction': 'checkDeployStatus'
        },
        body
    });

    const xml = await res.text();
    if (!res.ok) {
        throw new Error(`Metadata checkDeployStatus error: HTTP ${res.status} - ${xml.slice(0, 200)}`);
    }

    const done = matchTag(xml, 'done') === 'true';
    const success = matchTag(xml, 'success') === 'true';
    const status = matchTag(xml, 'status') || 'unknown';

    const componentFailures = parseComponentFailures(xml);
    const testFailures = parseTestFailures(xml);
    const deployMessages = parseDeployMessages(xml);

    const faultString = matchTag(xml, 'faultstring') || '';
    const faultCode = matchTag(xml, 'faultcode') || '';
    const xmlPreview = buildXmlPreview(xml);

    // Optional errors (best-effort parsing)
    const fallbackMessage = pickFirstNonEmpty(matchAllTags(xml, 'message'));
    const errorMessage = done && !success
        ? buildHumanError({ componentFailures, testFailures, deployMessages, fallbackMessage })
        : undefined;

    return {
        done,
        success,
        status,
        asyncProcessId,
        errorMessage,
        componentFailures,
        testFailures,
        deployMessages,
        faultString: done && !success ? faultString : undefined,
        faultCode: done && !success ? faultCode : undefined,
        xmlPreview: done && !success ? xmlPreview : undefined
    };
}

function matchTag(xml, tagName) {
    const re = new RegExp(`<(?:[A-Za-z0-9_]+:)?${tagName}(?:\\s[^>]*)?>([^<]*)</(?:[A-Za-z0-9_]+:)?${tagName}>`);
    const m = xml.match(re);
    return m ? m[1] : null;
}

function matchAllTags(xml, tagName) {
    const re = new RegExp(`<(?:[A-Za-z0-9_]+:)?${tagName}(?:\\s[^>]*)?>([^<]*)</(?:[A-Za-z0-9_]+:)?${tagName}>`, 'g');
    const out = [];
    let m;
    while ((m = re.exec(xml))) {
        out.push(m[1]);
    }
    return out;
}

function matchAllBlocks(xml, tagName) {
    const re = new RegExp(`<(?:[A-Za-z0-9_]+:)?${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[A-Za-z0-9_]+:)?${tagName}>`, 'g');
    const out = [];
    let m;
    while ((m = re.exec(xml))) {
        out.push(m[1]);
    }
    return out;
}

function pickFirstNonEmpty(values) {
    for (const v of values || []) {
        const s = String(v || '').trim();
        if (s) return s;
    }
    return '';
}

function parseComponentFailures(xml) {
    const blocks = matchAllBlocks(xml, 'componentFailures');
    return blocks.map((b) => {
        const fileName = matchTag(b, 'fileName') || '';
        const fullName = matchTag(b, 'fullName') || '';
        const componentType = matchTag(b, 'componentType') || '';
        const problem = matchTag(b, 'problem') || '';
        const problemType = matchTag(b, 'problemType') || '';
        const lineNumber = matchTag(b, 'lineNumber') || '';
        const columnNumber = matchTag(b, 'columnNumber') || '';
        return {
            fileName,
            fullName,
            componentType,
            problem,
            problemType,
            lineNumber,
            columnNumber
        };
    }).filter((f) => f.problem || f.fileName || f.fullName);
}

function parseDeployMessages(xml) {
    // Some Metadata responses use <messages> for errors instead of <componentFailures>
    const blocks = matchAllBlocks(xml, 'messages');
    return blocks.map((b) => {
        const fileName = matchTag(b, 'fileName') || '';
        const fullName = matchTag(b, 'fullName') || '';
        const problem = matchTag(b, 'problem') || '';
        const problemType = matchTag(b, 'problemType') || '';
        return { fileName, fullName, problem, problemType };
    }).filter((m) => m.problem || m.fileName || m.fullName);
}

function parseTestFailures(xml) {
    const blocks = matchAllBlocks(xml, 'runTestResult');
    if (blocks.length === 0) return [];
    // Look for common deploy test failure shapes.
    const failures = [];
    for (const b of blocks) {
        for (const mf of matchAllBlocks(b, 'failures')) {
            failures.push({
                name: matchTag(mf, 'name') || '',
                methodName: matchTag(mf, 'methodName') || '',
                message: matchTag(mf, 'message') || '',
                stackTrace: matchTag(mf, 'stackTrace') || ''
            });
        }
    }
    return failures.filter((f) => f.message || f.name || f.methodName);
}

function buildHumanError({ componentFailures, testFailures, deployMessages, fallbackMessage }) {
    const cf = (componentFailures || [])[0];
    if (cf?.problem) {
        const where = cf.fileName || cf.fullName || 'metadata';
        const loc = cf.lineNumber ? ` (line ${cf.lineNumber}${cf.columnNumber ? `, col ${cf.columnNumber}` : ''})` : '';
        return `${where}${loc}: ${cf.problem}`;
    }

    const dm = (deployMessages || [])[0];
    if (dm?.problem) {
        const where = dm.fileName || dm.fullName || 'metadata';
        return `${where}: ${dm.problem}`;
    }

    const tf = (testFailures || [])[0];
    if (tf?.message) {
        const testName = [tf.name, tf.methodName].filter(Boolean).join('.') || 'test';
        return `${testName}: ${tf.message}`;
    }

    return String(fallbackMessage || 'Deploy failed.').trim();
}

function buildXmlPreview(xml) {
    const s = String(xml || '');
    // Keep it compact enough to display in the UI debug panel.
    const max = 6000;
    if (s.length <= max) return s;
    return s.slice(0, max) + `\n…(truncated, total ${s.length} chars)`;
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

function escapeXml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}
