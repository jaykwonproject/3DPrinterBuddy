# PrintBuddy

> Scan a real object, sketch what you want, describe it in plain English — get a printable STL file.

A web app for people who own a 3D printer but find CAD too steep. Sketch your idea on a napkin (literally), point your phone at a reference object, describe what you want, and get back a parametric OpenSCAD-generated STL ready for your slicer.

> **For Claude Code:** This README is your build spec. Follow the phases in order. Each phase has explicit deliverables and validation steps. Implementation details and code structure are your call — focus on satisfying the specs and passing the validation checks. The OpenSCAD generation prompt is the one piece that must be used verbatim.

---

## Table of Contents

1. [What This Is](#what-this-is)
2. [Architecture](#architecture)
3. [Prerequisites](#prerequisites)
4. [Environment Variables](#environment-variables)
5. [Tech Stack](#tech-stack)
6. [Project Structure](#project-structure)
7. [Build Phases](#build-phases)
8. [Phase Specifications](#phase-specifications)
9. [The OpenSCAD Generation Prompt](#the-openscad-generation-prompt)
10. [Gotchas & Troubleshooting](#gotchas--troubleshooting)

---

## What This Is

**Problem:** Owning a 3D printer is fun for a month, then you run out of stuff to print. Learning CAD is too steep. AI text-to-3D tools produce decorative meshes that aren't really printable as functional parts.

**Solution:** PrintBuddy combines four inputs to generate parametric 3D-printable parts:

1. **Multi-photo scan** of a real-world reference object → 3D mesh for shape context
2. **Scale calibration** — click two points on the mesh, enter the real-world distance
3. **Hand-drawn sketch** of what you want to make (rough, napkin-style)
4. **Text description** of additional details/constraints

These feed a vision-enabled LLM (Gemini 2.5 Pro) which generates parametric OpenSCAD code. The code compiles to STL in-browser, ready for your slicer.

**Use case examples:**
- "Make a stand for this phone with a 60° tilt and a circular base" + sketch of the silhouette
- "Design a wall hook that fits over this bracket" + sketch showing hook geometry
- "Desk organizer that holds these AirPods and a pen" + sketch of the layout

**Explicit non-goals:**
- Precise replacement parts that must fit existing geometry exactly (use a real 3D scanner)
- Complex organic shapes that need careful curve fitting
- Threaded parts, gears, press-fits, mating mechanical assemblies

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                       BROWSER (Client)                          │
│                                                                 │
│   1. Multi-photo capture (getUserMedia, 6-8 photos)             │
│           │                                                     │
│           ▼                                                     │
│   2. POST photos → /api/generate-mesh                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                  NEXT.JS API ROUTES (Server)                    │
│                                                                 │
│   /api/generate-mesh ──► Hugging Face Space (Hunyuan3D-2)       │
│                              │                                  │
│                              ▼                                  │
│                          GLB mesh returned                      │
│                                                                 │
│   /api/generate-scad ──► Gemini API (vision-enabled)            │
│                          ├─ text: description + dims            │
│                          └─ image: user's sketch (PNG)          │
│                              │                                  │
│                              ▼                                  │
│                          OpenSCAD code                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                       BROWSER (Client)                          │
│                                                                 │
│   3. Render GLB in three.js + 2-click measurement tool          │
│   4. User sketches on canvas + types description                │
│   5. POST {dims, description, sketch, meshContext} → /api/scad  │
│   6. Receive OpenSCAD code                                      │
│   7. openscad-wasm compiles → STL → download + preview          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Key data flow points:**
- Photos and sketches are forwarded to APIs only briefly, never persisted server-side
- The GLB mesh is for *visual context* + dimension extraction, NOT for printing
- OpenSCAD code is the actual deliverable; the STL is compiled from it
- No database, no auth, no accounts — fully stateless

---

## Prerequisites

The user provides:

1. **Gemini API key** — get from https://aistudio.google.com/apikey (free tier)
2. **Hugging Face account + access token** — get from https://huggingface.co/settings/tokens (free, "read" scope is enough)
3. **Node.js 20+** installed locally
4. **A modern browser** for testing (Chrome/Safari, mobile or desktop)

That's it. No paid services. No database. No auth.

---

## Environment Variables

Create `.env.local` at the project root:

```bash
# Gemini API (free tier)
# https://aistudio.google.com/apikey
GEMINI_API_KEY=

# Hugging Face (free Zero GPU access)
# https://huggingface.co/settings/tokens (read scope)
HF_TOKEN=

# HF Space endpoint for image-to-3D
# Default: public Hunyuan3D-2 demo
# For better queue performance, fork the Space to your account and use that URL
HF_SPACE_URL=https://tencent-hunyuan3d-2.hf.space

# Model selection - use Pro for best code quality
# gemini-2.5-pro: best quality, lower free quota
# gemini-2.5-flash: faster, much higher free quota
GEMINI_MODEL=gemini-2.5-pro
```

Add `.env.local` to `.gitignore`. Create `.env.example` with the same keys but empty values — commit that.

---

## Tech Stack

**Framework:** Next.js 15+ (App Router), React 19+, TypeScript

**3D / Graphics:**
- `three` — 3D math, GLB loading, STL export
- `@react-three/fiber` — React renderer for three.js
- `@react-three/drei` — helpers (OrbitControls, Bounds, useGLTF)
- `openscad-wasm` — OpenSCAD compiler in the browser via WebAssembly

**Sketch input:**
- `react-sketch-canvas` — touch/mouse drawing canvas with undo/clear

**APIs:**
- `@google/generative-ai` — Gemini SDK (supports vision input)
- `@gradio/client` — Hugging Face Spaces client

**Styling:**
- Tailwind CSS v4

**Deployment:**
- Vercel (free tier)

---

## Project Structure

```
printbuddy/
├── .env.local                    # User's secrets (gitignored)
├── .env.example                  # Template (committed)
├── .gitignore
├── README.md
├── LICENSE                       # MIT
├── package.json
├── tsconfig.json
├── next.config.ts
├── tailwind.config.ts
│
├── public/
│   ├── openscad/                 # openscad-wasm files (setup script)
│   └── icons/
│
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx              # Main flow
│   │   ├── globals.css
│   │   │
│   │   └── api/
│   │       ├── generate-mesh/    # POST photos → HF Space → GLB
│   │       ├── generate-scad/    # POST dims+desc+sketch → Gemini → SCAD
│   │       └── repair-scad/      # POST broken SCAD + error → fixed SCAD
│   │
│   ├── components/
│   │   ├── PhotoCapture.tsx      # Multi-photo capture UI
│   │   ├── MeshViewer.tsx        # GLB viewer + 2-click measurement
│   │   ├── SketchPad.tsx         # Hand-drawing canvas
│   │   ├── DimensionForm.tsx     # Dims + description + sketch
│   │   ├── ScadPreview.tsx       # Generated SCAD (collapsible)
│   │   ├── StlViewer.tsx         # Final STL preview
│   │   ├── PhaseStepper.tsx      # Progress indicator
│   │   └── ui/                   # Reusable primitives
│   │
│   ├── lib/
│   │   ├── gemini.ts             # Gemini client (vision-enabled)
│   │   ├── prompts.ts            # OpenSCAD prompts (system, user, repair)
│   │   ├── huggingface.ts        # HF Space client wrapper
│   │   ├── openscad.ts           # openscad-wasm browser wrapper
│   │   ├── three-utils.ts        # GLB loading, measurement math
│   │   └── types.ts              # Shared types
│   │
│   └── hooks/
│       ├── useCamera.ts
│       ├── useOpenScad.ts
│       └── useMeasurement.ts
│
└── scripts/
    └── setup-openscad-wasm.sh    # Copies wasm files to public/
```

---

## Build Phases

Build strictly in this order. Each phase produces a runnable, testable artifact.

| Phase | Deliverable | Validation Gate |
|-------|------------|----------------|
| 1 | Project scaffold | "Hello world" page loads at localhost:3000 |
| 2 | Gemini OpenSCAD generation (text-only) | Valid SCAD from form inputs, renders in openscad.org |
| 3 | STL rendering in browser | openscad-wasm compiles test SCAD → downloadable STL |
| 4 | Form-based MVP (no scan, no sketch) | End-to-end works: form → SCAD → STL |
| 4.5 | Sketch input added | Sketch + text → measurably better SCAD output |
| 5 | Multi-photo capture | 8 photos captured with guided UI |
| 6 | Hugging Face Space integration | Photo → GLB mesh returned |
| 7 | Mesh viewer + scale calibration | Click 2 points, set scale, real-world dims output |
| 8 | Full integration | Real object → working STL end-to-end |
| 9 | Polish + Vercel deploy | Public URL works on mobile Safari |

**Critical principle:** Validate the AI step (Phase 2-4) before adding inputs. If Gemini can't reliably generate good OpenSCAD from simple manual inputs, no amount of scanning or sketching fixes that.

---

## Phase Specifications

### Phase 1 — Project Scaffold

**Goal:** Empty Next.js app running locally.

**Setup:**
- Initialize Next.js 15+ with TypeScript, Tailwind, App Router, `src/` directory
- Install dependencies: `three`, `@react-three/fiber`, `@react-three/drei`, `@google/generative-ai`, `@gradio/client`, `react-sketch-canvas`
- Create `.env.local` and `.env.example` per spec above
- Add `.env.local` to `.gitignore`

**Validation:**
- [ ] `npm run dev` starts; http://localhost:3000 loads
- [ ] No console errors
- [ ] `.env.local` exists with placeholder keys

---

### Phase 2 — Gemini OpenSCAD Generation (text-only)

**Goal:** Server route that accepts `{ description, width, height, depth, notes? }` and returns valid OpenSCAD code via Gemini.

**Implementation specs:**
- `src/lib/prompts.ts` contains the system prompt verbatim (see [The OpenSCAD Generation Prompt](#the-openscad-generation-prompt) section below)
- `src/lib/gemini.ts` wraps the `@google/generative-ai` SDK; reads model name from env
- Output cleaning: strip markdown fences (` ```scad ` etc.) before returning
- `src/app/api/generate-scad/route.ts` — POST endpoint, 60s max duration
- `src/app/api/repair-scad/route.ts` — POST endpoint that takes broken SCAD + error message and returns a fix

**Validation:**
Test via curl with these 5 inputs. Paste each output into https://openscad.org/preview/ — must render without errors:

1. `{description:"phone stand with circular base 100mm wide and 60° tilt", width:71, height:147, depth:8}`
2. `{description:"AirPods Pro case holder for a desk, with a small lip", width:65, height:60, depth:25}`
3. `{description:"business card holder, fan shape, holds 20 cards", width:85, height:54, depth:5}`
4. `{description:"cable organizer with 5 slots for USB cables on a desk edge", width:300, height:8, depth:8}`
5. `{description:"simple shelf bracket with 2 mounting holes", width:50, height:50, depth:50}`

- [ ] All 5 return valid OpenSCAD code (proper structure: params at top, modules, manifold geometry)
- [ ] At least 4/5 render without errors on the first try
- [ ] Repair endpoint successfully fixes a deliberately broken SCAD when given a real error message

**If <4/5 succeed, iterate on the prompt before moving on.** This is the project's foundation.

---

### Phase 3 — STL Rendering in Browser

**Goal:** Compile OpenSCAD code to STL client-side using `openscad-wasm`.

**Implementation specs:**
- Install `openscad-wasm`; copy wasm + js files from `node_modules` to `public/openscad/` via a postinstall script
- `src/lib/openscad.ts` — client-side module that lazy-loads openscad-wasm and exposes `compileScadToStl(code: string): Promise<Uint8Array>` and `downloadStl(data, filename)`
- The module must use `locateFile` to point to `/openscad/` so the wasm loads from the public folder
- May require cross-origin isolation headers in `next.config.ts` (see Phase 9)

**Test SCAD for validation:**
```scad
$fn = 64;
cube([20, 20, 20], center=true);
translate([0, 0, 15]) sphere(10);
```

**Validation:**
- [ ] Test page/button compiles the above SCAD and downloads an STL
- [ ] STL opens in Bambu Studio / PrusaSlicer without errors
- [ ] Shape is a sphere stacked on a cube
- [ ] No console errors

---

### Phase 4 — Form-Based MVP (no scan, no sketch)

**Goal:** Working app where user types dimensions + description, hits "Generate," and downloads a printable STL.

**UI:**
```
┌─────────────────────────────────────────────┐
│  PrintBuddy                                 │
│                                             │
│  Reference object dimensions (mm):          │
│  [  W  ] [  H  ] [  D  ]                    │
│                                             │
│  What do you want to make?                  │
│  ┌─────────────────────────────────────┐    │
│  │                                     │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  Additional notes (optional):               │
│  [                                     ]    │
│                                             │
│           [ Generate STL ]                  │
│                                             │
│  ─────────────────────────────────────      │
│                                             │
│  Generated OpenSCAD (collapsible):          │
│  ┌─────────────────────────────────────┐    │
│  │ [SCAD code shown here]              │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  [ Download STL ] [ Regenerate ]            │
└─────────────────────────────────────────────┘
```

**Behavior:**
- On submit: POST to `/api/generate-scad`, show loading state
- Display generated SCAD in a collapsible code block
- Auto-compile to STL via openscad-wasm, show progress
- If compile fails, POST to `/api/repair-scad` with the error, show "Fixing..." state
- After max 2 repair attempts, show error + raw SCAD with "Copy" button so user can debug
- On success, show "Download STL" + 3D preview

**Validation:**
Use the same 5 prompts from Phase 2. Each must produce a downloadable, sliceable STL:

- [ ] All 5 STLs slice in Bambu Studio without errors
- [ ] All 5 fit within Bambu A1 build volume (256×256×256mm)
- [ ] No wall thickness <1mm
- [ ] No floating geometry
- [ ] At least 4/5 succeed without needing repair

---

### Phase 4.5 — Sketch Input

**Goal:** Add a drawing canvas alongside the description. The sketch is sent to Gemini as a vision input.

**Implementation specs:**
- `src/components/SketchPad.tsx` wrapping `react-sketch-canvas`
- Canvas size: 400×400px on desktop, full-width on mobile (max 400px height)
- Tools: pen (default), eraser, undo, clear, color (black default — sketches are monochrome)
- Stroke width: 3-4px (legible without being chunky)
- Background: very light gray (#fafafa) so user sees the boundary
- Optional faint grid background for proportions reference
- "Skip sketch" button — text-only generation still works (sketch is optional)
- Export sketch as PNG → base64 data URL when submitting

**API update:**
- `/api/generate-scad` POST body now optionally includes `sketch: string` (base64 PNG data URL)
- `src/lib/gemini.ts` — when sketch is provided, send it as `inlineData` alongside the text prompt:
  ```typescript
  await model.generateContent([
    userPromptText,
    { inlineData: { mimeType: "image/png", data: sketchBase64 } },
  ]);
  ```

**Prompt update:**
The system prompt already includes sketch handling rules (see [The OpenSCAD Generation Prompt](#the-openscad-generation-prompt) below). No code changes to the prompt content.

**Validation:**
Run the same 5 test prompts from Phase 4, but this time add a 30-second sketch for each:

- [ ] Sketches submit without errors
- [ ] Gemini output noticeably reflects sketch geometry (e.g., a sketch showing tapered shape produces tapered SCAD output)
- [ ] Text-only mode (no sketch) still works
- [ ] Sketch UI works on iOS Safari with touch input

**Quality measure:** For at least 3/5 prompts, the version *with* sketch should produce a more accurate result than text alone. If sketches don't help, refine the system prompt's sketch handling rules.

---

### Phase 5 — Multi-Photo Capture UI

**Goal:** Browser UI to capture 6–8 photos around an object, with guidance and quality feedback.

**Implementation specs:**

- `src/components/PhotoCapture.tsx` using `getUserMedia({ video: { facingMode: 'environment' } })`
- On iOS Safari, camera access requires HTTPS + user gesture trigger
- Show live video preview with `<video playsInline autoPlay muted>`
- Overlay guide: 8 position indicators in a circle (clock positions: 12, 1:30, 3, 4:30, 6, 7:30, 9, 10:30)
- Highlight the current capture position
- Capture frames to `<canvas>`, export as JPEG (quality 0.85), max 1024px on longest side
- After each capture, show thumbnail + "Confirm" / "Retake" buttons
- Final grid view of all 8 photos with "Use these photos" / "Start over"

**UX rules:**
- User must confirm each photo before moving to the next position
- Running thumbnails of all captured photos always visible
- Each photo file size: target 100-300KB after compression
- Clear instruction text at each step ("Rotate object 45° to the right")

**Validation:**
- [ ] iOS Safari prompts for camera permission on first tap
- [ ] Live preview displays correctly
- [ ] All 8 photos capture in sequence
- [ ] Each photo compresses to <500KB
- [ ] Retake replaces current photo
- [ ] Final grid shows all 8 photos with correct order

---

### Phase 6 — Hugging Face Space Integration

**Goal:** Send photos to a HF Space running Hunyuan3D-2, receive a GLB mesh.

**Implementation specs:**

- `src/lib/huggingface.ts` using `@gradio/client`
- Connect to the Space URL from env, authenticate with HF token
- `src/app/api/generate-mesh/route.ts` — POST endpoint accepting multipart form data with photo(s)
- For v1: send only the front-facing photo (index 0 from the capture sequence) — Hunyuan3D-2 takes a single image
- Return the GLB binary with proper content type

**CRITICAL:** The exact Gradio endpoint name (e.g., `/generate_mesh`), parameter names, and result schema vary by Space. Before writing the integration:

1. Visit `https://tencent-hunyuan3d-2.hf.space` in browser
2. Scroll to bottom, click "Use via API"
3. Read the exact API spec shown there
4. Implement accordingly

**Validation:**
- [ ] POST a test image of an object on a clean background
- [ ] Response is a valid GLB file (use https://gltf-viewer.donmccurdy.com/ to verify)
- [ ] Recognizable 3D shape of the test object
- [ ] If queue wait is consistently >2 min, fork the Space (see Gotchas)

---

### Phase 7 — Mesh Viewer & Scale Calibration

**Goal:** Display the GLB in-browser, let user click two points and enter the real-world distance to calibrate scale. Output real-world bounding box dimensions.

**Implementation specs:**

- `src/components/MeshViewer.tsx` using `@react-three/fiber` + `@react-three/drei`
- Load GLB with `useGLTF`
- `<OrbitControls>` for rotate/zoom/pan
- Raycast on click → get world-space point on mesh surface
- Two-click flow:
  1. First click: place red marker
  2. Second click: place green marker + show input modal asking "Distance between these points (mm)?"
  3. On submit: compute `scale = realDistance / meshDistance`
  4. Apply scale to bounding box, output real-world W/H/D to parent
- "Recalibrate" button to redo
- Optional: ruler line between the two points for visual feedback

**UX:**
- Persistent instruction overlay: "Click two known reference points, then enter the real distance"
- Suggested reference: known phone width, AirPods case dimension, credit card width (85.6mm)
- After calibration, show prominent dimension readout: "W: 71mm · H: 147mm · D: 8mm"

**Validation:**
Test object: a credit card (85.6 × 53.98 × 0.76mm).

- [ ] GLB loads and renders
- [ ] OrbitControls work (drag to rotate, scroll to zoom)
- [ ] Clicking the mesh places markers at click points
- [ ] After two clicks, modal asks for distance
- [ ] After calibration with card width (85.6mm), reported height matches actual (53.98mm ±5%)
- [ ] Recalibrate button resets and allows re-doing

---

### Phase 8 — Full Integration

**Goal:** Wire all phases together into a single coherent flow.

**App state machine:**

```typescript
type AppPhase =
  | "intro"        // Welcome + start button
  | "capture"      // Multi-photo capture
  | "processing"   // Sending to HF, generating mesh
  | "calibrate"    // Mesh viewer + scale calibration
  | "describe"     // Description text + sketch pad + confirmed dims
  | "generating"   // Calling Gemini
  | "compiling"    // openscad-wasm running
  | "ready"        // STL preview + download
  | "error";       // Error + retry
```

**Transitions:**
- intro → capture (user starts)
- capture → processing (all 8 photos taken)
- processing → calibrate (mesh returned)
- calibrate → describe (scale set, dims confirmed)
- describe → generating (user submits)
- generating → compiling (SCAD received)
- compiling → ready (STL ready)
- ready → intro (start over)

**Components:**
- `<PhaseStepper>` at top showing: ① Capture → ② Calibrate → ③ Describe → ④ Result
- Each phase has its own component, swapped based on `phase` state
- "Skip scanning" button on intro → jumps to describe with empty dims (Phase 4 MVP path stays available)
- "Skip sketch" button on describe → text-only generation

**End-to-end validation:**

Real-world test:
1. Pick a phone in your house
2. Capture 8 photos
3. Wait for mesh
4. Calibrate using known phone width
5. Sketch a phone stand silhouette
6. Describe: "phone stand with circular base 100mm diameter and 60° tilt"
7. Wait for SCAD + STL
8. Download, slice in Bambu Studio, print
9. Does the phone fit?

- [ ] Full flow completes in under 3 minutes (excluding print time)
- [ ] Printed stand fits the phone
- [ ] All phase transitions are obvious and visually clear

---

### Phase 9 — Polish & Deploy

**Required headers in `next.config.ts`:**

openscad-wasm may need cross-origin isolation for SharedArrayBuffer. Add:
```typescript
async headers() {
  return [{
    source: "/(.*)",
    headers: [
      { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    ],
  }];
}
```

**Polish checklist:**
- [ ] Loading states with clear progress messages ("Reconstructing your object... ~45s")
- [ ] Error states with actionable copy ("Mesh generation failed — try better lighting or a less reflective object")
- [ ] Photo quality warnings ("This photo looks blurry — retake?")
- [ ] Mobile-responsive layout (test on iPhone Safari)
- [ ] Favicon + OG meta tags
- [ ] Brief About section explaining what PrintBuddy is + how to use it
- [ ] GitHub link in footer

**Deploy to Vercel:**
1. `vercel login && vercel`
2. In dashboard: add env vars (GEMINI_API_KEY, HF_TOKEN, HF_SPACE_URL, GEMINI_MODEL)
3. Set Node version to 20+
4. Deploy

**Post-deploy validation:**
- [ ] Public URL loads on desktop Chrome
- [ ] Loads on iOS Safari + iOS Chrome
- [ ] Camera works on mobile (HTTPS confirmed)
- [ ] Generate + download a model successfully on the deployed version
- [ ] Sketch works with touch input on mobile
- [ ] No console errors

**Open source:**
- [ ] Add LICENSE file (MIT)
- [ ] Public GitHub repo
- [ ] Screenshots/GIF in README
- [ ] Live demo URL prominent

---

## The OpenSCAD Generation Prompt

This is the most important file in the project. Paste this verbatim into `src/lib/prompts.ts`.

```typescript
export const SYSTEM_PROMPT = `You are an expert OpenSCAD developer specializing in 3D printable parts for hobbyist FDM printers. You write clean, parametric, well-commented OpenSCAD code that produces manifold (watertight) geometry suitable for slicing and printing.

# Output rules (CRITICAL)
- Output ONLY valid OpenSCAD code. No prose, no explanations, no markdown fences.
- Start the file with parameter declarations using descriptive names.
- All dimensions in millimeters.
- Include $fn = 64 near the top for smooth curves (use $fn = 128 for high-detail parts).
- Add brief comments above each module and major block explaining intent.

# Printability rules (CRITICAL)
- Minimum wall thickness: 1.6mm (use 2mm if uncertain).
- Minimum feature size: 0.8mm.
- Avoid overhangs greater than 45° unless the user explicitly asks for supports.
- Avoid floating geometry. Every solid must connect to the build plate.
- For enclosed cavities, add drainage holes (>=4mm diameter) to prevent print failures.
- Bases should be wider than tops where physically reasonable (stability).
- Include fillets/chamfers (1-2mm) on outer edges where appropriate for ergonomics.

# Fit and tolerance rules
- The reference object dimensions describe a real object that is NOT included in the print.
- The generated part must be designed AROUND the reference object, accommodating its dimensions.
- When the part needs to hold/cradle/grip the reference object, add 0.3mm clearance on all contact surfaces.
- For removable/insertable fits, add 0.5mm clearance.
- For loose fits (display holders, stands), 1mm clearance is fine.

# Sketch input (when provided)
- The user may attach a hand-drawn sketch showing the intended shape, layout, or key features.
- The sketch is a rough visual aid, not a precise spec. Interpret it loosely.
- Use the sketch for: overall form, proportions, orientation, key features, general layout.
- Use the text description for: precise dimensions, materials concerns, fit details, constraints.
- When the sketch and text description conflict on specifics, prefer the text description.
- Do NOT try to reproduce the sketch line-for-line. Extract intent, then design a proper printable part.
- If the sketch is missing or skipped, rely entirely on the text description.

# Construction rules
- Use modules to organize the design. Each functional element should be its own module.
- Use union() to combine, difference() to subtract, intersection() sparingly.
- Use translate() and rotate() — avoid mirror() and multmatrix() unless needed.
- Use hull() and minkowski() for organic shapes when appropriate (but they're slow — use sparingly).
- Use children() for reusable modules that take other shapes.

# Build plate constraints
- Default printer: Bambu A1 — 256 x 256 x 256mm build volume.
- Keep total part dimensions under 250mm in any axis to leave a safety margin.
- If the design would exceed this, scale down proportionally and add a comment noting the original intent.

# Style
- Variable names: snake_case, descriptive (phone_width, base_diameter, tilt_angle).
- Top of file: parameters grouped by category with section comments.
- Modules: lowercase with underscores.
- One blank line between major sections.

# Anti-patterns to avoid
- Do not use deprecated syntax (assign, etc.).
- Do not use libraries that require imports (BOSL, NopSCADlib) — write everything from primitives.
- Do not generate huge $fn values (>200) — slows compile to a crawl.
- Do not output multiple files or scenes — one self-contained .scad output only.
- Do not include test/debug code commented out.

Generate ONLY the OpenSCAD code. Nothing else.`;

export interface ScadGenerationInput {
  description: string;
  width: number;
  height: number;
  depth: number;
  notes?: string;
  sketchBase64?: string;  // PNG data URL, without the "data:image/png;base64," prefix
}

export function buildUserPrompt(input: ScadGenerationInput): string {
  const sketchNote = input.sketchBase64
    ? "\n\nA hand-drawn sketch is attached showing the intended shape. Interpret it loosely for form and layout, not for precise dimensions."
    : "";

  return `Reference object dimensions (the object to design AROUND):
- width: ${input.width}mm
- height: ${input.height}mm
- depth: ${input.depth}mm
${input.notes ? `- additional notes: ${input.notes}` : ""}

What I want to make:
${input.description}${sketchNote}

Generate the OpenSCAD code now. Output only code, no other text.`;
}

export function buildRepairPrompt(
  brokenScad: string,
  errorMessage: string,
  originalInput: ScadGenerationInput
): string {
  return `The OpenSCAD code below failed to compile with this error:

ERROR:
${errorMessage}

CODE THAT FAILED:
${brokenScad}

ORIGINAL REQUEST:
- Reference object: ${originalInput.width} x ${originalInput.height} x ${originalInput.depth}mm
- What to make: ${originalInput.description}
${originalInput.notes ? `- Notes: ${originalInput.notes}` : ""}

Fix the error and output the corrected OpenSCAD code. Output ONLY the fixed code, no explanations.`;
}
```

### Prompt iteration tips

Treat the prompt as living code. If outputs are consistently wrong in a specific way, edit the prompt:
- Walls too thin → strengthen minimum wall thickness rule
- Always producing the same generic shape → add sketch interpretation guidance
- Floating geometry → emphasize the "connect to build plate" rule
- Wrong scale → reinforce that reference object dims are NOT the part dims
- Sketch ignored → emphasize the sketch usage rules

Version the prompt. A/B test variants by running the same input through both and comparing outputs in openscad.org/preview/.

---

## Gotchas & Troubleshooting

### Hugging Face

**Queue wait >2 minutes during peak times.**
Fork the Space to your own account:
1. Visit the Space page
2. Three-dot menu → "Duplicate this Space"
3. Choose "Free Zero GPU" hardware
4. Wait ~5-10 min for build
5. Update `HF_SPACE_URL` in `.env.local` to your forked URL

**"API endpoint not found" when calling Space.**
Endpoint names vary. Visit Space → "Use via API" link → check exact endpoint name + params, update `huggingface.ts`.

**Space returns black/empty mesh.**
Photo quality issue. Object should fill 60-80% of frame, plain background, even lighting, matte (not glossy/transparent).

### Gemini

**"RECITATION" or "SAFETY" finish reason.**
Rephrase the user prompt. Specific descriptions sometimes trigger safety filters.

**Output has markdown fences despite the prompt rule.**
The `cleanScadOutput()` function handles this — make sure it strips ` ```scad ` and ` ``` ` markers.

**Free tier rate limit hit.**
Limits reset daily. If hit during dev, switch `GEMINI_MODEL` to `gemini-2.5-flash` (higher quota, slightly worse code quality).

**Sketch input not working.**
Verify the base64 data doesn't include the `data:image/png;base64,` prefix when sent to Gemini's `inlineData`. The SDK expects raw base64.

### OpenSCAD WASM

**Compile hangs forever.**
SCAD code likely has very high `$fn` or complex `minkowski()`. Inspect; regenerate with stronger constraints.

**"SharedArrayBuffer not defined" in console.**
Cross-origin isolation headers missing. Add them in `next.config.ts` (Phase 9).

**STL is empty or 0 bytes.**
Non-manifold or empty geometry. Paste SCAD into openscad.org/preview/ to diagnose; fix the prompt to reinforce manifold rules.

### iOS Safari

**Camera permission denied.**
Site must be HTTPS. On localhost, use Safari on Mac (allows camera on localhost). On mobile dev, deploy to Vercel first or use ngrok for HTTPS tunneling.

**Black video feed.**
`<video>` element needs `playsInline`, `autoPlay`, `muted` attributes.

**Sketch canvas doesn't accept touch input.**
`react-sketch-canvas` should handle this by default. If not, check that `touch-action: none` is set on the canvas element's parent.

### Vercel

**Function timeout on `/api/generate-mesh`.**
Free tier caps at 60s. HF cold starts can exceed this. Options:
- Upgrade to Vercel Pro for 300s limit
- Or implement client-side polling — have client call HF Space directly
- Or pre-warm the Space with a cron hitting it every 5 minutes

### General

**STL prints at wrong scale.**
User skipped or botched scale calibration. Make this step mandatory; validate scale is set before allowing "Generate."

**Generated part doesn't fit the reference object.**
Increase tolerance values in the prompt. Bump default clearances from 0.3mm to 0.5mm.

**Sketch produces worse results than text-only.**
Tighten the sketch interpretation rules in the system prompt. Emphasize "rough visual aid, not precise spec." If still bad, the sketch UI may need bigger canvas or better feedback so users draw more interpretable sketches.

---

## Final Notes for Claude Code

- **Build phase by phase. Validate before advancing.** Don't write Phase 5 while Phase 2 is unproven.
- **The OpenSCAD prompt is the most important file.** If outputs are bad, fix the prompt before assuming architecture is wrong.
- **Test with real prints.** No amount of code review substitutes for slicing and printing a generated STL.
- **Keep the codebase small.** Personal tool, not SaaS. Resist adding accounts, databases, analytics.
- **Mobile-first.** Validate every UI decision on iPhone Safari before desktop.

When stuck, return to the README. When in doubt, default to simpler.