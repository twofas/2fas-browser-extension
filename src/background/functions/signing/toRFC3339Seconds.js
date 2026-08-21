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
 * Formats an epoch timestamp as RFC3339 UTC with SECONDS precision. The
 * signing backend parses the timestamp header and re-formats it through Go's
 * time.RFC3339 (no fractional seconds) when rebuilding the canonical payload,
 * so any milliseconds here would make the reconstructed payload differ from
 * the signed one and fail verification.
 *
 * @param {number} epochMs - Epoch time in milliseconds.
 * @returns {string} e.g. "2026-01-01T12:00:00Z".
 */
const toRFC3339Seconds = epochMs => new Date(epochMs).toISOString().replace(/\.\d{3}Z$/, 'Z');

export default toRFC3339Seconds;
