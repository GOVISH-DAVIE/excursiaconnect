# Architecture and code conventions

How the code is laid out and layered now that the backend is its own process, and the rules that keep it clean. Written on 11 November 2026 for branch `backend`; revised the same day when the API moved out of Next.js into Express. The phases and dates are in [backend-plan.md](backend-plan.md), the servers in [deploy.md](deploy.md).

**The decisions:**
- **The API is Express, separate from Next.js.** It runs as its own Node process on its own subdomain (`api.example.co.ke`) and is the only thing that talks to PostgreSQL. Next.js serves the UI and nothing else: no server actions that write, no route handlers with data, no Prisma.
- **One repository, npm workspaces:** the web app, the API and three shared packages, so the rules and the request shapes are written once.
- **No Redux and no Redux-style global store** on the client. The prototype's single `useReducer` store and `dispatch(action)` from screens are retired, module by module.
- **TanStack Query** holds server data in the browser: fetching, caching, refetching, mutations and optimistic updates.
- **The Context API** holds only what is genuinely app-wide and is not server data: who is signed in, the current event, toasts.
- **Custom hooks** are the only way a screen gets data or changes it.
- **API calls are separate from the UI.** A component never calls `fetch`. One API client per module knows the network.
- **The rules stay pure** in `packages/domain` (M0.0). The API runs them for every write; the browser may run the same functions to explain a refusal before it happens.

## The repository

```
apps/
  web/                 @excursia/web        Next.js 16: pages, components, hooks, the API client. No database.
  api/                 @excursia/api        Express 5: routes, services, repositories; later the job worker.
packages/
  domain/              @excursia/domain     the rules: types, reducers, apply(), Ctx. Pure TypeScript.
  contracts/           @excursia/contracts  Zod schemas and the DTO types inferred from them: what crosses the wire.
  db/                  @excursia/db         the Prisma schema, migrations and client (createDb).
scripts/db/            setting up PostgreSQL locally
docs/                  this plan, the architecture, the deploy guide
```

**Who may import whom** (ESLint's `no-restricted-imports` in `eslint.config.mjs` checks it on every lint):

| Workspace | May import | May not import |
| --- | --- | --- |
| `apps/web` | `@excursia/domain`, `@excursia/contracts` | `@excursia/db`, `@prisma/*`, `pg`, `express` |
| `apps/api` | all three packages | `react`, `next` |
| `packages/domain` | nothing of ours | `react`, `next`, `@excursia/db`, `@prisma/*`, `express` |
| `packages/contracts` | `zod` | everything else of ours |
| `packages/db` | Prisma, `pg` | the other packages |

The packages are TypeScript source with no build step of their own. Next.js compiles them with the web app (Turbopack transpiles workspace packages); the API's build (`apps/api/scripts/build.mjs`) bundles them into one file; Vitest and `tsx` read them directly.

## The layers

Each layer imports only from the layers below it.

```
 apps/web
 UI                 src/app/**/page.tsx, layout.tsx       server components: read the session cookie, prefetch, <HydrationBoundary>
                    src/components/**, route-local *.tsx   client components: render, call hooks, nothing else
   │ uses
 Feature hooks      src/features/<module>/hooks/*.ts       useQuery / useSuspenseQuery / useMutation wrappers,
                                                           invalidation, optimistic updates, error → message
   │ uses
 Query contracts    src/features/<module>/queries.ts       query keys and queryOptions (both server and client use them)
   │ uses
 API client         src/features/<module>/api.ts           typed fetch calls to the API; parses responses with the
                    src/features/http.ts                   contracts; turns an ErrorBody into an ApiError
   │
   │ HTTPS, cookie included ── api.example.co.ke ─────────────────────────────────────────────────────────────
   ▼
 apps/api           src/modules/<module>/
 Routes             <module>.routes.ts                     paths and middleware (session guard), each pointing at a
                                                           controller handler; no logic
 Controllers        <module>.controller.ts                 HTTP in and out: params, query and body parsed with the
                                                           contract, call the service, status and JSON
 Services           <module>.service.ts                    commands (lock, load, apply the rule, save, audit, outbox)
                                                           and queries (per-viewer projections, DTOs); no req or res
 Repositories       <module>.repo.ts                       Prisma, and only here
 Assembly           index.ts                               repo → service → controller → routes; app.ts mounts it
   │
 packages
 Rules              @excursia/domain                       pure: types, rules, reducers, apply(state, action, ctx)
 Contracts          @excursia/contracts                    Zod schemas and DTO types, shared by web and api
 Database           @excursia/db                           schema, migrations, createDb()
```

**Why this shape:**
- **Screens stay simple:** they render what a hook returns and call what a hook offers.
- **Every network detail lives in one file per module** (`api.ts`). The Flutter apps and any other client call the same routes.
- **Routes say where, controllers say how HTTP looks, services decide.**
  - A routes file reads as the module's table of endpoints.
  - A controller is the only code that touches `req` and `res`.
  - The decisions are made in services, by the same rule functions the prototype runs, so they can't drift. Services are tested without HTTP.
- **Prisma appears in one layer of one process.** A change of query, index or table never reaches a service's logic, and never reaches the web app at all.
- **The web app holds no secrets.** It has no database URL and no payment keys; if it were compromised, the API's checks still stand between it and the data.

## The API process

`apps/api/src`, as it stands after the restructure:

- **`config.ts`** reads the environment once with Zod and stops the process on a bad value, naming the variable but never printing its value. Production requires https web origins and a cookie domain.
- **`app.ts`** builds the Express app from its dependencies (`createApp({ config, db })`), so tests make one against the test database without starting a server. In order:
  1. `trust proxy` = loopback (nginx on the same machine)
  2. helmet, with a deny-everything Content-Security-Policy, since the API only ever returns JSON
  3. CORS for the web app's origins only, with credentials
  4. `express.json` with a 100 kB limit
  5. the routers
  6. the 404 handler
  7. the error handler
- **`server.ts`** opens one database pool, listens on `127.0.0.1:4000`, and drains open requests on SIGTERM before closing the pool (blue/green, deploy.md).
- **`http/errors.ts`** holds `HttpError` and the error handler. Every failure leaves as an `ErrorBody` from `@excursia/contracts/http`:

  ```json
  { "error": { "code": "conflict", "message": "That table is already booked at 10:00" } }
  ```

  A Zod failure becomes `bad_request`, with the paths of the wrong fields (never their values). A body over 100 kB is `payload_too_large`, and malformed JSON is `bad_request`. Anything else is a bug: it is logged with the method and path only, and the browser gets `internal` with no detail.
- **`modules/health/`** is the first module, and the pattern every other one follows:

  | File | What it does |
  | --- | --- |
  | `health.routes.ts` | `GET /live` and `GET /ready`, each naming its controller handler |
  | `health.controller.ts` | `live` answers 200; `ready` asks the service and answers 200 or 503, never cached |
  | `health.service.ts` | `databaseAnswers()`: the repo's ping within 2 s, else down |
  | `health.repo.ts` | `ping()`: `SELECT 1` |
  | `index.ts` | `healthModule({ db })` builds the four and returns the router; `app.ts` mounts it at `/health` |

  `apps/api/tests/health.test.ts` tests each layer with a stand-in for the one below: the controller with a fake service, the service with a fake repo.

Every module has the same five files in `src/modules/<module>/`, and is mounted in `app.ts` under `/v1/<module>`. Each layer is a factory that takes the layer below (`createXController(service)`), with no module-level singletons, so tests can swap any layer.

## Sessions and cookies across the two subdomains

The site is `events.example.co.ke` (Next.js), and the API is `api.example.co.ke` (Express). Both are subdomains of one registrable domain, so they are the **same site** but **different origins**.

- **The session cookie is set by the API** at sign-in (M0.4).
  - Attributes: `HttpOnly; Secure; SameSite=Lax; Domain=.example.co.ke; Path=/`.
  - The browser sends it to the API and to the web app.
  - The cookie holds an opaque session id. The session itself lives in PostgreSQL.
- **The browser calls the API with `credentials: "include"`.** CORS on the API allows exactly the origins in `WEB_ORIGINS`, with credentials. Any other origin gets no CORS headers, so its scripts cannot read the response.
- **CSRF.** SameSite does not separate sibling subdomains, so the API checks two more things on every write (from M0.4):
  - The `Origin` header must be one of `WEB_ORIGINS`.
  - The body must be `application/json`. That content type forces a preflight that other origins fail.
- **Server components** can see the cookie, because it is scoped to the parent domain. A page's server component:
  1. reads the cookie with `cookies()`
  2. calls the API over loopback (`API_INTERNAL_URL`, `http://127.0.0.1:4000`), forwarding the cookie and the visitor's address in `X-Forwarded-For`
  3. prefetches into TanStack Query

  The API trusts forwarded headers only from loopback.
- **Locally**, the web app runs on `localhost:3010` and the API on `localhost:4000`. These are the same site too: cookies ignore ports. So the same rules hold without a domain on the cookie.

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

**1. Contracts, shared by both sides:** `packages/contracts/src/dealroom.ts`

```ts
import { z } from "zod";

export const AssignReviewerInput = z.object({ appIds: z.array(z.string()).min(1).max(200), staffId: z.string() });
export type AssignReviewerInput = z.infer<typeof AssignReviewerInput>;

export const ApplicationSummary = z.object({ id: z.string(), ref: z.string().nullable(), org: z.string(), status: z.string(), assignee: z.string().nullable() });
export type ApplicationSummary = z.infer<typeof ApplicationSummary>;
```

**2. The routes, a table of endpoints:** `apps/api/src/modules/dealroom/dealroom.routes.ts`

```ts
import { Router } from "express";
import { requireSession } from "../../http/session";
import type { DealRoomController } from "./dealroom.controller";

export function dealRoomRoutes(c: DealRoomController): Router {
  const r = Router();
  r.get("/:eventId/applications", requireSession({ staff: true }), c.listApplications);
  r.post("/:eventId/applications/assign", requireSession({ staff: true }), c.assignReviewer);
  return r;
}
```

`requireSession` is middleware. It loads the session from the cookie, checks the role and that the session belongs to `:eventId`, and puts it on `res.locals.session`.

**3. The controller, HTTP in and out:** `apps/api/src/modules/dealroom/dealroom.controller.ts`

```ts
import type { RequestHandler } from "express";
import { AssignReviewerInput, EventParams } from "@excursia/contracts/dealroom";
import type { DealRoomService } from "./dealroom.service";

export function createDealRoomController(service: DealRoomService) {
  return {
    assignReviewer: (async (req, res) => {
      const { eventId } = EventParams.parse(req.params);
      const input = AssignReviewerInput.parse(req.body); // a ZodError becomes 400 bad_request
      res.json(await service.assignReviewer(res.locals.session, eventId, input)); // a refusal throws HttpError("conflict", reason)
    }) satisfies RequestHandler,
    // listApplications: …
  };
}
export type DealRoomController = ReturnType<typeof createDealRoomController>;
```

Express 5 passes a rejected promise to the error handler by itself, so controllers have no try/catch.

**4. The service runs the rule:** `apps/api/src/modules/dealroom/dealroom.service.ts`

```ts
export function createDealRoomService(repo: DealRoomRepo) {
  return {
    assignReviewer: (session: Session, eventId: string, input: AssignReviewerInput) =>
      runCommand(repo, session, eventId, { type: "dr/assign", appIds: input.appIds, staffId: input.staffId }),
  };
}
```

`runCommand` is the one place the write pipeline lives (backend-plan.md, "How a write runs on the server"). It:
1. checks ownership of every record named
2. takes the per-event lock
3. loads the aggregate through the repository
4. calls `apply(state, action, ctx)` from `@excursia/domain/core/reducer`, with the actor taken from the session
5. saves only the changed records, the audit entry and the outbox
6. returns the DTO, or throws `HttpError("conflict", refusal.reason)`

Action objects exist only inside services. The client never sends one.

**5. Query contract:** `apps/web/src/features/dealroom/queries.ts`

```ts
import { queryOptions } from "@tanstack/react-query";
import { dealRoomApi } from "./api";

export const applicationsQuery = {
  key: (eventId: string, filter: string) => ["dealroom", eventId, "applications", filter] as const,
  options: (eventId: string, filter: string) =>
    queryOptions({ queryKey: applicationsQuery.key(eventId, filter), queryFn: () => dealRoomApi.listApplications(eventId, filter), staleTime: 15_000 }),
};
```

**6. API client, the only file that knows the network:** `apps/web/src/features/dealroom/api.ts`

```ts
import { z } from "zod";
import { ApplicationSummary, type AssignReviewerInput } from "@excursia/contracts/dealroom";
import { http } from "@/features/http";

export const dealRoomApi = {
  listApplications: (eventId: string, filter: string) =>
    http.get(`/v1/dealroom/${eventId}/applications`, { query: { filter }, schema: z.array(ApplicationSummary) }),
  assignReviewer: (eventId: string, input: AssignReviewerInput) =>
    http.post(`/v1/dealroom/${eventId}/applications/assign`, { body: input, schema: z.array(ApplicationSummary) }),
};
```

`http` (`src/features/http.ts`) works out the base URL and sends the cookie:
- In the browser it uses `NEXT_PUBLIC_API_URL` (`https://api.example.co.ke`) with `credentials: "include"`.
- On the server it uses `API_INTERNAL_URL`, with the cookie forwarded.

It parses a success with the given schema. It turns an `ErrorBody` into a thrown `ApiError` that carries the code and the rule's own message, such as "Your role cannot assign reviewers".

**7. The custom hook a screen uses:** `apps/web/src/features/dealroom/hooks/use-assign-reviewer.ts`

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { dealRoomApi } from "../api";

export function useAssignReviewer(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AssignReviewerInput) => dealRoomApi.assignReviewer(eventId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dealroom", eventId, "applications"] }),
  });
}
```

**8. The screen renders and calls the hook, nothing else:**

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

**9. The page prefetches on the server, so the first paint has data:** `apps/web/src/app/dealroom/applications/page.tsx`

```tsx
export default function Page() {
  return (
    <Suspense fallback={<QueueSkeleton />}>
      <QueueData />
    </Suspense>
  );
}

async function QueueData() {
  const eventId = await currentEventId(); // from the session, via the API
  const queryClient = new QueryClient();
  void queryClient.prefetchQuery(applicationsQuery.options(eventId, "all")); // http forwards the cookie on the server
  return (
    <HydrationBoundary state={dehydrate(queryClient, { shouldDehydrateQuery: (q) => defaultShouldDehydrateQuery(q) || q.state.status === "pending" })}>
      <Queue />
    </HydrationBoundary>
  );
}
```

The prefetch makes the same API call the browser would, over loopback, and the client hook reads the same key. Data is per viewer (the API reads the session), so pages that prefetch are dynamic, and the standard `dehydrate` is right. Public pages, such as an event's landing page, fetch without a cookie and may be cached.

## Context providers

Mounted once in `apps/web/src/app/providers.tsx`, a client component used by the root layout:

- **`QueryProvider`:** a new `QueryClient` for each server render, one shared client in the browser (the Next guide's pattern).
  - `staleTime` 15 s and one retry.
  - No refetch on window focus for staff screens that poll; the live board sets its own interval.
- **`SessionProvider`:** the signed-in user, their role and which persona screens to show.
  - Fetched once on the server from the API's `/v1/session` and passed down.
  - Exposes `useSession()`. It holds no records.
- **`EventProvider`:** the current event's id, name, dates and enabled modules. Exposes `useCurrentEvent()`.
- **`ToastProvider`:** `useToast()` for confirmations and refusals that need no inline place.

Each context has its own file, a typed `use…` hook that throws outside its provider, and a value memoised so consumers re-render only when it changes.

## Clean code rules

**Boundaries:** the table under "The repository", checked by ESLint. Within `apps/web`, also:
- `src/components/**` and client `*.tsx` may not import `@/features/*/api`. They use hooks.
- Only `src/features/http.ts` calls `fetch`.

**Components:**
- One component per file, named for what it shows.
- No data fetching and no business rules. A rule the UI needs (for example "why can't this be submitted?") is a pure function in `@excursia/domain`, called through a hook or a selector.
- Props are typed. No `any`.
- A component over about 150 lines is split.

**Hooks:**
- Named `useNoun` for reads (`useApplication`) and `useVerbNoun` for writes (`useSubmitApplication`).
- Each returns the query or mutation result as it is, so screens get `isPending`, `error` and `data` the same way everywhere.
- Query keys come only from the query contracts, never written inline.

**API:**
- Each module is `<module>.routes.ts`, `.controller.ts`, `.service.ts` and `.repo.ts`, plus an `index.ts` that assembles them.
  - Every layer is built from the one below, with no module-level singletons, so tests swap any layer.
- Each layer imports only the one below it. ESLint checks this:
  - A routes file may not import a service or a repo.
  - A controller may not import a repo.
  - Only repos import `@excursia/db` values; others may import its types.
- A routes file holds paths and middleware only. A handler written inline in a routes file is a review comment.
- A controller handler stays under about 15 lines: parse, call the service, respond.
  - It is the only code that reads `req` or writes `res`.
  - Services never see either.
- Every path parameter, query string and request body is parsed with its contract in the controller before use.
- Services return DTOs from `@excursia/contracts`, never Prisma models.
- Expected refusals throw `HttpError("conflict", reason)`, with the reason from the rules (`apply()`), so the screen shows exactly what the rule says.
- Unexpected errors throw. The error handler logs them without personal data and answers `internal`.
- The process never reads `process.env` outside `config.ts`.

**Naming and files:**
- kebab-case files.
- PascalCase components and types; camelCase functions.
- Module folders mirror the domain, on both sides: `dealroom`, `expo`, `events`, `registration`, `scanning`, `identity`.

**Tests**, all run by `npm test` at the root (one Vitest run):
- **Rules:** `packages/domain/tests`. In place: 183 tests.
- **The database's own guarantees:** `packages/db/tests`, as the app role against the test database. In place.
- **The API:** `apps/api/tests`. The real app on a random port: health, CORS, error shapes and settings are in place. Each module adds its routes, with service tests against the test PostgreSQL, one transaction per test, rolled back.
- **Hooks and screens:** Vitest with React Testing Library, the API client mocked at the module boundary.
- **End to end:** Playwright for each milestone's "done when", on a phone size and a laptop size, with both processes running.

## Moving off the prototype's store

The prototype's screens read `useStore()` / `useDr()` and call `dispatch`. They move to the feature hooks **one module at a time, in that module's milestone**.
- A screen is either on the API or on the prototype store, never half of each.
- When a module's last screen moves, its slice leaves the prototype store.
- When the last module moves, `apps/web/src/lib/store.tsx` and localStorage go. Only the rules in `packages/domain` remain from the prototype.
