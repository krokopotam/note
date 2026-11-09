/**
 * Single entry point for everything shared.
 *
 * The backend imports from here. The frontend imports `@note/shared/manifest` for
 * values and `@note/shared/schemas` as types only, which keeps zod out of the
 * browser bundle while both sides still share one definition of every contract.
 */
export * from './manifest.js';
export * from './schemas.js';
