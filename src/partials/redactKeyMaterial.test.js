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

// Every key below is generated at runtime and every assertion on redacted
// output is a number or a boolean (longestSurvivor, counts, `=== s`), so a
// failing test cannot print key material.

/* global crypto, Buffer */
import { describe, it, expect } from 'vitest';
import {
  redactLogString,
  redactLogValue,
  createRedactionStats,
  redactionStatsToJSON
} from './redactKeyMaterial.js';
import { longestSurvivor, installKeyConsoleTripwire } from '@test/helpers/keySinks.js';

const EC_PARAMS = { name: 'ECDSA', namedCurve: 'P-256' };
const RSA_PARAMS = { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-512' };

// Marker grammar: [redacted:<kind>:<len>] or [redacted:field:<name>:<len>|object].
const MARKER_GRAMMAR = /^\[redacted:(?:[a-z0-9-]+|field:[A-Za-z0-9_]+):(?:\d+|object)\]$/;
const MARKER_KINDS = new Set(['spki-p256', 'spki-rsa', 'pkcs8-p256', 'pkcs8-rsa', 'pem', 'hex', 'b64', 'b64url', 'b64-pct', 'reason', 'field', 'unprocessable']);

const b64 = buffer => Buffer.from(buffer).toString('base64');
const b64url = buffer => Buffer.from(buffer).toString('base64url');
const hex = buffer => Buffer.from(buffer).toString('hex');
const pem = (buffer, label) => `-----BEGIN ${label}-----\n${b64(buffer).match(/.{1,64}/g).join('\n')}\n-----END ${label}-----`;

const generateMaterial = async (params, usages) => {
  const pair = await crypto.subtle.generateKey(params, true, usages);
  const [spki, pkcs8, jwk] = await Promise.all([
    crypto.subtle.exportKey('spki', pair.publicKey),
    crypto.subtle.exportKey('pkcs8', pair.privateKey),
    crypto.subtle.exportKey('jwk', pair.privateKey)
  ]);

  return { pair, spki, pkcs8, jwk };
};

const generateP256Spki = async () => {
  const pair = await crypto.subtle.generateKey(EC_PARAMS, true, ['sign', 'verify']);

  return b64(await crypto.subtle.exportKey('spki', pair.publicKey));
};

const maxSurvivor = (text, secrets) => Math.max(...secrets.map(secret => longestSurvivor(text, secret)));

const derCases = (label, buffer, pemLabel) => {
  const standard = b64(buffer);
  const urlSafe = b64url(buffer);
  const hexed = hex(buffer);

  return [
    { label: `${label} base64`, text: `key=${standard}`, secrets: [standard] },
    { label: `${label} base64url`, text: `key=${urlSafe}&v=1`, secrets: [urlSafe] },
    { label: `${label} hex`, text: `bytes 0x${hexed}`, secrets: [hexed] },
    { label: `${label} pem`, text: JSON.stringify({ body: pem(buffer, pemLabel) }), secrets: [standard] },
    { label: `${label} json escaped slashes`, text: JSON.stringify({ value: standard }).replaceAll('/', '\\/'), secrets: [standard] },
    { label: `${label} encodeURIComponent`, text: `https://api.example.test/x?value=${encodeURIComponent(standard)}`, secrets: [standard] },
    { label: `${label} head 60`, text: `head ${standard.slice(0, 60)} end`, secrets: [standard.slice(0, 60)] },
    { label: `${label} tail 60`, text: `tail ${standard.slice(-60)} end`, secrets: [standard.slice(-60)] }
  ];
};

const RSA_JWK_MEMBERS = ['n', 'd', 'p', 'q', 'dp', 'dq', 'qi'];

describe('redactKeyMaterial', () => {
  it('every encoding is redacted', async () => {
    const [ec, rsa] = await Promise.all([
      generateMaterial(EC_PARAMS, ['sign', 'verify']),
      generateMaterial(RSA_PARAMS, ['encrypt', 'decrypt'])
    ]);
    const rawPoint = await crypto.subtle.exportKey('raw', ec.pair.publicKey);
    const ecJwkSecrets = [ec.jwk.d, ec.jwk.x, ec.jwk.y];
    const rsaJwkSecrets = RSA_JWK_MEMBERS.map(member => rsa.jwk[member]);

    const cases = [
      ...derCases('p256 spki', ec.spki, 'PUBLIC KEY'),
      ...derCases('p256 pkcs8', ec.pkcs8, 'PRIVATE KEY'),
      ...derCases('rsa spki', rsa.spki, 'PUBLIC KEY'),
      ...derCases('rsa pkcs8', rsa.pkcs8, 'PRIVATE KEY'),
      { label: 'p256 jwk json', text: JSON.stringify(ec.jwk), secrets: ecJwkSecrets },
      { label: 'p256 jwk json twice', text: JSON.stringify(JSON.stringify({ jwk: ec.jwk })), secrets: ecJwkSecrets },
      { label: 'rsa jwk json', text: JSON.stringify(rsa.jwk), secrets: rsaJwkSecrets },
      { label: 'p256 raw point base64', text: `point ${b64(rawPoint)}`, secrets: [b64(rawPoint)] },
      { label: 'p256 raw point base64url', text: `point ${b64url(rawPoint)}`, secrets: [b64url(rawPoint)] },
      { label: 'p256 raw point hex', text: `point ${hex(rawPoint)}`, secrets: [hex(rawPoint)] }
    ];

    const survivors = Object.fromEntries(cases.map(({ label, text, secrets }) => [label, maxSurvivor(redactLogString(text), secrets)]));

    // Object forms: a JWK and key-bearing values reached through the value walk.
    survivors['p256 jwk object'] = maxSurvivor(JSON.stringify(redactLogValue({ cause: ec.jwk })), ecJwkSecrets);
    survivors['rsa jwk object'] = maxSurvivor(JSON.stringify(redactLogValue(rsa.jwk)), rsaJwkSecrets);
    survivors['error with key cause'] = maxSurvivor(
      JSON.stringify(redactLogValue(new Error(`bad key ${b64(ec.spki)}`, { cause: { Reason: b64(rsa.pkcs8) } }))),
      [b64(ec.spki), b64(rsa.pkcs8)]
    );

    expect(survivors).toEqual(Object.fromEntries(Object.keys(survivors).map(label => [label, 0])));
  });

  it('conflict Reason loses both keys and keeps the sentinel', async () => {
    const [previous, next] = await Promise.all([generateP256Spki(), generateP256Spki()]);
    const reason = `cannot update key from "${previous}" to "${next}": browser extension already has public signing key`;
    const variants = [
      reason,
      JSON.stringify(JSON.stringify({ Code: 400, Type: 'BadRequest', Description: 'Bad Request', Reason: reason }))
    ];

    for (const input of variants) {
      const out = redactLogString(input);

      expect(longestSurvivor(out, previous)).toBe(0);
      expect(longestSurvivor(out, next)).toBe(0);
      expect(out.includes('already has public signing key')).toBe(true);
      expect((out.match(/\[redacted:spki-p256:\d+\]/g) || []).length).toBe(2);
      expect(/fp=/.test(out)).toBe(false);
    }

    // Opaque, non-DER values in the same sentence are still replaced.
    const opaque = redactLogString('cannot update key from "key-A" to "key-B": browser extension already has public signing key');

    expect(opaque.includes('key-A') || opaque.includes('key-B')).toBe(false);
    expect((opaque.match(/\[redacted:reason:5\]/g) || []).length).toBe(2);
  });

  it('marker format carries kind and length only', async () => {
    const [ec, rsa] = await Promise.all([
      generateMaterial(EC_PARAMS, ['sign', 'verify']),
      generateMaterial(RSA_PARAMS, ['encrypt', 'decrypt'])
    ]);
    const outputs = [
      ...derCases('p256 spki', ec.spki, 'PUBLIC KEY'),
      ...derCases('p256 pkcs8', ec.pkcs8, 'PRIVATE KEY'),
      ...derCases('rsa pkcs8', rsa.pkcs8, 'RSA PRIVATE KEY')
    ].map(({ text }) => redactLogString(text));

    outputs.push(redactLogString(`cannot update key from "${b64(ec.spki)}" to "x-label"`));
    outputs.push(JSON.stringify(redactLogValue({
      public_signing_key: b64(ec.spki),
      devicePublicKey: b64(rsa.spki),
      pkcs8: b64(ec.pkcs8),
      jwk: ec.jwk,
      nested: { private_key: { raw: 'object' } }
    })));

    const markers = outputs.flatMap(out => out.match(/\[redacted:[^\]]*\]/g) || []);
    const kinds = markers.map(marker => marker.slice('[redacted:'.length).split(':')[0]);

    expect(markers.length > 0).toBe(true);
    expect(markers.every(marker => MARKER_GRAMMAR.test(marker))).toBe(true);
    expect(kinds.every(kind => MARKER_KINDS.has(kind))).toBe(true);
    expect(outputs.some(out => /fp=|sha256|hash/i.test(out))).toBe(false);
  });

  it('benign corpus unchanged and idempotent', async () => {
    const extensionId = '2c1d0a8e-3f4b-4c5d-9e6f-7a8b9c0d1e2f';
    const deviceId = '0f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b';
    const apiPath = `https://api2.2fas.com/browser_extensions/${extensionId}/devices/${deviceId}/commands/request_2fa_token`;
    const wsPath = `wss://ws.2fas.com/browser_extensions/${extensionId}/2fa_requests/${deviceId}`;
    const mask = url => url.replaceAll('http', 'h**p').replaceAll('://', ':**').replaceAll('www', 'w*w').replaceAll('.', '*');
    const sha256 = hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('body')));
    const sha512 = hex(await crypto.subtle.digest('SHA-512', new TextEncoder().encode('body')));
    const nonce = b64url(crypto.getRandomValues(new Uint8Array(24)));

    const strings = [
      apiPath,
      wsPath,
      mask(apiPath),
      mask(wsPath),
      'Error: Tab not found.\n    at chrome-extension://abcdefghijklmnopabcdefghijklmnop/background.js:2:48213\n    at async Promise.all (index 0)\n    at async e.handleLoginRequest (chrome-extension://abcdefghijklmnopabcdefghijklmnop/background.js:2:51122)',
      mask('at chrome-extension://abcdefghijklmnopabcdefghijklmnop/background.js:2:48213'),
      'storeLog@moz-extension://4f3c2b1a-0d9e-4f7a-8b5c-4d3e2f1a0b9c/background.js:2:12345\nasync*flushBrowserRegistration@moz-extension://4f3c2b1a-0d9e-4f7a-8b5c-4d3e2f1a0b9c/background.js:2:67890',
      'storeLog@safari-web-extension://3B1C8E2A-1234-4F6A-9ABC-0123456789AB/background.js:2:12345\nasyncFunctionResume@[native code]',
      mask('storeLog@safari-web-extension://3B1C8E2A-1234-4F6A-9ABC-0123456789AB/background.js:2:12345'),
      'at storeLog (webpack-internal:///./src/partials/storeLog.js:152:11)',
      sha256,
      sha512,
      nonce,
      "Key: 'BrowserExtension.PublicSigningKey' Error:Field validation for 'PublicSigningKey' failed on the 'ecdsa_p256_public_key' tag",
      'Signature timestamp 2026-09-14T14:10:13Z is outside the allowed clock skew window (server time 2026-09-14T14:16:02Z)',
      'browser extension already has public signing key: updating public signing key is not supported',
      'Error: Tab not found.',
      'Proxy Authentication Required',
      'Private key missing while registration valid; re-pairing required',
      '[redacted:spki-p256:124]',
      '[redacted:field:public_signing_key:124]',
      '[redacted:field:jwk:object]',
      '[redacted:unprocessable:57]',
      '[binary:32]',
      '[CryptoKey]'
    ];

    const stats = createRedactionStats();
    const unchanged = strings.map(s => redactLogString(s, stats) === s);

    expect(unchanged).toEqual(strings.map(() => true));
    expect(redactionStatsToJSON(stats)).toEqual({ count: 0, kinds: [] });

    const causes = [
      { message: 'Private key missing while registration valid; re-pairing required', cause: { key: 'rsa', corruptFallbackKey: false, selfHealed: true } },
      { message: 'Private key lost while registration valid; storage regenerated, re-pairing required', cause: { key: 'rsa' } },
      { cause: { key: 'rsa', count: 2, firstAt: 1757937600000, userInitiated: false } },
      { privateKeyMissingReported: true, signingKeyMissingReported: true, status: 407, backendStatusText: 'Proxy Authentication Required' }
    ];

    expect(causes.map(cause => redactLogValue(cause))).toEqual(causes);

    // Idempotence on key-bearing input.
    const spki = await generateP256Spki();
    const keyText = `Reason: cannot update key from "${spki}" to "${spki}" | pem ${pem(Buffer.from(spki, 'base64'), 'PUBLIC KEY')} | ${encodeURIComponent(spki)}`;
    const once = redactLogString(keyText);
    const valueOnce = redactLogValue({ public_signing_key: spki, jwk: { kty: 'EC' }, bytes: new Uint8Array(8), message: once });

    expect(redactLogString(once) === once).toBe(true);
    expect(JSON.stringify(redactLogValue(valueOnce)) === JSON.stringify(valueOnce)).toBe(true);
  });

  it('value rules', async () => {
    const [ec, nonExtractable] = await Promise.all([
      generateMaterial(EC_PARAMS, ['sign', 'verify']),
      crypto.subtle.generateKey(EC_PARAMS, false, ['sign', 'verify'])
    ]);
    const spki = b64(ec.spki);
    const cyclic = { name: 'loop' };
    cyclic.self = cyclic;
    const throwing = {};
    Object.defineProperty(throwing, 'boom', { enumerable: true, get () { throw new Error('getter'); } });
    const hostileProxy = new Proxy({}, { ownKeys () { throw new Error('ownKeys'); } });

    const stats = createRedactionStats();
    const out = redactLogValue({
      bytes: new Uint8Array(32),
      buffer: new ArrayBuffer(16),
      cryptoKey: nonExtractable.privateKey,
      public_signing_key: spki,
      device_public_key: spki,
      cause: { key: 'rsa', corruptFallbackKey: true, privateKeyMissingReported: true },
      status: 407,
      cyclic,
      throwing
    }, stats);

    expect(out.bytes).toBe('[binary:32]');
    expect(out.buffer).toBe('[binary:16]');
    expect(out.cryptoKey).toBe('[CryptoKey]');
    expect(out.public_signing_key.startsWith('[redacted:field:')).toBe(true);
    expect(out.device_public_key.startsWith('[redacted:field:')).toBe(true);
    expect(out.cause).toEqual({ key: 'rsa', corruptFallbackKey: true, privateKeyMissingReported: true });
    expect(out.status).toBe(407);
    expect(out.cyclic.self).toBe('[Circular]');
    expect(out.throwing.boom).toBe('[unserializable]');
    expect(redactionStatsToJSON(stats)).toEqual({ count: 5, kinds: ['binary', 'cryptoKey', 'field'] });

    // A short value under a key-named field is not a key; numbers, booleans and null pass.
    expect(redactLogValue({ publicKey: 'rsa-pub', n: 1, ok: false, none: null })).toEqual({ publicKey: 'rsa-pub', n: 1, ok: false, none: null });
    expect(redactLogValue({ privateKey: { kty: 'EC' } }).privateKey).toBe('[redacted:field:privateKey:object]');

    // Errors become {name, message, stack, cause}; a falsy cause is kept, not dropped.
    const error = redactLogValue(new Error('plain', { cause: 0 }));

    expect(Object.keys(error)).toEqual(['name', 'message', 'stack', 'cause']);
    expect(error.name === 'Error' && error.message === 'plain' && error.cause === 0).toBe(true);

    let threw = false;

    try {
      redactLogValue(hostileProxy);
      redactLogValue({ nested: hostileProxy });
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
  });

  it('fail closed', async () => {
    const spki = await generateP256Spki();
    const originalReplace = RegExp.prototype[Symbol.replace];
    const stats = createRedactionStats();
    let threw = false;
    let stringOut;
    let valueOut;

    // Breaking the regex engine for the duration of the call is the point of this test.
    // eslint-disable-next-line no-extend-native
    RegExp.prototype[Symbol.replace] = function () {
      throw new Error('regex engine failure');
    };

    try {
      stringOut = redactLogString(`x ${spki}`, stats);
      valueOut = redactLogValue({ Reason: `x ${spki}` });
    } catch {
      threw = true;
    } finally {
      // eslint-disable-next-line no-extend-native
      RegExp.prototype[Symbol.replace] = originalReplace;
    }

    expect(threw).toBe(false);
    expect(typeof stringOut === 'string' && stringOut.startsWith('[redacted:unprocessable:')).toBe(true);
    expect(typeof valueOut?.Reason === 'string' && valueOut.Reason.startsWith('[redacted:unprocessable:')).toBe(true);
    expect(longestSurvivor(stringOut, spki)).toBe(0);
    expect(redactionStatsToJSON(stats)).toEqual({ count: 1, kinds: ['unprocessable'] });
  });

  it('2000 runtime P-256 SPKI and pkcs8 keys: miss count === 0', async () => {
    const TOTAL = 2000;
    const BATCH = 100;
    let misses = 0;
    let checked = 0;

    for (let offset = 0; offset < TOTAL; offset += BATCH) {
      const batch = await Promise.all(Array.from({ length: BATCH }, async (_, i) => {
        const pair = await crypto.subtle.generateKey(EC_PARAMS, true, ['sign', 'verify']);
        const [spki, pkcs8] = await Promise.all([
          crypto.subtle.exportKey('spki', pair.publicKey),
          crypto.subtle.exportKey('pkcs8', pair.privateKey)
        ]);
        const encode = (offset + i) % 2 === 0 ? b64 : b64url;

        return { spki: encode(spki), pkcs8: encode(pkcs8) };
      }));

      for (const { spki, pkcs8 } of batch) {
        const out = redactLogString(`cannot update key from "${spki}" to "label": sent public_signing_key=${spki} pkcs8=${pkcs8}`);

        misses += longestSurvivor(out, spki) > 0 ? 1 : 0;
        misses += longestSurvivor(out, pkcs8) > 0 ? 1 : 0;
        checked += 2;
      }
    }

    expect(checked).toBe(TOTAL * 2);
    expect(misses).toBe(0);

    // Dev source paths (short root, letters-only identifier segments) are exempt
    // from the entropy rule; the same path with a digit in a later segment is not.
    const realistic = 'at e (webpack-internal:///./src/background/functions/update/flushBrowserRegistration.js:1:2)';
    const highEntropyPath = '/src/background/functions/quickBrownFoxJumpsOverLazyDog/wizardJobsVexingly';
    const withDigit = highEntropyPath.replace('/functions/', '/functi0ns/');

    expect(redactLogString(realistic) === realistic).toBe(true);
    expect(redactLogString(highEntropyPath) === highEntropyPath).toBe(true);
    expect(redactLogString(withDigit) === withDigit).toBe(false);
  }, 60000);

  it('keySinks tripwire counts DER headers and never forwards to the console', async () => {
    const spki = await generateP256Spki();
    const originalError = console.error;
    let forwarded = 0;
    let tripwire;

    console.error = () => {
      forwarded += 1;
    };

    try {
      tripwire = installKeyConsoleTripwire();
      console.error('conflict', { Reason: `cannot update key from "${spki}"` });

      expect(tripwire.hits).toBe(1);
      expect(tripwire.calls).toBe(1);
      expect(forwarded).toBe(0);
    } finally {
      tripwire?.restore();
      console.error = originalError;
    }
  });
});
