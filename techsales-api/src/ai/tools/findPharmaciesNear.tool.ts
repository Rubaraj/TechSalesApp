/**
 * Phase C — `find_pharmacies_near`. READ tool. Pharmacy catalog lookup by
 * zip (exact, then zip-3 prefix, then state) with optional chain filter.
 * Reads the operator-owned lookup JSON (bootstrap copies it on startup),
 * cached in module scope.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { BOOTSTRAP_PATHS } from '../../utils/bootstrap.js';

interface Pharmacy {
  pharmacyId: string;
  name: string;
  chainName?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  county?: string;
  phone?: string;
}

let catalog: Pharmacy[] | null = null;

async function loadCatalog(): Promise<Pharmacy[]> {
  if (catalog) return catalog;
  const raw = await fs.readFile(path.join(BOOTSTRAP_PATHS.lookupDir, 'pharmacyData.json'), 'utf8');
  catalog = JSON.parse(raw) as Pharmacy[];
  return catalog;
}

const inputSchema = z.object({
  zip: z.string().regex(/^\d{5}$/).optional().describe('5-digit zip to search near.'),
  state: z.string().length(2).optional().describe('2-letter state filter (used alone or as fallback).'),
  chainName: z.string().optional().describe('Optional chain filter, e.g. "CVS", "Walgreens".'),
  limit: z.number().int().min(1).max(15).optional().default(5),
});

type ToolInput = z.infer<typeof inputSchema>;

export const findPharmaciesNearTool = tool(
  async (input: ToolInput): Promise<string> => {
    try {
      if (!input.zip && !input.state) {
        return JSON.stringify({ error: 'Provide zip or state.' });
      }
      let rows = await loadCatalog();
      if (input.chainName) {
        const c = input.chainName.toLowerCase();
        rows = rows.filter((p) => (p.chainName ?? p.name).toLowerCase().includes(c));
      }

      // Proximity rank without geo data: exact zip → same zip-3 prefix → same state.
      const rank = (p: Pharmacy): number => {
        if (input.zip) {
          if (p.zipCode === input.zip) return 0;
          if (p.zipCode?.slice(0, 3) === input.zip.slice(0, 3)) return 1;
        }
        if (input.state && p.state?.toUpperCase() === input.state.toUpperCase()) return 2;
        return 3;
      };
      const ranked = rows
        .map((p) => ({ p, r: rank(p) }))
        .filter(({ r }) => r < 3)
        .sort((a, b) => a.r - b.r);

      return JSON.stringify({
        total: ranked.length,
        pharmacies: ranked.slice(0, input.limit).map(({ p, r }) => ({
          pharmacyId: p.pharmacyId,
          name: p.name,
          chainName: p.chainName,
          address: `${p.address ?? ''}, ${p.city ?? ''}, ${p.state ?? ''} ${p.zipCode ?? ''}`.trim(),
          phone: p.phone,
          proximity: r === 0 ? 'same zip' : r === 1 ? 'nearby (zip prefix)' : 'same state',
        })),
      });
    } catch (err) {
      return JSON.stringify({ error: String(err) });
    }
  },
  {
    name: 'find_pharmacies_near',
    description:
      'Pharmacy catalog search near a zip code (exact zip, then nearby zip prefix, then same ' +
      'state), optionally filtered by chain. Use for "CVS near 33101", "pharmacies in FL". ' +
      'Useful before tagging a pharmacy on a lead.',
    schema: inputSchema,
  },
);
