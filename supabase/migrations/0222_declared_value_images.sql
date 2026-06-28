-- 0222 — declared-value justification images (owner 2026-06-28 #2)
--
-- "มูลค่าสำแดง (declared value) ต้องแก้ได้ + ใส่หมายเหตุ + แนบรูปได้หลายรูป" — the
-- justification for a declared customs value (supplier invoice photos, packing
-- evidence, etc.). The หมายเหตุ reuses the existing customs_declaration_lines.notes
-- column; this adds the multi-image store as a jsonb array of storage keys.
--
-- jsonb '[]' default (NOT null) so the app can append without a null-guard. Code
-- reads it tolerantly (parse → string[]). No FK, additive, idempotent.

alter table public.customs_declaration_lines
  add column if not exists declared_value_images jsonb not null default '[]'::jsonb;

comment on column public.customs_declaration_lines.declared_value_images is
  '2026-06-28 (#2): array of storage keys — justification images for the declared '
  'customs value (มูลค่าสำแดง). The basis text lives in .notes. Editable while the '
  'parent declaration is in draft.';
