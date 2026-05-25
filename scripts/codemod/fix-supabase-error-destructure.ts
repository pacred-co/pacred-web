/**
 * Codemod — Wave 19 Sprint A2 — §0c destructure-`error` sweep
 *
 * Rewrites `const { data } = await admin.from(...)...` → `const { data, error }
 * = await admin.from(...)...` AND inserts the matching error-handler block
 * before the existing null-guard. Three tiers (see docs/audit/supabase-error-
 * destructure-2026-05-26.md §"Fix patterns"):
 *
 *   HIGH   — admin/protected detail page · `notFound()` shape →
 *            console.error + throw (Next renders a real error boundary)
 *
 *   MEDIUM — server action · `return { ok: false, error: "not_found" }` shape
 *            → console.error + return `db_error:<code>` (distinct from miss)
 *
 *   LOW    — list/array · silent `(data ?? [])` shape →
 *            console.error only (no throw — degrade gracefully)
 *
 * Idempotent — re-running gives 0 diff.
 *
 * Skips:
 *   - destructure that already has `error`
 *   - non-Supabase awaits (not chained off `.from(...)` / `.rpc(...)` and root
 *     identifier isn't a recognised Supabase client name)
 *   - declarations in node_modules / .next / scripts/backfill / scripts/data /
 *     lib/supabase / test files / the 6 main-session manual-fix files
 *
 * Usage:
 *   pnpm tsx scripts/codemod/fix-supabase-error-destructure.ts [--dry-run] \
 *     [--file path/to/file.ts ...]
 *
 *   --dry-run            print diff per file but don't save
 *   --file <path>        operate on this file only (repeatable). When omitted,
 *                        sweeps actions/ + app/ + lib/.
 *   --report <path>      write json summary to <path>
 */
import {
  Project,
  Node,
  SyntaxKind,
  type SourceFile,
  type VariableDeclaration,
  type Identifier,
  type AwaitExpression,
  type CallExpression,
  type IfStatement,
  type ObjectBindingPattern,
  type BindingElement,
} from "ts-morph";
import { resolve, relative, join, sep } from "node:path";
import { existsSync, readdirSync, statSync } from "node:fs";

// ────────────────────────────────────────────────────────────────────────────
// Config
// ────────────────────────────────────────────────────────────────────────────

const ROOT = resolve(__dirname, "..", "..");

/** Directories the codemod sweeps when no --file is given. */
const SWEEP_ROOTS = ["actions", "app", "lib"];

/** Anything matching one of these substrings is skipped wholesale. */
const SKIP_PATH_FRAGMENTS = [
  `node_modules${sep}`,
  `.next${sep}`,
  // One-off scripts — OK to throw / no need for the §0c shape
  `scripts${sep}backfill${sep}`,
  `scripts${sep}data${sep}`,
  // The Supabase clients themselves — too low-level
  `lib${sep}supabase${sep}`,
  // Tests
  `.test.ts`,
  `.test.tsx`,
  `.spec.ts`,
  `.spec.tsx`,
  `__tests__${sep}`,
];

/**
 * Files the main session is fixing by hand — DO NOT touch.
 * Stored as path fragments (POSIX-style for portability).
 */
const MAIN_SESSION_MANUAL_FILES = [
  "actions/admin/forwarders.ts",
  "app/[locale]/(admin)/admin/freight/shipments/[id]/page.tsx",
  "actions/admin/customs-declarations.ts",
  "app/[locale]/(protected)/service-import/[fNo]/page.tsx",
  "app/[locale]/(admin)/admin/refunds/[id]/page.tsx",
  "actions/admin/wallet.ts",
];

/** A Supabase chain root looks like one of these identifiers / calls. */
const SUPABASE_ROOT_HINTS = [
  "admin",
  "supabase",
  "createAdminClient",
  "createClient",
  "sb",
  "client",
];

interface CodemodOptions {
  dryRun: boolean;
  files: string[];
  reportPath?: string;
}

interface PerFileResult {
  filePath: string;
  tierHigh: number;
  tierMedium: number;
  tierLow: number;
  skipped: number;
  alreadyOk: number;
  changed: boolean;
  errors: string[];
}

interface CodemodReport {
  filesScanned: number;
  filesChanged: number;
  filesSkippedManual: number;
  totalHigh: number;
  totalMedium: number;
  totalLow: number;
  totalSkipped: number;
  totalAlreadyOk: number;
  perFile: PerFileResult[];
}

// ────────────────────────────────────────────────────────────────────────────
// CLI parsing
// ────────────────────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): CodemodOptions {
  const opts: CodemodOptions = { dryRun: false, files: [] };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--file") opts.files.push(argv[++i]);
    else if (a === "--report") opts.reportPath = argv[++i];
    else if (a === "--help" || a === "-h") {
      console.log("usage: pnpm tsx scripts/codemod/fix-supabase-error-destructure.ts [--dry-run] [--file <path>...] [--report <path>]");
      process.exit(0);
    }
  }
  return opts;
}

// ────────────────────────────────────────────────────────────────────────────
// File discovery
// ────────────────────────────────────────────────────────────────────────────

function shouldSkipPath(p: string): boolean {
  const abs = resolve(p);
  for (const frag of SKIP_PATH_FRAGMENTS) {
    if (abs.includes(frag)) return true;
  }
  return false;
}

function isMainSessionFile(p: string): boolean {
  const rel = relative(ROOT, resolve(p)).split(sep).join("/");
  return MAIN_SESSION_MANUAL_FILES.includes(rel);
}

function* walkDir(dir: string): Generator<string> {
  if (!existsSync(dir)) return;
  for (const ent of readdirSync(dir)) {
    const full = join(dir, ent);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) {
      yield* walkDir(full);
    } else if (st.isFile() && (ent.endsWith(".ts") || ent.endsWith(".tsx"))) {
      yield full;
    }
  }
}

function discoverFiles(opts: CodemodOptions): string[] {
  if (opts.files.length) {
    return opts.files.map((f) => resolve(f));
  }
  const out: string[] = [];
  for (const root of SWEEP_ROOTS) {
    for (const f of walkDir(resolve(ROOT, root))) out.push(f);
  }
  return out;
}

// ────────────────────────────────────────────────────────────────────────────
// AST helpers
// ────────────────────────────────────────────────────────────────────────────

interface ChainInspect {
  isSupabase: boolean;
  isStorage: boolean;
  tableName: string | null;
}

/** Walk a chain rooted at `start` and decide if it's Supabase-y.
 *
 * Sets `isStorage=true` if the chain contains `.storage` — Storage operations
 * use a different error shape (`StorageError` has no `.code`) so the codemod
 * treats them as a separate tier (skip entirely).
 */
function walkChain(start: Node | undefined): ChainInspect & { isStorage: boolean } {
  let node = start;
  let isSupabase = false;
  let isStorage = false;
  let tableName: string | null = null;
  let depth = 0;

  while (node && depth < 30) {
    depth++;
    if (Node.isCallExpression(node)) {
      const callExpr = node as CallExpression;
      const callee = callExpr.getExpression();

      if (Node.isPropertyAccessExpression(callee)) {
        const methodName = callee.getName();
        if (methodName === "from") {
          isSupabase = true;
          const firstArg = callExpr.getArguments()[0];
          if (firstArg && Node.isStringLiteral(firstArg)) {
            tableName = firstArg.getLiteralValue();
          }
        } else if (methodName === "rpc") {
          isSupabase = true;
          const firstArg = callExpr.getArguments()[0];
          if (firstArg && Node.isStringLiteral(firstArg)) {
            tableName = `rpc:${firstArg.getLiteralValue()}`;
          }
        }
        node = callee.getExpression();
      } else if (Node.isIdentifier(callee)) {
        const id = (callee as Identifier).getText();
        if (SUPABASE_ROOT_HINTS.includes(id)) isSupabase = true;
        break;
      } else {
        node = callee;
      }
    } else if (Node.isPropertyAccessExpression(node)) {
      // `.storage` anywhere in the chain → Storage op, distinct error shape
      if (node.getName() === "storage") {
        isStorage = true;
      }
      node = node.getExpression();
    } else if (Node.isIdentifier(node)) {
      const id = (node as Identifier).getText();
      if (SUPABASE_ROOT_HINTS.includes(id)) isSupabase = true;
      break;
    } else if (Node.isParenthesizedExpression(node)) {
      node = node.getExpression();
    } else {
      break;
    }
  }

  return { isSupabase, isStorage, tableName };
}

function inspectSupabaseChain(awaitExpr: AwaitExpression): ChainInspect {
  const r = walkChain(awaitExpr.getExpression());
  return { isSupabase: r.isSupabase, isStorage: r.isStorage, tableName: r.tableName };
}

/**
 * For a `const { data } = await q;` pattern where the variable `q` is built
 * separately, walk back to the declaration of `q` in the same function scope
 * and check if its initializer chain looks Supabase-y.
 */
function inspectSupabaseVarRef(varName: string, decl: VariableDeclaration): ChainInspect {
  const scope = decl.getFirstAncestorByKind(SyntaxKind.Block)
            ?? decl.getFirstAncestorByKind(SyntaxKind.SourceFile);
  if (!scope) return { isSupabase: false, isStorage: false, tableName: null };
  let found: ChainInspect = { isSupabase: false, isStorage: false, tableName: null };
  scope.forEachDescendant((d, traversal) => {
    if (found.isSupabase) { traversal.stop(); return; }
    if (Node.isVariableDeclaration(d)) {
      const nm = d.getName();
      if (nm === varName) {
        const init = d.getInitializer();
        if (init) {
          const ci = walkChain(init);
          if (ci.isSupabase) found = { isSupabase: ci.isSupabase, isStorage: ci.isStorage, tableName: ci.tableName };
        }
      }
    }
  });
  return found;
}

interface DataBindingInfo {
  /** The string the consumer reads (e.g. "data" or "rowRaw"). */
  consumerName: string;
  /** What we'll name the error binding (e.g. "error" or "rowRawErr"). */
  errorName: string;
  /** True if the original was renamed (data: foo) — needs `error: fooErr` form. */
  renamed: boolean;
  /** The BindingElement node we're augmenting. */
  bindingElement: BindingElement;
}

/**
 * Look at an ObjectBindingPattern and decide if it has `data` (possibly
 * renamed) and lacks `error`. Returns null on skip (already-OK or no data).
 */
function inspectBindingPattern(pattern: ObjectBindingPattern): DataBindingInfo | null {
  let dataElem: BindingElement | null = null;
  let hasError = false;
  let renamed = false;
  let consumerName = "data";

  for (const elem of pattern.getElements()) {
    const propName = elem.getPropertyNameNode();
    const nameNode = elem.getNameNode();
    const propKey = propName ? propName.getText() : (Node.isIdentifier(nameNode) ? nameNode.getText() : null);

    if (propKey === "data") {
      dataElem = elem;
      if (propName) {
        // Pattern: `data: somethingElse`
        renamed = true;
        consumerName = Node.isIdentifier(nameNode) ? nameNode.getText() : "data";
      } else {
        renamed = false;
        consumerName = "data";
      }
    } else if (propKey === "error") {
      hasError = true;
    }
  }

  if (!dataElem || hasError) return null;

  // Pick a name for the error binding that won't clash in the enclosing scope.
  // Default: `error`. If renamed, default: `<dataName>Err`. The naming clash
  // resolution happens at the call site (we check `tryFindFreeName`).
  const errorName = renamed ? `${consumerName}Err` : "error";
  return { consumerName, errorName, renamed, bindingElement: dataElem };
}

/** Find a free identifier in the enclosing block, given a preferred name. */
function tryFindFreeName(preferred: string, decl: VariableDeclaration): string {
  const scope = decl.getFirstAncestorByKind(SyntaxKind.Block)
            ?? decl.getFirstAncestorByKind(SyntaxKind.SourceFile);
  if (!scope) return preferred;
  // Collect identifiers used in scope (cheap heuristic — get all Identifier nodes' text).
  const used = new Set<string>();
  scope.forEachDescendant((d) => {
    if (Node.isIdentifier(d)) used.add(d.getText());
  });
  let candidate = preferred;
  let suffix = 1;
  while (used.has(candidate)) {
    candidate = `${preferred}${suffix}`;
    suffix++;
    if (suffix > 99) break;
  }
  return candidate;
}

type Tier = "HIGH" | "MEDIUM" | "LOW";

interface TierDecision {
  tier: Tier;
  /** The IfStatement that contains the existing null-guard (HIGH/MEDIUM only). */
  nullGuard: IfStatement | null;
  missErrorLiteral: string | null;
}

/**
 * Classify the next significant statement after the `const { data } = ...`
 * declaration. Walks at most ~6 statements forward in the enclosing block.
 *
 * HIGH:    `if (!data) notFound();`  OR  `if (!data) return null;`
 * MEDIUM:  `if (!data) return { ok: false, error: "..." };`
 * LOW:     anything else (or no guard within window)
 */
function classifyTier(decl: VariableDeclaration, consumerName: string): TierDecision {
  const varStmt = decl.getFirstAncestorByKind(SyntaxKind.VariableStatement);
  if (!varStmt) return { tier: "LOW", nullGuard: null, missErrorLiteral: null };
  const parent = varStmt.getParent();
  if (!parent) return { tier: "LOW", nullGuard: null, missErrorLiteral: null };

  // Collect ALL statements in the parent block, filter to those after our var
  // statement, sort by start position.
  let siblings: Node[] = [];
  if (Node.isBlock(parent) || Node.isSourceFile(parent) || Node.isCaseClause(parent) || Node.isDefaultClause(parent) || Node.isModuleBlock(parent)) {
    siblings = parent.getChildSyntaxList()?.getChildren() ?? [];
    siblings = siblings.filter((s) => s.getStart() > varStmt.getStart());
  }

  // Look at the next ~6 statements
  for (let i = 0; i < Math.min(siblings.length, 6); i++) {
    const stmt = siblings[i];
    if (!Node.isIfStatement(stmt)) continue;

    const cond = stmt.getExpression();
    if (!Node.isPrefixUnaryExpression(cond)) continue;
    if (cond.getOperatorToken() !== SyntaxKind.ExclamationToken) continue;
    const operand = cond.getOperand();
    if (!Node.isIdentifier(operand)) continue;
    if ((operand as Identifier).getText() !== consumerName) continue;

    // Found `if (!consumerName) ...`. Inspect the body.
    const thenStmt = stmt.getThenStatement();
    const guardText = thenStmt.getText();

    if (/\bnotFound\s*\(\s*\)/.test(guardText)) {
      return { tier: "HIGH", nullGuard: stmt, missErrorLiteral: null };
    }
    if (/\breturn\s+null\s*;?/.test(guardText)) {
      return { tier: "HIGH", nullGuard: stmt, missErrorLiteral: null };
    }
    const medMatch = guardText.match(/return\s*\{\s*ok\s*:\s*false\s*,\s*error\s*:\s*["']([^"']+)["']\s*[,}]/);
    if (medMatch) {
      return { tier: "MEDIUM", nullGuard: stmt, missErrorLiteral: medMatch[1] };
    }
    if (/\bthrow\s+/.test(guardText)) {
      return { tier: "HIGH", nullGuard: stmt, missErrorLiteral: null };
    }
    return { tier: "LOW", nullGuard: null, missErrorLiteral: null };
  }

  return { tier: "LOW", nullGuard: null, missErrorLiteral: null };
}

// ────────────────────────────────────────────────────────────────────────────
// Transformation
// ────────────────────────────────────────────────────────────────────────────

/**
 * SitePlan stores POSITIONS (not Node references) so that we can apply edits
 * via plain-text string manipulation. ts-morph's mutation API invalidates
 * sibling Node references when one node is replaced — that crashes a multi-
 * site file.
 */
interface SitePlan {
  /** Line number of the declaration (for error reporting only). */
  declLine: number;
  /** Start position of the ObjectBindingPattern (`{ data }`) in the original source. */
  bindingStart: number;
  /** End position of the ObjectBindingPattern. */
  bindingEnd: number;
  /** Replacement text for the binding pattern (`{ data, error }`). */
  newBindingText: string;
  /** Where to insert the error-handler snippet (line-start position). */
  insertPos: number;
  /** Whether `insertPos` is a "before-line" insert (HIGH/MEDIUM) or "after-stmt" (LOW). */
  insertMode: "before-line" | "after-stmt";
  /** The text to insert (with leading indent already applied). */
  insertText: string;
  tier: Tier;
}

function buildErrorHandlerSnippet(tier: Tier, errVar: string, tableName: string): string {
  const tablePart = tableName || "supabase";

  if (tier === "HIGH") {
    const logCtx = `{ code: ${errVar}.code, message: ${errVar}.message, details: ${errVar}.details, hint: ${errVar}.hint }`;
    return [
      `if (${errVar}) {`,
      `  console.error(\`[${tablePart} lookup] failed\`, ${logCtx});`,
      `  throw new Error(\`Failed to load ${tablePart} (\${${errVar}.code ?? "unknown"}): \${${errVar}.message}\`);`,
      `}`,
    ].join("\n");
  }

  if (tier === "MEDIUM") {
    const logCtx = `{ code: ${errVar}.code, message: ${errVar}.message }`;
    return [
      `if (${errVar}) {`,
      `  console.error(\`[${tablePart} mutation lookup] failed\`, ${logCtx});`,
      `  return { ok: false, error: \`db_error:\${${errVar}.code ?? "unknown"}\` };`,
      `}`,
    ].join("\n");
  }

  // LOW — log only, never throw
  const logCtx = `{ code: ${errVar}.code, message: ${errVar}.message }`;
  return [
    `if (${errVar}) {`,
    `  console.error(\`[${tablePart} list] failed\`, ${logCtx});`,
    `}`,
  ].join("\n");
}

/** Compute the indentation (leading whitespace) of the line containing `pos`. */
function getLineIndent(sourceText: string, pos: number): string {
  let i = pos;
  while (i > 0 && sourceText[i - 1] !== "\n") i--;
  let indent = "";
  while (i < sourceText.length && (sourceText[i] === " " || sourceText[i] === "\t")) {
    indent += sourceText[i];
    i++;
  }
  return indent;
}

/**
 * Prepend `indent` to every non-empty line of `snippet`.
 * The snippet is written un-indented (column 0); the caller supplies the indent.
 */
function reindentSnippet(snippet: string, indent: string): string {
  return snippet
    .split("\n")
    .map((line) => (line.length === 0 ? line : indent + line))
    .join("\n");
}

/**
 * Build the new binding-pattern text from the existing one + the error binding.
 * Examples:
 *   `{ data }`         →  `{ data, error }`
 *   `{ data: foo }`    →  `{ data: foo, error: fooErr }`
 *   `{ data, count }`  →  `{ data, count, error }`
 */
function buildAugmentedBindingText(pattern: ObjectBindingPattern, binding: DataBindingInfo): string {
  const elements = pattern.getElements();
  const parts: string[] = elements.map((e) => e.getText());
  if (binding.renamed) {
    parts.push(`error: ${binding.errorName}`);
  } else {
    parts.push(`error`);
  }
  return `{ ${parts.join(", ")} }`;
}

/** Apply all planned transforms to a single source file. */
function transformFile(sf: SourceFile, dryRun: boolean): PerFileResult {
  const filePath = sf.getFilePath();
  const result: PerFileResult = {
    filePath,
    tierHigh: 0,
    tierMedium: 0,
    tierLow: 0,
    skipped: 0,
    alreadyOk: 0,
    changed: false,
    errors: [],
  };

  const origText = sf.getFullText();
  const plans: SitePlan[] = [];

  // 1) Collect all candidate sites by walking the AST ONCE. We capture
  //    everything we need as plain primitives (positions + strings) so that
  //    later AST mutations don't invalidate cross-plan references.
  sf.forEachDescendant((node) => {
    if (!Node.isVariableDeclaration(node)) return;
    const decl = node as VariableDeclaration;
    const nameNode = decl.getNameNode();
    if (!Node.isObjectBindingPattern(nameNode)) return;

    const init = decl.getInitializer();
    if (!init || !Node.isAwaitExpression(init)) return;
    const awaitExpr = init as AwaitExpression;

    const binding = inspectBindingPattern(nameNode);
    if (!binding) {
      const elements = nameNode.getElements();
      const hasData = elements.some((e) => {
        const pn = e.getPropertyNameNode();
        const nn = e.getNameNode();
        const k = pn ? pn.getText() : (Node.isIdentifier(nn) ? nn.getText() : null);
        return k === "data";
      });
      if (hasData) result.alreadyOk++;
      return;
    }

    // Is this a Supabase chain?
    const awaitInner = awaitExpr.getExpression();
    const chainInfo: ChainInspect = Node.isIdentifier(awaitInner)
      ? inspectSupabaseVarRef((awaitInner as Identifier).getText(), decl)
      : inspectSupabaseChain(awaitExpr);

    if (!chainInfo.isSupabase) {
      result.skipped++;
      return;
    }

    // Storage operations have a different error shape — `StorageError` has
    // only `name` + `message`, NO `.code`. Skip them; the engineer should
    // add an explicit handler.
    if (chainInfo.isStorage) {
      result.skipped++;
      return;
    }

    // Resolve a non-clashing error binding name.
    // If the preferred name is taken in scope, switch the binding to the
    // renamed form (`error: error1`) so the destructure key stays valid
    // Supabase shape AND the snippet refers to the correct local variable.
    const errorName = tryFindFreeName(binding.errorName, decl);
    if (errorName !== binding.errorName) {
      // Collision — force renamed form so the snippet's `error1.code` etc.
      // resolves to the new local var, not the outer `error`.
      binding.renamed = true;
      binding.errorName = errorName;
    }

    const tierDecision = classifyTier(decl, binding.consumerName);
    const tableName = chainInfo.tableName ?? "supabase";

    // Build the new binding text now (before any AST is invalidated).
    const newBindingText = buildAugmentedBindingText(nameNode, binding);
    const bindingStart = nameNode.getStart();
    const bindingEnd = nameNode.getEnd();

    // Build the snippet to insert.
    const snippet = buildErrorHandlerSnippet(tierDecision.tier, errorName, tableName);

    let insertPos: number;
    let insertMode: "before-line" | "after-stmt";
    let insertText: string;

    if ((tierDecision.tier === "HIGH" || tierDecision.tier === "MEDIUM") && tierDecision.nullGuard) {
      const guardStart = tierDecision.nullGuard.getStart();
      const indent = getLineIndent(origText, guardStart);
      const lineStart = guardStart - indent.length;
      insertPos = lineStart;
      insertMode = "before-line";
      insertText = reindentSnippet(snippet, indent) + "\n";
    } else {
      // LOW (or HIGH/MEDIUM with no matching guard found)
      const stmt = decl.getFirstAncestorByKind(SyntaxKind.VariableStatement);
      if (!stmt) {
        // Should never happen — declaration must be inside a statement.
        result.errors.push(`${decl.getStartLineNumber()}: no enclosing VariableStatement`);
        return;
      }
      const stmtEnd = stmt.getEnd();
      const indent = getLineIndent(origText, stmt.getStart());
      insertPos = stmtEnd;
      insertMode = "after-stmt";
      insertText = "\n" + reindentSnippet(snippet, indent);
    }

    plans.push({
      declLine: decl.getStartLineNumber(),
      bindingStart,
      bindingEnd,
      newBindingText,
      insertPos,
      insertMode,
      insertText,
      tier: tierDecision.tier,
    });
  });

  if (plans.length === 0) return result;

  // 2) Apply all edits to the raw text in REVERSE source order so earlier
  //    positions remain valid. Each plan contributes two edits:
  //      (a) replace the binding pattern text
  //      (b) insert the error-handler snippet
  //
  //    Edits are sorted by position descending; within a single site, the
  //    insertPos for HIGH/MEDIUM is AFTER bindingEnd (insertPos is at the
  //    start of the guard line, which comes after the binding) — so we apply
  //    insert FIRST, then binding-replace, both still going descending.

  interface RawEdit {
    pos: number;
    /** "replace" needs an endPos. "insert" only needs pos. */
    kind: "replace" | "insert";
    endPos?: number;
    text: string;
  }

  const edits: RawEdit[] = [];
  for (const p of plans) {
    edits.push({ kind: "insert", pos: p.insertPos, text: p.insertText });
    edits.push({ kind: "replace", pos: p.bindingStart, endPos: p.bindingEnd, text: p.newBindingText });
  }
  // Apply highest position first so earlier positions stay valid.
  // For two edits at the same position, "insert" comes first then "replace"
  // so the inserted text doesn't shift the replace boundaries.
  edits.sort((a, b) => {
    if (b.pos !== a.pos) return b.pos - a.pos;
    return a.kind === "insert" ? -1 : 1;
  });

  let newText = origText;
  for (const e of edits) {
    if (e.kind === "insert") {
      newText = newText.slice(0, e.pos) + e.text + newText.slice(e.pos);
    } else {
      newText = newText.slice(0, e.pos) + e.text + newText.slice(e.endPos!);
    }
  }

  for (const p of plans) {
    if (p.tier === "HIGH") result.tierHigh++;
    else if (p.tier === "MEDIUM") result.tierMedium++;
    else result.tierLow++;
  }
  result.changed = true;

  if (!dryRun) {
    sf.replaceWithText(newText);
    sf.saveSync();
  }

  return result;
}

// ────────────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const opts = parseArgs(process.argv);
  const allFiles = discoverFiles(opts);

  const project = new Project({
    tsConfigFilePath: resolve(ROOT, "tsconfig.json"),
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
  });

  const report: CodemodReport = {
    filesScanned: 0,
    filesChanged: 0,
    filesSkippedManual: 0,
    totalHigh: 0,
    totalMedium: 0,
    totalLow: 0,
    totalSkipped: 0,
    totalAlreadyOk: 0,
    perFile: [],
  };

  for (const f of allFiles) {
    if (shouldSkipPath(f)) continue;
    if (isMainSessionFile(f)) {
      report.filesSkippedManual++;
      continue;
    }
    report.filesScanned++;

    let sf: SourceFile;
    try {
      sf = project.addSourceFileAtPath(f);
    } catch (e) {
      console.error(`[skip] ${f}: ${(e as Error).message}`);
      continue;
    }

    const res = transformFile(sf, opts.dryRun);
    report.totalHigh += res.tierHigh;
    report.totalMedium += res.tierMedium;
    report.totalLow += res.tierLow;
    report.totalSkipped += res.skipped;
    report.totalAlreadyOk += res.alreadyOk;
    if (res.changed) {
      report.filesChanged++;
      report.perFile.push(res);
      console.log(`[changed] ${relative(ROOT, f).split(sep).join("/")}  H=${res.tierHigh}  M=${res.tierMedium}  L=${res.tierLow}`);
    }

    // Free the source file to keep memory usage sane on a 700-file sweep.
    project.removeSourceFile(sf);
  }

  console.log("\n────────────── Codemod summary ──────────────");
  console.log(`Files scanned:           ${report.filesScanned}`);
  console.log(`Files changed:           ${report.filesChanged}`);
  console.log(`Files skipped (manual):  ${report.filesSkippedManual}`);
  console.log(`HIGH transforms:         ${report.totalHigh}`);
  console.log(`MEDIUM transforms:       ${report.totalMedium}`);
  console.log(`LOW transforms:          ${report.totalLow}`);
  console.log(`Skipped (non-Supabase):  ${report.totalSkipped}`);
  console.log(`Already-OK (had error):  ${report.totalAlreadyOk}`);
  if (opts.dryRun) console.log("\n(dry-run — no files saved)");

  if (opts.reportPath) {
    const { writeFileSync } = await import("node:fs");
    writeFileSync(opts.reportPath, JSON.stringify(report, null, 2));
    console.log(`Report written: ${opts.reportPath}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
