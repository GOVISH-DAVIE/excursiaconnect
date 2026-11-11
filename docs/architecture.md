# Architecture and code conventions

How the code is layered once the backend exists, and the rules that keep it clean. Written on 11 November 2026 for branch `backend`; the phases and dates are in [backend-plan.md](backend-plan.md).

**The decisions:**
- **No Redux and no Redux-style global store** on the client. The prototype's single `useReducer` store and `dispatch(action)` from screens are retired, module by module.
- **TanStack Query** holds server data in the browser: fetching, caching, refetching, mutations and optimistic updates.
- **The Context API** holds only what is genuinely app-wide and is not server data: who is signed in, the current event, toasts.
- **Custom hooks** are the only way a screen gets data or changes it.
- **API calls are separate from the UI.** A component never calls `fetch`, a server action or Prisma.
- **The rules stay pure** in `src/lib` (M0.0) and run on the server. They are the business logic, not client state management.

## The layers

Each layer imports only from the layers below it. Lint enforces the boundaries.

```
 UI                 src/app/**/page.tsx, layout.tsx      server components: auth gate, prefetch, <HydrationBoundary>
                    src/components/**, route-local *.tsx  client components: render, call hooks, nothing else
   │ uses
 Feature hooks      src/features/<module>/hooks/*.ts      useQuery / useSuspenseQuery / useMutation wrappers,
                                                          invalidation, optimistic updates, error → message
   │ uses
 Query contracts    src/features/<module>/queries.ts      query keys, queryOptions, server cache tags
                                                          (no server-only or client-only imports: both sides use it)
   │ uses
 API client         src/features/<module>/api.ts          typed calls: GET route handlers for reads, server actions
                                                          for writes; returns DTOs; errors as ApiError
   │ calls over the network
 Server boundary    src/app/api/**/route.ts               reads for the client, webhooks, /api/v1 for the apps
                    src/server/<module>/actions.ts        'use server': session → Zod → service → updateTag → DTO
   │ calls
 Services           src/server/<module>/service.ts        commands (lock, load, apply the rule, save, audit, outbox)
                                                          and queries (per-viewer projections)
   │ uses
 Repositories       src/server/<module>/repo.ts           Prisma, and only here
 Rules              src/lib/**                            pure: types, rules, reducers; no React, Next or Prisma
 Contracts          src/features/<module>/schemas.ts      Zod schemas and DTO types, shared by the API client and
                                                          the server boundary
```

**Why this shape:**
- **Screens stay simple:** they render what a hook returns and call what a hook offers.
- **Every network detail lives in one file per module** (`api.ts`), so moving a read from a route handler to a server action, or adding the apps' API, never touches a screen.
- **The server boundary is thin:** it authenticates, validates and delegates. The decisions are made in services, by the same rule functions the prototype runs, so they can't drift.
- **Prisma appears in one layer.** A change of query, index or table never reaches a service's logic or a screen.

## Where state lives

| Kind of state | Where | Examples |
| --- | --- | --- |
| Server data | **TanStack Query** cache, keyed by the query contracts | an application, the review queue, meetings, the pipeline |
| App-wide session facts | **Context**, set once from the server in a layout | the signed-in user and role (`useSession`), the current event (`useCurrentEvent`) |
| UI-wide transient state | **Context** | toasts, a confirm dialog |
| Local UI state | `useState` / `useReducer` inside a component or hook | a form's draft, an open panel, a filter |
| Shareable UI state | the URL (search params) | the selected tab, filters, the open session |

**Server data never goes into Context.** A context holding fetched records re-renders everything below it on every change, and duplicates what the query cache already does.

## The pattern, worked end to end: assigning a reviewer

**1. Contracts, shared by both sides:** `src/features/dealroom/schemas.ts`

```ts
import { z } from "zod";

export const AssignReviewerInput = z.object({ appIds: z.array(z.string()).min(1), staffId: z.string() });
export type AssignReviewerInput = z.infer<typeof AssignReviewerInput>;

export type ApplicationSummary = { id: string; ref: string | null; org: string; status: string; assignee: string | null };
```

**2. Query contract:** `src/features/dealroom/queries.ts`

```ts
import { queryOptions } from "@tanstack/react-query";
import { dealRoomApi } from "./api";

export const applicationsQuery = {
  key: (eventId: string, filter: string) => ["dealroom", eventId, "applications", filter] as const,
  tag: (eventId: string) => `dealroom:${eventId}:applications`,
  options: (eventId: string, filter: string) =>
    queryOptions({ queryKey: applicationsQuery.key(eventId, filter), queryFn: () => dealRoomApi.listApplications(eventId, filter), staleTime: 15_000 }),
};
```

**3. API client, the only file that knows the network:** `src/features/dealroom/api.ts`

```ts
import { assignReviewerAction } from "@/server/dealroom/actions";
import { getJson, unwrap } from "@/features/http";
import type { ApplicationSummary, AssignReviewerInput } from "./schemas";

export const dealRoomApi = {
  listApplications: (eventId: string, filter: string) =>
    getJson<ApplicationSummary[]>(`/api/dealroom/${eventId}/applications?filter=${encodeURIComponent(filter)}`),
  assignReviewer: async (input: AssignReviewerInput) => unwrap(await assignReviewerAction(input)),
};
```

`unwrap` turns a server action's `{ ok: false, refusal }` into a thrown `ApiError` carrying the rule's own reason, such as "Your role cannot assign reviewers".

**4. The custom hook a screen uses:** `src/features/dealroom/hooks/use-assign-reviewer.ts`

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { dealRoomApi } from "../api";
import { applicationsQuery } from "../queries";

export function useAssignReviewer(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: dealRoomApi.assignReviewer,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dealroom", eventId, "applications"] }),
  });
}
```

**5. The screen renders and calls the hook, nothing else:**

```tsx
"use client";
export function AssignButton({ eventId, appIds, staffId }: Props) {
  const assign = useAssignReviewer(eventId);
  return (
    <>
      <button disabled={assign.isPending} onClick={() => assign.mutate({ appIds, staffId })}>Assign</button>
      {assign.error && <p role="alert">{assign.error.message}</p>}
    </>
  );
}
```

**6. The server boundary, thin:** `src/server/dealroom/actions.ts`

```ts
"use server";
import { updateTag } from "next/cache";
import { requireSession } from "@/server/auth/session";
import { AssignReviewerInput } from "@/features/dealroom/schemas";
import { applicationsQuery } from "@/features/dealroom/queries";
import { dealRoomService } from "./service";

export async function assignReviewerAction(raw: unknown) {
  const session = await requireSession({ staff: true });
  const input = AssignReviewerInput.parse(raw);
  const result = await dealRoomService.assignReviewer(session, input);
  if (result.ok) updateTag(applicationsQuery.tag(session.eventId));
  return result;
}
```

**7. The service runs the rule:** `src/server/dealroom/service.ts`

```ts
import "server-only";
export const dealRoomService = {
  assignReviewer: (session: Session, input: AssignReviewerInput) =>
    runCommand(session, session.eventId, { type: "dr/assign", appIds: input.appIds, staffId: input.staffId }),
};
```

`runCommand` is the one place the write pipeline lives (backend-plan.md, "How a write runs on the server"). It:
1. checks ownership of every record named
2. takes the per-event lock
3. loads the aggregate through the repository
4. calls `apply(state, action, ctx)` from `src/lib/core/reducer`, with the actor taken from the session
5. saves only the changed records, the audit entry and the outbox
6. returns `{ ok: true, data }` or `{ ok: false, refusal }`

Action objects exist only inside services. The client never sends one.

**8. The page prefetches on the server, so the first paint has data:** `src/app/dealroom/applications/page.tsx`

```tsx
export default function Page() {
  return (
    <Suspense fallback={<QueueSkeleton />}>
      <QueueData />
    </Suspense>
  );
}

async function QueueData() {
  const session = await requireSession({ staff: true });
  const queryClient = new QueryClient();
  void queryClient.prefetchQuery({ ...applicationsQuery.options(session.eventId, "all"), queryFn: () => dealRoomQueries.listApplications(session, "all") });
  return (
    <HydrationBoundary state={dehydrate(queryClient, { shouldDehydrateQuery: (q) => defaultShouldDehydrateQuery(q) || q.state.status === "pending" })}>
      <Queue />
    </HydrationBoundary>
  );
}
```

The prefetch calls the service query directly rather than going over HTTP. The client hook, `useSuspenseQuery(applicationsQuery.options(...))`, then reads the same key. Per-viewer data is dynamic (it reads the session), so the standard `dehydrate` is right here. Cached public data uses the Next guide's prerenderable hydration helper instead, because `dehydrate()` reads the clock during a prerender.

## Context providers

Mounted once in `src/app/providers.tsx`, a client component used by the root layout:

- **`QueryProvider`:** a new `QueryClient` for each server render, one shared client in the browser (the Next guide's pattern). Defaults: `staleTime` 15 s, one retry, no refetch on window focus for staff screens that poll (the live board sets its own interval).
- **`SessionProvider`:** the signed-in user, their role and which persona screens to show, read once on the server and passed down. Exposes `useSession()`. It holds no records.
- **`EventProvider`:** the current event's id, name, dates and enabled modules. Exposes `useCurrentEvent()`.
- **`ToastProvider`:** `useToast()` for confirmations and refusals that need no inline place.

Each context has its own file, a typed `use…` hook that throws outside its provider, and a value memoised so consumers re-render only when it changes.

## Clean code rules

**Boundaries, enforced by ESLint (`no-restricted-imports`):**
- `src/components/**` and client `*.tsx` may not import `@/server/**`, `@prisma/client`, `@/features/*/api` or `next/headers`. They use hooks.
- `src/features/**` may not import `@/server/**/service`, `@/server/**/repo` or `@prisma/client`. The API client may import server actions only.
- `src/lib/**` may not import `react`, `next/*`, `@prisma/client` or `@/server/**`.
- `@prisma/client` is imported only in `src/server/**/repo.ts` and `src/server/db.ts`.
- Every file under `src/server/**` starts with `import "server-only"`, except `actions.ts`, which starts with `"use server"`.

**Components:**
- One component per file, named for what it shows.
- No data fetching and no business rules: a rule the UI needs (for example "why can't this be submitted?") is a pure function in `src/lib`, called through a hook or a selector.
- Props are typed. No `any`.
- A component over about 150 lines is split.

**Hooks:**
- Named `useNoun` for reads (`useApplication`) and `useVerbNoun` for writes (`useSubmitApplication`).
- Each returns the query or mutation result as it is, so screens get `isPending`, `error` and `data` the same way everywhere.
- Query keys come only from the query contracts, never written inline.

**Server:**
- Server actions and route handlers stay under about 20 lines: session, parse, service, invalidate, return.
- Services return `{ ok: true, data } | { ok: false, refusal }`, never Prisma models. DTOs are mapped in the service.
- Refusal text comes from the rules (`apply()`), so the screen shows exactly what the rule says.

**Errors:**
- Expected refusals are values, not exceptions, until `unwrap` turns them into `ApiError` for the hook.
- Unexpected errors throw, reach the nearest error boundary, and are logged on the server without personal data.

**Naming and files:**
- kebab-case files.
- PascalCase components and types; camelCase functions.
- Module folders mirror the domain: `dealroom`, `expo`, `events`, `registration`, `scanning`, `identity`.

**Tests:**
- Rules: Vitest on `src/lib` (already in place, `npm test`).
- Services: Vitest against a test PostgreSQL, one transaction per test, rolled back.
- Hooks and screens: Vitest with React Testing Library, the API client mocked at the module boundary.
- End to end: Playwright for each milestone's "done when", on a phone size and a laptop size.

## Moving off the prototype's store

The prototype's screens read `useStore()` / `useDr()` and call `dispatch`. They move to the feature hooks **one module at a time, in that module's milestone**. A screen is either on the server or on the prototype store, never half of each. When a module's last screen moves, its slice leaves the prototype store. When the last module moves, `src/lib/store.tsx` and localStorage go, and only `src/lib`'s rules remain from the prototype.
