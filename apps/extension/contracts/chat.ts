import { z } from 'zod';
import { isCanonicalEktOrigin, parseEktPageUrl } from './ekt-url';

const nonblank = (maximum: number) =>
  z.string().min(1).max(maximum).refine((value) => value.trim().length > 0);

export const boundedIdSchema = nonblank(128);

export const pageContextSchema = z.strictObject({
  url: z.string().min(1).max(2048).refine((value) => parseEktPageUrl(value) !== null),
  origin: z.string().min(1).max(256).refine(isCanonicalEktOrigin),
  region: nonblank(64).nullable(),
  locale: nonblank(35),
  current_product_id: z.number().int().positive().refine(Number.isSafeInteger).nullable(),
}).refine((context) => parseEktPageUrl(context.url)?.origin === context.origin);

export const chatPayloadSchema = z.strictObject({
  session_id: boundedIdSchema,
  message: nonblank(8000),
  attachment_ids: z.array(boundedIdSchema).max(10),
  page_context: pageContextSchema,
});

export type ChatPayload = z.infer<typeof chatPayloadSchema>;
export type PageContext = z.infer<typeof pageContextSchema>;
