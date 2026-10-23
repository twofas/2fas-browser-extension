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

import { describe, it, expect } from 'vitest';
import { classifyError, isRetryable, isSigningKeyConflictError } from './registrationRetryPolicy.js';

describe('registrationRetryPolicy — classifyError', () => {
  it('retries a proxy 407: the API never answered, the proxy did', () => {
    // A corporate proxy challenges a background fetch the browser cannot
    // authenticate; once the user signs in through a tab the cached credentials
    // let a later attempt through. Dropping the record here abandoned the
    // browser-info update and, in 1.9.0, the signing-key registration.
    expect(isRetryable(classifyError({ status: 407, statusText: '', content: '' }))).toBe(true);
  });

  it('keeps retrying the established transient statuses', () => {
    [408, 425, 429, 500, 502, 503].forEach(status => {
      expect(isRetryable(classifyError({ status }))).toBe(true);
    });
  });

  it('still gives up on deterministic client errors', () => {
    [400, 401, 403, 409, 410, 422].forEach(status => {
      expect(isRetryable(classifyError({ status }))).toBe(false);
    });
  });

  it('routes 404 to re-registration, not retry', () => {
    expect(classifyError({ status: 404 })).toBe('notFound');
    expect(isRetryable('notFound')).toBe(false);
  });

  it('treats a missing status as a network failure', () => {
    expect(classifyError({ name: 'TypeError', message: 'Failed to fetch' })).toBe('network');
    expect(classifyError(null)).toBe('network');
  });
});

describe('registrationRetryPolicy — isSigningKeyConflictError', () => {
  const conflict = Reason => ({ status: 400, statusText: 'Bad Request', content: { Code: 400, Type: 'BadRequest', Description: 'Malformed request syntax.', Reason } });

  it('recognises the Reason the backend sends since 2026-09-24 (no keys echoed)', () => {
    expect(isSigningKeyConflictError(conflict('updating public signing key is not supported'))).toBe(true);
  });

  it('still recognises the Reason of the previous backend (both keys quoted)', () => {
    expect(isSigningKeyConflictError(conflict('cannot update key from "key-A" to "key-B": browser extension already has public signing key: updating public signing key is not supported'))).toBe(true);
  });

  it('recognises the sentinel in a text body too', () => {
    expect(isSigningKeyConflictError({ status: 400, content: 'updating public signing key is not supported' })).toBe(true);
  });

  it('does not mistake a validator rejection of the key field for a conflict', () => {
    expect(isSigningKeyConflictError(conflict("Key: 'UpdateBrowserExtension.PublicSigningKey' Error:Field validation for 'PublicSigningKey' failed on the 'ecdsa_p256_public_key' tag"))).toBe(false);
  });

  it('needs a 400', () => {
    expect(isSigningKeyConflictError({ status: 401, content: 'updating public signing key is not supported' })).toBe(false);
    expect(isSigningKeyConflictError({ name: 'TypeError', message: 'updating public signing key is not supported' })).toBe(false);
  });
});
