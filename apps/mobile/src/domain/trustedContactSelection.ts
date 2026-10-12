export type TrustedContactCandidate = {
  consentGranted: boolean;
  phone?: string;
};

/** Selects the safest immediate-call fallback without changing alert eligibility. */
export function selectPrimaryTrustedContact<T extends TrustedContactCandidate>(contacts: T[]) {
  const consented = contacts.filter((contact) => contact.consentGranted);
  return consented.find((contact) => Boolean(contact.phone?.trim())) ?? consented[0];
}
