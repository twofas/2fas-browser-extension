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
import isRegistrationPending from './registrationPending.js';
import { REGISTRATION_STORAGE_KEY } from '@background/functions/update/registrationRetryPolicy.js';

const pending = { op: 'create', attempts: 1 };

describe('isRegistrationPending', () => {
  it('recognises keys-written-but-not-registered with the durable create in charge', () => {
    expect(isRegistrationPending({
      keys: { publicKey: 'pub' },
      [REGISTRATION_STORAGE_KEY]: pending
    })).toBe(true);
  });

  it('is false once the registration landed — nothing is pending any more', () => {
    expect(isRegistrationPending({
      keys: { publicKey: 'pub' },
      extensionID: 'ext-1',
      [REGISTRATION_STORAGE_KEY]: pending
    })).toBe(false);
  });

  it('is false for a genuinely empty storage: there is nothing to wait for, a reset is right', () => {
    expect(isRegistrationPending({})).toBe(false);
    expect(isRegistrationPending(null)).toBe(false);
    expect(isRegistrationPending({ [REGISTRATION_STORAGE_KEY]: pending })).toBe(false);
  });

  it('is false for a pending UPDATE — that install is already registered', () => {
    expect(isRegistrationPending({
      keys: { publicKey: 'pub' },
      [REGISTRATION_STORAGE_KEY]: { op: 'update' }
    })).toBe(false);
  });

  it('is false when keys exist but no record does — the caller must re-enqueue, not wait', () => {
    expect(isRegistrationPending({ keys: { publicKey: 'pub' } })).toBe(false);
  });
});
