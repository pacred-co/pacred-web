/**
 * Zod schemas for V-G5 org contacts.
 *
 * Per port-spec [docs/port-specs/admin-polish-bundle.md] §V-G5.
 */

import { z } from "zod";

export const ORG_CONTACT_KINDS = [
  "domain",
  "email",
  "line_oa",
  "phone",
  "wechat",
  "social",
  "address",
] as const;
export type OrgContactKind = (typeof ORG_CONTACT_KINDS)[number];

/** Human label per kind for the admin tabs. */
export const ORG_CONTACT_KIND_LABEL: Record<OrgContactKind, string> = {
  domain:  "โดเมน",
  email:   "อีเมล",
  line_oa: "LINE OA",
  phone:   "โทรศัพท์",
  wechat:  "WeChat",
  social:  "Social",
  address: "ที่อยู่",
};

export const createOrgContactSchema = z.object({
  kind:           z.enum(ORG_CONTACT_KINDS),
  label:          z.string().trim().min(1, "label required").max(120),
  value:          z.string().trim().min(1, "value required").max(500),
  department:     z.string().trim().max(80).optional(),
  is_active:      z.boolean().optional().default(true),
  display_order:  z.number().int().min(0).max(9999).optional().default(0),
  notes:          z.string().trim().max(1000).optional(),
});
export type CreateOrgContactInput = z.infer<typeof createOrgContactSchema>;

export const updateOrgContactSchema = z.object({
  id:             z.string().uuid(),
  label:          z.string().trim().min(1).max(120).optional(),
  value:          z.string().trim().min(1).max(500).optional(),
  department:     z.string().trim().max(80).optional().nullable(),
  is_active:      z.boolean().optional(),
  display_order:  z.number().int().min(0).max(9999).optional(),
  notes:          z.string().trim().max(1000).optional().nullable(),
});
export type UpdateOrgContactInput = z.infer<typeof updateOrgContactSchema>;

export const deleteOrgContactSchema = z.object({
  id: z.string().uuid(),
});
export type DeleteOrgContactInput = z.infer<typeof deleteOrgContactSchema>;
