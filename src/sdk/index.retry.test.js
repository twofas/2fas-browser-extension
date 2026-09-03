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

/* global Response */
import { describe, it, expect } from 'vitest';
import SDK from './index.js';

describe('SDK.isRetryableError', () => {
  it('fails fast on a proxy 407: the 1-2 s in-flight backoff cannot satisfy an auth challenge', () => {
    // Recovery from a proxy challenge takes a user sign-in through a tab; that is
    // what the durable registration retry (30 s … 1 h) is for. Retrying here only
    // delays the paired-devices error the user is already looking at.
    expect(new SDK().isRetryableError(new Response('', { status: 407 }))).toBe(false);
  });

  it('retries the established transient statuses', () => {
    [408, 425, 429, 500, 502, 503].forEach(status => {
      expect(new SDK().isRetryableError(new Response('', { status }))).toBe(true);
    });
  });

  it('keeps failing fast on deterministic 4xx', () => {
    [400, 401, 403, 404, 409].forEach(status => {
      expect(new SDK().isRetryableError(new Response('', { status }))).toBe(false);
    });
  });
});
