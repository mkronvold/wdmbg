import { z } from 'zod';

/** Placeholder health payload shared across API and web. */
export const healthSchema = z.object({
  status: z.literal('ok'),
  service: z.string().min(1),
  version: z.string().min(1),
});

export type Health = z.infer<typeof healthSchema>;

/** Placeholder probe batch envelope — traffic fields land in a later phase. */
export const probeBatchSchema = z.object({
  probeId: z.string().min(1),
  sentAt: z.string().datetime(),
  samples: z.array(z.record(z.string(), z.unknown())).default([]),
});

export type ProbeBatch = z.infer<typeof probeBatchSchema>;
