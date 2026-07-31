import { isLocalAddress } from '@wdmbg/contracts';
import fs from 'node:fs';

/**
 * Offline GeoIP/ASN enrichment.
 *
 * Place a MaxMind-compatible MMDB (or CSV export) at WDMBG_GEOIP_DB_PATH.
 * MVP ships without a licensed DB — private IPs map to "Local", everything
 * else to "Unknown" until a DB file is present.
 *
 * Suggested setup (operator-provided license):
 *   1. Obtain GeoLite2-Country.mmdb (MaxMind license required)
 *   2. Mount read-only at /data/geoip/GeoLite2-Country.mmdb
 *   3. Set WDMBG_GEOIP_DB_PATH=/data/geoip/GeoLite2-Country.mmdb
 *
 * Full MMDB parsing can be added later; this module documents the path and
 * exposes a simple hook for tests / future readers.
 */
export class GeoIpService {
  private readonly dbPath: string | undefined;
  private readonly present: boolean;
  private readonly overrides = new Map<string, string>();

  constructor(dbPath = process.env.WDMBG_GEOIP_DB_PATH) {
    this.dbPath = dbPath;
    this.present = Boolean(dbPath && fs.existsSync(dbPath));
  }

  get status(): { configured: boolean; present: boolean; path?: string } {
    return {
      configured: Boolean(this.dbPath),
      present: this.present,
      ...(this.dbPath ? { path: this.dbPath } : {}),
    };
  }

  /** Test/helper override when no MMDB is loaded. */
  setOverride(ip: string, country: string): void {
    this.overrides.set(ip, country);
  }

  lookupCountry(ip: string): string {
    if (isLocalAddress(ip)) return 'Local';
    const override = this.overrides.get(ip);
    if (override) return override;
    if (!this.present) return 'Unknown';
    // DB present but MMDB reader not wired in MVP — still Unknown until reader lands.
    return 'Unknown';
  }
}
