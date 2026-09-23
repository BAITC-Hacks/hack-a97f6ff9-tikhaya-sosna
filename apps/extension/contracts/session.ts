import { z } from 'zod';
import { isCanonicalEktOrigin } from './ekt-url';

export const sessionScopeSchema = z.strictObject({
  tab_id: z.number().int().nonnegative().refine(Number.isSafeInteger),
  origin: z.string().refine(isCanonicalEktOrigin),
});

export const sessionDescriptorSchema = z.strictObject({
  session_id: z.uuid(),
  origin: z.string().refine(isCanonicalEktOrigin),
});

export const sessionRecordSchema = z.strictObject({
  schema_version: z.literal(1),
  session_id: z.uuid(),
  origin: z.string().refine(isCanonicalEktOrigin),
  tab_id: z.number().int().nonnegative().refine(Number.isSafeInteger),
});

export type SessionScope = z.infer<typeof sessionScopeSchema>;
export type SessionDescriptor = z.infer<typeof sessionDescriptorSchema>;
export type SessionRecord = z.infer<typeof sessionRecordSchema>;
