# RenderLite — Frontend

**Presenter:** Sushmita
**Section:** Frontend Dashboard (User Interface & Real-time Experience)
**Time suggestion:** 4–5 minutes

---

## 1. Opening line

> "Everything you see when you log in to RenderLite — the dashboard, projects, deployments, live logs, and live CPU/RAM graphs — is the frontend. It is the **single window** through which a developer talks to our entire platform."

---

## 2. What the Frontend is responsible for

The frontend is the **control panel** of the PaaS. Its job is to make a complex backend feel as simple as a few clicks.

Concretely, the frontend handles:

1. **Authentication UX** – GitHub OAuth login, JWT storage, protected routes.
2. **Project & Service management** – create projects, register services, link a GitHub repo.
3. **Triggering deployments** – the “Deploy” button that fires the entire backend pipeline.
4. **Real-time observability** – live deployment logs and live container metrics over WebSockets.
5. **Service navigation** – list of projects → list of services → service details → deployment history.
6. **Polished UX** – animations, route progress bar, toast notifications, dark theme.

---

## 3. Tech stack used (Frontend only)

| Layer              | Tool / Library                              |
| ------------------ | ------------------------------------------- |
| Framework          | **React 18**                                |
| Build tool         | **Vite 5**                                  |
| Language           | **TypeScript**                              |
| Styling            | **TailwindCSS 3**                           |
| Routing            | **React Router v6**                         |
| Server state       | **TanStack React Query**                    |
| HTTP client        | **Axios**                                   |
| Real-time          | **socket.io-client**                        |
| Forms & validation | **React Hook Form** + **Zod**               |
| UI primitives      | **Radix UI** (Tabs, Dropdown, Tooltip, etc.)|
| Icons              | **Lucide React**                            |
| Charts (CPU/RAM)   | **Recharts**                                |
| Animations         | **Framer Motion**                           |
| Notifications      | **Sonner** (toasts) + **NProgress**         |
| Command palette    | **cmdk**                                    |

> Located in `packages/frontend/` — a separate workspace package built as a Single-Page Application.

---

## 4. Application structure (what to point at)

```
packages/frontend/src/
├── pages/
│   ├── Login.tsx              ← GitHub OAuth entry
│   ├── AuthCallback.tsx       ← receives JWT after OAuth
│   ├── Dashboard.tsx          ← overview cards + recent deploys
│   ├── Projects.tsx           ← all projects
│   ├── ProjectDetail.tsx      ← services inside a project
│   ├── ServiceDetail.tsx      ← live metrics, env vars, deploys
│   ├── DeploymentDetail.tsx   ← live build logs (WebSocket)
│   ├── Organizations.tsx
│   └── OrgDetail.tsx
├── components/                 ← Layout, AnimatedCard, Skeleton, Tooltip…
├── contexts/AuthContext.tsx    ← user/token/login/logout
├── api/
│   ├── client.ts               ← Axios instance + REST endpoints
│   └── socket.ts               ← Socket.io connection
└── App.tsx                     ← Routes + ProtectedRoute guard
```

---

## 5. Authentication flow (UX side)

What happens from the user's perspective:

1. User lands on `/login` and clicks **Continue with GitHub**.
2. They are redirected to GitHub OAuth.
3. GitHub redirects back to our backend → backend mints a **JWT**.
4. Backend redirects to our `/auth/callback?token=…` page.
5. Frontend stores the token in `localStorage`, calls `/auth/me`, populates `AuthContext`.
6. From now on, every API request sends `Authorization: Bearer <jwt>`.
7. `<ProtectedRoute>` blocks access to any page if the user is not authenticated.

> Show snippet from `App.tsx` (`ProtectedRoute`) and `contexts/AuthContext.tsx` if asked.

---

## 6. How the frontend talks to the backend

We use **two channels**, depending on the type of data:

### a) REST (request / response) — via Axios

For everything **transactional**:

* `GET /api/projects`, `POST /api/projects`
* `GET /api/services/:id`, `POST /api/deployments`
* `GET /api/metrics/overview`

Wrapped in **React Query** so we get caching, refetching, loading states, and optimistic UI for free.

### b) WebSockets (push) — via Socket.io

For everything **live**:

* `deployment:log` → live build/deploy logs streamed line-by-line.
* `deployment:status` → status transitions (QUEUED → BUILDING → SUCCESS / FAILED).
* `service:status` → service is now RUNNING / STOPPED / FAILED.
* `service:metrics` → CPU %, memory %, network RX/TX every 5 seconds.

Frontend `subscribe`s to the right room (`deployment:<id>` or `service:<id>`) and renders updates as they arrive.

---

## 7. Key screens to demo

1. **Dashboard** (`Dashboard.tsx`)

   * Stat cards: Projects / Services / Running / Deployments.
   * Recent deployments with color-coded status icons.
   * Greeting (Good morning / afternoon / evening) and quick actions.

2. **Projects → Project Detail**

   * Create a project, then add a service by pasting a GitHub repo URL and choosing a branch.
   * Service gets an auto-assigned subdomain.

3. **Service Detail**

   * **Live CPU & memory chart** powered by `Recharts`, updated via Socket.io every 5 seconds.
   * Environment variables (encrypted on backend with AES-256 — important security point).
   * Custom domains, deployment history, “Deploy” and “Rollback” buttons.

4. **Deployment Detail**

   * **Live, line-by-line build logs** streaming over WebSocket.
   * Status pill flips automatically when the worker finishes.

---

## 8. UX touches worth mentioning

* **Dark, developer-first theme** (Tailwind, similar look-and-feel to Render / Vercel).
* **Skeleton loaders + Framer Motion page transitions** instead of blank screens.
* **NProgress** route progress bar at the top of the screen on every navigation.
* **Sonner toasts** for create / delete / deploy success and failure.
* **Command palette (cmdk)** — keyboard-driven navigation.
* **Radix UI** for accessible Tabs, Tooltips, Alert dialogs, Dropdowns.

---

## 9. Why this matters (closing line)

> "The backend is powerful, but without a clean frontend the user would have to fight with cURL and Docker logs.
> Our frontend turns _'I have a GitHub repo'_ into _'I have a live URL'_ in **three clicks**, and then keeps the developer informed in real-time as their app builds and runs."

---

## 10. Quick Q&A cheatsheet

| Likely question                              | Short answer                                                                  |
| -------------------------------------------- | ----------------------------------------------------------------------------- |
| Why React + Vite, not Next.js?               | We need a pure SPA dashboard, no SSR. Vite gives instant HMR and fast builds. |
| How are API calls authenticated?             | JWT in `Authorization` header, attached by an Axios interceptor.              |
| How do logs stay in sync?                    | Socket.io rooms; we `join` `deployment:<id>` and stream events.               |
| How are CPU / RAM graphs updated?            | Backend emits `service:metrics` every 5s; Recharts re-renders.                |
| Where are env variables stored?              | Encrypted (AES-256) in Postgres; UI never shows raw values until decrypted.   |
| What if the user is offline / token expired? | `AuthContext` clears the token and redirects to `/login`.                     |
