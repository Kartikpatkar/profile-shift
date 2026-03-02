// Minimal ZIP writer (STORE method, no compression) for Metadata API deploy.
// Produces a Uint8Array with local headers + central directory + EOCD.

export function zipStore(files) {
  // files: Array<{ path: string, data: Uint8Array }>
  const encoder = new TextEncoder();

  const localParts = [];
  const centralParts = [];

  let offset = 0;

  for (const f of files) {
    const filenameBytes = encoder.encode(f.path);
    const data = f.data;
    const crc = crc32(data);

    const localHeader = new Uint8Array(30 + filenameBytes.length);
    writeU32(localHeader, 0, 0x04034b50);
    writeU16(localHeader, 4, 20); // version needed
    writeU16(localHeader, 6, 0); // flags
    writeU16(localHeader, 8, 0); // compression = store
    writeU16(localHeader, 10, 0); // mod time
    writeU16(localHeader, 12, 0); // mod date
    writeU32(localHeader, 14, crc);
    writeU32(localHeader, 18, data.length);
    writeU32(localHeader, 22, data.length);
    writeU16(localHeader, 26, filenameBytes.length);
    writeU16(localHeader, 28, 0); // extra length
    localHeader.set(filenameBytes, 30);

    localParts.push(localHeader, data);

    const centralHeader = new Uint8Array(46 + filenameBytes.length);
    writeU32(centralHeader, 0, 0x02014b50);
    writeU16(centralHeader, 4, 20); // version made by
    writeU16(centralHeader, 6, 20); // version needed
    writeU16(centralHeader, 8, 0); // flags
    writeU16(centralHeader, 10, 0); // compression
    writeU16(centralHeader, 12, 0);
    writeU16(centralHeader, 14, 0);
    writeU32(centralHeader, 16, crc);
    writeU32(centralHeader, 20, data.length);
    writeU32(centralHeader, 24, data.length);
    writeU16(centralHeader, 28, filenameBytes.length);
    writeU16(centralHeader, 30, 0); // extra
    writeU16(centralHeader, 32, 0); // comment
    writeU16(centralHeader, 34, 0); // disk start
    writeU16(centralHeader, 36, 0); // internal attrs
    writeU32(centralHeader, 38, 0); // external attrs
    writeU32(centralHeader, 42, offset);
    centralHeader.set(filenameBytes, 46);

    centralParts.push(centralHeader);

    offset += localHeader.length + data.length;
  }

  const centralStart = offset;
  const centralDir = concat(centralParts);
  offset += centralDir.length;

  const eocd = new Uint8Array(22);
  writeU32(eocd, 0, 0x06054b50);
  writeU16(eocd, 4, 0);
  writeU16(eocd, 6, 0);
  writeU16(eocd, 8, files.length);
  writeU16(eocd, 10, files.length);
  writeU32(eocd, 12, centralDir.length);
  writeU32(eocd, 16, centralStart);
  writeU16(eocd, 20, 0);

  return concat([...localParts, centralDir, eocd]);
}

export function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function concat(parts) {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function writeU16(buf, off, v) {
  buf[off] = v & 0xff;
  buf[off + 1] = (v >>> 8) & 0xff;
}

function writeU32(buf, off, v) {
  buf[off] = v & 0xff;
  buf[off + 1] = (v >>> 8) & 0xff;
  buf[off + 2] = (v >>> 16) & 0xff;
  buf[off + 3] = (v >>> 24) & 0xff;
}

// CRC32 (standard polynomial 0xEDB88320)
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}
