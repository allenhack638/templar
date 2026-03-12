# templar-templates

The official template registry for [create-templar](../cli/README.md). This package contains all scaffolding templates available through the Templar CLI.

## Template Registry

Templates are listed in [`templates.json`](./templates.json). When a user runs `templar`, this file is fetched to populate the selection list.

```json
[
  {
    "name": "react-basic",
    "displayName": "React Basic",
    "description": "A simple React template with minimal setup"
  }
]
```

| Field | Required | Description |
|-------|----------|-------------|
| `name` | yes | Unique identifier used as the directory name and CLI argument |
| `displayName` | yes | Human-readable name shown in the interactive prompt |
| `description` | yes | Short description shown alongside the display name |

---

## Adding a New Template

### 1. Create the template directory

Each template lives in its own directory named after the template's `name` field:

```
packages/templates/
└── your-template-name/
    ├── steps.json        # Required — defines setup steps
    ├── files/            # Optional — static files to copy into the project
    └── plugins/          # Optional — custom plugin scripts
```

### 2. Define steps in `steps.json`

`steps.json` is the heart of a template. It defines an ordered list of operations the CLI engine will execute when scaffolding a project.

```json
{
  "steps": [
    {
      "type": "file",
      "action": "create",
      "options": {
        "file": "package.json",
        "content": "{ \"name\": \"my-project\" }"
      }
    }
  ]
}
```

Steps are executed **sequentially** in the order they appear.

### 3. Register the template

Add an entry to [`templates.json`](./templates.json):

```json
{
  "name": "your-template-name",
  "displayName": "Your Template",
  "description": "What this template creates"
}
```

---

## Step Reference

Every step has this shape:

```json
{
  "type": "<step-type>",
  "action": "<action>",
  "options": { }
}
```

All file paths in `options` are relative to:
- The **project directory** for output files (`file`, `to`)
- The **template directory** for source files (`from`, `script`)

---

### `file` — File system operations

#### `file:create`

Creates a new file with the given content. Parent directories are created automatically.

```json
{
  "type": "file",
  "action": "create",
  "options": {
    "file": "src/index.ts",
    "content": "console.log('hello');"
  }
}
```

| Option | Type | Description |
|--------|------|-------------|
| `file` | `string` | Path relative to the project root |
| `content` | `string` | File content |

---

#### `file:copy`

Copies a file (or directory) from the template into the project.

```json
{
  "type": "file",
  "action": "copy",
  "options": {
    "from": "files/",
    "to": "."
  }
}
```

| Option | Type | Description |
|--------|------|-------------|
| `from` | `string` | Path relative to the template directory |
| `to` | `string` | Destination path relative to the project root |

---

#### `file:delete`

Deletes a file from the project. Logs a warning if the file does not exist.

```json
{
  "type": "file",
  "action": "delete",
  "options": {
    "file": "README.md"
  }
}
```

| Option | Type | Description |
|--------|------|-------------|
| `file` | `string` | Path relative to the project root |

---

#### `file:move` / `file:rename`

Moves or renames a file within the project. `rename` is an alias for `move`.

```json
{
  "type": "file",
  "action": "move",
  "options": {
    "from": "src/old-name.ts",
    "to": "src/new-name.ts"
  }
}
```

| Option | Type | Description |
|--------|------|-------------|
| `from` | `string` | Source path relative to the project root |
| `to` | `string` | Destination path relative to the project root |

---

### `edit` — Edit file contents

#### `edit:append`

Appends content to the end of a file.

```json
{
  "type": "edit",
  "action": "append",
  "options": {
    "file": ".gitignore",
    "content": "dist/\n.env"
  }
}
```

| Option | Type | Description |
|--------|------|-------------|
| `file` | `string` | Path relative to the project root |
| `content` | `string` | Content to append |

---

#### `edit:prepend`

Prepends content to the beginning of a file.

```json
{
  "type": "edit",
  "action": "prepend",
  "options": {
    "file": "src/index.css",
    "content": "@import './theme.css';"
  }
}
```

| Option | Type | Description |
|--------|------|-------------|
| `file` | `string` | Path relative to the project root |
| `content` | `string` | Content to prepend |

---

#### `edit:replace`

Replaces **all** occurrences of a string within a file.

```json
{
  "type": "edit",
  "action": "replace",
  "options": {
    "file": "src/config.ts",
    "match": "APP_NAME",
    "content": "my-app"
  }
}
```

| Option | Type | Description |
|--------|------|-------------|
| `file` | `string` | Path relative to the project root |
| `match` | `string` | String to find (all occurrences replaced) |
| `content` | `string` | Replacement string |

---

#### `edit:insertBefore`

Inserts content before the **first** occurrence of a match string.

```json
{
  "type": "edit",
  "action": "insertBefore",
  "options": {
    "file": "src/main.ts",
    "match": "app.listen",
    "content": "app.use(middleware);"
  }
}
```

| Option | Type | Description |
|--------|------|-------------|
| `file` | `string` | Path relative to the project root |
| `match` | `string` | Anchor string to insert before |
| `content` | `string` | Content to insert |

---

#### `edit:insertAfter`

Inserts content after the **first** occurrence of a match string.

```json
{
  "type": "edit",
  "action": "insertAfter",
  "options": {
    "file": "src/main.ts",
    "match": "import express",
    "content": "import helmet from 'helmet';"
  }
}
```

| Option | Type | Description |
|--------|------|-------------|
| `file` | `string` | Path relative to the project root |
| `match` | `string` | Anchor string to insert after |
| `content` | `string` | Content to insert |

---

#### `edit:jsonMerge`

Deep-merges a JSON object into an existing JSON file. Creates the file if it does not exist.

```json
{
  "type": "edit",
  "action": "jsonMerge",
  "options": {
    "file": "package.json",
    "data": {
      "scripts": {
        "build": "tsc"
      }
    }
  }
}
```

| Option | Type | Description |
|--------|------|-------------|
| `file` | `string` | Path relative to the project root |
| `data` | `object` | JSON object to deep-merge into the file |

Nested objects are merged recursively. Primitive values are overwritten.

---

### `package` — Package management

All package operations use `pnpm` and run in the project directory.

#### `package:install`

Installs production dependencies.

```json
{
  "type": "package",
  "action": "install",
  "options": {
    "packages": {
      "react": "18.3.1",
      "react-dom": "18.3.1"
    }
  }
}
```

| Option | Type | Description |
|--------|------|-------------|
| `packages` | `Record<string, string>` | Map of package name to version (use `"latest"` for latest) |

---

#### `package:installDev`

Installs development dependencies.

```json
{
  "type": "package",
  "action": "installDev",
  "options": {
    "packages": {
      "typescript": "5.0.0",
      "@types/node": "latest"
    }
  }
}
```

| Option | Type | Description |
|--------|------|-------------|
| `packages` | `Record<string, string>` | Map of package name to version |

---

#### `package:remove`

Removes packages from the project.

```json
{
  "type": "package",
  "action": "remove",
  "options": {
    "packages": ["lodash", "moment"]
  }
}
```

| Option | Type | Description |
|--------|------|-------------|
| `packages` | `string[]` | List of package names to remove |

---

### `command` — Shell commands

#### `command:run`

Executes an arbitrary shell command. Defaults to running in the project directory.

```json
{
  "type": "command",
  "action": "run",
  "options": {
    "command": "git",
    "args": ["init"],
    "cwd": "."
  }
}
```

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `command` | `string` | yes | Executable to run |
| `args` | `string[]` | no | Arguments to pass |
| `cwd` | `string` | no | Working directory (defaults to project root) |

---

### `plugin` — Custom scripts

#### `plugin:execute`

Runs a custom TypeScript or JavaScript plugin from the template's `plugins/` directory. Use this for logic too complex to express in `steps.json`.

```json
{
  "type": "plugin",
  "action": "execute",
  "options": {
    "script": "setup-env",
    "options": {
      "port": 3000
    }
  }
}
```

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `script` | `string` | yes | Filename (without extension) inside `plugins/` |
| `options` | `any` | no | Arbitrary options passed to the plugin |

**Plugin file format** (`plugins/setup-env.ts`):

```typescript
import type { TemplarContext } from 'create-templar';

export async function execute(context: TemplarContext, options: any): Promise<void> {
  // context.projectName   — the name entered by the user
  // context.projectPath   — absolute path to the new project
  // context.templateName  — name of the selected template
  // context.templatePath  — absolute path to the template directory
}
```

The plugin must export an `execute` function. Both `.ts` and `.js` files are supported.

---

## Rules for Template Authors

- **`steps.json` is required.** A template without it will fail immediately.
- **Steps are ordered.** Place `file:create` / `file:copy` steps before `edit:*` steps that modify those files.
- **Package installs are slow.** Batch all packages into a single `package:install` step where possible instead of many separate ones.
- **Avoid hardcoded project names.** The project name and path are available at runtime via the step context — use `plugin:execute` if you need dynamic content.
- **Keep `files/` clean.** Only include files that should be copied verbatim. Generated or computed files belong in `file:create` steps.
- **Plugins are for complex logic only.** Prefer declarative steps; reserve plugins for logic that genuinely cannot be expressed as a sequence of steps.
- **Test locally first.** Run `templar your-template-name` from inside the monorepo — dev mode will use the local template before you publish.
- **Register before shipping.** Add your entry to `templates.json` as the last step, after verifying the template works end-to-end.

---

## Example Template

```
packages/templates/
└── node-cli/
    ├── steps.json
    └── files/
        └── src/
            └── index.ts
```

`steps.json`:

```json
{
  "steps": [
    {
      "type": "file",
      "action": "copy",
      "options": {
        "from": "files/",
        "to": "."
      }
    },
    {
      "type": "edit",
      "action": "jsonMerge",
      "options": {
        "file": "package.json",
        "data": {
          "name": "my-cli",
          "version": "0.1.0",
          "bin": { "my-cli": "dist/index.js" }
        }
      }
    },
    {
      "type": "package",
      "action": "installDev",
      "options": {
        "packages": {
          "typescript": "latest",
          "@types/node": "latest"
        }
      }
    },
    {
      "type": "command",
      "action": "run",
      "options": {
        "command": "git",
        "args": ["init"]
      }
    }
  ]
}
```
