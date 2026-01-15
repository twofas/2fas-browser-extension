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
 * Generates CSS selectors for detecting OTP/2FA input fields.
 * @returns {string} Comma-separated CSS selector string for OTP input fields
 */
const inputsSelectors = () => {
  const generateExact = (attr, values) => values.map(v => `input[${attr}="${v}" i]`);
  const generateContains = (attr, values) => values.map(v => `input[${attr}*="${v}" i]`);
  const generateNotExact = (attr, values) => values.map(v => `:not([${attr}="${v}" i])`);
  const generateNotMulti = (attrs, values) => values.flatMap(v => attrs.map(attr => `:not([${attr}="${v}" i])`));

  // OTP/MFA field identifiers for id/name attributes (case-insensitive, so no need for camelCase variants)
  const otpIdentifiers = [
    'code', 'otp', 'otpcode', 'otp_code', 'otp-code',
    'token', 'mfa', 'mfacode', 'mfa_code', 'mfa-code',
    'totp', 'totpcode', 'totp_code', 'totp-code',
    '2fa', '2facode', '2fa_code', '2fa-code',
    'twofactor', 'twofactorcode', 'two_factor_code', 'two-factor-code',
    'verification', 'verificationcode', 'verification_code', 'verification-code',
    'verifycode', 'verify_code', 'verify-code',
    'authcode', 'auth_code', 'auth-code',
    'securitycode', 'security_code', 'security-code',
    'authenticator', 'authenticatorcode',
    'pin', 'pincode', 'pin_code', 'pin-code',
    'passcode', 'pass_code', 'pass-code',
    'onetimecode', 'one_time_code', 'one-time-code',
    'challenge', 'challengecode', 'challenge_code',
    'smscode', 'sms_code', 'sms-code'
  ];

  // OTP keywords for placeholder/aria-label (partial match)
  const otpKeywords = {
    en: [
      'code', 'otp', 'token', 'verification', '2fa', 'digit',
      'authentication', 'authenticator', 'one-time', 'one time',
      'security code', 'passcode', 'pin code', 'enter code',
      'enter otp', 'enter pin', 'sms code', '6 digit', '6-digit'
    ],
    pl: ['kod', 'weryfikacyjny', 'weryfikacja', 'jednorazowy', 'cyfr', 'uwierzytelnianie'],
    de: ['bestätigungscode', 'verifizierungscode', 'sicherheitscode', 'einmalcode', 'authentifizierung', 'stellig'],
    fr: ['code de vérification', 'code de sécurité', 'code à usage unique', 'authentification', 'chiffres'],
    es: ['código', 'verificación', 'seguridad', 'autenticación', 'dígitos'],
    pt: ['código', 'verificação', 'segurança', 'autenticação', 'dígitos'],
    it: ['codice', 'verifica', 'sicurezza', 'autenticazione', 'cifre'],
    nl: ['verificatiecode', 'beveiligingscode', 'eenmalige code', 'authenticatie', 'cijfers'],
    tr: ['doğrulama kodu', 'güvenlik kodu', 'tek kullanımlık', 'kimlik doğrulama', 'haneli'],
    uk: ['код підтвердження', 'код безпеки', 'одноразовий код', 'автентифікація', 'цифр'],
    id: ['kode verifikasi', 'kode keamanan', 'kode sekali pakai', 'autentikasi'],
    el: ['κωδικός επαλήθευσης', 'κωδικός ασφαλείας', 'μιας χρήσης', 'ψηφία'],
    ja: ['認証コード', '確認コード', 'セキュリティコード', 'ワンタイム', '桁'],
    ko: ['인증 코드', '확인 코드', '보안 코드', '일회용', '자리'],
    zh: ['验证码', '驗證碼', '安全码', '安全碼', '一次性', '位数', '位數'],
    ar: ['رمز التحقق', 'رمز الأمان', 'رمز لمرة واحدة'],
    he: ['קוד אימות', 'קוד אבטחה', 'קוד חד פעמי'],
    hi: ['सत्यापन कोड', 'सुरक्षा कोड', 'एक बार का कोड'],
    th: ['รหัสยืนยัน', 'รหัสความปลอดภัย', 'รหัสครั้งเดียว'],
    vi: ['mã xác minh', 'mã bảo mật', 'mã dùng một lần'],
    cs: ['ověřovací kód', 'bezpečnostní kód', 'jednorázový kód'],
    sv: ['verifieringskod', 'säkerhetskod', 'engångskod'],
    no: ['bekreftelseskode', 'sikkerhetskode', 'engangskode'],
    da: ['bekræftelseskode', 'sikkerhedskode', 'engangskode'],
    fi: ['vahvistuskoodi', 'turvakoodi', 'kertakäyttökoodi'],
    hu: ['ellenőrző kód', 'biztonsági kód', 'egyszeri kód'],
    ro: ['cod de verificare', 'cod de securitate', 'cod unic']
  };

  // Aria-label specific keywords (subset of placeholder keywords)
  const ariaKeywords = {
    en: [
      'code', 'verification', 'authentication', 'otp', 'one-time', 'one time',
      'security code', 'passcode', '2fa', 'two-factor', 'two factor',
      'mfa', 'totp', 'authenticator', 'digit'
    ],
    pl: ['kod weryfikacyjny', 'kod jednorazowy'],
    de: ['bestätigungscode', 'einmalcode'],
    fr: ['code de vérification', 'code à usage unique'],
    es: ['código de verificación', 'código único'],
    pt: ['código de verificação', 'código único'],
    it: ['codice di verifica', 'codice monouso'],
    nl: ['verificatiecode', 'eenmalige code'],
    tr: ['doğrulama kodu', 'tek kullanımlık kod'],
    uk: ['код підтвердження', 'одноразовий код'],
    ja: ['認証コード', '確認コード'],
    ko: ['인증 코드', '확인 코드'],
    zh: ['验证码', '驗證碼']
  };

  // Exclusion values (lowercase, case-insensitive matching handles variations)
  const usernameExclusions = ['username', 'user', 'userid', 'user_id', 'login', 'email', 'mail'];
  const passwordExclusions = ['password', 'passwd', 'pass', 'pwd', 'current-password', 'new-password'];
  const searchExclusions = ['search', 'q', 'query', 'searchinput', 'search-input'];
  const newsletterExclusions = ['newsletter', 'subscribe', 'subscription'];
  const addressExclusions = [
    'address', 'phone', 'telephone', 'mobile',
    'firstname', 'lastname', 'first_name', 'last_name',
    'name', 'fullname', 'full_name'
  ];
  const creditCardExclusions = ['card', 'cardnumber', 'card-number', 'cc-number', 'ccnumber', 'cvv', 'cvc', 'expiry'];
  const commentExclusions = ['comment', 'comments', 'message', 'feedback', 'review'];
  const couponExclusions = ['coupon', 'promo', 'promocode', 'promo-code', 'discount'];
  const autocompleteExclusions = [
    'username', 'email', 'current-password', 'new-password',
    'name', 'given-name', 'family-name', 'tel',
    'address-line1', 'address-line2', 'postal-code', 'street-address',
    'cc-number', 'cc-csc', 'cc-exp'
  ];

  // Build input exclusions
  const inputSelectors = [
    // State exclusions (pseudo-classes, no case sensitivity needed)
    ':not(:read-only)',
    ':not([readonly])',
    ':not(:disabled)',
    ':not([disabled])',
    ':not([role="button" i])',
    ':not([role="submit" i])',

    // Data attribute exclusions
    ':not([data-e2e="input-username" i])',
    ':not([data-e2e="input-password" i])',
    ':not([data-e2e="input-search-language" i])',

    // Vendor-specific exclusions
    ':not([id="vendor-search-handler" i])',
    ':not([name="vendor-search-handler" i])',

    // Type/role exclusions
    ':not([type="search" i])',
    ':not([role="searchbox" i])',
    ':not([role="search" i])',
    ':not([placeholder="Search" i])',
    ':not([placeholder="Search..." i])',
    ':not([aria-label="Search" i])',

    // Autocomplete exclusions
    ...generateNotExact('autocomplete', autocompleteExclusions),

    // Generated exclusions for id/name
    ...generateNotMulti(['id', 'name'], usernameExclusions),
    ...generateNotMulti(['id', 'name'], passwordExclusions),
    ...generateNotMulti(['id', 'name'], searchExclusions),
    ...generateNotMulti(['id', 'name'], newsletterExclusions),
    ...generateNotMulti(['id', 'name'], addressExclusions),
    ...generateNotMulti(['id', 'name'], creditCardExclusions),
    ...generateNotMulti(['id', 'name'], commentExclusions),
    ...generateNotMulti(['id', 'name'], couponExclusions)
  ].join('');

  // Password type inputs with OTP-related attributes
  const passwordOtpIds = ['security-code', 'challenge', 'otp', 'mfa', 'totp', '2fa', 'pin', 'pincode', 'passcode'];
  const passwordOtpNames = ['otp', 'mfa', 'totp', '2fa', 'pin', 'passcode', 'security-code', 'securitycode', 'verification'];

  const passwordSelectors = [
    ...passwordOtpIds.map(id => `input[type="password" i][id="${id}" i]`),
    ...passwordOtpNames.map(name => `input[type="password" i][name="${name}" i]`),
    'input[type="password" i][autocomplete="one-time-code" i]',
    'input[id="mfacode" i]',
    'input[id="otpcode" i]',
    'input[id="authcode" i]'
  ].join(',');

  const autocompleteSelectors = 'input[autocomplete="one-time-code" i]';

  const nameSelectors = generateExact('name', otpIdentifiers).join(',');
  const idSelectors = generateExact('id', otpIdentifiers).join(',');

  const allPlaceholderKeywords = Object.values(otpKeywords).flat();
  const placeholderSelectors = generateContains('placeholder', allPlaceholderKeywords).join(',');

  const allAriaKeywords = Object.values(ariaKeywords).flat();
  const ariaSelectors = generateContains('aria-label', allAriaKeywords).join(',');

  // Data attribute selectors
  const dataTestPatterns = ['otp', 'mfa', '2fa', 'totp', 'verification', 'code', 'pin'];
  const dataCyPatterns = ['otp', 'mfa', 'verification'];
  const dataQaPatterns = ['otp', 'mfa', 'verification'];

  const dataAttributeSelectors = [
    ...generateContains('data-testid', dataTestPatterns),
    ...generateContains('data-cy', dataCyPatterns),
    ...generateContains('data-qa', dataQaPatterns)
  ].join(',');

  const textAreaSelectors = [
    ':not([type="hidden" i])',
    ':not(:read-only)',
    ':not([readonly])',
    ':not(:disabled)',
    ':not([disabled])'
  ].join('');

  const baseSelectors = `input[type="text" i]${inputSelectors},input[type="number" i]${inputSelectors},input[type="tel" i]${inputSelectors},input:not([type])${inputSelectors},textarea${textAreaSelectors}`;

  return `${autocompleteSelectors},${passwordSelectors},${nameSelectors},${idSelectors},${placeholderSelectors},${ariaSelectors},${dataAttributeSelectors},${baseSelectors}`;
};

export default inputsSelectors;
