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

import { REGISTRATION_STORAGE_KEY } from '@background/functions/update/registrationRetryPolicy.js';

/**
 * Whether storage holds a healthy half-registered install: the keys are written but
 * the create POST has not landed yet and the durable retry owns it (offline install,
 * reset or self-heal without connectivity).
 *
 * Regenerating in this state is destructive — it clears the pending record, mints a
 * fresh keypair and bumps `attempt`, so a merely offline user burns through the
 * attempt budget and ends on the "data error" overlay. The background already
 * refuses to regenerate here (checkSafariStorage, verifyStorageIntegrity); the
 * pages and the storageReset handler share the same predicate through this helper.
 *
 * `registrationRetryPolicy` is pure decision logic (no browser APIs), so importing
 * it into a page bundle costs nothing but keeps the storage key in one place.
 *
 * @param {Object} storage - A storage.local snapshot.
 * @returns {boolean}
 */
const isRegistrationPending = storage => Boolean(
  storage?.keys?.publicKey &&
  !storage?.extensionID &&
  storage?.[REGISTRATION_STORAGE_KEY]?.op === 'create'
);

export default isRegistrationPending;
