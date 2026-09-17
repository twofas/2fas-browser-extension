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

/**
 * Error Types the 2FAS API puts in an error body (the ApiError constructors in the
 * backend's common/api/errors.go). Any other value is reported as 'other'.
 */
const BACKEND_ERROR_TYPES = Object.freeze(['BadRequest', 'InternalServerError', 'NotFound', 'AccessForbidden', 'Conflict', 'Gone', 'OK']);

/** Names of status-less failures (SDK.onError network shape) worth telling apart. */
const NETWORK_ERROR_NAMES = Object.freeze(['AbortError', 'TypeError', 'SyntaxError']);

// Same sentinel as isSigningKeyConflictError: ErrBrowserExtensionAlreadyHasSigningKey.
const SIGNING_KEY_CONFLICT_SENTINEL = 'already has public signing key';

// go-playground/validator: "Key: 'Cmd.Field' Error:Field validation for 'Field' failed on the 'tag' tag".
const VALIDATION_FIELD = /Field validation for '([^']*)'/;
const VALIDATION_TAG = /failed on the '([^']*)' tag/;
const GO_FIELD_NAME = /^[A-Z][A-Za-z]{1,40}$/;
const VALIDATOR_TAG_NAME = /^[a-z0-9_]{1,40}$/;

const NOT_FOUND_REASON = /could not be found/i;
const DATABASE_REASON = /\b(?:sql|mysql|gorm|database)\b|\bError \d{4} \(/i;

/** @returns {Object} A descriptor with every field at its "nothing known" value. */
const emptyDescriptor = () => ({
  status: null,
  signed: null,
  bodyShape: 'none',
  type: 'none',
  reasonClass: 'none',
  validationField: 'none',
  validationTag: 'none',
  reasonLength: 0,
  networkName: 'none'
});

/**
 * Keeps a validator capture only when it has the expected identifier shape.
 *
 * @param {Array|null} match - Result of RegExp#exec.
 * @param {RegExp} shape - Allowed shape of the captured name.
 * @returns {string} The captured name, 'other', or 'none' without a match.
 */
const captureName = (match, shape) => {
  if (!match) {
    return 'none';
  }

  return shape.test(match[1]) ? match[1] : 'other';
};

/**
 * Describes a normalized SDK error (see SDK.onError) with typed, key-free fields.
 * The response body is only measured and classified, never copied: the backend
 * echoes request values into Reason (the signing-key conflict names both public
 * keys), so no Reason, Description or body text can reach a log through this.
 * Every string field is an allowlisted constant or a shape-checked identifier.
 * Never throws: a hostile input degrades to the fields read so far.
 *
 * @param {*} err - Response-shaped {status, statusText, signed, content} or network-shaped {name, message}.
 * @returns {{
 *   status: number|null,
 *   signed: boolean|null,
 *   bodyShape: 'json'|'text'|'empty'|'none',
 *   type: string,
 *   reasonClass: 'signingKeyConflict'|'validation'|'notFound'|'database'|'other'|'none',
 *   validationField: string,
 *   validationTag: string,
 *   reasonLength: number,
 *   networkName: 'AbortError'|'TypeError'|'SyntaxError'|'other'|'none'
 * }}
 */
const describeBackendError = err => {
  const descriptor = emptyDescriptor();

  try {
    if (!err || typeof err !== 'object') {
      return descriptor;
    }

    if (typeof err.status === 'number' && Number.isFinite(err.status)) {
      descriptor.status = err.status;
    } else {
      descriptor.networkName = NETWORK_ERROR_NAMES.includes(err.name) ? err.name : 'other';
    }

    if (typeof err.signed === 'boolean') {
      descriptor.signed = err.signed;
    }

    if (!('content' in err)) {
      return descriptor;
    }

    const content = err.content;
    let reason = '';
    let haystack = '';

    if (content === '' || content === null || content === undefined) {
      descriptor.bodyShape = 'empty';
    } else if (typeof content === 'string') {
      descriptor.bodyShape = 'text';
      reason = content;
      haystack = content;
    } else {
      descriptor.bodyShape = 'json';

      if (typeof content === 'object') {
        const type = content.Type;

        descriptor.type = (type === undefined || type === null) ? 'none' : (BACKEND_ERROR_TYPES.includes(type) ? type : 'other');
        reason = typeof content.Reason === 'string' ? content.Reason : '';
      }

      try {
        haystack = JSON.stringify(content) || '';
      } catch (e) {
        haystack = reason;
      }
    }

    const fieldMatch = VALIDATION_FIELD.exec(haystack);

    descriptor.reasonLength = reason.length;
    descriptor.validationField = captureName(fieldMatch, GO_FIELD_NAME);
    descriptor.validationTag = captureName(VALIDATION_TAG.exec(haystack), VALIDATOR_TAG_NAME);

    if (haystack.toLowerCase().includes(SIGNING_KEY_CONFLICT_SENTINEL)) {
      descriptor.reasonClass = 'signingKeyConflict';
    } else if (fieldMatch) {
      descriptor.reasonClass = 'validation';
    } else if (descriptor.type === 'NotFound' || NOT_FOUND_REASON.test(reason)) {
      descriptor.reasonClass = 'notFound';
    } else if (DATABASE_REASON.test(reason)) {
      descriptor.reasonClass = 'database';
    } else if (reason.length > 0) {
      descriptor.reasonClass = 'other';
    }
  } catch (e) {
    // A throwing getter or proxy trap: keep the fields already read, all typed.
  }

  return descriptor;
};

export default describeBackendError;
export { BACKEND_ERROR_TYPES };
