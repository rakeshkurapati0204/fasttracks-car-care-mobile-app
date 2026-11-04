// Stops a bad `sales-trial` build BEFORE it is built and handed to salesmen. Runs on EAS as part of the "eas-build-pre-install" hook, and does nothing for every
// other profile (it only acts when FASTTRACKS_TRIAL=1, which only the sales-trial profile sets). The trial APK is a release build with no Metro behind it, so it must
// talk to a real, separate staging backend over HTTPS; a wrong URL would otherwise ship silently inside 5-10 phones for 20 days.
const PRIVATE_HOST = [
  /^localhost$/i, /\.localhost$/i, /\.local$/i, /\.internal$/i, /\.invalid$/i, /\.test$/i, /\.example$/i,
  /^127\./, /^0\.0\.0\.0$/, /^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^169\.254\./, /^\[?::1\]?$/, /^\[?f[cd][0-9a-f]{2}:/i,
];
// The live production dashboard. The pilot must NOT write into it. Add more with FASTTRACKS_PRODUCTION_HOSTS=a.com,b.com
const PRODUCTION_HOSTS = ['dashboard.fasttrackscarcare.in'];

function check(env = process.env) {
  if (env.FASTTRACKS_TRIAL !== '1') return []; // not a trial build: nothing to check
  const errors = [];
  if (env.FASTTRACKS_DIALER !== '1') errors.push('FASTTRACKS_DIALER must be 1 for the trial build (it carries the phone-app module).');

  const raw = env.EXPO_PUBLIC_API_URL;
  if (!raw) errors.push('EXPO_PUBLIC_API_URL is not set.');
  else {
    let url = null;
    try { url = new URL(raw); } catch { errors.push(`EXPO_PUBLIC_API_URL is not a valid URL: ${raw}`); }
    if (url) {
      const host = url.hostname.toLowerCase();
      const blockedProd = [...PRODUCTION_HOSTS, ...(env.FASTTRACKS_PRODUCTION_HOSTS ?? '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean)];
      if (url.protocol !== 'https:') errors.push('EXPO_PUBLIC_API_URL must use https://.');
      if (PRIVATE_HOST.some((re) => re.test(host))) errors.push(`EXPO_PUBLIC_API_URL host "${host}" is local, private or a placeholder: it cannot work on a salesman's phone.`);
      if (blockedProd.includes(host)) errors.push(`EXPO_PUBLIC_API_URL points at the PRODUCTION host "${host}": the pilot must use a separate staging backend.`);
      if (!/\/api\/v1\/?$/.test(url.pathname)) errors.push('EXPO_PUBLIC_API_URL must end with /api/v1.');
      if (url.username || url.password || url.search || url.hash) errors.push('EXPO_PUBLIC_API_URL must not contain credentials, a query or a fragment.');
    }
  }
  // Test aids that must never be inside a trial APK.
  for (const flag of ['EXPO_PUBLIC_VOIP_MOCK', 'EXPO_PUBLIC_VOIP_NATIVE', 'EXPO_PUBLIC_AUTOANSWER_LEARN']) {
    if (env[flag] === 'true') errors.push(`${flag} must not be true in a trial build.`);
  }
  return errors;
}

module.exports = { check };

if (require.main === module) {
  const errors = check();
  if (errors.length > 0) {
    console.error(`[sales-trial] build refused:\n - ${errors.join('\n - ')}`);
    process.exit(1);
  }
  if (process.env.FASTTRACKS_TRIAL === '1') console.log(`[sales-trial] checks passed (API: ${new URL(process.env.EXPO_PUBLIC_API_URL).host})`);
}
