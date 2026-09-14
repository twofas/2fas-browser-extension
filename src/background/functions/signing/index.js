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

export { default as buildCanonicalRequest, SIGNATURE_VERSION } from './canonicalRequest.js';
export { default as p1363ToDer } from './p1363ToDer.js';
export { default as signRequest, NONCE_BYTES } from './signRequest.js';
export { default as getSigningHeaders } from './getSigningHeaders.js';
export { default as bytesToB64url } from './bytesToB64url.js';
export { default as b64urlToBytes } from './b64urlToBytes.js';
export { default as hashBody } from './hashBody.js';
export { default as toRFC3339Seconds } from './toRFC3339Seconds.js';
export {
  HEADER_SIGNATURE_VERSION,
  HEADER_SIGNATURE_TIMESTAMP,
  HEADER_SIGNATURE_NONCE,
  HEADER_BODY_SHA256,
  HEADER_SIGNATURE
} from './signingHeaderNames.js';
export { getClockOffsetMs, noteServerDate } from './clockOffset.js';
export { default as ensureUsableSigningKeyMaterial } from './ensureUsableSigningKeyMaterial.js';
export {
  generateSigningKeyMaterial,
  getOrMigrateSigningKey,
  saveSigningKey,
  getSigningKey,
  deleteSigningKey
} from './signingKeyStore.js';
export {
  getSigningState,
  patchSigningState,
  activateSigning,
  noteSigningAuthResult,
  markSigningConflict,
  defaultSigningState,
  SIGNING_STORAGE_KEY
} from './signingState.js';
