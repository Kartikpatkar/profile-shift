export function xmlEscape(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function xmlEl(tag, content, indent = '') {
  if (content === undefined || content === null || content === '') return '';
  return `${indent}<${tag}>${xmlEscape(content)}</${tag}>\n`;
}

export function xmlBool(tag, value, indent = '') {
  return `${indent}<${tag}>${value ? 'true' : 'false'}</${tag}>\n`;
}
