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
node --import tsx/esm src/index.ts react-basic my-test-app
```

Or link the bin globally for a cleaner experience:

```bash
pnpm link --global   # run once from packages/cli/
templar react-basic my-test-app
```

> **Dev mode detection**: When the CLI is run from inside the monorepo, it automatically detects `packages/templates/` next to itself and uses those local templates instead of fetching from GitHub. You will see a `🧪 Dev Mode: Using local template registry` message confirming this.

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
│   ├── index.ts              # Shebang entry point — just calls cli/index.ts
│   ├── cli/
│   │   └── index.ts          # CLI definition, argument parsing, orchestration
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

The CLI execution follows three phases:

```
Phase 1 — Registry
  getTemplates()
    └── dev mode?  → read local packages/templates/templates.json
                     else → fetch from GitHub raw URL

Phase 2 — Download
  downloadOrCopyTemplate(name, dest)
    └── dev mode?  → fs.copy() from local packages/templates/<name>/
                     else → giget pulls from GitHub

Phase 3 — Execute
  loadTemplateSteps(targetPath)   ← reads steps.json from copied template dir
  createContext(...)              ← builds TemplarContext
  runSteps(stepsJSON, context)    ← iterates steps, dynamically imports handler
```

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
    projectName: string;   // e.g. "my-app"
    projectPath: string;   // absolute path to generated project
    templateName: string;  // e.g. "react-basic"
    templatePath: string;  // absolute path to template source (inside project after copy)
}
```

`templatePath` points to the template directory that was **copied into the target project**, not the original source. Step handlers read static assets from here (e.g., plugin scripts via `plugin:execute`).

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
# 1. Start the CLI against a local template
node --import tsx/esm src/index.ts react-basic test-output

# 2. Inspect the result
ls -la test-output/

# 3. Clean up
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

### Checking dev mode is active

Run the CLI from any directory inside the monorepo. If you see:

```
ℹ 🧪 Dev Mode: Using local template registry
```

dev mode is active. If you don't see this, the CLI cannot find `packages/templates/templates.json` relative to its location — check your `__dirname` resolution in `cli/index.ts`.

---

## Extending the CLI

### Adding a new CLI flag or command

The CLI uses [Commander.js](https://github.com/tj/commander.js). Add options in `cli/index.ts`:

```typescript
program
    .option('--no-install', 'Skip package installation steps')
    .action(async (templateArg, projectNameArg, options) => {
        // options.install === false when --no-install is passed
    });
```

Propagate the flag through `TemplarContext` if step handlers need to read it.

### Changing how templates are fetched

Edit `getTemplates()` and `downloadOrCopyTemplate()` in `cli/index.ts`. Both functions check `getDevTemplatesDir()` first — preserve that contract so local development keeps working.

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
