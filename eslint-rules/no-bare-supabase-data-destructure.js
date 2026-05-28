/**
 * ESLint rule — `no-bare-supabase-data-destructure`
 *
 * Wave 19 Sprint A2 — enforces AGENTS.md §0c at lint time.
 *
 * Flags:
 *   const { data } = await admin.from(...).select()...
 *   const { data: foo } = await supabase.rpc(...).single()
 *
 * Demands `error` (or `error: <name>Err`) be in the destructure pattern.
 * Auto-fixable for the simple case — just adds the missing element. The
 * call-site still needs a human (or the codemod) to add the `if (error)`
 * handler block; the auto-fix only makes the error visible to TypeScript so
 * the developer sees the unused-variable lint and remembers to handle it.
 *
 * Detection heuristic:
 *   - Initializer is `await <expr>`
 *   - The `<expr>` chain contains a `.from(...)` or `.rpc(...)` call, OR
 *   - The chain root is an identifier matching a recognised Supabase client
 *     name (`admin`, `supabase`, `sb`, `client` — same list as the codemod)
 *
 * Skips:
 *   - destructure that already has `error`
 *   - destructure with no `data` binding
 *
 * Configuration:
 *   None. Single severity; rule applies as written.
 */

"use strict";

const SUPABASE_ROOT_HINTS = ["admin", "supabase", "createAdminClient", "createClient", "sb", "client"];

/**
 * Walk a left-hand expression chain (PropertyAccess/Call/Identifier) and
 * decide if it looks like a Supabase query.
 *
 * Returns { isSupabase, isStorage }:
 *   - isSupabase=true if chain has `.from(...)`, `.rpc(...)`, or root identifier
 *     is a recognised Supabase client name
 *   - isStorage=true if chain contains `.storage` — Storage errors have a
 *     different shape (no `.code`) so the rule SKIPS them entirely (an engineer
 *     should add their own explicit handler)
 */
function inspectChain(node) {
  let cur = node;
  let isSupabase = false;
  let isStorage = false;
  let depth = 0;
  while (cur && depth < 30) {
    depth++;
    if (cur.type === "CallExpression") {
      const callee = cur.callee;
      if (callee && callee.type === "MemberExpression") {
        const propName = callee.property && callee.property.name;
        if (propName === "from" || propName === "rpc") isSupabase = true;
        cur = callee.object;
      } else if (callee && callee.type === "Identifier") {
        if (SUPABASE_ROOT_HINTS.includes(callee.name)) isSupabase = true;
        break;
      } else {
        break;
      }
    } else if (cur.type === "MemberExpression") {
      if (cur.property && cur.property.name === "storage") isStorage = true;
      cur = cur.object;
    } else if (cur.type === "Identifier") {
      if (SUPABASE_ROOT_HINTS.includes(cur.name)) isSupabase = true;
      break;
    } else if (cur.type === "TSNonNullExpression" || cur.type === "TSAsExpression") {
      cur = cur.expression;
    } else if (cur.type === "ParenthesizedExpression") {
      cur = cur.expression;
    } else {
      break;
    }
  }
  return { isSupabase, isStorage };
}

/** Find the `data` property in an ObjectPattern; return null if absent. */
function findDataProperty(pattern) {
  if (!pattern || pattern.type !== "ObjectPattern") return null;
  for (const prop of pattern.properties) {
    if (prop.type !== "Property") continue;
    const keyName = prop.key && (prop.key.name || prop.key.value);
    if (keyName === "data") return prop;
  }
  return null;
}

/** True if the pattern already has an `error` property. */
function hasErrorProperty(pattern) {
  if (!pattern || pattern.type !== "ObjectPattern") return false;
  return pattern.properties.some((p) => {
    if (p.type !== "Property") return false;
    const k = p.key && (p.key.name || p.key.value);
    return k === "error";
  });
}

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require `error` in any Supabase destructure (per AGENTS.md §0c). Silent error → silent 404 (case study: PR10899 transient PgBouncer timeout).",
      recommended: true,
    },
    messages: {
      missingError:
        "Supabase destructure must include `error` (per AGENTS.md §0c). Silent failure → false 404 / wrong 'not_found' toast / data corruption.",
    },
    fixable: "code",
    schema: [],
  },

  create(context) {
    return {
      VariableDeclarator(node) {
        // const { data } = await ...
        if (!node.id || node.id.type !== "ObjectPattern") return;
        if (!node.init || node.init.type !== "AwaitExpression") return;

        const dataProp = findDataProperty(node.id);
        if (!dataProp) return;
        if (hasErrorProperty(node.id)) return;

        const awaitee = node.init.argument;
        const chain = inspectChain(awaitee);
        if (!chain.isSupabase) return;
        // Storage errors (`StorageError`) have no `.code` — different shape.
        // Skip them; engineers should add their own explicit handler.
        if (chain.isStorage) return;

        const sourceCode = context.getSourceCode();
        const pattern = node.id;

        // Compute the error binding name: `error` (or `<dataName>Err` if data
        // was renamed via `data: foo`).
        let errorBinding = "error";
        if (dataProp.shorthand === false && dataProp.value && dataProp.value.type === "Identifier") {
          errorBinding = `error: ${dataProp.value.name}Err`;
        }

        context.report({
          node: pattern,
          messageId: "missingError",
          fix(fixer) {
            // Insert ", error" (or ", error: <name>Err") before the closing brace.
            const lastProp = pattern.properties[pattern.properties.length - 1];
            const closeBrace = sourceCode.getTokenAfter(lastProp, (t) => t.value === "}");
            if (!closeBrace) return null;
            return fixer.insertTextAfter(lastProp, `, ${errorBinding}`);
          },
        });
      },
    };
  },
};
