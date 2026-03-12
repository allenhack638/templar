# create-templar

A step-driven project scaffolding CLI. Scaffold projects from curated templates with a single command.

## Installation

```bash
npm create templar@latest
# or
pnpm create templar@latest
# or
npx create-templar
```

## Usage

```bash
# Interactive wizard — prompts for everything
templar
templar my-app

# Direct remote template (no menu)
templar my-app --template github:user/repo

# Remote JSON catalog → interactive menu
templar my-app --list https://example.com/templates.json

# Local template directory (great for development)
templar my-app --local ./my-template

# Local JSON catalog → interactive menu
templar my-app --local ./catalog.json
```

`--template`, `--list`, and `--local` are mutually exclusive. Providing more than one exits immediately with an error.

## How It Works

The CLI is a pure traffic router — it resolves a template source, hands it to the engine, and gets out of the way.

1. **Route** — the flag (or interactive wizard) determines the source
2. **Download** — remote sources are fetched via `giget` into a temporary sibling folder
3. **Validate** — `steps.json` must be present and valid JSON before execution starts
4. **Execute** — steps run sequentially; the temp folder is deleted when done (success or failure)

## Available Templates

| Name | Description |
|------|-------------|
| `react-basic` | A simple React template with minimal setup |
| `express-api` | Production-ready Express.js API boilerplate |
| `fullstack` | A monorepo with React frontend and Express backend |

## Development

This package lives inside the `templar` monorepo.

```bash
# Install dependencies from the root
pnpm install

# Build the CLI
pnpm run build

# Watch for changes
pnpm run dev

# Type check
pnpm run check-types
```

## Project Name Rules

Project names are sanitized automatically:
- Converted to lowercase
- Spaces replaced with hyphens
- Only `a-z`, `0-9`, `-`, and `_` are kept

## Step System

Templates define their setup logic in a `steps.json` file. The CLI engine executes each step in order. Available step types:

| Type | Actions | Description |
|------|---------|-------------|
| `file` | `create`, `copy`, `delete`, `move`, `rename` | File system operations |
| `edit` | `append`, `prepend`, `replace`, `insertBefore`, `insertAfter`, `jsonMerge` | Edit file contents |
| `package` | `install`, `installDev`, `remove` | Manage npm packages via pnpm |
| `command` | `run` | Execute shell commands |
| `plugin` | `execute` | Run a custom plugin script from the template |

See the [templar-templates](../templates/README.md) package for full documentation on authoring templates and steps.
