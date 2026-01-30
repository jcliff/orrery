/**
 * SQLite cache layer for incremental data fetching.
 * Tracks ETags, last-modified timestamps, and stores fetched features.
 */
import Database from 'better-sqlite3';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Feature, Geometry, GeoJsonProperties } from 'geojson';

// ============================================================================
// Types
// ============================================================================

export interface SourceMetadata {
  sourceId: string;
  etag: string | null;
  lastModified: string | null;
  lastFetched: string;
  recordCount: number;
}

export interface CachedFeature {
  id: string;
  sourceId: string;
  data: string; // JSON string
  fetchedAt: string;
}

export interface CacheStats {
  sourceCount: number;
  featureCount: number;
  sizeBytes: number;
}

// ============================================================================
// Cache Implementation
// ============================================================================

export class FeatureCache {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.init();
  }

  private init(): void {
    // Enable WAL mode for better concurrency
    this.db.pragma('journal_mode = WAL');

    // Create tables
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sources (
        source_id TEXT PRIMARY KEY,
        etag TEXT,
        last_modified TEXT,
        last_fetched TEXT NOT NULL,
        record_count INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS features (
        id TEXT NOT NULL,
        source_id TEXT NOT NULL,
        data TEXT NOT NULL,
        fetched_at TEXT NOT NULL,
        PRIMARY KEY (source_id, id),
        FOREIGN KEY (source_id) REFERENCES sources(source_id)
      );

      CREATE INDEX IF NOT EXISTS idx_features_source
        ON features(source_id);
    `);
  }

  /**
   * Get metadata for a source to check if refresh is needed.
   */
  getSourceMetadata(sourceId: string): SourceMetadata | null {
    const row = this.db
      .prepare(
        `SELECT source_id, etag, last_modified, last_fetched, record_count
         FROM sources WHERE source_id = ?`
      )
      .get(sourceId) as
      | {
          source_id: string;
          etag: string | null;
          last_modified: string | null;
          last_fetched: string;
          record_count: number;
        }
      | undefined;

    if (!row) return null;

    return {
      sourceId: row.source_id,
      etag: row.etag,
      lastModified: row.last_modified,
      lastFetched: row.last_fetched,
      recordCount: row.record_count,
    };
  }

  /**
   * Update source metadata after a fetch.
   */
  updateSourceMetadata(
    sourceId: string,
    meta: {
      etag?: string | null;
      lastModified?: string | null;
      recordCount: number;
    }
  ): void {
    this.db
      .prepare(
        `INSERT INTO sources (source_id, etag, last_modified, last_fetched, record_count)
         VALUES (?, ?, ?, datetime('now'), ?)
         ON CONFLICT(source_id) DO UPDATE SET
           etag = excluded.etag,
           last_modified = excluded.last_modified,
           last_fetched = excluded.last_fetched,
           record_count = excluded.record_count`
      )
      .run(sourceId, meta.etag ?? null, meta.lastModified ?? null, meta.recordCount);
  }

  /**
   * Upsert features for a source. Uses transaction for performance.
   */
  upsertFeatures<T>(
    sourceId: string,
    features: T[],
    getFeatureId: (feature: T, index: number) => string
  ): void {
    // Ensure source exists first (for foreign key constraint)
    this.db
      .prepare(
        `INSERT INTO sources (source_id, last_fetched, record_count)
         VALUES (?, datetime('now'), 0)
         ON CONFLICT(source_id) DO NOTHING`
      )
      .run(sourceId);

    const stmt = this.db.prepare(
      `INSERT INTO features (id, source_id, data, fetched_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(source_id, id) DO UPDATE SET
         data = excluded.data,
         fetched_at = excluded.fetched_at`
    );

    const insertMany = this.db.transaction((items: T[]) => {
      for (let i = 0; i < items.length; i++) {
        const feature = items[i];
        const id = getFeatureId(feature, i);
        stmt.run(id, sourceId, JSON.stringify(feature));
      }
    });

    insertMany(features);
  }

  /**
   * Get all features for a source.
   */
  getFeatures<T>(sourceId: string): T[] {
    const rows = this.db
      .prepare(`SELECT data FROM features WHERE source_id = ?`)
      .all(sourceId) as { data: string }[];

    return rows.map((row) => JSON.parse(row.data) as T);
  }

  /**
   * Get feature count for a source.
   */
  getFeatureCount(sourceId: string): number {
    const row = this.db
      .prepare(`SELECT COUNT(*) as count FROM features WHERE source_id = ?`)
      .get(sourceId) as { count: number };

    return row.count;
  }

  /**
   * Delete all features for a source (for full refresh).
   */
  clearSource(sourceId: string): void {
    this.db.prepare(`DELETE FROM features WHERE source_id = ?`).run(sourceId);
    this.db.prepare(`DELETE FROM sources WHERE source_id = ?`).run(sourceId);
  }

  /**
   * Get cache statistics.
   */
  getStats(): CacheStats {
    const sourceCount = (
      this.db.prepare(`SELECT COUNT(*) as count FROM sources`).get() as {
        count: number;
      }
    ).count;

    const featureCount = (
      this.db.prepare(`SELECT COUNT(*) as count FROM features`).get() as {
        count: number;
      }
    ).count;

    const sizeBytes = (
      this.db
        .prepare(`SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()`)
        .get() as { size: number }
    ).size;

    return { sourceCount, featureCount, sizeBytes };
  }

  /**
   * Check if source needs refresh based on age.
   */
  needsRefresh(sourceId: string, maxAgeHours = 24): boolean {
    const meta = this.getSourceMetadata(sourceId);
    if (!meta) return true;

    const lastFetched = new Date(meta.lastFetched);
    const ageMs = Date.now() - lastFetched.getTime();
    const ageHours = ageMs / (1000 * 60 * 60);

    return ageHours > maxAgeHours;
  }

  /**
   * Close the database connection.
   */
  close(): void {
    this.db.close();
  }
}

// ============================================================================
// Factory
// ============================================================================

const DEFAULT_CACHE_PATH = new URL(
  '../../data/cache/features.db',
  import.meta.url
).pathname;

let defaultCache: FeatureCache | null = null;

export async function getCache(
  dbPath: string = DEFAULT_CACHE_PATH
): Promise<FeatureCache> {
  if (defaultCache && dbPath === DEFAULT_CACHE_PATH) {
    return defaultCache;
  }

  // Ensure directory exists
  await mkdir(dirname(dbPath), { recursive: true });

  const cache = new FeatureCache(dbPath);

  if (dbPath === DEFAULT_CACHE_PATH) {
    defaultCache = cache;
  }

  return cache;
}

/**
 * Helper to generate feature ID from GeoJSON feature.
 */
export function geoJsonFeatureId(
  feature: Feature<Geometry, GeoJsonProperties>,
  index: number,
  idProperty?: string
): string {
  if (idProperty && feature.properties?.[idProperty]) {
    return String(feature.properties[idProperty]);
  }
  // Fall back to index if no ID property
  return `feature_${index}`;
}
