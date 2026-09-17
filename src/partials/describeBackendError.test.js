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

// Keys are generated at runtime. A descriptor built from a key-bearing error is
// only ever asserted on through numbers and booleans (longestSurvivor, `=== x`),
// so a failing test cannot print key material. toEqual is used on keyless input only.

/* global crypto, Buffer */
import { describe, it, expect } from 'vitest';
import describeBackendError, { BACKEND_ERROR_TYPES } from './describeBackendError.js';
import { longestSurvivor } from '@test/helpers/keySinks.js';

const SENTINEL = 'browser extension already has public signing key: updating public signing key is not supported';
const VALIDATION_REASON = "Key: 'UpdateBrowserExtension.PublicSigningKey' Error:Field validation for 'PublicSigningKey' failed on the 'ecdsa_p256_public_key' tag";
const DESCRIPTOR_FIELDS = ['bodyShape', 'networkName', 'reasonClass', 'reasonLength', 'signed', 'status', 'type', 'validationField', 'validationTag'];

const generateP256Spki = async () => {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);

  return Buffer.from(await crypto.subtle.exportKey('spki', pair.publicKey)).toString('base64');
};

const badRequest = (content, extra = {}) => ({
  status: 400,
  statusText: 'Bad Request',
  url: 'https://api.example.test/browser_extensions/ext-1',
  signed: false,
  content,
  ...extra
});

const apiError = (reason, type = 'BadRequest') => ({ Code: 400, Type: type, Description: 'Malformed request syntax.', Reason: reason });

describe('describeBackendError', () => {
  it('names the field and the tag of a validator rejection', () => {
    expect(describeBackendError(badRequest(apiError(VALIDATION_REASON)))).toEqual({
      status: 400,
      signed: false,
      bodyShape: 'json',
      type: 'BadRequest',
      reasonClass: 'validation',
      validationField: 'PublicSigningKey',
      validationTag: 'ecdsa_p256_public_key',
      reasonLength: VALIDATION_REASON.length,
      networkName: 'none'
    });
  });

  it('measures a Reason that embeds a key without copying it', async () => {
    const spki = await generateP256Spki();
    const reason = `invalid public signing key "${spki}"`;
    const descriptor = describeBackendError(badRequest(apiError(reason)));

    expect(descriptor.reasonClass === 'other').toBe(true);
    expect(typeof descriptor.reasonLength).toBe('number');
    expect(descriptor.reasonLength === reason.length).toBe(true);
    expect(longestSurvivor(JSON.stringify(descriptor), spki)).toBe(0);
  });

  it('recognises the backend conflict Reason and keeps neither key', async () => {
    const [previous, next] = await Promise.all([generateP256Spki(), generateP256Spki()]);
    const descriptor = describeBackendError(badRequest(apiError(`cannot update key from "${previous}" to "${next}": ${SENTINEL}`)));
    const wire = JSON.stringify(descriptor);

    expect(descriptor.reasonClass === 'signingKeyConflict').toBe(true);
    expect(descriptor.type === 'BadRequest').toBe(true);
    expect(longestSurvivor(wire, previous)).toBe(0);
    expect(longestSurvivor(wire, next)).toBe(0);
  });

  it('still recognises the sentinel when only the Description carries it', () => {
    expect(describeBackendError(badRequest({ Code: 400, Description: SENTINEL }))).toMatchObject({
      bodyShape: 'json',
      type: 'none',
      reasonClass: 'signingKeyConflict',
      reasonLength: 0
    });
  });

  it('describes a status-less AbortError as a network failure', () => {
    expect(describeBackendError({ name: 'AbortError', message: 'The operation was aborted.' })).toEqual({
      status: null,
      signed: null,
      bodyShape: 'none',
      type: 'none',
      reasonClass: 'none',
      validationField: 'none',
      validationTag: 'none',
      reasonLength: 0,
      networkName: 'AbortError'
    });
  });

  it('keeps allowlisted network error names only', async () => {
    const spki = await generateP256Spki();

    expect(describeBackendError({ name: 'TypeError', message: 'Failed to fetch' }).networkName).toBe('TypeError');
    expect(describeBackendError(new SyntaxError('Invalid JSON response')).networkName).toBe('SyntaxError');
    expect(describeBackendError({ name: 'OfflineStuck', message: 'pending while offline' }).networkName).toBe('other');
    expect(describeBackendError(new Error('boom')).networkName).toBe('other');

    const hostile = describeBackendError({ name: spki, message: spki });
    expect(hostile.networkName === 'other').toBe(true);
    expect(longestSurvivor(JSON.stringify(hostile), spki)).toBe(0);
  });

  it('tells the body shapes apart', () => {
    expect(describeBackendError(badRequest('')).bodyShape).toBe('empty');
    expect(describeBackendError(badRequest(null)).bodyShape).toBe('empty');
    expect(describeBackendError({ status: 502, statusText: 'Bad Gateway' }).bodyShape).toBe('none');
    expect(describeBackendError(badRequest([])).bodyShape).toBe('json');
    expect(describeBackendError(badRequest('Service Unavailable'))).toMatchObject({
      bodyShape: 'text',
      type: 'none',
      reasonClass: 'other',
      reasonLength: 19
    });
  });

  it('measures a text body that echoes a key without copying it', async () => {
    const spki = await generateP256Spki();
    const body = `<html><body>${spki}</body></html>`;
    const descriptor = describeBackendError(badRequest(body));

    expect(descriptor.bodyShape === 'text').toBe(true);
    expect(descriptor.reasonLength === body.length).toBe(true);
    expect(longestSurvivor(JSON.stringify(descriptor), spki)).toBe(0);
  });

  it('collapses backend Types outside the allowlist to other', async () => {
    const spki = await generateP256Spki();

    for (const type of BACKEND_ERROR_TYPES) {
      expect(describeBackendError(badRequest(apiError('x', type))).type).toBe(type);
    }

    expect(describeBackendError(badRequest(apiError('x', 'Teapot'))).type).toBe('other');
    expect(describeBackendError(badRequest(apiError('x', 42))).type).toBe('other');

    const hostile = describeBackendError(badRequest(apiError('x', spki)));
    expect(hostile.type === 'other').toBe(true);
    expect(longestSurvivor(JSON.stringify(hostile), spki)).toBe(0);
  });

  it('turns validation captures that are not Go field names or tags into other', async () => {
    const spki = await generateP256Spki();

    expect(describeBackendError(badRequest(apiError("Field validation for 'public_key' failed on the 'Bad-Tag' tag")))).toMatchObject({
      reasonClass: 'validation',
      validationField: 'other',
      validationTag: 'other'
    });

    const hostile = describeBackendError(badRequest(apiError(`Field validation for '${spki}' failed on the '${spki}' tag`)));
    expect(hostile.validationField === 'other' && hostile.validationTag === 'other').toBe(true);
    expect(longestSurvivor(JSON.stringify(hostile), spki)).toBe(0);
  });

  it('classifies not-found and database reasons', () => {
    expect(describeBackendError(badRequest(apiError('Extension could not be found: 3f1c', 'NotFound'), { status: 404 })).reasonClass).toBe('notFound');
    expect(describeBackendError(badRequest(apiError("Error 1062 (23000): Duplicate entry 'x' for key 'PRIMARY'"))).reasonClass).toBe('database');
    expect(describeBackendError(badRequest(apiError('sql: database is closed', 'InternalServerError'), { status: 500 })).reasonClass).toBe('database');
  });

  it('never throws and always returns exactly the typed fields', () => {
    const circular = { Code: 400, Type: 'BadRequest', Reason: 'loop' };
    circular.self = circular;

    const throwingContent = { status: 400 };
    Object.defineProperty(throwingContent, 'content', { enumerable: true, get () { throw new Error('getter'); } });

    const hostileProxy = new Proxy({}, {
      get () { throw new Error('trap'); },
      has () { throw new Error('trap'); }
    });

    const inputs = [null, undefined, 'text', 42, badRequest(circular), throwingContent, hostileProxy, badRequest(apiError(VALIDATION_REASON))];

    for (const input of inputs) {
      let descriptor = null;

      expect(() => { descriptor = describeBackendError(input); }).not.toThrow();
      expect(Object.keys(descriptor).sort()).toEqual(DESCRIPTOR_FIELDS);
    }
  });
});
