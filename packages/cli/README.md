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
# Interactive mode — prompts for template and project name
templar

# Specify a template
templar react-basic

# Specify a project name
templar my-app

# Specify both — no prompts
templar react-basic my-app
```

## How It Works

When you run `templar`, it:

1. **Fetches** the template registry from GitHub (or locally in dev mode)
2. **Prompts** you to select a template and enter a project name (if not provided as arguments)
3. **Downloads** the selected template into a new directory
4. **Executes** each step defined in the template's `steps.json` sequentially

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

**Dev mode**: When running from within the monorepo, the CLI automatically detects the local `packages/templates/` directory and uses it instead of fetching from GitHub. This lets you develop and test templates without publishing.

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
