import { z } from "zod";

export const SERVICE_TYPES = [
  "import",
  "export",
  "clear",
  "customs",
  "order",
  "payment",
] as const;

export const ORDER_STATUSES = [
  "pending",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
] as const;

export const createOrderSchema = z.object({
  serviceType: z.enum(SERVICE_TYPES),
  origin: z.string().optional().nullable(),
  destination: z.string().optional().nullable(),
  description: z.string().min(1, "กรุณากรอกรายละเอียด").max(2000),
});
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
