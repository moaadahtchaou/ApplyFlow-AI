import { canonicalLeadKeys, type CanonicalLeadInput } from './canonical';

export type CompanyCandidate = {
  leadFingerprint: string | null;
  name: string;
  website: string | null;
  phone?: string | null;
  location: string | null;
  city?: string | null;
  sourceUrl?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

function companyAsLeadCandidate(company: CompanyCandidate): CanonicalLeadInput {
  return {
    name: company.name,
    website: company.website,
    address: company.location,
    city: company.city,
    phone: company.phone,
    sourceUrl: company.sourceUrl,
    latitude: company.latitude,
    longitude: company.longitude,
    fingerprint: company.leadFingerprint
  };
}

function hasSharedCanonicalKey(left: CanonicalLeadInput, right: CanonicalLeadInput) {
  const leftKeys = new Set(canonicalLeadKeys(left));
  return canonicalLeadKeys(right).some((key) => leftKeys.has(key));
}

export function leadMatchesCompany(
  lead: CanonicalLeadInput,
  company: CompanyCandidate
) {
  return hasSharedCanonicalKey(lead, companyAsLeadCandidate(company));
}

export function leadMatchesLead(left: CanonicalLeadInput, right: CanonicalLeadInput) {
  return hasSharedCanonicalKey(left, right);
}
