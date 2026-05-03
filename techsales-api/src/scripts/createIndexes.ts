/**
 * createIndexes.ts
 *
 * Idempotent index creation for the seeded collections per plan §8.
 *
 * Mongoose's `createIndex` on the underlying driver is a no-op when the same
 * spec already exists, so re-running this is safe. Conflicting specs (same
 * keys, different options) will throw — the seeder catches and logs that.
 *
 * Exposed as a function for the seeder; can be called directly via tsx if a
 * future operator wants to (re)create indexes without re-seeding.
 */
import type { Connection } from 'mongoose';
import { logger } from '../config/logger.js';

// Use the driver's index spec shapes — `Connection.collection()` returns the
// raw driver collection, whose `createIndex` expects different generics than
// Mongoose's model-level helper.
export type IndexKeys = Record<string, 1 | -1 | 'text' | '2dsphere'>;
export interface IndexOpts {
  name?: string;
  unique?: boolean;
  sparse?: boolean;
}

export type IndexSpec = [IndexKeys, IndexOpts?];

/**
 * Per-collection index specs. The `db` field tags which connection each
 * collection belongs to so the seeder can route to the right connection.
 */
export interface CollectionIndexConfig {
  db: 'app' | 'lookup';
  collection: string;
  indexes: IndexSpec[];
}

export const INDEX_PLAN: CollectionIndexConfig[] = [
  // medhub_app
  {
    db: 'app',
    collection: 'leads',
    indexes: [
      [{ leadId: 1 }, { unique: true, name: 'leadId_unique' }],
      [{ leadStatus: 1 }, { name: 'leadStatus_1' }],
      [{ state: 1, county: 1 }, { name: 'state_county' }],
      [{ createdBy: 1 }, { name: 'createdBy_1' }],
      [
        {
          firstName: 'text',
          lastName: 'text',
          email: 'text',
          phone: 'text',
          medicareNumber: 'text',
        },
        { name: 'lead_text_search' },
      ],
    ],
  },
  {
    db: 'app',
    collection: 'users',
    indexes: [
      [{ username: 1 }, { unique: true, name: 'username_unique' }],
      [{ roleId: 1 }, { name: 'roleId_1' }],
    ],
  },
  {
    db: 'app',
    collection: 'roles',
    indexes: [[{ roleId: 1 }, { unique: true, name: 'roleId_unique' }]],
  },
  {
    db: 'app',
    collection: 'departments',
    indexes: [
      [{ departmentId: 1 }, { unique: true, name: 'departmentId_unique' }],
    ],
  },
  {
    db: 'app',
    collection: 'enrollments',
    indexes: [
      [{ enrollmentId: 1 }, { unique: true, name: 'enrollmentId_unique' }],
      [{ leadId: 1 }, { name: 'leadId_1' }],
      [{ planId: 1 }, { name: 'planId_1' }],
      [{ status: 1 }, { name: 'status_1' }],
    ],
  },
  {
    db: 'app',
    collection: 'members',
    indexes: [
      [{ memberId: 1 }, { unique: true, name: 'memberId_unique' }],
      [{ policyNumber: 1, dateOfBirth: 1 }, { name: 'policy_dob' }],
      [{ isActive: 1 }, { name: 'isActive_1' }],
    ],
  },
  {
    db: 'app',
    collection: 'memberAppointments',
    indexes: [[{ memberId: 1, status: 1 }, { name: 'member_status' }]],
  },
  {
    db: 'app',
    collection: 'targets',
    indexes: [[{ userId: 1, period: 1 }, { name: 'user_period' }]],
  },

  // medhub_lookup
  {
    db: 'lookup',
    collection: 'plans',
    indexes: [
      [{ planId: 1 }, { unique: true, name: 'planId_unique' }],
      [{ carrier: 1, contractYear: 1 }, { name: 'carrier_year' }],
      [{ category: 1, planType: 1 }, { name: 'category_planType' }],
    ],
  },
  {
    db: 'lookup',
    collection: 'benefits',
    indexes: [[{ planId: 1 }, { name: 'planId_1' }]],
  },
  {
    db: 'lookup',
    collection: 'premiums',
    indexes: [[{ planId: 1 }, { unique: true, name: 'planId_unique' }]],
  },
  {
    db: 'lookup',
    collection: 'starRatings',
    indexes: [[{ planId: 1 }, { unique: true, name: 'planId_unique' }]],
  },
  {
    db: 'lookup',
    collection: 'drugs',
    indexes: [
      [{ drugId: 1 }, { unique: true, name: 'drugId_unique' }],
      [
        { drugLabelName: 'text', brandName: 'text', genericName: 'text' },
        { name: 'drug_text_search' },
      ],
    ],
  },
  {
    db: 'lookup',
    collection: 'pharmacies',
    indexes: [
      [{ pharmacyId: 1 }, { unique: true, name: 'pharmacyId_unique' }],
    ],
  },
  {
    db: 'lookup',
    collection: 'providers',
    indexes: [
      [{ providerId: 1 }, { unique: true, name: 'providerId_unique' }],
      [{ providerName: 'text' }, { name: 'provider_text_search' }],
    ],
  },
  {
    db: 'lookup',
    collection: 'zipStateCounty',
    indexes: [
      [{ zipCode: 1 }, { unique: true, name: 'zipCode_unique' }],
      [{ state: 1, county: 1 }, { name: 'state_county' }],
    ],
  },
];

export function getIndexConfig(collection: string): CollectionIndexConfig | undefined {
  return INDEX_PLAN.find((c) => c.collection === collection);
}

export async function createIndexesForCollection(
  conn: Connection,
  collection: string,
): Promise<void> {
  const cfg = getIndexConfig(collection);
  if (!cfg) {
    logger.warn({ collection }, 'createIndexes: no index config for collection');
    return;
  }
  const coll = conn.collection(collection);
  for (const [keys, options] of cfg.indexes) {
    try {
      // Cast to `any` — the raw driver's IndexSpecification union is too
      // loose for our typed `IndexKeys` shape, but accepts plain objects
      // at runtime exactly like this.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await coll.createIndex(keys as any, (options ?? {}) as any);
    } catch (err) {
      logger.warn(
        { err, collection, keys, options },
        'createIndexes: index creation failed (continuing)',
      );
    }
  }
}
