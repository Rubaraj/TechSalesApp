/**
 * Server-side name → catalog-id resolution for drugs, pharmacies and
 * providers.
 *
 * The browser has had this for a while (`drugService.findDrugByName` and
 * friends), but only while an agent has the lead form open. The screening
 * assistant writes the lead itself, so it needs the same lookups here —
 * the catalog JSONs already ship to the server, they were simply never
 * loaded. Semantics deliberately mirror the FE resolvers so a lead built
 * by the assistant looks like one an agent tagged by hand.
 *
 * Every resolver returns null on a miss; callers record misses in the
 * lead's notes rather than dropping what the caller told us.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { BOOTSTRAP_PATHS } from '../../utils/bootstrap.js';
import { logger } from '../../config/logger.js';

interface DrugRow {
  drugId: string;
  brandName?: string;
  genericName?: string;
  drugLabelName?: string;
  strength?: string;
}
interface PharmacyRow {
  pharmacyId: string;
  name?: string;
  chainName?: string;
  zipCode?: string;
}
interface ProviderRow {
  providerId: string;
  providerName?: string;
  zipCode?: string;
}

export interface ResolvedDrug {
  drugId: string;
  drugName: string;
  strength?: string;
}
export interface ResolvedPharmacy {
  pharmacyId: string;
  name: string;
}
export interface ResolvedProvider {
  providerId: string;
  providerName: string;
}

let drugs: DrugRow[] | null = null;
let pharmacies: PharmacyRow[] | null = null;
let providers: ProviderRow[] | null = null;

async function load<T>(file: string, cached: T[] | null): Promise<T[]> {
  if (cached) return cached;
  try {
    const raw = await readFile(path.join(BOOTSTRAP_PATHS.lookupDir, file), 'utf8');
    return JSON.parse(raw) as T[];
  } catch (err) {
    logger.warn({ err, file }, 'catalogResolver: catalog unavailable — matches will be skipped');
    return [];
  }
}

/** "500 MG" / "500mg" → "500mg" so heard dosages compare to catalog strengths. */
function normalizeStrength(value: string | undefined): string {
  return (value ?? '').toLowerCase().replace(/\s+/g, '');
}

/**
 * Exact name match (brand / generic / label), preferring the row whose
 * strength matches what the caller said. Metformin alone has 500mg, 850mg
 * and 1000mg rows — without the strength check we'd silently tag whichever
 * happened to be first in the file.
 */
export async function resolveDrug(
  name: string,
  dosage?: string,
): Promise<ResolvedDrug | null> {
  drugs = await load<DrugRow>('drugData.json', drugs);
  const wanted = name.trim().toLowerCase();
  if (!wanted) return null;
  const matches = drugs.filter(
    (d) =>
      d.brandName?.toLowerCase() === wanted ||
      d.genericName?.toLowerCase() === wanted ||
      d.drugLabelName?.toLowerCase() === wanted,
  );
  if (matches.length === 0) return null;
  const wantedStrength = normalizeStrength(dosage);
  const picked =
    (wantedStrength && matches.find((d) => normalizeStrength(d.strength) === wantedStrength)) ||
    matches[0]!;
  return {
    drugId: picked.drugId,
    drugName: picked.brandName || picked.genericName || name.trim(),
    ...(picked.strength ? { strength: picked.strength } : {}),
  };
}

/** Chain name or store name, preferring a store near the caller (zip-3). */
export async function resolvePharmacy(
  name: string,
  zipCode?: string,
): Promise<ResolvedPharmacy | null> {
  pharmacies = await load<PharmacyRow>('pharmacyData.json', pharmacies);
  const wanted = name.trim().toLowerCase();
  if (!wanted) return null;
  const matches = pharmacies.filter(
    (p) =>
      p.chainName?.toLowerCase() === wanted ||
      (p.name ?? '').toLowerCase().includes(wanted) ||
      (p.chainName ?? '').toLowerCase().includes(wanted),
  );
  if (matches.length === 0) return null;
  const zip3 = (zipCode ?? '').slice(0, 3);
  const near = zip3 ? matches.find((p) => (p.zipCode ?? '').startsWith(zip3)) : undefined;
  const picked = near ?? matches[0]!;
  return { pharmacyId: picked.pharmacyId, name: picked.name || name.trim() };
}

/**
 * Substring match on the catalog's "Last, First M., CRED" names, after
 * stripping a leading "Dr.". Note the seeded catalog only covers WA/OR/ID/PA,
 * so a caller elsewhere legitimately won't match — that's a note, not a bug.
 */
export async function resolveProvider(
  name: string,
  zipCode?: string,
): Promise<ResolvedProvider | null> {
  providers = await load<ProviderRow>('providerData.json', providers);
  const wanted = name.trim().replace(/^dr\.?\s+/i, '').toLowerCase();
  if (!wanted) return null;
  const matches = providers.filter((p) => (p.providerName ?? '').toLowerCase().includes(wanted));
  if (matches.length === 0) return null;
  const zip3 = (zipCode ?? '').slice(0, 3);
  const near = zip3 ? matches.find((p) => (p.zipCode ?? '').startsWith(zip3)) : undefined;
  const picked = near ?? matches[0]!;
  return { providerId: picked.providerId, providerName: picked.providerName || name.trim() };
}

/** Test seam — drop the cached catalogs. */
export const __resetCatalogsForTests = (): void => {
  drugs = null;
  pharmacies = null;
  providers = null;
};
