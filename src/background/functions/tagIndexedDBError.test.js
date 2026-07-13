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
import tagIndexedDBError from './tagIndexedDBError.js';

describe('tagIndexedDBError', () => {
  it('marks the error as a retryable IndexedDB failure', () => {
    const tagged = tagIndexedDBError(new Error('IDB open failed'));

    expect(tagged).toBeInstanceOf(Error);
    expect(tagged.isIndexedDBError).toBe(true);
    expect(tagged.name).toBe('PrivateKeyStoreUnavailable');
  });

  it('embeds the original error message', () => {
    expect(tagIndexedDBError(new Error('quota exceeded')).message)
      .toBe('IndexedDB private-key store unavailable: quota exceeded');
  });

  it('falls back to the raw value when the rejection has no message', () => {
    expect(tagIndexedDBError('disabled by policy').message)
      .toBe('IndexedDB private-key store unavailable: disabled by policy');
  });

  it('does not throw on a null/undefined rejection', () => {
    expect(tagIndexedDBError(null).isIndexedDBError).toBe(true);
    expect(tagIndexedDBError(undefined).message)
      .toBe('IndexedDB private-key store unavailable: undefined');
  });
});
