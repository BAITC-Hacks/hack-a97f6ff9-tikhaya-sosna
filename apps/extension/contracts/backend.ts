import { z } from 'zod';
import { backendProductSchema, normalizeProduct, productCardSchema } from './product';

const nonblank = (max: number) => z.string().refine((text) => text.length <= max && text.trim().length > 0);

export const backendChatResponseSchema = z.object({
  request_id: nonblank(128),
  message: nonblank(32_000),
  products: z.array(backendProductSchema).max(20),
  cart_proposal: z.union([z.record(z.string(), z.unknown()), z.null()]),
});

export const chatReplySchema = z.strictObject({
  request_id: nonblank(128),
  message: nonblank(32_000),
  products: z.array(productCardSchema).max(20),
  cart_proposal_received: z.boolean(),
});

export type ChatReply = z.infer<typeof chatReplySchema>;

export function normalizeBackendReply(value: unknown): ChatReply | null {
  const parsed = backendChatResponseSchema.safeParse(value);
  if (!parsed.success) return null;
  const reply = {
    request_id: parsed.data.request_id,
    message: parsed.data.message,
    products: parsed.data.products.map(normalizeProduct),
    cart_proposal_received: parsed.data.cart_proposal !== null,
  };
  return chatReplySchema.safeParse(reply).success ? reply : null;
}
