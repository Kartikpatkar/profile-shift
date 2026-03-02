export function normalizeApiName(name = '') {
  // PermissionSet fullName must be a valid metadata name:
  // starts with a letter, contains only letters, numbers, underscores.
  const raw = String(name).trim();
  const cleaned = raw
    .replace(/[^a-zA-Z0-9_]+/g, '_')
    .replace(/^_+/, '')
    .replace(/_+$/, '')
    .replace(/_+/g, '_');

  const withPrefix = /^[A-Za-z]/.test(cleaned) ? cleaned : `PS_${cleaned || 'PermissionSet'}`;
  return withPrefix.slice(0, 80);
}
