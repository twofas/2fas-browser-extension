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

/* global navigator */

/**
 * Copies text using the legacy `document.execCommand('copy')` path via a temporary
 * off-screen textarea. This is the only path that works on insecure (`http://`)
 * pages — where `navigator.clipboard` is undefined — and a fallback when the async
 * Clipboard API rejects (document not focused, permissions policy, gesture rigor).
 *
 * @param {string} text - The text to copy
 * @param {Element} [mountInto] - Element to append the temp textarea to (defaults to body)
 * @returns {boolean} True if the copy command reported success
 */
const copyViaExecCommand = (text, mountInto) => {
  const host = mountInto || document.body;

  if (!host || typeof document.execCommand !== 'function') {
    return false;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.top = '-9999px';
  textarea.style.left = '-9999px';
  textarea.style.opacity = '0';
  textarea.style.pointerEvents = 'none';

  host.appendChild(textarea);

  let copied = false;

  try {
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  } finally {
    textarea.remove();
  }

  return copied;
};

/**
 * Copies text to the clipboard robustly (Z5/N1/N2): prefers the async Clipboard
 * API in secure contexts, `await`s it so a rejection is observable, and falls back
 * to `execCommand('copy')` when the API is unavailable (`http://`) or rejects. The
 * caller must only report success (the "Copied" label) when this resolves true.
 *
 * @async
 * @param {string} text - The text to copy
 * @param {Element} [mountInto] - Element to host the fallback textarea (defaults to body)
 * @returns {Promise<boolean>} True only when the text was actually copied
 */
const copyToClipboard = async (text, mountInto) => {
  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Rejected (no focus / permissions-policy / gesture rigor) — try execCommand.
    }
  }

  return copyViaExecCommand(text, mountInto);
};

export { copyViaExecCommand };
export default copyToClipboard;
