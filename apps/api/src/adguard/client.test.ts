import { describe, expect, it } from 'vitest';
import {
  parseClients,
  parseDhcpStatus,
  parseRewrites,
  pickStableName,
  looksLikeIp,
} from './client.js';

describe('parseRewrites', () => {
  it('parses domain/answer pairs and skips junk', () => {
    const list = parseRewrites([
      { domain: 'nas.lan', answer: '10.0.0.10', enabled: true },
      { domain: 'cname.lan', answer: 'other.lan' },
      { domain: '', answer: '1.1.1.1' },
      null,
      { domain: 'disabled.lan', answer: '10.0.0.99', enabled: false },
    ]);
    expect(list).toEqual([
      { domain: 'nas.lan', answer: '10.0.0.10', enabled: true },
      { domain: 'cname.lan', answer: 'other.lan', enabled: true },
      { domain: 'disabled.lan', answer: '10.0.0.99', enabled: false },
    ]);
  });
});

describe('parseDhcpStatus', () => {
  it('handles leases and static_leases field variants', () => {
    const status = parseDhcpStatus({
      leases: [{ ip: '10.0.0.20', hostname: 'laptop', mac: 'aa:bb' }],
      static_leases: [{ IP: '10.0.0.21', host_name: 'printer' }],
    });
    expect(status.leases).toEqual([{ ip: '10.0.0.20', hostname: 'laptop', mac: 'aa:bb' }]);
    expect(status.staticLeases).toEqual([{ ip: '10.0.0.21', hostname: 'printer' }]);
  });

  it('returns empty on garbage', () => {
    expect(parseDhcpStatus(null)).toEqual({ leases: [], staticLeases: [] });
  });
});

describe('parseClients', () => {
  it('maps persistent and auto clients', () => {
    const res = parseClients({
      clients: [{ name: 'TV', ids: ['10.0.0.30', 'aa:bb:cc'] }],
      auto_clients: [{ ip: '10.0.0.31', name: 'phone', source: 'etc/hosts' }],
    });
    expect(res.clients).toEqual([{ name: 'TV', ids: ['10.0.0.30', 'aa:bb:cc'] }]);
    expect(res.autoClients).toEqual([{ ip: '10.0.0.31', name: 'phone', source: 'etc/hosts' }]);
  });
});

describe('pickStableName', () => {
  it('prefers shortest then lexicographic', () => {
    expect(pickStableName(['zzzz.long.example', 'aa', 'bb'])).toBe('aa');
    expect(pickStableName(['cc', 'aa'])).toBe('aa');
  });
});

describe('looksLikeIp', () => {
  it('detects v4 and simple v6', () => {
    expect(looksLikeIp('10.0.0.1')).toBe(true);
    expect(looksLikeIp('2001:db8::1')).toBe(true);
    expect(looksLikeIp('nas.lan')).toBe(false);
  });
});
