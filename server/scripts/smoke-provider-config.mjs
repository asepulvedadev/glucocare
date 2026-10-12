import { isAlertChannelConfigured } from '../dist/alertProviders.js';

const expected = process.env.EXPECTED_PROVIDER_CONFIGURED === 'true';
const actual = isAlertChannelConfigured('email');
if (actual !== expected) {
  throw new Error(`provider HTTPS guard mismatch: expected ${expected}, got ${actual}`);
}
console.log(`provider-config-smoke=passed configured=${actual}`);
