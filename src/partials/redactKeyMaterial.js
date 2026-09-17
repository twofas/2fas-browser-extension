//
//  This file is part of the 2FAS Browser Extension (https://github.com/twofas/2fas-browser-extension)
//  Copyright © 2026 Two Factor Authentication Service, Inc.
//  Contributed by Grzegorz Zając. All rights reserved.
//
//  This program is free software: you can redistribute it and/or modify
//  it under the terms of the GNU General Public License as published by
//  the Free Software Foundation, either version 3 of the License, or
//  any later version.
//
//  This program is distributed in the hope that it will be useful,
//  but WITHOUT ANY WARRANTY; without even the implied warranty of
//  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
//  GNU General Public License for more details.
//
//  You should have received a copy of the GNU General Public License
//  along with this program. If not, see <https://www.gnu.org/licenses/>
//

// Pure redactor for cryptographic key material in log payloads. It has no
// imports, so it is safe in every bundle, content scripts included.
//
// A marker never carries anything derived from the bytes it replaced except
// their length: `[redacted:<kind>:<len>]`, `[redacted:field:<name>:<len>]`,
// `[redacted:field:<name>:object]`, `[binary:<n>]`, `[CryptoKey]`. No
// fingerprint, hash or excerpt, ever.

/* global CryptoKey */

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const ANY_BASE64_CHAR = '[A-Za-z0-9+/_-]';
const ANY_HEX_BYTE = '[0-9a-f]{2}';

// AlgorithmIdentifier SEQUENCEs: id-ecPublicKey + prime256v1, rsaEncryption + NULL.
const EC_P256_ALGORITHM = [0x30, 0x13, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, 0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07];
const RSA_ALGORITHM = [0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00];

// Fixed DER headers of the key encodings the extension produces or receives:
// algorithm OIDs and ASN.1 length fields only, nothing taken from a real key.
// `null` is a length byte that varies from key to key.
const DER_HEADER_BYTES = [
  { kind: 'spki-p256', bytes: [0x30, 0x59, ...EC_P256_ALGORITHM, 0x03, 0x42, 0x00, 0x04] },
  { kind: 'spki-rsa', bytes: [0x30, 0x82, 0x01, 0x22, ...RSA_ALGORITHM, 0x03, 0x82, 0x01, 0x0f, 0x00, 0x30, 0x82, 0x01, 0x0a, 0x02, 0x82, 0x01, 0x01, 0x00] },
  // PKCS#8 P-256 with the embedded public key (what Web Crypto exports).
  { kind: 'pkcs8-p256', bytes: [0x30, 0x81, 0x87, 0x02, 0x01, 0x00, ...EC_P256_ALGORITHM, 0x04, 0x6d, 0x30, 0x6b, 0x02, 0x01, 0x01, 0x04, 0x20] },
  // ... with the curve parameters repeated inside ECPrivateKey (OpenSSL tooling).
  { kind: 'pkcs8-p256', bytes: [0x30, 0x81, 0x93, 0x02, 0x01, 0x00, ...EC_P256_ALGORITHM, 0x04, 0x79, 0x30, 0x77, 0x02, 0x01, 0x01, 0x04, 0x20] },
  // ... without the public key.
  { kind: 'pkcs8-p256', bytes: [0x30, 0x41, 0x02, 0x01, 0x00, ...EC_P256_ALGORITHM, 0x04, 0x27, 0x30, 0x25, 0x02, 0x01, 0x01, 0x04, 0x20] },
  // PKCS#8 RSA-2048: the three outer lengths depend on the key (1214-1219 bytes).
  { kind: 'pkcs8-rsa', bytes: [0x30, 0x82, 0x04, null, 0x02, 0x01, 0x00, ...RSA_ALGORITHM, 0x04, 0x82, 0x04, null, 0x30, 0x82, 0x04, null, 0x02, 0x01, 0x00, 0x02, 0x82, 0x01, 0x01, 0x00] }
];

/**
 * Regex source for the base64 or base64url encoding of a DER header that starts
 * at byte 0. A character whose six bits touch a varying byte becomes a wildcard;
 * a trailing partial character is left out.
 * @param {Array<number|null>} bytes - Header bytes, `null` for a varying byte.
 * @return {string} Regex source.
 */
const base64HeaderSource = bytes => {
  const bits = bytes.flatMap(byte => [7, 6, 5, 4, 3, 2, 1, 0].map(shift => (byte === null ? null : (byte >> shift) & 1)));
  let source = '';

  for (let offset = 0; offset + 6 <= bits.length; offset += 6) {
    const group = bits.slice(offset, offset + 6);

    if (group.includes(null)) {
      source += ANY_BASE64_CHAR;
      continue;
    }

    const char = BASE64_ALPHABET[group.reduce((value, bit) => (value << 1) | bit, 0)];

    if (char === '+') {
      source += '[+-]';
    } else if (char === '/') {
      source += '[/_]';
    } else {
      source += char;
    }
  }

  return source;
};

/**
 * Regex source for the hex encoding of a DER header (use with the `i` flag).
 * @param {Array<number|null>} bytes - Header bytes, `null` for a varying byte.
 * @return {string} Regex source.
 */
const hexHeaderSource = bytes => bytes.map(byte => (byte === null ? ANY_HEX_BYTE : byte.toString(16).padStart(2, '0'))).join('');

const DER_HEADERS = DER_HEADER_BYTES.map(({ kind, bytes }) => ({
  kind,
  base64: base64HeaderSource(bytes),
  hex: hexHeaderSource(bytes)
}));

/**
 * DER key headers as base64/base64url patterns (not anchored, not global), for
 * tests that count key headers reaching a sink.
 * @type {ReadonlyArray<{kind: string, pattern: RegExp}>}
 */
const DER_HEADER_PATTERNS = Object.freeze(DER_HEADERS.map(({ kind, base64 }) => Object.freeze({ kind, pattern: new RegExp(base64) })));

const DER_ANCHORED = DER_HEADERS.map(({ kind, base64 }) => ({ kind, pattern: new RegExp(`^${base64}`) }));
const MIN_DER_HEX_LENGTH = Math.min(...DER_HEADERS.map(({ hex }) => hex.length));

// s0: a key-length base64 run that may carry JSON-escaped slashes.
const ESCAPED_SLASH_RUN = /[A-Za-z0-9+/=\\]{40,}/g;
const ESCAPED_SLASH = /\\+\//g;
// s1: PEM armor.
const PEM_BLOCK = /-----BEGIN [A-Z0-9 ]+-----[\s\S]*?-----END [A-Z0-9 ]+-----/g;
// s2: the backend conflict Reason (`cannot update key from %q to %q`), raw or JSON-escaped.
const CONFLICT_REASON = /(cannot update key from )(\\*"?)([^"\s\\]*)(\\*"?)( to )(\\*"?)([^"\s\\]*)(\\*"?)/g;
// s2: key-bearing JWK members in JSON text, raw or JSON-escaped.
const JWK_MEMBER_TEXT = /(\\*"(d|p|q|dp|dq|qi|k|x|y|n)\\*"\s*:\s*\\*")([A-Za-z0-9_-]{40,})/g;
// s3: percent-encoded runs.
const PERCENT_RUN = /(?:[A-Za-z0-9._~-]|%[0-9A-Fa-f]{2}){16,}/g;
const PERCENT_KEY_CHARS = /%(?:2B|2F|3D)/i;
const PERCENT_ESCAPE = /%([0-9A-Fa-f]{2})/g;
const HAS_PERCENT_ESCAPE = /%[0-9A-Fa-f]{2}/;
// s4: a DER header consumes the rest of its run.
const DER_RUN = new RegExp(`(?:${DER_HEADERS.map(({ base64 }) => base64).join('|')})${ANY_BASE64_CHAR}*={0,2}`, 'g');
// s5: hex runs, long enough for a raw P-256 point or carrying a DER header.
const HEX_RUN = new RegExp(`[0-9a-f]{${MIN_DER_HEX_LENGTH},}`, 'gi');
const HEX_DER_HEADER = new RegExp(DER_HEADERS.map(({ hex }) => hex).join('|'), 'i');
const MIN_HEX_KEY_LENGTH = 130;
// s6: standard and URL-safe base64 are scanned separately, never as one mixed
// class, so dashed UUIDs next to paths never glue into one long run.
const STANDARD_RUN = /[A-Za-z0-9+/]{40,}={0,2}/g;
const URL_SAFE_RUN = /[A-Za-z0-9_-]{40,}={0,2}/g;
const UPPERCASE = /[A-Z]/;
const LOWERCASE = /[a-z]/;
const DIGIT = /[0-9]/;
const LETTERS_ONLY = /^[A-Za-z]+$/;
const MAX_PATH_ROOT_LENGTH = 16;
const MIN_PATH_LOWERCASE_RATIO = 0.7;

const MARKER = /^\[(?:redacted:(?:field:[A-Za-z0-9_]+|[a-z0-9-]+):(?:\d+|object)|binary:\d+|CryptoKey|Circular|unserializable|array|object)\]$/;
const KEY_FIELD = /^(public_?(signing_?)?key|signing_?(public|private)_?key|private_?key|device_?public_?key|pkcs8|spki|jwk)$/i;
const JWK_KEY_MEMBERS = new Set(['d', 'p', 'q', 'dp', 'dq', 'qi', 'k', 'x', 'y', 'n']);
const MIN_FIELD_VALUE_LENGTH = 16;
const MAX_DEPTH = 6;

/**
 * Creates an accumulator for redaction statistics (counters and kinds only).
 * @return {{count: number, kinds: Set<string>}}
 */
const createRedactionStats = () => ({ count: 0, kinds: new Set() });

const isStats = stats => Boolean(stats) && typeof stats.count === 'number' && stats.kinds instanceof Set;

const noteRedaction = (stats, kind) => {
  if (isStats(stats)) {
    stats.count += 1;
    stats.kinds.add(kind);
  }
};

const mergeStats = (target, source) => {
  if (isStats(target) && isStats(source)) {
    target.count += source.count;
    source.kinds.forEach(kind => target.kinds.add(kind));
  }
};

/**
 * Serializes a redaction accumulator for a log context.
 * @param {{count: number, kinds: Set<string>}} stats - The accumulator.
 * @return {{count: number, kinds: string[]}} Count and sorted kinds.
 */
const redactionStatsToJSON = stats => (isStats(stats) ? { count: stats.count, kinds: [...stats.kinds].sort() } : { count: 0, kinds: [] });

const marker = (stats, kind, length) => {
  noteRedaction(stats, kind);
  return `[redacted:${kind}:${length}]`;
};

const fieldMarker = (stats, name, size) => {
  noteRedaction(stats, 'field');
  return `[redacted:field:${name}:${size}]`;
};

const derKindOf = text => DER_ANCHORED.find(({ pattern }) => pattern.test(text))?.kind || null;

const shannonEntropy = text => {
  const counts = new Map();

  for (const char of text) {
    counts.set(char, (counts.get(char) || 0) + 1);
  }

  let entropy = 0;

  counts.forEach(count => {
    const probability = count / text.length;
    entropy -= probability * Math.log2(probability);
  });

  return entropy;
};

// Dev builds put source paths in stacks (`/src/background/functions/update/...`):
// a short root, then at least three letters-only, mostly lowercase identifier
// segments. Random base64 almost never has that shape, so a key fragment cannot
// hide behind the exemption.
const isDevSourcePath = run => {
  const [root, ...segments] = run.split('/');

  if (segments.length < 3 || root.length > MAX_PATH_ROOT_LENGTH || !segments.every(segment => LETTERS_ONLY.test(segment))) {
    return false;
  }

  let letters = 0;
  let lowercase = 0;

  segments.forEach(segment => {
    for (const char of segment) {
      letters += 1;
      lowercase += char >= 'a' && char <= 'z' ? 1 : 0;
    }
  });

  return lowercase / letters >= MIN_PATH_LOWERCASE_RATIO;
};

const looksLikeKeyRun = (run, standard) => {
  let end = run.length;

  while (end > 0 && run[end - 1] === '=') {
    end -= 1;
  }

  const body = run.slice(0, end);

  if (!UPPERCASE.test(body) || !LOWERCASE.test(body)) {
    return false;
  }

  if (standard && isDevSourcePath(body)) {
    return false;
  }

  if (body.length >= 48) {
    return shannonEntropy(body) >= 4.5;
  }

  return body.length >= 40 && DIGIT.test(body) && shannonEntropy(body) >= 4.2;
};

const unescapeSlashes = str => str.replace(ESCAPED_SLASH_RUN, run => (run.includes('\\/') ? run.replace(ESCAPED_SLASH, '/') : run));

const redactPem = (str, stats) => str.replace(PEM_BLOCK, block => marker(stats, 'pem', block.length));

const reasonValue = (value, stats) => {
  if (!value || MARKER.test(value)) {
    return value;
  }

  return marker(stats, derKindOf(value) || 'reason', value.length);
};

const redactConflictReason = (str, stats) => str.replace(
  CONFLICT_REASON,
  (match, from, openA, a, closeA, to, openB, b, closeB) => `${from}${openA}${reasonValue(a, stats)}${closeA}${to}${openB}${reasonValue(b, stats)}${closeB}`
);

const redactJwkMembers = (str, stats) => str.replace(JWK_MEMBER_TEXT, (match, prefix, name, value) => `${prefix}${fieldMarker(stats, name, value.length)}`);

const percentDecode = run => {
  let decoded = run;

  // A few rounds cover double encoding (%252B).
  for (let round = 0; round < 3 && HAS_PERCENT_ESCAPE.test(decoded); round += 1) {
    decoded = decoded.replace(PERCENT_ESCAPE, (escape, code) => String.fromCharCode(parseInt(code, 16)));
  }

  return decoded;
};

const redactPercentRuns = (str, stats) => str.replace(PERCENT_RUN, run => {
  if (!PERCENT_KEY_CHARS.test(run)) {
    return run;
  }

  const decoded = percentDecode(run);

  // Dry run on the decoded text (no stats, no nested percent pass): key-like
  // only if some rule would change it.
  return applyRules(decoded, null, false) === decoded ? run : marker(stats, 'b64-pct', run.length);
});

const redactDerRuns = (str, stats) => str.replace(DER_RUN, run => marker(stats, derKindOf(run) || 'b64', run.length));

const redactHexRuns = (str, stats) => str.replace(HEX_RUN, run => (
  run.length >= MIN_HEX_KEY_LENGTH || HEX_DER_HEADER.test(run) ? marker(stats, 'hex', run.length) : run
));

const collectKeyRuns = (str, pattern, kind, standard) => {
  const spans = [];

  for (const match of str.matchAll(pattern)) {
    if (looksLikeKeyRun(match[0], standard)) {
      spans.push({ start: match.index, end: match.index + match[0].length, kind });
    }
  }

  return spans;
};

// Both alphabets are scanned on the same input and overlapping spans merged, so
// a base64url key is never cut into standard-alphabet pieces (or vice versa)
// whose leftovers would survive.
const redactRandomRuns = (str, stats) => {
  const spans = [
    ...collectKeyRuns(str, STANDARD_RUN, 'b64', true),
    ...collectKeyRuns(str, URL_SAFE_RUN, 'b64url', false)
  ].sort((a, b) => a.start - b.start || b.end - a.end);

  if (spans.length === 0) {
    return str;
  }

  const merged = [];

  for (const span of spans) {
    const last = merged[merged.length - 1];
    const size = span.end - span.start;

    if (last && span.start < last.end) {
      if (size > last.size) {
        last.kind = span.kind;
        last.size = size;
      }

      last.end = Math.max(last.end, span.end);
    } else {
      merged.push({ ...span, size });
    }
  }

  let out = '';
  let cursor = 0;

  merged.forEach(({ start, end, kind }) => {
    out += str.slice(cursor, start) + marker(stats, kind, end - start);
    cursor = end;
  });

  return out + str.slice(cursor);
};

/**
 * Applies the string rules in order (s0-s6). Throws on an engine failure; the
 * public entry points fail closed around it.
 * @param {string} str - Input text.
 * @param {Object|null} stats - Accumulator, or null for a dry run.
 * @param {boolean} [decodePercent=true] - Whether to run the percent-decoding rule.
 * @return {string} Redacted text.
 */
const applyRules = (str, stats, decodePercent = true) => {
  let out = unescapeSlashes(str);
  out = redactPem(out, stats);
  out = redactConflictReason(out, stats);
  out = redactJwkMembers(out, stats);

  if (decodePercent) {
    out = redactPercentRuns(out, stats);
  }

  out = redactDerRuns(out, stats);
  out = redactHexRuns(out, stats);

  return redactRandomRuns(out, stats);
};

/**
 * Replaces key material in a string with kind+length markers. Idempotent, and
 * fails closed: if redaction itself throws, the whole string is replaced by
 * `[redacted:unprocessable:<len>]` and nothing is thrown.
 * @param {string} str - The text to redact. Non-strings are returned unchanged.
 * @param {{count: number, kinds: Set<string>}} [stats] - Optional accumulator.
 * @return {string} The redacted text.
 */
const redactLogString = (str, stats) => {
  if (typeof str !== 'string') {
    return str;
  }

  const local = createRedactionStats();

  try {
    const out = applyRules(str, local);
    mergeStats(stats, local);
    return out;
  } catch {
    noteRedaction(stats, 'unprocessable');
    return `[redacted:unprocessable:${str.length}]`;
  }
};

const setField = (target, name, value) => {
  // defineProperty, so a `__proto__` key is copied as data, never as a prototype.
  Object.defineProperty(target, name, { value, enumerable: true, writable: true, configurable: true });
};

const readField = (source, name) => {
  try {
    return { value: source[name] };
  } catch {
    return null;
  }
};

const walk = (value, depth, seen, stats) => {
  if (typeof value === 'string') {
    return redactLogString(value, stats);
  }

  if (value === null || typeof value !== 'object') {
    return value;
  }

  // Type rules come before any traversal.
  const tag = Object.prototype.toString.call(value);

  if ((typeof CryptoKey !== 'undefined' && value instanceof CryptoKey) || tag === '[object CryptoKey]') {
    noteRedaction(stats, 'cryptoKey');
    return '[CryptoKey]';
  }

  if (ArrayBuffer.isView(value) || tag === '[object ArrayBuffer]' || tag === '[object SharedArrayBuffer]') {
    noteRedaction(stats, 'binary');
    return `[binary:${value.byteLength}]`;
  }

  if (depth >= MAX_DEPTH) {
    return Array.isArray(value) ? '[array]' : '[object]';
  }

  if (seen.has(value)) {
    return '[Circular]';
  }

  seen.add(value);

  if (value instanceof Error) {
    const result = {};

    ['name', 'message', 'stack', 'cause'].forEach(name => {
      const field = readField(value, name);

      if (!field) {
        setField(result, name, '[unserializable]');
        return;
      }

      // Same shape as sanitizeLogValue: text fields default to '', the cause is kept as-is.
      setField(result, name, walk(name === 'cause' ? field.value : field.value || '', depth + 1, seen, stats));
    });

    return result;
  }

  let keys;

  try {
    keys = Object.keys(value);
  } catch {
    return '[unserializable]';
  }

  const kty = readField(value, 'kty');
  const jwkShaped = typeof kty?.value === 'string';
  const result = Array.isArray(value) ? [] : {};

  keys.forEach(key => {
    const name = key.length >= 40 ? redactLogString(key, stats) : key;
    const field = readField(value, key);

    if (!field) {
      setField(result, name, '[unserializable]');
      return;
    }

    const keyField = !Array.isArray(value) && (KEY_FIELD.test(key) || (jwkShaped && JWK_KEY_MEMBERS.has(key)));

    if (keyField && typeof field.value === 'string' && field.value.length >= MIN_FIELD_VALUE_LENGTH && !MARKER.test(field.value)) {
      setField(result, name, fieldMarker(stats, key, field.value.length));
      return;
    }

    if (keyField && field.value !== null && typeof field.value === 'object') {
      setField(result, name, fieldMarker(stats, key, 'object'));
      return;
    }

    try {
      setField(result, name, walk(field.value, depth + 1, seen, stats));
    } catch {
      setField(result, name, '[unserializable]');
    }
  });

  return result;
};

/**
 * Returns a key-free copy of any log value. Type rules first (CryptoKey,
 * binary), then Errors as {name, message, stack, cause}, key-named fields, JWK
 * members, and every string through {@link redactLogString}. Depth, cycles and
 * throwing getters are guarded; numbers, booleans and null pass unchanged. Fails
 * closed to `[redacted:unprocessable:<len|object>]`.
 * @param {*} value - The value to redact.
 * @param {{count: number, kinds: Set<string>}} [stats] - Optional accumulator.
 * @return {*} The redacted copy.
 */
const redactLogValue = (value, stats) => {
  const local = createRedactionStats();

  try {
    const out = walk(value, 0, new WeakSet(), local);
    mergeStats(stats, local);
    return out;
  } catch {
    noteRedaction(stats, 'unprocessable');
    return `[redacted:unprocessable:${typeof value === 'string' ? value.length : 'object'}]`;
  }
};

export {
  DER_HEADER_PATTERNS,
  createRedactionStats,
  redactLogString,
  redactLogValue,
  redactionStatsToJSON
};
