# CLAUDE.md

Persistent context for Claude Code working on PrintBuddy. Read this every session. Defer to README.md for build phase details — this file covers how to *work* on the project, not what to build.

---

## Project at a Glance

**PrintBuddy** — a web app that turns multi-photo scans + sketches + plain-English descriptions into 3D-printable STL files via Gemini-generated OpenSCAD.

**Who it's for:** HyukJoo, building for personal use, open-sourcing publicly. Not a SaaS, not a product, not a startup. Hobby tool that solves one specific problem.

**Owner's working style (apply throughout):**
- No fluff, no filler, no pleasantries in commit messages, PR descriptions, or comments
- Push back if a request seems wrong — don't just comply
- Offer alternatives when relevant
- Bullet points and lists over prose
- Get straight to the point

---

## How to Work

### Phase discipline (non-negotiable)

The README defines 9 phases. Build them in order. **Validate each phase's checklist before starting the next.** If a phase's validation fails, fix the current phase — do not move on hoping later work will compensate.

Phase order is intentional:
- Phases 2-4 validate the AI generation step (the project's actual risk)
- Phases 5-7 add inputs (capture, sketch, calibration)
- Phase 8 is integration
- Phase 9 is deployment

If you find yourself wanting to skip ahead, stop and re-read the relevant phase's validation gate.

### What requires asking vs proceeding

**Proceed without asking:**
- Implementation details inside a phase (file structure, component naming, exact React patterns)
- Library choices that match the tech stack
- Fixing bugs and validation failures within the current phase
- TypeScript types and interfaces
- Refactoring to keep code small and clean

**Ask first:**
- Adding any feature not in the README
- Changing the OpenSCAD generation prompt (see "Sacred files" below)
- Skipping a phase or its validation
- Adding a new dependency that wasn't in the tech stack
- Anything that requires money (paid Vercel tier, Replicate API, etc.)
- Changing the project's scope (auth, database, multi-user, etc.)

### When something is wrong

If validation fails after a reasonable attempt:
1. Don't just paper over it. Diagnose root cause.
2. If the prompt is producing bad output, iterate the prompt — not the surrounding code
3. If a library doesn't work as expected, check its actual docs (not stale assumptions)
4. If stuck, surface the issue clearly with: what you tried, what happened, what you think is wrong, and the smallest reproduction

---

## Sacred Files

These files must not change without explicit user approval:

### `src/lib/prompts.ts` — The OpenSCAD generation prompt

This prompt is the most important code in the project. Output quality of every generation depends on it.

**Allowed without asking:**
- Adding missing imports if the file won't compile
- Fixing TypeScript type errors in the surrounding code (not the prompt string)

**Requires asking:**
- Any change to the `SYSTEM_PROMPT` string contents
- Any change to `buildUserPrompt` or `buildRepairPrompt` logic
- Adding new prompt variants or templates

If you believe the prompt should change, propose the specific edit + the failing case it would fix, and wait for approval.

### `README.md`

Don't edit without asking. If specs are ambiguous, ask for clarification rather than rewriting them.

### `.env.local`

Never commit. Never read its values into code that gets logged. Never include API keys in commit messages or error output.

---

## Coding Conventions

### TypeScript

- `strict: true` in tsconfig
- No `any` unless interfacing with untyped third-party code (and add a comment explaining why)
- Prefer `interface` for object shapes that may be extended, `type` for unions/aliases
- Use `unknown` over `any` when accepting external data; narrow with type guards

### React

- Functional components with hooks only — no class components
- Server Components by default (App Router); add `"use client"` only when needed (state, browser APIs, three.js)
- Custom hooks for reusable stateful logic (camera, openscad, measurement)
- One component per file; co-locate small subcomponents only when they aren't reused
- Avoid premature memoization. Use `useMemo`/`useCallback` only when there's a measurable problem.

### File naming

- Components: PascalCase (`PhotoCapture.tsx`)
- Libs/hooks: camelCase (`useCamera.ts`, `gemini.ts`)
- Routes: lowercase with hyphens (`/api/generate-scad`)

### Imports

- Absolute imports from `@/` for everything in `src/`
- Group order: external → internal → relative
- No barrel files (`index.ts` re-exports) unless there's a clear ergonomic win

### Comments

- Comment WHY, not WHAT. Code should explain what it does; comments explain why it does it that way.
- No commented-out code. Delete it. Git remembers.
- No JSDoc on obvious functions. Use JSDoc for exported library functions where types alone don't convey intent.

### Errors

- Throw `Error` with descriptive messages — never throw strings or objects
- Server routes: catch errors, log them server-side, return JSON `{ error: string }` with appropriate status code
- Client: surface errors to the user with actionable copy ("Mesh generation failed. Try better lighting.") — never raw stack traces

### Async

- Always `await` promises explicitly. No floating promises.
- `Promise.all` for parallel work where order doesn't matter; serial `await` otherwise
- Set timeouts on external API calls (Gemini, HF) — don't let requests hang forever

---

## Architectural Constraints

### What this project IS

- A stateless web app
- Free-tier compatible (Gemini free, HF Zero GPU, Vercel free)
- A tool you use, not a service you sign up for
- Open source under MIT

### What this project is NOT

Do not add these without explicit approval:

- ❌ User accounts, auth, sign-up flows
- ❌ A database (Supabase, Postgres, SQLite, anything)
- ❌ Server-side persistence of user content (photos, sketches, generated files)
- ❌ Analytics, tracking, telemetry
- ❌ Email integration
- ❌ Payment processing
- ❌ Multi-user features (sharing, collaboration)
- ❌ A backend beyond Next.js API routes
- ❌ Native mobile apps

### Free-tier discipline

The project must work end-to-end on free tiers. Before adding anything that consumes quota:

- **Gemini:** free tier has daily request limits. Each generation = 1 request. Cache nothing server-side (no DB). Show users their generation succeeded/failed clearly.
- **HF Spaces:** Zero GPU is shared. Cold starts and queue waits are facts of life. Show loading states with realistic time estimates.
- **Vercel:** function timeout = 60s on free tier. Mesh generation can exceed this. README documents the workarounds.
- **No external storage:** no S3, no Cloudinary, no anything that bills.

---

## Testing

### What counts as "tested"

A feature is tested when:

1. Its specified validation checklist in the README passes
2. It works on mobile iOS Safari (the primary target)
3. It survives the real-world end-to-end test for the relevant phase

### What does NOT count as tested

- TypeScript compiles ✓ — necessary but not sufficient
- Vercel deploys ✓ — necessary but not sufficient
- "Looks right in the browser on desktop" — primary target is mobile

### The only test that ultimately matters

For Phases 2-8: a generated STL must slice in Bambu Studio and print successfully on a real Bambu A1. Code review and synthetic tests are upstream of this, not substitutes for it.

### Automated tests

Skip them. This is a hobby tool with one user. The validation gates per phase substitute for unit tests. If a piece of logic is non-obvious enough to warrant a unit test, simplify the logic first.

---

## When You Need Information

### Don't guess. Verify.

- **Gradio Space API:** every Space exposes its API at the bottom of its page ("Use via API"). Read it before writing client code. Endpoint names and param schemas vary.
- **Gemini SDK:** check https://ai.google.dev/api before assuming method signatures. The SDK evolves.
- **openscad-wasm:** check the package's README on npm for the current API. Loading patterns have shifted over versions.
- **Next.js 15 patterns:** App Router conventions are different from Pages Router. Don't pattern-match from old Next.js code.

### When asking the user is faster than searching

Ask if:
- The user has context you don't (their environment, their hardware, their preference between two valid options)
- A decision is reversible but expensive to undo
- The work is blocked and a single answer unblocks it

Don't ask if:
- The answer is in the README
- You can verify it in 30 seconds with the right web search
- It's an implementation detail the user explicitly delegated

---

## Common Pitfalls (Project-Specific)

### Don't trust your OpenSCAD code by inspection alone

Generated SCAD might look fine and still produce non-manifold geometry or compile errors. Always:
1. Compile via `openscad-wasm` locally OR
2. Paste into openscad.org/preview/ to verify

### Don't conflate the mesh and the STL

- The GLB mesh from HF is for *visual context* and *dimension extraction*. It is decorative-grade, NOT printable.
- The STL comes from OpenSCAD code compilation. That's what gets sliced and printed.
- If you ever find yourself trying to convert the GLB directly to STL for printing, stop — that's the wrong path.

### Don't bypass the calibration step

Skipping scale calibration produces an STL at the wrong size. The calibration step is mandatory in Phase 8 — enforce it in code, don't just document it.

### Don't trust photo input quality

Bad photos (glossy, dark, cluttered backgrounds) produce bad meshes. Build UI that catches obvious issues before sending photos to HF, since each call costs quota and time.

### Don't pre-load openscad-wasm on every page

It's a multi-MB WebAssembly file. Lazy-load it only when needed (when user first generates an STL). Use dynamic import with `"use client"`.

---

## Deployment Notes

### Vercel environment variables

Match `.env.example` exactly. If you add a new env var to the code, add it to `.env.example` and update the README. Don't let env drift between local and Vercel.

### Don't enable analytics

Vercel offers free analytics. Decline. This is a private tool, no traffic data needed.

### Public URL

Once deployed, the URL goes in:
1. The README footer
2. The GitHub repo description
3. Nowhere else (no social posts unless user explicitly asks)

---

## Communicating with the User

### Status updates

After completing a phase:
1. State what was built (one line)
2. State what was validated and how
3. State what's next
4. Stop. Don't explain implementation details unless asked.

### When stuck

Don't loop silently. After 2 failed attempts at the same problem:
1. State the problem precisely
2. State what you tried
3. State your best hypothesis
4. Ask for direction

### Don't apologize reflexively

If you make a mistake, fix it and move on. No "I apologize for the confusion." Just: "Fixed — the issue was X."

### Don't oversell

Don't say a phase is "complete" if validation isn't passing. Don't claim "production-ready" — this is a hobby tool.

---

## Quick Reference

| Need | Source |
|------|--------|
| What to build | README.md |
| How to work on it | This file (CLAUDE.md) |
| The system prompt | `src/lib/prompts.ts` (do not modify without asking) |
| Tech stack versions | README "Tech Stack" section |
| Phase validation criteria | README "Phase Specifications" |
| Gotchas / known issues | README "Gotchas & Troubleshooting" |
| Env vars | `.env.example` |

---

## Final Reminder

PrintBuddy is one person's tool. Optimize for: working reliably, being small, being simple to modify, being free to run. Optimize against: generic best practices that bloat the codebase, scope creep, premature abstraction, enterprise patterns.

When in doubt, default to less.