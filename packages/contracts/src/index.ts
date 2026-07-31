import { z } from 'zod';

/** Sliding query windows over the 15-minute in-memory ring. */
export const windowSchema = z.enum(['5s', '30s', '5m']);
export type QueryWindow = z.infer<typeof windowSchema>;

export const WINDOW_SECONDS: Record<QueryWindow, number> = {
  '5s': 5,
  '30s': 30,
  '5m': 300,
};

export const RING_BUCKET_COUNT = 900;
export const BUCKET_INTERVAL_SEC = 1;

export const l4Schema = z.enum(['tcp', 'udp', 'icmp', 'other']);
export type L4 = z.infer<typeof l4Schema>;

/** Health payload shared across API and web. */
export const healthSchema = z.object({
  status: z.literal('ok'),
  service: z.string().min(1),
  version: z.string().min(1),
});
export type Health = z.infer<typeof healthSchema>;

/** Single bidirectional flow sample inside a 1s bucket. */
export const flowSampleSchema = z.object({
  src: z.string().min(1),
  dst: z.string().min(1),
  srcPort: z.number().int().min(0).max(65535),
  dstPort: z.number().int().min(0).max(65535),
  l4: l4Schema,
  l7: z.string().min(1).optional(),
  bytesSrcToDst: z.number().nonnegative(),
  bytesDstToSrc: z.number().nonnegative(),
  packetsSrcToDst: z.number().int().nonnegative().default(0),
  packetsDstToSrc: z.number().int().nonnegative().default(0),
});
export type FlowSample = z.infer<typeof flowSampleSchema>;

export const secondBucketSchema = z.object({
  t: z.number().int().nonnegative(),
  flows: z.array(flowSampleSchema),
});
export type SecondBucket = z.infer<typeof secondBucketSchema>;

/** Probe → API rollup envelope (POST /api/ingest/rollups). */
export const rollupEnvelopeSchema = z.object({
  probeId: z.string().min(1),
  sentAt: z.string().datetime(),
  intervalSec: z.literal(1).default(1),
  buckets: z.array(secondBucketSchema).min(1).max(120),
});
export type RollupEnvelope = z.infer<typeof rollupEnvelopeSchema>;

/** @deprecated Use rollupEnvelopeSchema — kept for Phase 0 callers. */
export const probeBatchSchema = rollupEnvelopeSchema;
export type ProbeBatch = RollupEnvelope;

export const talkerRowSchema = z.object({
  host: z.string(),
  label: z.string().optional(),
  txBytes: z.number().nonnegative(),
  rxBytes: z.number().nonnegative(),
  totalBytes: z.number().nonnegative(),
  country: z.string().optional(),
});
export type TalkerRow = z.infer<typeof talkerRowSchema>;

export const protocolRowSchema = z.object({
  protocol: z.string(),
  bytes: z.number().nonnegative(),
  packets: z.number().nonnegative(),
});
export type ProtocolRow = z.infer<typeof protocolRowSchema>;

export const flowRowSchema = z.object({
  src: z.string(),
  srcPort: z.number().int(),
  dst: z.string(),
  dstPort: z.number().int(),
  l4: l4Schema,
  l7: z.string().optional(),
  bytes: z.number().nonnegative(),
  packets: z.number().nonnegative(),
  /** Present on host-relative flow views. */
  txBytes: z.number().nonnegative().optional(),
  rxBytes: z.number().nonnegative().optional(),
});
export type FlowRow = z.infer<typeof flowRowSchema>;

export const countryRowSchema = z.object({
  country: z.string(),
  bytes: z.number().nonnegative(),
});
export type CountryRow = z.infer<typeof countryRowSchema>;

export const dashboardSchema = z.object({
  window: windowSchema,
  generatedAt: z.string().datetime(),
  topTalkers: z.array(talkerRowSchema),
  topReceivers: z.array(talkerRowSchema),
  topProtocols: z.array(protocolRowSchema),
  hotFlows: z.array(flowRowSchema),
  topCountries: z.array(countryRowSchema),
});
export type Dashboard = z.infer<typeof dashboardSchema>;

export const hostSummarySchema = z.object({
  host: z.string(),
  label: z.string().optional(),
  window: windowSchema,
  generatedAt: z.string().datetime(),
  txBytes: z.number().nonnegative(),
  rxBytes: z.number().nonnegative(),
  totalBytes: z.number().nonnegative(),
  txRateBps: z.number().nonnegative(),
  rxRateBps: z.number().nonnegative(),
  topProtocols: z.array(protocolRowSchema),
  topPeers: z.array(talkerRowSchema),
});
export type HostSummary = z.infer<typeof hostSummarySchema>;

export const hostFlowsSchema = z.object({
  host: z.string(),
  window: windowSchema,
  generatedAt: z.string().datetime(),
  flows: z.array(flowRowSchema),
});
export type HostFlows = z.infer<typeof hostFlowsSchema>;

export const aliasPutSchema = z.object({
  host: z.string().min(1),
  alias: z.string().min(1).max(128),
});
export type AliasPut = z.infer<typeof aliasPutSchema>;

export const aliasSchema = z.object({
  host: z.string(),
  alias: z.string(),
  updatedAt: z.string().datetime(),
});
export type Alias = z.infer<typeof aliasSchema>;

export const resolveRequestSchema = z.object({
  hosts: z.array(z.string().min(1)).min(1).max(50),
});
export type ResolveRequest = z.infer<typeof resolveRequestSchema>;

export const resolveResultSchema = z.object({
  host: z.string(),
  hostname: z.string().nullable(),
  source: z.enum(['cache', 'ptr', 'alias', 'none']),
});
export type ResolveResult = z.infer<typeof resolveResultSchema>;

export const resolveResponseSchema = z.object({
  results: z.array(resolveResultSchema),
});
export type ResolveResponse = z.infer<typeof resolveResponseSchema>;

export const liveTickSchema = z.object({
  type: z.literal('tick'),
  t: z.number().int(),
  totalBytes: z.number().nonnegative(),
  flowCount: z.number().int().nonnegative(),
});
export type LiveTick = z.infer<typeof liveTickSchema>;

/** Well-known private / local ranges → country label "Local". */
export function isLocalAddress(ip: string): boolean {
  const v4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const a = Number(v4[1]);
    const b = Number(v4[2]);
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 0) return true;
    return false;
  }
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === 'localhost') return true;
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
  if (lower.startsWith('fe80:')) return true;
  return false;
}
