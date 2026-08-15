/**
 * shadcn convention entry point for `cn`.
 *
 * Every component pulled from shadcn or 21st.dev imports `cn` from `@/lib/utils`,
 * so this path has to exist for a copy-paste to compile unedited. The
 * implementation lives in `@/lib/cn`; this re-exports it rather than duplicating,
 * so there is still exactly one definition.
 */
export { cn } from './cn';
