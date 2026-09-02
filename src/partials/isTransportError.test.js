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
import isTransportError from './isTransportError.js';

describe('isTransportError — what must NOT reach the backend log', () => {
  it('treats the per-engine fetch failures as transport', () => {
    // Chrome, Firefox, WebKit — each words it differently.
    expect(isTransportError(new TypeError('Failed to fetch'))).toBe(true);
    expect(isTransportError(new TypeError('NetworkError when attempting to fetch resource.'))).toBe(true);
    expect(isTransportError(new TypeError('Load failed'))).toBe(true);
    expect(isTransportError({ message: 'The Internet connection appears to be offline.' })).toBe(true);
  });

  it('treats an aborted / timed-out request as transport', () => {
    const aborted = new Error('aborted');
    aborted.name = 'AbortError';

    expect(isTransportError(aborted)).toBe(true);
    expect(isTransportError({ name: 'TimeoutError' })).toBe(true);
    expect(isTransportError({ message: 'The request timed out' })).toBe(true);
  });

  it('treats server-side statuses as transport', () => {
    [408, 425, 429, 500, 502, 503].forEach(status => {
      expect(isTransportError({ status })).toBe(true);
    });
  });
});

describe('isTransportError — what must still be reported', () => {
  it('keeps deterministic 4xx: a bad payload or a dead extensionID is ours', () => {
    [400, 401, 403, 404, 409, 422].forEach(status => {
      expect(isTransportError({ status })).toBe(false);
    });
  });

  it('keeps our own thrown assertions and programming errors', () => {
    // The point of the guard: silencing everything without a status would have
    // swallowed real defects (a TypeError has no status either).
    expect(isTransportError(new Error('updateList remove device failed'))).toBe(false);
    expect(isTransportError(new TypeError("Cannot read properties of undefined (reading 'map')"))).toBe(false);
    expect(isTransportError(new Error('createExtensionInstance: missing id in response'))).toBe(false);
  });

  it('keeps anything it cannot classify', () => {
    expect(isTransportError(null)).toBe(false);
    expect(isTransportError(undefined)).toBe(false);
    expect(isTransportError({})).toBe(false);
    expect(isTransportError('boom')).toBe(false);
  });
});
