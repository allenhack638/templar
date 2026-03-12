# Development Guide — create-templar CLI

This guide covers everything you need to know to develop, test, and extend the CLI package efficiently.

---

## Prerequisites

- **Node.js** ≥ 18
- **pnpm** ≥ 10 (`npm i -g pnpm`)
- Clone the full monorepo — the CLI depends on `packages/templates/` being present

---

## Setup

From the **monorepo root**:

```bash
pnpm install
```

That's it. No separate install needed inside `packages/cli`.

---

## Development Workflow

### Running the CLI in dev mode

```bash
# From the monorepo root
pnpm dev

# Or directly from this package
pnpm --filter create-templar dev
```

This runs `tsx watch src/index.ts`, which:
- Executes TypeScript directly (no build step needed)
- Restarts automatically on file changes
- Runs the CLI as if it were installed globally

To scaffold a project while in dev mode:

```bash
# Interactive wizard
node --import tsx/esm src/index.ts my-test-app

# Direct local template (fastest for template development)
node --import tsx/esm src/index.ts my-test-app --local ../../templates/react-basic

# Remote template
node --import tsx/esm src/index.ts my-test-app --template github:user/repo
```

Or link the bin globally for a cleaner experience:

```bash
pnpm link --global          # run once from packages/cli/
templar my-test-app --local ../../templates/react-basic
```

### Building

```bash
# From the monorepo root
pnpm build

# Or just this package
pnpm --filter create-templar build
```

Build runs `tsc && vite build` and outputs to `dist/`. The bin entry point is `dist/index.js`.

### Type checking

```bash
pnpm check-types
# or
pnpm --filter create-templar check-types
```

---

## Project Structure

```
packages/cli/
├── src/
│   ├── index.ts              # Shebang + all CLI logic (routing, prompts, engine invocation)
│   ├── engine/
│   │   ├── context.ts        # TemplarContext factory
│   │   ├── templateLoader.ts # Loads & validates steps.json
│   │   └── stepRunner.ts     # Dynamically imports and runs step handlers
│   ├── steps/                # One file per step type/action
│   │   ├── file/             # create, copy, delete, move, rename
│   │   ├── edit/             # append, prepend, replace, insertBefore, insertAfter, jsonMerge
│   │   ├── package/          # install, installDev, remove
│   │   ├── command/          # run
│   │   └── plugin/           # execute
│   ├── types/
│   │   └── step.ts           # TypeScript types for steps, options, StepsJSON
│   └── utils/
│       ├── logger.ts         # Coloured console output helpers
│       ├── fileUtils.ts      # Pure string/file manipulation helpers
│       └── packageUtils.ts   # pnpm wrapper
├── dist/                     # Build output (gitignored)
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

---

## Architecture Overview

The CLI is a **pure traffic router**. It parses flags, validates them, resolves a `templatePath`, and hands everything to the engine. It has no opinion about what the engine does with it.

```
src/index.ts
  │
  ├── --template <source>   → downloadToTemp()  ─┐
  ├── --list <url>          → fetchCatalog()      ├─ runEngine(projectPath, templatePath, params)
  ├── --local <path>        → fs.statSync()      ─┘       │
  └── (no flags)            → interactive wizard          ├─ loadTemplateSteps(templatePath)
                                                           ├─ createContext({ ... })
                                                           └─ runSteps(stepsJSON, context)
```

**Temp folder strategy (remote routes only):**
- A sibling folder `<project-name>-templar-temp` is created for the download
- Stale temp folders from crashed runs are silently overwritten
- The `finally` block deletes the temp folder whether the engine succeeds or fails
- Local routes (`--local`) use the source directory directly — no temp folder, no network

### How `runSteps` resolves handlers

`stepRunner.ts` uses a dynamic import keyed on `type` and `action`:

```
steps/<type>/<action>.ts
```

So `{ type: "file", action: "create" }` maps to `steps/file/create.ts`. Adding a new step type or action is as simple as dropping a new file in the right folder.

---

## Adding a New Step Handler

1. **Create the handler file** at `src/steps/<type>/<action>.ts`:

```typescript
import type { TemplarContext } from '../../engine/context.js';

interface MyStepOptions {
    file: string;
    // ... your options
}

const handler = {
    async execute(options: MyStepOptions, context: TemplarContext): Promise<void> {
        // context.projectPath  — absolute path to the generated project
        // context.templatePath — absolute path to the template source
        // context.projectName  — sanitized project name
        // context.templateName — selected template name
    }
};

export default handler;
```

2. **Add types** to `src/types/step.ts` if this step type is new.

3. **Test it** by adding a step to a local template's `steps.json` and running the CLI in dev mode.

No registration or switch-case update needed — the step runner discovers handlers by path convention automatically.

---

## Key Modules

### `engine/context.ts`

```typescript
interface TemplarContext {
    projectName: string;              // e.g. "my-app"
    projectPath: string;              // absolute path to the generated project
    templateName: string;             // e.g. "react-basic"
    templatePath: string;             // absolute path to the template source directory
    params: Record<string, unknown>;  // arbitrary CLI flags passed through from the router
}
```

`createContext` now takes a single config object with all paths explicitly provided — no path guessing:

```typescript
createContext({
    projectName,
    projectPath,   // where the new project will be created
    templateName,
    templatePath,  // temp dir (remote) or local dir — where steps.json and assets live
    params,        // forwarded from CLI options, available to plugins and future handlers
})
```

`templatePath` is always a **separate directory** from `projectPath`. For remote templates it is the temp folder; for local routes it is the source directory the user pointed at. Step handlers read static assets from `templatePath` and write generated output to `projectPath`.

### `utils/logger.ts`

```typescript
logger.info('message')     // ℹ blue
logger.success('message')  // ✔ green
logger.warn('message')     // ⚠ yellow
logger.error('message')    // ✖ red
```

Always use the logger — never `console.log` — so output is consistent and filterable.

### `utils/fileUtils.ts`

Pure string/file helpers used by `edit/*` handlers. All functions that modify file content take the **original string** and return the **modified string** — they do not write to disk themselves. The handler is responsible for reading and writing.

### `utils/packageUtils.ts`

Wraps `pnpm add` and `pnpm add -D`. Converts a `Record<string, string>` package map (`{ "react": "18.3.1" }`) into the correct CLI arguments.

---

## Common Development Tasks

### Testing a template end-to-end

```bash
# 1. Scaffold using a local template (fastest — no network, no temp folder)
node --import tsx/esm src/index.ts test-output --local ../../templates/react-basic

# 2. Or test the full remote path
node --import tsx/esm src/index.ts test-output --template github:allenhack638/templar/packages/templates/react-basic

# 3. Inspect the result
ls -la test-output/

# 4. Clean up (temp folder is auto-deleted, only project dir remains)
rm -rf test-output/
```

### Watching for type errors

```bash
# In a separate terminal
pnpm check-types --watch
# or via tsc directly
cd packages/cli && npx tsc --noEmit --watch
```

### Debugging a step handler

Add a temporary `console.log` in the handler and re-run. Because `dev` mode uses `tsx` (no build), your change is picked up immediately.

To trace which handler is being loaded, add a log at the top of `stepRunner.ts`:

```typescript
console.log('[stepRunner] loading', handlerPath);
```

---

## Extending the CLI

### Adding a new CLI flag (params passthrough)

Any `.option()` that is not a routing flag (`--template`, `--list`, `--local`) is automatically stripped out of `options` and forwarded to the engine as `context.params`. You do not need to touch the routing logic.

```typescript
// In src/index.ts — just add the option definition:
program
    .option('--dry-run', 'Preview steps without executing them')
    .option('--registry <url>', 'Override the default official template registry')
```

Then read it inside a step handler or plugin:

```typescript
// In any step handler or plugin:
if (context.params['dry-run']) {
    logger.info('[dry-run] would execute: ...');
    return;
}
```

### Adding a new routing flag

If you need a new **source type** (e.g., `--npm <package>`), add a handler function following the same pattern as `handleDirectTemplate`, then add a branch in the dispatch block at the bottom of the `program.action` callback. Extract the new flag from `options` alongside `template`, `list`, `local` so it does not leak into `params`.

### Changing the remote registry URL

Change the `REGISTRY_URL` constant at the top of `src/index.ts`. The interactive fallback passes this URL to `handleRemoteCatalog`, so one change covers both the interactive wizard and any code that references it.

---

## Publishing

```bash
# From monorepo root, build first
pnpm build

# Then publish the CLI package
cd packages/cli
pnpm publish --access public
```

The `files` field in `package.json` ensures only `dist/` is shipped — source files are not included.

> After publishing, test with `npx create-templar@latest` in a clean directory to confirm production mode (GitHub fetch) works correctly.
