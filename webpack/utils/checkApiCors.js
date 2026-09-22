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

// Release check: does the API's CORS policy let the extension's requests through
// when the browser applies CORS to them? Safari does whenever the user has not
// granted the extension access to the API host, and then a request header the
// preflight does not allow fails as a silent "Load failed" (the 1.9.x Safari
// outage: X-2FAS-* signing headers, fixed server-side in 95c3a84).
//
// Everything is read from the source, so a new signing header or HTTP method is
// checked without editing this file. Run: `yon check-api-cors`.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '../..');
const ORIGIN = 'safari-web-extension://cors-check';
const SAMPLE_EXTENSION_ID = '00000000-0000-4000-8000-000000000000';
// Methods a browser never needs listed in Access-Control-Allow-Methods.
const SAFELISTED_METHODS = ['GET', 'HEAD', 'POST'];
// The methods the SDK signs today. Derivation from the source must find at least
// these, or a refactor broke the pattern and the check would silently shrink.
const EXPECTED_SIGNED_METHODS = ['GET', 'PUT', 'POST', 'DELETE'];

const readSource = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const apiUrl = () => {
  try {
    process.loadEnvFile(path.join(ROOT, '.env'));
  } catch {}

  return (process.env.API_URL || 'https://api2.2fas.com').replace(/\/+$/, '');
};

const signingHeaders = () => {
  const names = [...readSource('src/background/functions/signing/signingHeaderNames.js').matchAll(/'(X-2FAS-[A-Za-z0-9-]+)'/g)].map(match => match[1]);

  if (names.length === 0) {
    throw new Error('No X-2FAS-* header names found in signingHeaderNames.js');
  }

  return names;
};

const signedMethods = () => {
  const methods = new Set([...readSource('src/sdk/index.js').matchAll(/signedFetch\('([A-Z]+)'/g)].map(match => match[1]));
  const missing = EXPECTED_SIGNED_METHODS.filter(method => !methods.has(method));

  if (missing.length > 0) {
    throw new Error(`signedFetch('<METHOD>' not found in src/sdk/index.js for: ${missing.join(', ')}; update the pattern or EXPECTED_SIGNED_METHODS`);
  }

  return [...methods];
};

const listHeader = (res, name) => (res.headers.get(name) || '')
  .split(',')
  .map(value => value.trim().toLowerCase())
  .filter(Boolean);

const checkPreflight = async (url, method, requestHeaders) => {
  const res = await fetch(url, {
    method: 'OPTIONS',
    headers: {
      Origin: ORIGIN,
      'Access-Control-Request-Method': method,
      'Access-Control-Request-Headers': requestHeaders.map(name => name.toLowerCase()).join(',')
    }
  });

  const problems = [];

  if (!res.ok) {
    problems.push(`preflight answered ${res.status}`);
  }

  const allowOrigin = res.headers.get('access-control-allow-origin');

  if (allowOrigin !== '*' && allowOrigin !== ORIGIN) {
    problems.push(`Access-Control-Allow-Origin is ${allowOrigin === null ? 'missing' : `"${allowOrigin}"`}`);
  }

  const allowMethods = listHeader(res, 'access-control-allow-methods');

  if (!SAFELISTED_METHODS.includes(method) && !allowMethods.includes('*') && !allowMethods.includes(method.toLowerCase())) {
    problems.push(`method ${method} not in Access-Control-Allow-Methods`);
  }

  const allowHeaders = listHeader(res, 'access-control-allow-headers');
  const missing = requestHeaders.filter(name => !allowHeaders.includes('*') && !allowHeaders.includes(name.toLowerCase()));

  if (missing.length > 0) {
    problems.push(`not in Access-Control-Allow-Headers: ${missing.join(', ')}`);
  }

  return problems;
};

const checkHealthResponse = async base => {
  const res = await fetch(`${base}/health`, { headers: { Origin: ORIGIN } });
  const problems = [];
  const allowOrigin = res.headers.get('access-control-allow-origin');

  // Clock priming and the browser-block diagnosis (apiHostAccess.js) read this
  // response from extension pages that may be on the CORS path.
  if (allowOrigin !== '*' && allowOrigin !== ORIGIN) {
    problems.push(`GET /health Access-Control-Allow-Origin is ${allowOrigin === null ? 'missing' : `"${allowOrigin}"`}`);
  }

  const exposed = listHeader(res, 'access-control-expose-headers');

  // The signing clock offset comes from the Date header; under CORS the browser
  // hides every response header that is not safelisted or exposed.
  if (!exposed.includes('*') && !exposed.includes('date')) {
    problems.push('Date not in Access-Control-Expose-Headers (clock-skew correction cannot read it)');
  }

  return problems;
};

const main = async () => {
  const base = apiUrl();
  const url = `${base}/browser_extensions/${SAMPLE_EXTENSION_ID}/devices`;
  // Accept is CORS-safelisted; Content-Type: application/json is not.
  const requestHeaders = ['Content-Type', ...signingHeaders()];
  const results = [];

  for (const method of signedMethods()) {
    results.push([`preflight ${method}`, await checkPreflight(url, method, requestHeaders)]);
  }

  // The browser-block diagnosis (apiHostAccess.js) preflights GET /health with the
  // same headers; if /health answered outside the CORS layer, every network glitch
  // would read as a block again.
  results.push(['preflight GET /health', await checkPreflight(`${base}/health`, 'GET', requestHeaders)]);

  results.push(['response headers', await checkHealthResponse(base)]);

  console.log(`CORS check against ${base} (origin ${ORIGIN})`);

  let failed = false;

  for (const [name, problems] of results) {
    if (problems.length === 0) {
      console.log(`  ok    ${name}`);
      continue;
    }

    failed = true;
    problems.forEach(problem => console.log(`  FAIL  ${name}: ${problem}`));
  }

  process.exitCode = failed ? 1 : 0;
};

main().catch(err => {
  console.error(`CORS check could not run: ${err.message}`);
  process.exitCode = 2;
});
