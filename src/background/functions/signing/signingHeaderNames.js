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

// The five request-signature headers verified by the backend
// (2fas-server internal/common/signing). Header names are case-insensitive
// on the wire; the backend reads them via Go's canonicalized http.Header
// regardless of the casing sent here.
const HEADER_SIGNATURE_VERSION = 'X-2FAS-Signature-Version';
const HEADER_SIGNATURE_TIMESTAMP = 'X-2FAS-Signature-Timestamp';
const HEADER_SIGNATURE_NONCE = 'X-2FAS-Signature-Nonce';
const HEADER_BODY_SHA256 = 'X-2FAS-Body-Sha256';
const HEADER_SIGNATURE = 'X-2FAS-Signature';

export {
  HEADER_SIGNATURE_VERSION,
  HEADER_SIGNATURE_TIMESTAMP,
  HEADER_SIGNATURE_NONCE,
  HEADER_BODY_SHA256,
  HEADER_SIGNATURE
};
