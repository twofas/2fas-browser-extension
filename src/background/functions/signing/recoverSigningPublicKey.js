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

/* global crypto, TextEncoder, btoa */
import ab2b64 from '@background/functions/ab2b64.js';

// Recovers the PUBLIC half of an ECDSA P-256 signing key from two signatures
// made with it. Needed when the stored public key was lost or mismatched and
// the private key is non-extractable (IndexedDB): Web Crypto cannot derive a
// public key from such a private key, but any ECDSA signature determines the
// signer's public key up to a small set of candidates (public-key recovery,
// as in Ethereum's ecrecover), and Web Crypto can verify which candidate is
// the real one. Nothing here touches secret material: the arithmetic runs on
// the signature, the message digest and the curve constants, all public. A
// wrong candidate can never come back — it fails the Web Crypto verification
// of the second signature. Only the true public key is returned, and only a
// key the backend never needs to be told twice: it is the same key the
// install may already have registered.
//
// NIST P-256 (secp256r1) domain parameters.
const P = 2n ** 256n - 2n ** 224n + 2n ** 192n + 2n ** 96n - 1n;
const N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
const B = 0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604bn;
const G = {
  x: 0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296n,
  y: 0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5n
};

const ECDSA_PARAMS = { name: 'ECDSA', namedCurve: 'P-256' };
const SIGN_PARAMS = { name: 'ECDSA', hash: { name: 'SHA-256' } };

// Fixed public messages. The first signature yields the candidates, the second
// picks the true key: every candidate verifies the signature it was derived
// from, only the real key verifies an independent one.
const MESSAGES = [
  '2FAS signing public key recovery 1',
  '2FAS signing public key recovery 2'
].map(text => new TextEncoder().encode(text));

const mod = (value, modulus) => ((value % modulus) + modulus) % modulus;

const modPow = (base, exponent, modulus) => {
  let result = 1n;
  let b = mod(base, modulus);
  let e = exponent;

  while (e > 0n) {
    if (e & 1n) {
      result = (result * b) % modulus;
    }

    b = (b * b) % modulus;
    e >>= 1n;
  }

  return result;
};

// Fermat inverse: P and N are prime.
const modInv = (value, modulus) => modPow(value, modulus - 2n, modulus);

const bytesToBigInt = bytes => bytes.reduce((acc, byte) => (acc << 8n) | BigInt(byte), 0n);

const bigIntToBytes = value => {
  const out = new Uint8Array(32);
  let v = value;

  for (let i = 31; i >= 0; i--) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }

  return out;
};

const bytesToB64urlUnpadded = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// Affine point arithmetic over P; null is the point at infinity.
const pointDouble = point => {
  if (!point || point.y === 0n) {
    return null;
  }

  const lambda = mod((3n * point.x * point.x - 3n) * modInv(2n * point.y, P), P);
  const x = mod(lambda * lambda - 2n * point.x, P);

  return { x, y: mod(lambda * (point.x - x) - point.y, P) };
};

const pointAdd = (a, b) => {
  if (!a) {
    return b;
  }

  if (!b) {
    return a;
  }

  if (a.x === b.x) {
    return a.y === b.y ? pointDouble(a) : null;
  }

  const lambda = mod((b.y - a.y) * modInv(b.x - a.x, P), P);
  const x = mod(lambda * lambda - a.x - b.x, P);

  return { x, y: mod(lambda * (a.x - x) - a.y, P) };
};

const pointMul = (scalar, point) => {
  let result = null;
  let addend = point;
  let k = scalar;

  while (k > 0n) {
    if (k & 1n) {
      result = pointAdd(result, addend);
    }

    addend = pointDouble(addend);
    k >>= 1n;
  }

  return result;
};

/**
 * The public-key candidates of an ECDSA signature (r, s) over digest z:
 * Q = r⁻¹ (s·R − z·G) for every curve point R with x ≡ r.
 *
 * @param {bigint} z - The message digest as an integer.
 * @param {bigint} r
 * @param {bigint} s
 * @returns {Array<{x: bigint, y: bigint}>} Up to four candidates.
 */
const recoverCandidates = (z, r, s) => {
  const candidates = [];
  const rInv = modInv(r, N);
  const zG = pointMul(z, G);
  const minusZG = zG ? { x: zG.x, y: mod(-zG.y, P) } : null;

  // r + N: unreachable in practice on P-256 (P − N ≈ 2^127, so R.x ≥ N has
  // probability ≈ 2^-129); kept for completeness of the recovery.
  for (const x of [r, r + N]) {
    if (x >= P) {
      continue;
    }

    const ySquared = mod(x * x * x - 3n * x + B, P);
    // P ≡ 3 (mod 4): a square root, when one exists, is ySquared^((P+1)/4).
    const y = modPow(ySquared, (P + 1n) / 4n, P);

    if (mod(y * y, P) !== ySquared) {
      continue;
    }

    for (const candidateY of [y, mod(-y, P)]) {
      const q = pointMul(rInv, pointAdd(pointMul(s, { x, y: candidateY }), minusZG));

      if (q) {
        candidates.push(q);
      }
    }
  }

  return candidates;
};

/**
 * Recovers the public half of an ECDSA P-256 signing key as standard-base64
 * SPKI — the encoding of `keys.signingPublicKey` — from two Web Crypto
 * signatures made with it. Every candidate is confirmed by Web Crypto against
 * the second signature before it is returned; nothing is guessed.
 *
 * @async
 * @param {CryptoKey} privateKey - An ECDSA P-256 private key with the 'sign' usage (extractable or not).
 * @returns {Promise<?string>} The SPKI, or null when no candidate verified (never for a real P-256 signing key).
 * @throws {Error} When the key cannot sign ECDSA P-256 (Web Crypto rejects the sign call).
 */
const recoverSigningPublicKey = async privateKey => {
  const [first, second] = await Promise.all(MESSAGES.map(message => crypto.subtle.sign(SIGN_PARAMS, privateKey, message)));
  const signature = new Uint8Array(first);

  if (signature.length !== 64) {
    // Web Crypto ECDSA returns P1363 r||s; anything else is not a P-256 signature.
    return null;
  }

  const r = bytesToBigInt(signature.subarray(0, 32));
  const s = bytesToBigInt(signature.subarray(32));

  if (r <= 0n || r >= N || s <= 0n || s >= N) {
    return null;
  }

  const z = bytesToBigInt(new Uint8Array(await crypto.subtle.digest('SHA-256', MESSAGES[0])));

  for (const candidate of recoverCandidates(z, r, s)) {
    const jwk = {
      kty: 'EC',
      crv: 'P-256',
      x: bytesToB64urlUnpadded(bigIntToBytes(candidate.x)),
      y: bytesToB64urlUnpadded(bigIntToBytes(candidate.y))
    };
    let publicKey;

    try {
      publicKey = await crypto.subtle.importKey('jwk', jwk, ECDSA_PARAMS, true, ['verify']);
    } catch (err) {
      continue;
    }

    if (await crypto.subtle.verify(SIGN_PARAMS, publicKey, second, MESSAGES[1])) {
      return ab2b64(await crypto.subtle.exportKey('spki', publicKey));
    }
  }

  return null;
};

export default recoverSigningPublicKey;
