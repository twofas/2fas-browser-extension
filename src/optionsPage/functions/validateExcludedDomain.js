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
 * @typedef {Object} DomainValidationResult
 * @property {boolean} valid - Whether the input is an acceptable excluded-domain.
 * @property {string} [domain] - Normalized hostname (www. stripped), present when valid.
 * @property {string} [messageKey] - i18n key for the validation error, present when invalid.
 * @property {string} [messageFallback] - Fallback message for the error, present when invalid.
 */

/**
 * Pure validation/normalization of a user-entered excluded domain. Kept free of
 * DOM/i18n so it can be unit tested; the caller maps `messageKey` to a localized
 * string. Validation is intentionally permissive about TLDs (uses the URL parser
 * instead of a hand-rolled regex) so valid inputs like `Example.com`, `.technology`,
 * IDN or `localhost.local` are accepted, while still rejecting empty/oversized
 * input and bare hostnames without a dot.
 *
 * @param {string|null|undefined} rawDomain - The raw value from the form field.
 * @returns {DomainValidationResult} The validation outcome.
 */
const validateExcludedDomain = rawDomain => {
  const domain = (rawDomain || '').trim();

  if (!domain || domain.length <= 0) {
    return { valid: false, messageKey: 'optionsDomainRequired', messageFallback: 'Domain is required' };
  }

  if (domain.length > 256) {
    return { valid: false, messageKey: 'optionsDomainTooLong', messageFallback: 'Domain is too long' };
  }

  const urlTemp = domain.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');

  try {
    const urlObj = new URL(`https://${urlTemp}`);

    if (!urlObj.hostname.includes('.')) {
      return { valid: false, messageKey: 'optionsDomainIncorrect', messageFallback: 'Domain is not correct' };
    }

    return { valid: true, domain: urlObj.hostname.replace(/^(www\.)?/, '').replace(/\/$/, '') };
  } catch (err) {
    return { valid: false, messageKey: 'optionsDomainIncorrect', messageFallback: 'Domain is not correct' };
  }
};

export default validateExcludedDomain;
