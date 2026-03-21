# Skill Registry

**Orchestrator use only.** Read this registry once per session to resolve skill paths, then pass pre-resolved paths directly to each sub-agent's launch prompt. Sub-agents receive the path and load the skill directly — they do NOT read this registry.

## User Skills

| Trigger | Skill | Path |
|---------|-------|------|
| React components, Next.js pages, data fetching, bundle optimization, performance improvements | vercel-react-best-practices | D:\programacion\python\Stocks_prediction\.agents\skills\vercel-react-best-practices\SKILL.md |

## Project Conventions

| File | Path | Notes |
|------|------|-------|
| AGENTS.md | D:\programacion\python\Stocks_prediction\AGENTS.md | Index — React/Next.js best practices |
| PRD.md | D:\programacion\python\Stocks_prediction\STOXX-stocks\PRD.md | Project requirements and specifications |

## React/Next.js Rules (from AGENTS.md)

The following rules from AGENTS.md are available as individual files in `.agents/rules/`:

| Category | Rule Files |
|----------|------------|
| Async Patterns | async-defer-await, async-dependencies, async-parallel, async-suspense-boundaries, async-api-routes |
| Bundle Optimization | bundle-barrel-imports, bundle-conditional, bundle-defer-third-party, bundle-dynamic-imports, bundle-preload |
| Server Performance | server-auth-actions, server-cache-lru, server-cache-react, server-dedup-props, server-hoist-static-io, server-parallel-fetching, server-serialization, server-after-nonblocking |
| Client Data Fetching | client-event-listeners, client-localstorage-schema, client-passive-event-listeners, client-swr-dedup |
| Re-render Optimization | rerender-derived-state, rerender-derived-state-no-effect, rerender-defer-reads, rerender-dependencies, rerender-functional-setstate, rerender-lazy-state-init, rerender-memo, rerender-memo-with-default-value, rerender-move-effect-to-event, rerender-no-inline-components, rerender-simple-expression-in-memo, rerender-transitions, rerender-use-ref-transient-values |
| Rendering Performance | rendering-activity, rendering-animate-svg-wrapper, rendering-conditional-render, rendering-content-visibility, rendering-hoist-jsx, rendering-hydration-no-flicker, rendering-hydration-suppress-warning, rendering-resource-hints, rendering-script-defer-async, rendering-svg-precision, rendering-usetransition-loading |
| JavaScript Performance | js-batch-dom-css, js-cache-function-results, js-cache-property-access, js-cache-storage, js-combine-iterations, js-early-exit, js-flatmap-filter, js-hoist-regexp, js-index-maps, js-length-check-first, js-min-max-loop, js-set-map-lookups, js-tosorted-immutable |
| Advanced Patterns | advanced-event-handler-refs, advanced-init-once, advanced-use-latest |

Read the convention files listed above for project-specific patterns and rules. All referenced paths have been extracted — no need to read index files to discover more.
