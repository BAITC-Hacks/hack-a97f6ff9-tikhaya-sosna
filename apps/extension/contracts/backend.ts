import { z } from 'zod';
import { boundedIdSchema } from './chat';
import { backendProductSchema, legacyBackendProductSchema, normalizeLegacyProduct,
  normalizeProduct, productCardSchema } from './product';

const nonblank = (max: number) => z.string().refine((text) => text.length <= max && text.trim().length > 0);

export const backendChatResponseSchema = z.object({
  request_id: nonblank(128),
  message: nonblank(32_000),
  products: z.array(backendProductSchema).max(20),
  cart_proposal: z.union([z.record(z.string(), z.unknown()), z.null()]),
});

export const legacyBackendChatResponseSchema = z.strictObject({
  message: nonblank(32_000),
  products: z.array(legacyBackendProductSchema).max(20),
  cart_proposal: z.union([z.record(z.string(), z.unknown()), z.null()]),
});

export const chatReplySchema = z.strictObject({
  request_id: nonblank(128),
  message: nonblank(32_000),
  products: z.array(productCardSchema).max(20),
  cart_proposal_received: z.boolean(),
});

export type ChatReply = z.infer<typeof chatReplySchema>;

export function normalizeBackendReply(value: unknown, options?: { fallbackRequestId: string }): ChatReply | null {
  const canonical = backendChatResponseSchema.safeParse(value);
  let reply: ChatReply;
  if (canonical.success) {
    reply = {
      request_id: canonical.data.request_id,
      message: canonical.data.message,
      products: canonical.data.products.map(normalizeProduct),
      cart_proposal_received: canonical.data.cart_proposal !== null,
    };
  } else {
    const legacy = legacyBackendChatResponseSchema.safeParse(value);
    const fallback = boundedIdSchema.safeParse(options?.fallbackRequestId);
    if (!legacy.success || !fallback.success) return null;
    reply = {
      request_id: fallback.data,
      message: legacy.data.message,
      products: legacy.data.products.map(normalizeLegacyProduct),
      cart_proposal_received: legacy.data.cart_proposal !== null,
    };
  }
  return chatReplySchema.safeParse(reply).success ? reply : null;
}
