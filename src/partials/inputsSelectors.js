//
//  This file is part of the 2FAS Browser Extension (https://github.com/twofas/2fas-browser-extension)
//  Copyright © 2023 Two Factor Authentication Service, Inc.
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

const inputsSelectors = () => {
  // @TODO: Improve selectors to avoid false positives

  const inputSelectors = [
    ':not(read-only)',
    ':not(readonly)',
    ':not([read-only])',
    ':not([readonly])',
    ':not(list)',
    ':not(-moz-read-only)',
    ':not(disabled)',
    ':not([disabled])',
    ':not([role="button"])',
    ':not([role="submit"])',
    ':not([data-e2e="input-username"])',
    ':not([data-e2e="input-password"])',
    ':not([data-e2e="input-search-language"])',
    ':not([id="vendor-search-handler"])',
    ':not([name="vendor-search-handler"])',
    ':not([id="username"])',
    ':not([name="username"])',
    ':not([placeholder="Search"])'
  ].join('');

  const passwordSelectors = [
    'input[type="password"][id="security-code" i]',
    'input[type="password"][id="challenge" i]',
    'input[type="password"][id="otp" i]',
    'input#mfacode'
  ].join(',');

  const autocompleteSelectors = [
    'input[autocomplete="one-time-code"]',
    'input[autocomplete="one-time-code" i]'
  ].join(',');

  const nameSelectors = [
    'input[name="code" i]',
    'input[name="otp" i]',
    'input[name="token" i]',
    'input[name="mfa" i]',
    'input[name="mfa_code" i]',
    'input[name="mfaCode" i]',
    'input[name="totp" i]',
    'input[name="verification_code" i]',
    'input[name="verificationCode" i]',
    'input[name="2fa" i]',
    'input[name="twoFactorCode" i]',
    'input[name="authCode" i]',
    'input[name="securityCode" i]',
    'input[name="otpCode" i]',
    'input[name="passcode" i]',
    'input[name="oneTimeCode" i]'
  ].join(',');

  const idSelectors = [
    'input[id="code" i]',
    'input[id="otp" i]',
    'input[id="token" i]',
    'input[id="mfa" i]',
    'input[id="totp" i]',
    'input[id="verification" i]',
    'input[id="twoFactorCode" i]',
    'input[id="authCode" i]',
    'input[id="verificationCode" i]',
    'input[id="passcode" i]',
    'input[id="oneTimeCode" i]'
  ].join(',');

  const placeholderSelectors = [
    'input[placeholder*="code" i]',
    'input[placeholder*="otp" i]',
    'input[placeholder*="token" i]',
    'input[placeholder*="verification" i]',
    'input[placeholder*="2fa" i]',
    'input[placeholder*="digit" i]',
    'input[placeholder*="authentication" i]'
  ].join(',');

  const ariaSelectors = [
    'input[aria-label*="code" i]',
    'input[aria-label*="verification" i]',
    'input[aria-label*="authentication" i]',
    'input[aria-label*="otp" i]'
  ].join(',');

  const textAreaSelectors = [
    ':not([type="hidden"])',
    ':not(read-only)',
    ':not(readonly)',
    ':not([read-only])',
    ':not([readonly])',
    ':not(-moz-read-only)',
    ':not(disabled)',
    ':not([disabled])'
  ].join('');

  const baseSelectors = `input[type="text"]${inputSelectors},input[type="number"]${inputSelectors},input[type="tel"]${inputSelectors},input:not([type])${inputSelectors},textarea${textAreaSelectors}`;

  return `${autocompleteSelectors},${passwordSelectors},${nameSelectors},${idSelectors},${placeholderSelectors},${ariaSelectors},${baseSelectors}`;
};

export default inputsSelectors;
