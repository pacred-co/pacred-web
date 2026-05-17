/**
 * Empty stand-in for the `server-only` build-time marker package.
 *
 * `lib/forwarder/billing-gate.ts` opens with `import "server-only"`. In a
 * Next.js build that specifier is resolved by the bundler; it is NOT an
 * installed npm package, so the `tsx` unit-test harness cannot resolve it
 * and the import throws MODULE_NOT_FOUND.
 *
 * `tsconfig.test.json` maps the `server-only` specifier to this file via
 * `compilerOptions.paths`, so the gate's real module graph loads unchanged
 * under `tsx`. Test-only infrastructure — production code never loads this.
 */
export {};
