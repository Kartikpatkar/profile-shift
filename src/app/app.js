import { MSG } from '../sw/constants.js';
import { normalizeApiName } from '../shared/text.js';

// Production logging gate (leave console.error visible).
const DEBUG = false;
const dlog = (...args) => { if (DEBUG) console.log(...args); };

/** @typedef {{ id: string, name: string, metadataFullName: string|null }} ProfileListItem */

const els = {
    themeToggle: document.getElementById('themeToggle'),
    authActions: document.getElementById('authActions'),
    loginProdBtn: document.getElementById('btnLoginProd'),
    loginSandboxBtn: document.getElementById('btnLoginSandbox'),
    orgMenuWrap: document.getElementById('orgMenuWrap'),
    profileBtn: document.getElementById('profileBtn'),
    profileMenu: document.getElementById('profileMenu'),
    menuOrgName: document.getElementById('menuOrgName'),
    logoutBtn: document.getElementById('btnLogout'),
    switchOrgBtn: document.getElementById('btnSwitchOrg'),

    deployConfirm: document.getElementById('deployConfirm'),
    deployConfirmOrg: document.getElementById('deployConfirmOrg'),
    deployConfirmPermSet: document.getElementById('deployConfirmPermSet'),
    deployConfirmSummary: document.getElementById('deployConfirmSummary'),
    deployConfirmCancelBtn: document.getElementById('btnDeployCancel'),
    deployConfirmConfirmBtn: document.getElementById('btnDeployConfirm'),
    loadingOverlay: document.getElementById('loadingOverlay'),
    loadingText: document.getElementById('loadingText'),
    profileInput: document.getElementById('profileInput'),
    profilesList: document.getElementById('profilesList'),

    permissionSetName: document.getElementById('permissionSetName'),

    convertBtn: document.getElementById('btnConvert'),
    exportBtn: document.getElementById('btnExport'),
    deployBtn: document.getElementById('btnDeploy'),

    editor: document.getElementById('editor'),
    tabBar: document.getElementById('tabBar'),
    tabPanel: document.getElementById('tabPanel'),

    // Extraction summary/debug UI removed; console logging only.
};

let latestModel = null;
let latestXml = null;
let xmlDirty = false;
let desiredPermissionSetApiName = '';
let activeSectionKey = 'objects';

let fieldObjectFilter = '';

const sectionSearch = {
    objects: '',
    fields: '',
    system: '',
    apex: '',
    vf: '',
    tabs: '',
    recordTypes: '',
    flows: '',
    externalDataSources: '',
    namedCredentials: '',
    connectedApps: '',
    customPermissions: ''
};

let selectedProfileId = null;

let currentOrgHost = '';

const THEME_STORAGE_KEY = 'ps:theme';

function getSavedTheme() {
    try {
        const v = String(localStorage.getItem(THEME_STORAGE_KEY) || '').trim().toLowerCase();
        if (v === 'light' || v === 'dark') return v;
        return '';
    } catch {
        return '';
    }
}

function getEffectiveTheme() {
    const saved = getSavedTheme();
    if (saved) return saved;
    try {
        return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    } catch {
        return 'dark';
    }
}

function applyTheme(theme) {
    const t = theme === 'light' || theme === 'dark' ? theme : '';
    const root = document.documentElement;
    if (!t) root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', t);

    // Switch UI: checked means "dark".
    if (els.themeToggle) {
        const effective = getEffectiveTheme();
        els.themeToggle.checked = effective === 'dark';
    }
}

function toggleTheme() {
    const current = getEffectiveTheme();
    const next = current === 'light' ? 'dark' : 'light';
    try {
        localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
        // ignore
    }
    applyTheme(next);
}

let busyCount = 0;

function setBusy(isBusy, message = '') {
    const next = isBusy ? busyCount + 1 : Math.max(0, busyCount - 1);
    busyCount = next;

    if (!els.loadingOverlay) return;
    els.loadingOverlay.hidden = busyCount === 0;
    if (els.loadingText && message) els.loadingText.textContent = message;
}

async function withBusy(message, fn) {
    setBusy(true, message);
    try {
        return await fn();
    } finally {
        setBusy(false);
    }
}

function setHeaderAuthUi({ isAuthenticated, instanceUrl }) {
    let host = '';
    try {
        host = instanceUrl ? new URL(instanceUrl).hostname : '';
    } catch {
        host = '';
    }

    currentOrgHost = isAuthenticated ? host : '';
    updateMenuOrgName();

    if (els.authActions) els.authActions.hidden = Boolean(isAuthenticated);
    if (els.orgMenuWrap) els.orgMenuWrap.hidden = !Boolean(isAuthenticated);

    if (!isAuthenticated) closeProfileMenu();
}

function updateMenuOrgName() {
    const label = currentOrgHost || '—';
    if (els.menuOrgName) els.menuOrgName.textContent = label;
}

function closeProfileMenu() {
    if (!els.profileMenu || !els.profileBtn) return;
    els.profileMenu.hidden = true;
    els.profileBtn.setAttribute('aria-expanded', 'false');
}

let deployConfirmPendingResolve = null;
let deployConfirmBusy = false;

function setDeployConfirmBusy(busy) {
    deployConfirmBusy = Boolean(busy);
    if (!els.deployConfirmConfirmBtn || !els.deployConfirmCancelBtn) return;

    els.deployConfirmCancelBtn.disabled = deployConfirmBusy;
    els.deployConfirmConfirmBtn.disabled = deployConfirmBusy;
    els.deployConfirmConfirmBtn.textContent = deployConfirmBusy ? 'Deploying…' : 'Deploy';
}

function isDeployConfirmOpen() {
    return Boolean(els.deployConfirm && !els.deployConfirm.hidden);
}

function closeDeployConfirm(confirmed = false, { force = false } = {}) {
    if (!els.deployConfirm) return;

    // If a deploy is running, keep the modal visible.
    if (deployConfirmBusy && !force) return;

    els.deployConfirm.hidden = true;
    setDeployConfirmBusy(false);

    const r = deployConfirmPendingResolve;
    deployConfirmPendingResolve = null;
    if (typeof r === 'function') r(Boolean(confirmed));
}

function resolveDeployConfirm(confirmed = false) {
    const r = deployConfirmPendingResolve;
    deployConfirmPendingResolve = null;
    if (typeof r === 'function') r(Boolean(confirmed));
}

function hideDeployConfirm() {
    if (!els.deployConfirm) return;
    els.deployConfirm.hidden = true;
    setDeployConfirmBusy(false);
    deployConfirmPendingResolve = null;
}

function countXmlBlocks(xml, tagName) {
    const re = new RegExp(`<${tagName}\\b`, 'g');
    const m = String(xml || '').match(re);
    return m ? m.length : 0;
}

function buildDeploySummaryRows(xml, model) {
    const blocks = [
        { tag: 'objectPermissions', label: 'Object Permissions' },
        { tag: 'fieldPermissions', label: 'Field Permissions' },
        { tag: 'userPermissions', label: 'System Permissions' },
        { tag: 'classAccesses', label: 'Apex Class Access' },
        { tag: 'pageAccesses', label: 'Visualforce Page Access' },
        { tag: 'tabSettings', label: 'App / Tab Permissions' },
        { tag: 'recordTypeVisibilities', label: 'Record Type Visibility' },
        { tag: 'flowAccesses', label: 'Flow Access' },
        { tag: 'externalDataSourceAccesses', label: 'External Data Source Access' },
        { tag: 'externalCredentialPrincipalAccesses', label: 'Named Credential Access' },
        { tag: 'customPermissions', label: 'Custom Permissions' }
    ];

    const out = blocks
        .map((b) => ({ label: b.label, count: countXmlBlocks(xml, b.tag) }))
        .filter((r) => r.count > 0);

    const connectedApps = (model?.assignedConnectedApps || [])
        .filter((r) => r?.enabled && String(r.connectedApp || '').trim())
        .map((r) => String(r.connectedApp).trim());
    if (connectedApps.length > 0) {
        out.push({ label: 'Assigned Connected Apps (updated on deploy)', count: connectedApps.length, connectedApps });
    }

    return out;
}

function renderDeploySummary(summaryRows) {
    if (!els.deployConfirmSummary) return;
    els.deployConfirmSummary.innerHTML = '';

    const rows = Array.isArray(summaryRows) ? summaryRows : [];
    if (rows.length === 0) {
        els.deployConfirmSummary.appendChild(el('div', { class: 'sumNote', text: 'No enabled items detected. Deploy will still create/update the Permission Set metadata (label/license), but with no permission blocks.' }));
        return;
    }

    for (const r of rows) {
        const row = el('div', { class: 'sumRow' }, [
            el('div', { class: 'sumLabel', text: r.label }),
            el('div', { class: 'cellMono', text: String(r.count) })
        ]);
        els.deployConfirmSummary.appendChild(row);

        if (Array.isArray(r.connectedApps) && r.connectedApps.length > 0) {
            const shown = r.connectedApps.slice(0, 20);
            const more = r.connectedApps.length - shown.length;
            const txt = shown.join(', ') + (more > 0 ? ` (+${more} more)` : '');
            els.deployConfirmSummary.appendChild(el('div', { class: 'sumNote', text: txt }));
        }
    }

    els.deployConfirmSummary.appendChild(el('div', { class: 'sumNote', text: 'Deploy applies changes via Metadata API to the currently connected org.' }));
}

async function confirmDeploy() {
    if (!latestModel) return false;
    closeProfileMenu();
    if (!els.deployConfirm || !els.deployConfirmConfirmBtn || !els.deployConfirmCancelBtn) {
        // Fallback if dialog markup is missing for any reason.
        return window.confirm('Deploy Permission Set via Metadata API?');
    }

    const xml = await ensureXmlFresh();
    const fullName = normalizeApiName(latestModel.permissionSetApiName || 'PermissionSet');

    if (els.deployConfirmOrg) els.deployConfirmOrg.textContent = currentOrgHost || '—';
    if (els.deployConfirmPermSet) els.deployConfirmPermSet.textContent = fullName;

    const rows = buildDeploySummaryRows(xml, latestModel);
    renderDeploySummary(rows);

    setDeployConfirmBusy(false);
    els.deployConfirm.hidden = false;

    return await new Promise((resolve) => {
        deployConfirmPendingResolve = resolve;

        // Focus primary action for quick keyboard confirmation.
        try {
            els.deployConfirmConfirmBtn.focus();
        } catch {
            // ignore
        }
    });
}

function openProfileMenu() {
    if (!els.profileMenu || !els.profileBtn) return;
    updateMenuOrgName();
    els.profileMenu.hidden = false;
    els.profileBtn.setAttribute('aria-expanded', 'true');
}

function toggleProfileMenu() {
    if (!els.profileMenu) return;
    if (els.profileMenu.hidden) openProfileMenu();
    else closeProfileMenu();
}

function resetUiForOrgChange() {
    selectedProfileId = null;
    latestModel = null;
    latestXml = null;
    xmlDirty = false;
    desiredPermissionSetApiName = '';
    activeSectionKey = 'objects';
    fieldObjectFilter = '';

    clearDatalist(els.profilesList);
    if (els.profileInput) {
        els.profileInput.value = '';
        els.profileInput.disabled = true;
    }

    if (els.permissionSetName) {
        els.permissionSetName.disabled = true;
        els.permissionSetName.value = '';
    }

    if (els.editor) els.editor.hidden = true;
    updateButtonsForSelection();
}

/** @type {{ items: ProfileListItem[], byLabel: Map<string, ProfileListItem>, byLabelLower: Map<string, ProfileListItem>, byNameLower: Map<string, ProfileListItem|null> }} */
let profileCatalog = {
    items: [],
    byLabel: new Map(),
    byLabelLower: new Map(),
    byNameLower: new Map()
};

let apexCatalog = {
    status: 'idle', // idle | loading | ready | error
    names: [],
    error: null
};

let vfCatalog = {
    status: 'idle', // idle | loading | ready | error
    names: [],
    error: null
};

function setStatus(message, kind = '') {
    const type = kind === 'err' ? 'error' : kind === 'ok' ? 'success' : 'info';
    const title = kind === 'err' ? 'Error' : kind === 'ok' ? 'Success' : 'Status';

    try {
        if (typeof window.showToast === 'function') {
            window.showToast(title, String(message ?? ''), type);
            return;
        }
    } catch {
        // ignore
    }

    // Fallback (should only happen if toast script/container is missing)
    if (type === 'error') console.error('[ProfileShift]', title, message);
    else dlog('[ProfileShift]', title, message);
}

function safeJson(value) {
    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return String(value);
    }
}

function debugLog(label, value) {
    if (!DEBUG) return;
    try {
        // Keep logs easy to filter.
        if (value === undefined) console.log('[ProfileShift]', label);
        else console.log('[ProfileShift]', label, value);
    } catch {
        // ignore
    }
}

function sendMessage(msg) {
    return chrome.runtime.sendMessage(msg);
}

function clearDatalist(listEl) {
    if (!listEl) return;
    listEl.innerHTML = '';
}

function getSelectedProfile() {
    const raw = String(els.profileInput?.value || '').trim();
    if (!raw) return null;

    const direct = profileCatalog.byLabel.get(raw);
    if (direct) return direct;

    const lower = raw.toLowerCase();
    const byLabelLower = profileCatalog.byLabelLower.get(lower);
    if (byLabelLower) return byLabelLower;

    const byName = profileCatalog.byNameLower.get(lower);
    if (byName) return byName;

    return null;
}

function getSelectedProfileId() {
    return getSelectedProfile()?.id || null;
}

function getSelectedProfileLabel() {
    return getSelectedProfile()?.name || '';
}

function optionLabel(p) {
    if (p.metadataFullName) return `${p.name}  —  ${p.metadataFullName}`;
    return `${p.name}  —  (metadata fullName unknown)`;
}

function sortProfiles(a, b) {
    return (a.name || '').localeCompare((b.name || ''), undefined, { sensitivity: 'base' });
}

async function refreshProfiles() {
    await withBusy('Loading profiles…', async () => {
        setStatus('Loading profiles…');

        els.profileInput.disabled = true;
        els.convertBtn.disabled = true;
        els.exportBtn.disabled = true;
        els.deployBtn.disabled = true;

        selectedProfileId = null;
        if (els.profileInput) els.profileInput.value = '';
        clearDatalist(els.profilesList);

        const res = await sendMessage({ type: MSG.LIST_PROFILES });
        if (!res?.ok) {
            setHeaderAuthUi({ isAuthenticated: false, instanceUrl: '' });
            setStatus(res?.error || 'Not connected. Use Login to connect to an org.', 'err');
            debugLog('LIST_PROFILES failed', res);

            // Keep editor disabled while not authenticated.
            if (els.editor) els.editor.hidden = true;
            return;
        }

        /** @type {ProfileListItem[]} */
        const profiles = (res.profiles || []).slice().sort(sortProfiles);

        setHeaderAuthUi({ isAuthenticated: true, instanceUrl: res.instanceUrl || '' });

        // Build searchable catalog (label -> profile) and datalist options.
        profileCatalog = {
            items: profiles,
            byLabel: new Map(),
            byLabelLower: new Map(),
            byNameLower: new Map()
        };

        const nameCounts = new Map();
        for (const p of profiles) {
            const nameLower = String(p.name || '').trim().toLowerCase();
            if (!nameLower) continue;
            nameCounts.set(nameLower, (nameCounts.get(nameLower) || 0) + 1);
        }

        for (const p of profiles) {
            const label = optionLabel(p);
            profileCatalog.byLabel.set(label, p);
            profileCatalog.byLabelLower.set(label.toLowerCase(), p);

            const nameLower = String(p.name || '').trim().toLowerCase();
            if (nameLower) {
                if ((nameCounts.get(nameLower) || 0) === 1) profileCatalog.byNameLower.set(nameLower, p);
                else profileCatalog.byNameLower.set(nameLower, null);
            }

            const opt = document.createElement('option');
            opt.value = label;
            els.profilesList.appendChild(opt);
        }

        els.profileInput.disabled = false;

        els.permissionSetName.disabled = true;
        els.permissionSetName.value = '';

        setStatus(`Loaded ${profiles.length} profiles.`);
        debugLog('Profiles loaded', { loaded: profiles.length, sample: profiles.slice(0, 10) });
    });
}

// Header profile menu wiring
if (els.profileBtn) {
    els.profileBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleProfileMenu();
    });
}

document.addEventListener('click', (e) => {
    const t = /** @type {HTMLElement|null} */ (e?.target || null);
    if (!t) return;
    // Close menu when clicking outside
    if (els.profileMenu && !els.profileMenu.hidden) {
        const withinMenu = els.profileMenu.contains(t);
        const withinBtn = els.profileBtn ? els.profileBtn.contains(t) : false;
        if (!withinMenu && !withinBtn) closeProfileMenu();
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (isDeployConfirmOpen()) {
        closeDeployConfirm(false);
        return;
    }
    closeProfileMenu();
});

if (els.deployConfirm) {
    // Click outside the panel to cancel.
    els.deployConfirm.addEventListener('click', (e) => {
        if (e.target === els.deployConfirm) closeDeployConfirm(false);
    });
}

if (els.deployConfirmCancelBtn) {
    els.deployConfirmCancelBtn.addEventListener('click', () => closeDeployConfirm(false));
}

if (els.deployConfirmConfirmBtn) {
    // Confirm should keep the modal open while the deploy runs.
    els.deployConfirmConfirmBtn.addEventListener('click', () => {
        setDeployConfirmBusy(true);
        resolveDeployConfirm(true);
    });
}

if (els.logoutBtn) {
    els.logoutBtn.addEventListener('click', async () => {
        closeProfileMenu();
        setStatus('Clearing session…');
        resetUiForOrgChange();
        setHeaderAuthUi({ isAuthenticated: false, instanceUrl: '' });
        const res = await sendMessage({ type: MSG.CLEAR_SESSION });
        if (!res?.ok) {
            setStatus(res?.error || 'Failed to clear session', 'err');
            return;
        }
        await refreshProfiles();
        updateButtonsForSelection();
    });
}

if (els.switchOrgBtn) {
    els.switchOrgBtn.addEventListener('click', async () => {
        closeProfileMenu();
        setStatus('Switching org…');
        resetUiForOrgChange();
        setHeaderAuthUi({ isAuthenticated: false, instanceUrl: '' });
        const res = await sendMessage({ type: MSG.SWITCH_ORG });
        if (!res?.ok) {
            setStatus(res?.error || 'Failed to switch org', 'err');
            return;
        }
        await refreshProfiles();
        updateButtonsForSelection();
    });
}

async function loginFlow(useSandbox) {
    closeProfileMenu();
    setStatus(useSandbox ? 'Opening Salesforce sandbox login…' : 'Opening Salesforce production login…');
    resetUiForOrgChange();
    setHeaderAuthUi({ isAuthenticated: false, instanceUrl: '' });

    const res = await sendMessage({
        type: MSG.LOGIN,
        payload: { useSandbox: Boolean(useSandbox) }
    });

    if (!res?.ok) {
        setStatus(res?.error || 'Login failed', 'err');
        return;
    }

    // After login, refresh profiles from the newly-authenticated org.
    await refreshProfiles();
    updateButtonsForSelection();
}

if (els.loginProdBtn) {
    els.loginProdBtn.addEventListener('click', () => loginFlow(false).catch((e) => {
        setStatus(String(e?.message || e), 'err');
        debugLog('Login prod error', String(e?.stack || e));
    }));
}

if (els.loginSandboxBtn) {
    els.loginSandboxBtn.addEventListener('click', () => loginFlow(true).catch((e) => {
        setStatus(String(e?.message || e), 'err');
        debugLog('Login sandbox error', String(e?.stack || e));
    }));
}

if (els.themeToggle) {
    els.themeToggle.addEventListener('change', () => {
        const next = els.themeToggle.checked ? 'dark' : 'light';
        try {
            localStorage.setItem(THEME_STORAGE_KEY, next);
        } catch {
            // ignore
        }
        applyTheme(next);
    });
}

function updateButtonsForSelection() {
    const id = getSelectedProfileId();
    const hasSelection = Boolean(id);

    els.convertBtn.disabled = !hasSelection;
    els.exportBtn.disabled = !hasSelection || !latestModel;
    els.deployBtn.disabled = !hasSelection || !latestModel;
}

function updateCountsFromModel() {
    // Extraction Summary UI removed; keep this as a lightweight console-only signal.
    const counts = {
        objects: latestModel?.objectPermissions?.length || 0,
        fields: latestModel?.fieldPermissions?.length || 0,
        sysPerms: latestModel?.userPermissions?.length || 0,
        apex: latestModel?.apexClassAccesses?.length || 0,
        vf: latestModel?.visualforcePageAccesses?.length || 0,
        tabs: latestModel?.tabSettings?.length || 0,
        recordTypes: latestModel?.recordTypeVisibilities?.length || 0,
        flows: latestModel?.flowAccesses?.length || 0,
        externalDataSources: latestModel?.externalDataSourceAccesses?.length || 0,
        namedCredentials: latestModel?.externalCredentialPrincipalAccesses?.length || 0,
        connectedApps: latestModel?.assignedConnectedApps?.length || 0,
        customPermissions: latestModel?.customPermissions?.length || 0
    };
    debugLog('Counts', counts);
}

function markDirty() {
    xmlDirty = true;
    latestXml = null;
    updateCountsFromModel();
}

function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
        else if (v !== null && v !== undefined) node.setAttribute(k, String(v));
    }
    for (const c of children || []) {
        if (c === null || c === undefined) continue;
        if (typeof c === 'string') node.appendChild(document.createTextNode(c));
        else node.appendChild(c);
    }
    return node;
}

function normQuery(q) {
    return String(q || '').trim().toLowerCase();
}

function includesQuery(haystack, q) {
    const nq = normQuery(q);
    if (!nq) return true;
    return String(haystack || '').toLowerCase().includes(nq);
}

function filterRowsForSection(sectionKey, rows, q) {
    const query = normQuery(q);

    switch (sectionKey) {
        case 'objects':
            return query ? (rows || []).filter((r) => includesQuery(r?.object, query)) : rows;
        case 'fields':
            return (rows || [])
                .filter((r) => {
                    if (!fieldObjectFilter) return true;
                    return getFieldObjectName(r?.field) === fieldObjectFilter;
                })
                .filter((r) => (query ? includesQuery(r?.field, query) : true));
        case 'system':
            return query ? (rows || []).filter((r) => includesQuery(r?.name, query)) : rows;
        case 'apex':
            return query ? (rows || []).filter((r) => includesQuery(r?.apexClass, query)) : rows;
        case 'vf':
            return query ? (rows || []).filter((r) => includesQuery(r?.apexPage, query)) : rows;
        case 'tabs':
            return query ? (rows || []).filter((r) => includesQuery(r?.tab, query)) : rows;
        case 'recordTypes':
            return query ? (rows || []).filter((r) => includesQuery(r?.recordType, query)) : rows;
        case 'flows':
            return query ? (rows || []).filter((r) => includesQuery(r?.flow, query)) : rows;
        case 'externalDataSources':
            return query ? (rows || []).filter((r) => includesQuery(r?.externalDataSource, query)) : rows;
        case 'namedCredentials':
            return query ? (rows || []).filter((r) => includesQuery(r?.externalCredentialPrincipal, query)) : rows;
        case 'connectedApps':
            return query ? (rows || []).filter((r) => includesQuery(r?.connectedApp, query)) : rows;
        case 'customPermissions':
            return query ? (rows || []).filter((r) => includesQuery(r?.name, query)) : rows;
        default:
            return rows;
    }
}

function getFieldObjectName(fieldFullName) {
    const raw = String(fieldFullName || '');
    const dot = raw.indexOf('.');
    if (dot <= 0) return '';
    return raw.slice(0, dot);
}

function buildSelectAllControl(sectionKey, displayRows) {
    const rows = Array.isArray(displayRows) ? displayRows : [];

    const getRowAll = (r) => {
        if (!r) return false;
        switch (sectionKey) {
            case 'objects':
                return Boolean(r.allowRead && r.allowCreate && r.allowEdit && r.allowDelete && r.viewAllRecords && r.modifyAllRecords);
            case 'fields':
                return Boolean(r.readable && r.editable);
            case 'system':
            case 'apex':
            case 'vf':
            case 'flows':
            case 'externalDataSources':
            case 'namedCredentials':
            case 'connectedApps':
            case 'customPermissions':
                return Boolean(r.enabled);
            case 'recordTypes':
                return Boolean(r.visible);
            default:
                return null;
        }
    };

    // If the section doesn't support it.
    if (getRowAll(rows[0]) === null && rows.length > 0) return null;
    if (rows.length === 0) return null;

    const allOn = rows.every((r) => Boolean(getRowAll(r)));
    const someOn = rows.some((r) => Boolean(getRowAll(r)));

    const input = el('input', { type: 'checkbox', class: 'chk' });
    input.checked = allOn;
    input.indeterminate = someOn && !allOn;

    input.addEventListener('change', () => {
        const next = Boolean(input.checked);

        for (const r of rows) {
            switch (sectionKey) {
                case 'objects':
                    r.allowRead = next;
                    r.allowCreate = next;
                    r.allowEdit = next;
                    r.allowDelete = next;
                    r.viewAllRecords = next;
                    r.modifyAllRecords = next;
                    break;
                case 'fields':
                    r.readable = next;
                    r.editable = next;
                    break;
                case 'system':
                case 'apex':
                case 'vf':
                case 'flows':
                case 'externalDataSources':
                case 'namedCredentials':
                case 'connectedApps':
                case 'customPermissions':
                    r.enabled = next;
                    break;
                case 'recordTypes':
                    r.visible = next;
                    if (!next) r.default = false;
                    break;
                default:
                    break;
            }
        }

        markDirty();
        renderEditor();
    });

    return el('label', { class: 'selectAll' }, [input, el('span', { text: 'Select all' })]);
}

function renderEditor() {
    if (!els.tabBar || !els.tabPanel) return;

    // Preserve focus/cursor when we re-render on search.
    const activeEl = document.activeElement;
    const shouldRestoreSearchFocus = activeEl && activeEl.id === 'tabSearch';
    const restoreSelStart = shouldRestoreSearchFocus ? activeEl.selectionStart : null;
    const restoreSelEnd = shouldRestoreSearchFocus ? activeEl.selectionEnd : null;

    els.tabBar.innerHTML = '';
    els.tabPanel.innerHTML = '';

    if (!latestModel) return;

    const sections = getSections();

    // Ensure active key exists.
    if (!sections.some((s) => s.key === activeSectionKey)) {
        activeSectionKey = sections[0]?.key || 'objects';
    }

    // Build tabs
    for (const s of sections) {
        const btn = el('button', {
            class: 'tab',
            type: 'button',
            role: 'tab',
            'aria-selected': String(s.key === activeSectionKey),
            text: `${s.short} (${s.getRows().length})`,
            onclick: () => {
                activeSectionKey = s.key;
                renderEditor();
            }
        });
        els.tabBar.appendChild(btn);
    }

    // Render active panel
    const active = sections.find((s) => s.key === activeSectionKey) || sections[0];
    if (!active) return;

    const rows = active.getRows();
    const q = sectionSearch[active.key] || '';
    const filteredRows = filterRowsForSection(active.key, rows, q);
    const wrap = el('div', { class: 'tableWrap', role: 'tabpanel' });

    const titleText = q
        ? `${active.title} (${filteredRows.length}/${rows.length})`
        : `${active.title} (${rows.length})`;
    const titleRow = el('div', { class: 'tableTitleRow' }, [
        el('div', { class: 'tableTitle', text: titleText }),
        buildSelectAllControl(active.key, filteredRows)
    ].filter(Boolean));
    wrap.appendChild(titleRow);

    const tools = el('div', { class: `tableTools${active.key === 'fields' ? ' two' : ''}` });
    const searchInput = el('input', {
        id: 'tabSearch',
        class: 'input',
        type: 'text',
        value: q,
        placeholder: `Search ${active.short}…`,
        oninput: (e) => {
            sectionSearch[active.key] = String(e?.target?.value || '');
            renderEditor();
        }
    });
    tools.appendChild(searchInput);

    if (active.key === 'fields') {
        const objects = Array.from(new Set((rows || [])
            .map((r) => getFieldObjectName(r?.field))
            .filter(Boolean)))
            .sort((a, b) => a.localeCompare(b));

        const sel = el('select', {
            class: 'sel',
            id: 'fieldObjectSelect',
            onchange: (e) => {
                fieldObjectFilter = String(e?.target?.value || '');
                renderEditor();
            }
        }, [
            el('option', { value: '', text: 'All objects' }),
            ...objects.map((o) => el('option', { value: o, text: o }))
        ]);

        sel.value = fieldObjectFilter;
        tools.appendChild(sel);
    }

    wrap.appendChild(tools);

    wrap.appendChild(active.render(rows, q));
    els.tabPanel.appendChild(wrap);

    if (shouldRestoreSearchFocus) {
        // Restore focus/cursor after DOM is rebuilt.
        const next = /** @type {HTMLInputElement|null} */ (document.getElementById('tabSearch'));
        if (next) {
            next.focus({ preventScroll: true });
            try {
                if (typeof restoreSelStart === 'number' && typeof restoreSelEnd === 'number') {
                    next.setSelectionRange(restoreSelStart, restoreSelEnd);
                }
            } catch {
                // ignore
            }
        }
    }
}

function ensureApexCatalogLoaded() {
    if (apexCatalog.status === 'ready' || apexCatalog.status === 'loading') return;
    apexCatalog.status = 'loading';
    apexCatalog.error = null;

    sendMessage({ type: MSG.LIST_APEX_CLASSES })
        .then((res) => {
            if (!res?.ok) {
                apexCatalog.status = 'error';
                apexCatalog.error = res?.error || 'Failed to list Apex classes';
                apexCatalog.names = [];
                return;
            }

            apexCatalog.status = 'ready';
            apexCatalog.error = null;
            apexCatalog.names = Array.isArray(res.names) ? res.names : [];
        })
        .catch((e) => {
            apexCatalog.status = 'error';
            apexCatalog.error = String(e?.message || e);
            apexCatalog.names = [];
        })
        .finally(() => {
            // Re-render so the dropdown gets populated.
            if (latestModel) renderEditor();
        });
}

function ensureVfCatalogLoaded() {
    if (vfCatalog.status === 'ready' || vfCatalog.status === 'loading') return;
    vfCatalog.status = 'loading';
    vfCatalog.error = null;

    sendMessage({ type: MSG.LIST_VF_PAGES })
        .then((res) => {
            if (!res?.ok) {
                vfCatalog.status = 'error';
                vfCatalog.error = res?.error || 'Failed to list Visualforce pages';
                vfCatalog.names = [];
                return;
            }

            vfCatalog.status = 'ready';
            vfCatalog.error = null;
            vfCatalog.names = Array.isArray(res.names) ? res.names : [];
        })
        .catch((e) => {
            vfCatalog.status = 'error';
            vfCatalog.error = String(e?.message || e);
            vfCatalog.names = [];
        })
        .finally(() => {
            // Re-render so the add control gets populated.
            if (latestModel) renderEditor();
        });
}

function getSections() {
    return [
        {
            key: 'objects',
            short: 'Objects',
            title: 'Object Permissions',
            getRows: () => latestModel?.objectPermissions || [],
            render: renderObjectPermissionsTable
        },
        {
            key: 'fields',
            short: 'Fields',
            title: 'Field Permissions',
            getRows: () => latestModel?.fieldPermissions || [],
            render: renderFieldPermissionsTable
        },
        {
            key: 'system',
            short: 'System',
            title: 'System Permissions',
            getRows: () => latestModel?.userPermissions || [],
            render: renderUserPermissionsTable
        },
        {
            key: 'apex',
            short: 'Apex',
            title: 'Apex Class Access',
            getRows: () => latestModel?.apexClassAccesses || [],
            render: renderApexTable
        },
        {
            key: 'vf',
            short: 'VF',
            title: 'Visualforce Page Access',
            getRows: () => latestModel?.visualforcePageAccesses || [],
            render: renderVfTable
        },
        {
            key: 'tabs',
            short: 'Tabs',
            title: 'Tab Settings',
            getRows: () => latestModel?.tabSettings || [],
            render: renderTabsTable
        },
        {
            key: 'recordTypes',
            short: 'Record Types',
            title: 'Record Type Visibilities',
            getRows: () => latestModel?.recordTypeVisibilities || [],
            render: renderRecordTypesTable
        },
        {
            key: 'flows',
            short: 'Flows',
            title: 'Flow Access',
            getRows: () => latestModel?.flowAccesses || [],
            render: renderFlowAccessTable
        },
        {
            key: 'externalDataSources',
            short: 'Ext Data',
            title: 'External Data Source Access',
            getRows: () => latestModel?.externalDataSourceAccesses || [],
            render: renderExternalDataSourceAccessTable
        },
        {
            key: 'namedCredentials',
            short: 'Named Creds',
            title: 'Named Credential Access',
            getRows: () => latestModel?.externalCredentialPrincipalAccesses || [],
            render: renderNamedCredentialAccessTable
        },
        {
            key: 'connectedApps',
            short: 'Conn Apps',
            title: 'Assigned Connected Apps',
            getRows: () => latestModel?.assignedConnectedApps || [],
            render: renderConnectedAppsTable
        },
        {
            key: 'customPermissions',
            short: 'Custom Perms',
            title: 'Custom Permissions',
            getRows: () => latestModel?.customPermissions || [],
            render: renderCustomPermissionsTable
        }
    ];
}

function renderFlowAccessTable(rows, q = '') {
    const displayRows = filterRowsForSection('flows', rows, q);
    const table = el('table');
    table.appendChild(el('thead', {}, [
        el('tr', {}, [
            el('th', { text: 'Flow' }),
            headerToggleCell('Enabled', displayRows, (r) => r.enabled, (r, v) => { r.enabled = v; })
        ])
    ]));

    const body = el('tbody');
    displayRows.forEach((p) => {
        const tr = el('tr');
        tr.appendChild(el('td', { class: 'cellMono', text: p.flow || '' }));
        tr.appendChild(checkboxCell(p.enabled, (v) => { p.enabled = v; markDirty(); }));
        body.appendChild(tr);
    });

    // Add new Flow access row (free-text)
    const existing = new Set((rows || []).map((r) => String(r.flow || '').toLowerCase()).filter(Boolean));
    const addTr = el('tr');
    const input = el('input', { class: 'sel', type: 'text', placeholder: 'Flow API name…' });
    const addBtn = el('button', {
        class: 'miniBtn',
        type: 'button',
        text: 'Add',
        onclick: () => {
            const name = String(input.value || '').trim();
            if (!name) return;
            const key = name.toLowerCase();
            if (existing.has(key)) return;
            rows.push({ flow: name, enabled: true });
            input.value = '';
            markDirty();
            renderEditor();
        }
    });
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addBtn.click();
        }
    });
    addTr.appendChild(el('td', {}, [input]));
    addTr.appendChild(el('td', {}, [addBtn]));
    body.appendChild(addTr);

    table.appendChild(body);
    return table;
}

function renderExternalDataSourceAccessTable(rows, q = '') {
    const displayRows = filterRowsForSection('externalDataSources', rows, q);
    const table = el('table');
    table.appendChild(el('thead', {}, [
        el('tr', {}, [
            el('th', { text: 'External Data Source' }),
            headerToggleCell('Enabled', displayRows, (r) => r.enabled, (r, v) => { r.enabled = v; })
        ])
    ]));

    const body = el('tbody');
    displayRows.forEach((p) => {
        const tr = el('tr');
        tr.appendChild(el('td', { class: 'cellMono', text: p.externalDataSource || '' }));
        tr.appendChild(checkboxCell(p.enabled, (v) => { p.enabled = v; markDirty(); }));
        body.appendChild(tr);
    });

    // Add new External Data Source access row (free-text)
    const existing = new Set((rows || []).map((r) => String(r.externalDataSource || '').toLowerCase()).filter(Boolean));
    const addTr = el('tr');
    const input = el('input', { class: 'sel', type: 'text', placeholder: 'External Data Source name…' });
    const addBtn = el('button', {
        class: 'miniBtn',
        type: 'button',
        text: 'Add',
        onclick: () => {
            const name = String(input.value || '').trim();
            if (!name) return;
            const key = name.toLowerCase();
            if (existing.has(key)) return;
            rows.push({ externalDataSource: name, enabled: true });
            input.value = '';
            markDirty();
            renderEditor();
        }
    });
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addBtn.click();
        }
    });
    addTr.appendChild(el('td', {}, [input]));
    addTr.appendChild(el('td', {}, [addBtn]));
    body.appendChild(addTr);

    table.appendChild(body);
    return table;
}

function renderNamedCredentialAccessTable(rows, q = '') {
    const displayRows = filterRowsForSection('namedCredentials', rows, q);
    const table = el('table');
    table.appendChild(el('thead', {}, [
        el('tr', {}, [
            el('th', { text: 'External Credential Principal' }),
            headerToggleCell('Enabled', displayRows, (r) => r.enabled, (r, v) => { r.enabled = v; })
        ])
    ]));

    const body = el('tbody');
    displayRows.forEach((p) => {
        const tr = el('tr');
        tr.appendChild(el('td', { class: 'cellMono', text: p.externalCredentialPrincipal || '' }));
        tr.appendChild(checkboxCell(p.enabled, (v) => { p.enabled = v; markDirty(); }));
        body.appendChild(tr);
    });

    // Add new External Credential Principal access row (free-text)
    const existing = new Set((rows || []).map((r) => String(r.externalCredentialPrincipal || '').toLowerCase()).filter(Boolean));
    const addTr = el('tr');
    const input = el('input', { class: 'sel', type: 'text', placeholder: 'myExternalCredential-myPrincipal…' });
    const addBtn = el('button', {
        class: 'miniBtn',
        type: 'button',
        text: 'Add',
        onclick: () => {
            const name = String(input.value || '').trim();
            if (!name) return;
            const key = name.toLowerCase();
            if (existing.has(key)) return;
            rows.push({ externalCredentialPrincipal: name, enabled: true });
            input.value = '';
            markDirty();
            renderEditor();
        }
    });
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addBtn.click();
        }
    });
    addTr.appendChild(el('td', {}, [input]));
    addTr.appendChild(el('td', {}, [addBtn]));
    body.appendChild(addTr);

    table.appendChild(body);
    return table;
}

function renderConnectedAppsTable(rows, q = '') {
    const displayRows = filterRowsForSection('connectedApps', rows, q);
    const table = el('table');
    table.appendChild(el('thead', {}, [
        el('tr', {}, [
            el('th', { text: 'Connected App' }),
            headerToggleCell('Assigned', displayRows, (r) => r.enabled, (r, v) => { r.enabled = v; })
        ])
    ]));

    const body = el('tbody');
    displayRows.forEach((p) => {
        const tr = el('tr');
        tr.appendChild(el('td', { class: 'cellMono', text: p.connectedApp || '' }));
        tr.appendChild(checkboxCell(p.enabled, (v) => { p.enabled = v; markDirty(); }));
        body.appendChild(tr);
    });

    // Add new Connected App assignment row (free-text)
    const existing = new Set((rows || []).map((r) => String(r.connectedApp || '').toLowerCase()).filter(Boolean));
    const addTr = el('tr');
    const input = el('input', { class: 'sel', type: 'text', placeholder: 'Connected App API name…' });
    const addBtn = el('button', {
        class: 'miniBtn',
        type: 'button',
        text: 'Add',
        onclick: () => {
            const name = String(input.value || '').trim();
            if (!name) return;
            const key = name.toLowerCase();
            if (existing.has(key)) return;
            rows.push({ connectedApp: name, enabled: true });
            input.value = '';
            markDirty();
            renderEditor();
        }
    });
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addBtn.click();
        }
    });
    addTr.appendChild(el('td', {}, [input]));
    addTr.appendChild(el('td', {}, [addBtn]));
    body.appendChild(addTr);

    table.appendChild(body);
    return table;
}

function checkboxCell(value, onChange) {
    const input = el('input', { type: 'checkbox', class: 'chk' });
    input.checked = Boolean(value);
    input.addEventListener('change', () => onChange(Boolean(input.checked)));
    return el('td', {}, [input]);
}

function headerToggleCell(label, displayRows, getValue, setValue) {
    const rows = Array.isArray(displayRows) ? displayRows : [];
    if (rows.length === 0) return el('th', { text: label });

    const allOn = rows.every((r) => Boolean(getValue(r)));
    const someOn = rows.some((r) => Boolean(getValue(r)));

    const input = el('input', { type: 'checkbox', class: 'chk' });
    input.checked = allOn;
    input.indeterminate = someOn && !allOn;
    input.addEventListener('change', () => {
        const next = Boolean(input.checked);
        for (const r of rows) setValue(r, next);
        markDirty();
        renderEditor();
    });

    return el('th', {}, [
        el('div', { class: 'thCtl' }, [
            el('span', { text: label }),
            input
        ])
    ]);
}

function renderObjectPermissionsTable(rows, q = '') {
    const displayRows = filterRowsForSection('objects', rows, q);
    const table = el('table');
    table.appendChild(el('thead', {}, [
        el('tr', {}, [
            el('th', { text: 'Object' }),            
            headerToggleCell('Create', displayRows, (r) => r.allowCreate, (r, v) => { r.allowCreate = v; }),
            headerToggleCell('Read', displayRows, (r) => r.allowRead, (r, v) => { r.allowRead = v; }),
            headerToggleCell('Edit', displayRows, (r) => r.allowEdit, (r, v) => { r.allowEdit = v; }),
            headerToggleCell('Delete', displayRows, (r) => r.allowDelete, (r, v) => { r.allowDelete = v; }),
            headerToggleCell('View All', displayRows, (r) => r.viewAllRecords, (r, v) => { r.viewAllRecords = v; }),
            headerToggleCell('Modify All', displayRows, (r) => r.modifyAllRecords, (r, v) => { r.modifyAllRecords = v; })
        ])
    ]));

    const body = el('tbody');
    displayRows.forEach((p, idx) => {
        const tr = el('tr');
        tr.appendChild(el('td', { class: 'cellMono', text: p.object || '' }));
        tr.appendChild(checkboxCell(p.allowCreate, (v) => { p.allowCreate = v; markDirty(); }));
        tr.appendChild(checkboxCell(p.allowRead, (v) => { p.allowRead = v; markDirty(); }));
        tr.appendChild(checkboxCell(p.allowEdit, (v) => { p.allowEdit = v; markDirty(); }));
        tr.appendChild(checkboxCell(p.allowDelete, (v) => { p.allowDelete = v; markDirty(); }));
        tr.appendChild(checkboxCell(p.viewAllRecords, (v) => { p.viewAllRecords = v; markDirty(); }));
        tr.appendChild(checkboxCell(p.modifyAllRecords, (v) => { p.modifyAllRecords = v; markDirty(); }));
        body.appendChild(tr);
    });
    table.appendChild(body);
    return table;
}

function renderFieldPermissionsTable(rows, q = '') {
    const displayRows = filterRowsForSection('fields', rows, q);
    const table = el('table');
    table.appendChild(el('thead', {}, [
        el('tr', {}, [
            el('th', { text: 'Field' }),
            headerToggleCell('Readable', displayRows, (r) => r.readable, (r, v) => { r.readable = v; }),
            headerToggleCell('Editable', displayRows, (r) => r.editable, (r, v) => { r.editable = v; })
        ])
    ]));

    const body = el('tbody');
    displayRows.forEach((p, idx) => {
        const tr = el('tr');
        tr.appendChild(el('td', { class: 'cellMono', text: p.field || '' }));
        tr.appendChild(checkboxCell(p.readable, (v) => { p.readable = v; markDirty(); }));
        tr.appendChild(checkboxCell(p.editable, (v) => { p.editable = v; markDirty(); }));
        body.appendChild(tr);
    });
    table.appendChild(body);
    return table;
}

function renderUserPermissionsTable(rows, q = '') {
    const displayRows = filterRowsForSection('system', rows, q);
    const table = el('table');
    table.appendChild(el('thead', {}, [
        el('tr', {}, [
            el('th', { text: 'Permission' }),
            headerToggleCell('Enabled', displayRows, (r) => r.enabled, (r, v) => { r.enabled = v; })
        ])
    ]));

    const body = el('tbody');
    displayRows.forEach((p, idx) => {
        const tr = el('tr');
        tr.appendChild(el('td', { class: 'cellMono', text: p.name || '' }));
        tr.appendChild(checkboxCell(p.enabled, (v) => { p.enabled = v; markDirty(); }));
        body.appendChild(tr);
    });
    table.appendChild(body);
    return table;
}

function renderCustomPermissionsTable(rows, q = '') {
    const displayRows = filterRowsForSection('customPermissions', rows, q);
    const table = el('table');
    table.appendChild(el('thead', {}, [
        el('tr', {}, [
            el('th', { text: 'Custom Permission' }),
            headerToggleCell('Enabled', displayRows, (r) => r.enabled, (r, v) => { r.enabled = v; })
        ])
    ]));

    const body = el('tbody');
    displayRows.forEach((p) => {
        const tr = el('tr');
        tr.appendChild(el('td', { class: 'cellMono', text: p.name || '' }));
        tr.appendChild(checkboxCell(p.enabled, (v) => { p.enabled = v; markDirty(); }));
        body.appendChild(tr);
    });
    table.appendChild(body);
    return table;
}

function renderApexTable(rows, q = '') {
    ensureApexCatalogLoaded();

    const displayRows = filterRowsForSection('apex', rows, q);

    const table = el('table');
    table.appendChild(el('thead', {}, [
        el('tr', {}, [
            el('th', { text: 'Apex Class' }),
            headerToggleCell('Enabled', displayRows, (r) => r.enabled, (r, v) => { r.enabled = v; })
        ])
    ]));

    const body = el('tbody');
    displayRows.forEach((p, idx) => {
        const tr = el('tr');
        tr.appendChild(el('td', { class: 'cellMono', text: p.apexClass || '' }));
        tr.appendChild(checkboxCell(p.enabled, (v) => { p.enabled = v; markDirty(); }));
        body.appendChild(tr);
    });

    // Add new Apex class controls (searchable list of classes not already added)
    const existing = new Set((rows || []).map((r) => String(r.apexClass || '').toLowerCase()).filter(Boolean));
    const available = apexCatalog.status === 'ready'
        ? (apexCatalog.names || []).filter((n) => !existing.has(String(n).toLowerCase()))
        : [];

    const addTr = el('tr');
    const listId = 'apexCatalogList';
    const input = el('input', {
        class: 'sel',
        type: 'text',
        list: listId,
        placeholder:
            apexCatalog.status === 'loading'
                ? 'Loading Apex classes…'
                : (apexCatalog.status === 'ready' && available.length === 0)
                    ? 'No remaining Apex classes'
                    : 'Type to search Apex class…'
    });
    input.disabled = apexCatalog.status !== 'ready' || available.length === 0;

    const dl = el('datalist', { id: listId }, available.map((name) => el('option', { value: name })));

    const addBtn = el('button', {
        class: 'miniBtn',
        type: 'button',
        text: 'Add',
        onclick: () => {
            const name = String(input.value || '').trim();
            if (!name) return;

            const nameLower = name.toLowerCase();
            if (existing.has(name.toLowerCase())) return;

            if (apexCatalog.status === 'ready') {
                const isKnown = (apexCatalog.names || []).some((n) => String(n).toLowerCase() === nameLower);
                if (!isKnown) {
                    setStatus('Pick an Apex class from the list.', 'err');
                    return;
                }
            }

            rows.push({ apexClass: name, enabled: true });
            input.value = '';
            markDirty();
            renderEditor();
        }
    });
    addBtn.disabled = input.disabled;
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addBtn.click();
        }
    });

    if (apexCatalog.status === 'error') {
        addTr.appendChild(el('td', { class: 'cellMono', text: `Failed to load Apex classes: ${apexCatalog.error || 'unknown error'}` }));
        addTr.appendChild(el('td', {}, []));
    } else {
        addTr.appendChild(el('td', {}, [input, dl]));
        addTr.appendChild(el('td', {}, [addBtn]));
    }

    body.appendChild(addTr);

    table.appendChild(body);
    return table;
}

function renderVfTable(rows, q = '') {
    ensureVfCatalogLoaded();

    const displayRows = filterRowsForSection('vf', rows, q);

    const table = el('table');
    table.appendChild(el('thead', {}, [
        el('tr', {}, [
            el('th', { text: 'VF Page' }),
            headerToggleCell('Enabled', displayRows, (r) => r.enabled, (r, v) => { r.enabled = v; })
        ])
    ]));

    const body = el('tbody');
    displayRows.forEach((p, idx) => {
        const tr = el('tr');
        tr.appendChild(el('td', { class: 'cellMono', text: p.apexPage || '' }));
        tr.appendChild(checkboxCell(p.enabled, (v) => { p.enabled = v; markDirty(); }));
        body.appendChild(tr);
    });

    // Add new VF page controls (searchable list of pages not already added)
    const existing = new Set((rows || []).map((r) => String(r.apexPage || '').toLowerCase()).filter(Boolean));
    const available = vfCatalog.status === 'ready'
        ? (vfCatalog.names || []).filter((n) => !existing.has(String(n).toLowerCase()))
        : [];

    const addTr = el('tr');
    const listId = 'vfCatalogList';
    const input = el('input', {
        class: 'sel',
        type: 'text',
        list: listId,
        placeholder:
            vfCatalog.status === 'loading'
                ? 'Loading VF pages…'
                : (vfCatalog.status === 'ready' && available.length === 0)
                    ? 'No remaining VF pages'
                    : 'Type to search VF page…'
    });
    input.disabled = vfCatalog.status !== 'ready' || available.length === 0;

    const dl = el('datalist', { id: listId }, available.map((name) => el('option', { value: name })));

    const addBtn = el('button', {
        class: 'miniBtn',
        type: 'button',
        text: 'Add',
        onclick: () => {
            const name = String(input.value || '').trim();
            if (!name) return;

            const nameLower = name.toLowerCase();
            if (existing.has(nameLower)) return;

            if (vfCatalog.status === 'ready') {
                const isKnown = (vfCatalog.names || []).some((n) => String(n).toLowerCase() === nameLower);
                if (!isKnown) {
                    setStatus('Pick a VF page from the list.', 'err');
                    return;
                }
            }

            rows.push({ apexPage: name, enabled: true });
            input.value = '';
            markDirty();
            renderEditor();
        }
    });
    addBtn.disabled = input.disabled;
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addBtn.click();
        }
    });

    if (vfCatalog.status === 'error') {
        addTr.appendChild(el('td', { class: 'cellMono', text: `Failed to load VF pages: ${vfCatalog.error || 'unknown error'}` }));
        addTr.appendChild(el('td', {}, []));
    } else {
        addTr.appendChild(el('td', {}, [input, dl]));
        addTr.appendChild(el('td', {}, [addBtn]));
    }

    body.appendChild(addTr);

    table.appendChild(body);
    return table;
}

function renderTabsTable(rows, q = '') {
    const normalizeTabVis = (v) => {
        const raw = String(v || '').trim();
        if (raw === 'DefaultOn') return 'Visible';
        if (raw === 'DefaultOff') return 'Available';
        if (raw === 'Hidden') return 'Hidden';
        if (raw === 'Visible' || raw === 'Available') return raw;
        return raw || 'Available';
    };

    const table = el('table');
    table.appendChild(el('thead', {}, [
        el('tr', {}, [
            el('th', { text: 'Tab' }),
            el('th', { text: 'Visibility' })
        ])
    ]));

    const body = el('tbody');
    const displayRows = filterRowsForSection('tabs', rows, q);
    displayRows.forEach((p, idx) => {
        const tr = el('tr');
        tr.appendChild(el('td', { class: 'cellMono', text: p.tab || '' }));

        const sel = el('select', { class: 'sel' }, [
            el('option', { value: 'Visible', text: 'Visible' }),
            el('option', { value: 'Available', text: 'Available' }),
            el('option', { value: 'Hidden', text: 'Hidden' })
        ]);
        sel.value = normalizeTabVis(p.visibility);
        sel.addEventListener('change', () => {
            p.visibility = sel.value;
            markDirty();
        });
        tr.appendChild(el('td', {}, [sel]));
        body.appendChild(tr);
    });
    table.appendChild(body);
    return table;
}

function renderRecordTypesTable(rows, q = '') {
    const displayRows = filterRowsForSection('recordTypes', rows, q);
    const table = el('table');
    table.appendChild(el('thead', {}, [
        el('tr', {}, [
            el('th', { text: 'Record Type' }),
            headerToggleCell('Visible', displayRows, (r) => r.visible, (r, v) => {
                r.visible = v;
                if (!v) r.default = false;
            }),
            el('th', { text: 'Default' })
        ])
    ]));

    const body = el('tbody');
    displayRows.forEach((p, idx) => {
        const tr = el('tr');
        tr.appendChild(el('td', { class: 'cellMono', text: p.recordType || '' }));
        tr.appendChild(checkboxCell(p.visible, (v) => { p.visible = v; markDirty(); }));
        tr.appendChild(checkboxCell(p.default, (v) => { p.default = v; markDirty(); }));
        body.appendChild(tr);
    });
    table.appendChild(body);
    return table;
}

async function convertSelected() {
    const selectedProfile = getSelectedProfile();
    const profileId = selectedProfile?.id || null;
    if (!profileId) return;

    const profileFullName = (selectedProfile?.metadataFullName || '').trim() || null;

    await withBusy('Extracting profile…', async () => {
        setStatus('Extracting profile via Metadata API…');
        els.convertBtn.disabled = true;
        els.exportBtn.disabled = true;
        els.deployBtn.disabled = true;

        const extractRes = await sendMessage({
            type: MSG.EXTRACT_PROFILE,
            payload: { profileId, profileFullName }
        });
        if (!extractRes?.ok) {
            setStatus(extractRes?.error || 'Extraction failed', 'err');
            debugLog('EXTRACT_PROFILE failed', extractRes);
            updateButtonsForSelection();
            return;
        }

        latestModel = extractRes.extraction;

        // Enable and default the Permission Set API name.
        els.permissionSetName.disabled = false;
        if (desiredPermissionSetApiName) {
            latestModel.permissionSetApiName = normalizeApiName(desiredPermissionSetApiName);
        } else {
            desiredPermissionSetApiName = latestModel.permissionSetApiName || '';
        }

        els.permissionSetName.value = normalizeApiName(desiredPermissionSetApiName || latestModel.permissionSetApiName || '');
        xmlDirty = true;

        els.editor.hidden = false;

        updateCountsFromModel();
        renderEditor();

        debugLog('Conversion model', {
            model: {
                profileName: latestModel?.profileName,
                permissionSetApiName: latestModel?.permissionSetApiName
            }
        });

        setStatus('Ready: review/edit permissions, then export/deploy.', 'ok');
        updateButtonsForSelection();
    });
}

async function ensureXmlFresh() {
    if (!latestModel) return null;
    if (!xmlDirty && latestXml) return latestXml;

    const genRes = await sendMessage({
        type: MSG.GENERATE_PERMISSIONSET_XML,
        payload: { model: latestModel }
    });

    if (!genRes?.ok) {
        throw new Error(genRes?.error || 'Failed to generate XML');
    }

    latestXml = genRes.xml;
    xmlDirty = false;
    return latestXml;
}

async function exportXml() {
    if (!latestModel) return;

    const xml = await ensureXmlFresh();
    if (!xml) return;

    const fullName = normalizeApiName(latestModel.permissionSetApiName || 'PermissionSet');

    const blob = new Blob([xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `${fullName}.permissionset-meta.xml`;
    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);
    setStatus('Downloaded XML file.', 'ok');
}

async function deployXml() {
    if (!latestModel) return;

    setStatus('Deploying via Metadata API…');
    els.deployBtn.disabled = true;

    const fullName = normalizeApiName(latestModel.permissionSetApiName || 'PermissionSet');

    const res = await sendMessage({
        type: MSG.DEPLOY_PERMISSIONSET,
        payload: {
            model: latestModel,
            permissionSetApiName: fullName
        }
    });

    if (!res?.ok) {
        setStatus(res?.error || 'Deploy failed', 'err');
        debugLog('DEPLOY_PERMISSIONSET failed', res);
        updateButtonsForSelection();
        return;
    }

    debugLog('DEPLOY_PERMISSIONSET result', res);
    setStatus(`Deploy complete: ${fullName}`, 'ok');
    updateButtonsForSelection();
}

function onProfileSelectionChanged() {
    const id = getSelectedProfileId();
    if (id === selectedProfileId) {
        updateButtonsForSelection();
        return;
    }
    selectedProfileId = id;

    latestModel = null;
    latestXml = null;
    xmlDirty = false;

    els.editor.hidden = true;

    const hasSelection = Boolean(getSelectedProfileId());
    els.permissionSetName.disabled = !hasSelection;
    if (hasSelection) {
        const base = getSelectedProfileLabel() || 'PermissionSet';
        desiredPermissionSetApiName = normalizeApiName(`${base}_Delta`);
        els.permissionSetName.value = desiredPermissionSetApiName;
    } else {
        desiredPermissionSetApiName = '';
        els.permissionSetName.value = '';
    }

    updateButtonsForSelection();
}

els.profileInput.addEventListener('input', onProfileSelectionChanged);
els.profileInput.addEventListener('change', onProfileSelectionChanged);

els.permissionSetName.addEventListener('input', () => {
    const next = normalizeApiName(els.permissionSetName.value);
    desiredPermissionSetApiName = next;
    if (latestModel) latestModel.permissionSetApiName = next;
    if (next !== els.permissionSetName.value) {
        // keep UI stable but normalized
        els.permissionSetName.value = next;
    }
    if (latestModel) markDirty();
});

els.convertBtn.addEventListener('click', () => convertSelected().catch((e) => {
    setStatus(String(e?.message || e), 'err');
    debugLog('Convert error', String(e?.stack || e));
    updateButtonsForSelection();
}));

els.exportBtn.addEventListener('click', () => exportXml().catch((e) => {
    setStatus(String(e?.message || e), 'err');
    debugLog('Export error', String(e?.stack || e));
}));

els.deployBtn.addEventListener('click', () => (async () => {
    const ok = await confirmDeploy();
    if (!ok) return;
    try {
        await deployXml();
    } finally {
        // Close after we show success/error status.
        hideDeployConfirm();
    }
})().catch((e) => {
    setStatus(String(e?.message || e), 'err');
    debugLog('Deploy error', String(e?.stack || e));
    updateButtonsForSelection();
    hideDeployConfirm();
}));

(async function init() {
    // Theme init should happen before we show any UI.
    applyTheme(getSavedTheme() || '');

    setHeaderAuthUi({ isAuthenticated: false, instanceUrl: '' });

    clearDatalist(els.profilesList);
    if (els.profileInput) els.profileInput.value = '';
    els.profileInput.disabled = true;

    els.convertBtn.disabled = true;
    els.exportBtn.disabled = true;
    els.deployBtn.disabled = true;

    els.permissionSetName.disabled = true;
    els.permissionSetName.value = '';

    await refreshProfiles();
    updateButtonsForSelection();
})();
