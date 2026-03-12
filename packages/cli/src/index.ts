#!/usr/bin/env node
import { Command } from 'commander';
import inquirer from 'inquirer';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { downloadTemplate } from 'giget';
import { logger } from './utils/logger.js';
import { loadTemplateSteps } from './engine/templateLoader.js';
import { createContext } from './engine/context.js';
import { runSteps } from './engine/stepRunner.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REGISTRY_URL =
    'https://raw.githubusercontent.com/allenhack638/templar/master/packages/templates/templates.json';

const TEMP_SUFFIX = '-templar-temp';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TemplateCatalogEntry {
    name: string;
    displayName: string;
    description: string;
    /** giget source (e.g. "github:user/repo/path") for remote catalogs,
     *  or a path relative to the catalog file for local catalogs. */
    source: string;
}

interface SourceFlags {
    template?: string;
    list?: string;
    local?: string;
    dryRun?: boolean;
}

// ---------------------------------------------------------------------------
// Environment helpers
// ---------------------------------------------------------------------------

/**
 * Returns true when running inside a known CI environment.
 * Covers GitHub Actions, GitLab CI, Jenkins, CircleCI, Bitbucket, and the
 * generic CI=true convention used by most modern CI platforms.
 */
export const isCI = (): boolean =>
    process.env.CI === 'true' ||
    process.env.CI === '1' ||
    !!process.env.CONTINUOUS_INTEGRATION ||
    !!process.env.BUILD_ID ||
    !!process.env.GITHUB_ACTIONS;

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

const sanitizeProjectName = (name: string): string =>
    name
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-_]/g, '')
        .replace(/-+/g, '-');

const getTempDir = (cwd: string, projectName: string): string =>
    path.join(cwd, `${projectName}${TEMP_SUFFIX}`);

// ---------------------------------------------------------------------------
// Guard: target project directory must not already exist and be non-empty
// ---------------------------------------------------------------------------

const assertTargetDirAvailable = async (
    projectPath: string,
    projectName: string,
): Promise<void> => {
    if (!(await fs.pathExists(projectPath))) return;

    const entries = await fs.readdir(projectPath);
    if (entries.length > 0) {
        throw new Error(
            `Directory "${projectName}" already exists and is not empty. ` +
            `Choose a different project name or remove the existing directory.`,
        );
    }
};

// ---------------------------------------------------------------------------
// Guard: template directory must contain a valid steps.json
// ---------------------------------------------------------------------------

const assertValidTemplate = async (dir: string): Promise<void> => {
    const stepsPath = path.join(dir, 'steps.json');

    if (!(await fs.pathExists(stepsPath))) {
        throw new Error(
            `Invalid template: steps.json not found in "${dir}". ` +
            `This template may be corrupted or incomplete.`,
        );
    }

    try {
        await fs.readJson(stepsPath);
    } catch {
        throw new Error(
            `Invalid template: steps.json in "${dir}" is malformed JSON.`,
        );
    }
};

// ---------------------------------------------------------------------------
// Temp folder management
// ---------------------------------------------------------------------------

const downloadToTemp = async (source: string, tempDir: string): Promise<void> => {
    // Silently overwrite any stale temp folder left by a previously crashed run.
    if (await fs.pathExists(tempDir)) {
        await fs.remove(tempDir);
    }
    await downloadTemplate(source, { dir: tempDir, force: true });
};

// fs-extra's remove() is safe on non-existent paths (rm -rf semantics) —
// no pathExists guard needed. This keeps the finally-block cleanup
// unconditional, which tests can assert on reliably.
const cleanupTemp = async (tempDir: string): Promise<void> => {
    await fs.remove(tempDir);
};

// ---------------------------------------------------------------------------
// Catalog fetchers
// ---------------------------------------------------------------------------

const fetchRemoteCatalog = async (url: string): Promise<TemplateCatalogEntry[]> => {
    let res: Response;
    try {
        res = await fetch(url);
    } catch (err: any) {
        throw new Error(
            `Network error while fetching catalog from "${url}": ${err.message}. ` +
            `Check your internet connection.`,
        );
    }

    if (!res.ok) {
        throw new Error(
            `Failed to fetch catalog from "${url}": HTTP ${res.status} ${res.statusText}.`,
        );
    }

    try {
        return (await res.json()) as TemplateCatalogEntry[];
    } catch {
        throw new Error(`Catalog at "${url}" did not return valid JSON.`);
    }
};

const readLocalCatalog = async (filePath: string): Promise<TemplateCatalogEntry[]> => {
    try {
        return (await fs.readJson(filePath)) as TemplateCatalogEntry[];
    } catch {
        throw new Error(`Failed to parse local catalog at "${filePath}". Is it valid JSON?`);
    }
};

// ---------------------------------------------------------------------------
// Interactive catalog menu
// ---------------------------------------------------------------------------

const promptCatalogSelection = async (
    catalog: TemplateCatalogEntry[],
): Promise<TemplateCatalogEntry> => {
    if (catalog.length === 0) {
        throw new Error('The template catalog is empty — no templates to select from.');
    }

    const { selected } = await inquirer.prompt<{ selected: TemplateCatalogEntry }>([
        {
            type: 'list',
            name: 'selected',
            message: 'Select a template:',
            choices: catalog.map((t) => ({
                name: `${t.displayName}  —  ${t.description}`,
                value: t,
            })),
        },
    ]);

    return selected;
};

// ---------------------------------------------------------------------------
// Project-name prompt (shared between routes that need it)
// ---------------------------------------------------------------------------

const promptProjectName = async (): Promise<string> => {
    const { name } = await inquirer.prompt<{ name: string }>([
        {
            type: 'input',
            name: 'name',
            message: 'Project name:',
            prefix: '🚀',
            validate: (input: string) => {
                const sanitized = sanitizeProjectName(input);
                return sanitized.length > 0
                    ? true
                    : 'Required. Use letters, numbers, and hyphens only.';
            },
        },
    ]);
    return sanitizeProjectName(name);
};

// ---------------------------------------------------------------------------
// Core engine invocation
// ---------------------------------------------------------------------------

const runEngine = async (
    projectName: string,
    projectPath: string,
    templateName: string,
    templatePath: string,
    params: Record<string, unknown>,
): Promise<void> => {
    const stepsJson = await loadTemplateSteps(templatePath);
    const context = createContext({ projectName, projectPath, templateName, templatePath, params });
    await runSteps(stepsJson, context);
};

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

/**
 * Route 1 — Direct remote template
 *   npx create-templar my-app --template github:user/repo
 */
const handleDirectTemplate = async (
    source: string,
    projectName: string,
    cwd: string,
    params: Record<string, unknown>,
): Promise<void> => {
    const projectPath = path.join(cwd, projectName);
    const tempDir = getTempDir(cwd, projectName);

    await assertTargetDirAvailable(projectPath, projectName);

    try {
        logger.info(`Fetching template from ${source} …`);
        await downloadToTemp(source, tempDir);
        await assertValidTemplate(tempDir);

        const templateName = source.split('/').pop() ?? source;
        await runEngine(projectName, projectPath, templateName, tempDir, params);
    } finally {
        await cleanupTemp(tempDir);
    }
};

/**
 * Route 2 — Remote template catalog
 *   npx create-templar my-app --list https://example.com/templates.json
 */
const handleRemoteCatalog = async (
    catalogUrl: string,
    projectName: string,
    cwd: string,
    params: Record<string, unknown>,
): Promise<void> => {
    logger.info(`Fetching catalog from ${catalogUrl} …`);
    const catalog = await fetchRemoteCatalog(catalogUrl);
    const selected = await promptCatalogSelection(catalog);

    const projectPath = path.join(cwd, projectName);
    const tempDir = getTempDir(cwd, projectName);

    await assertTargetDirAvailable(projectPath, projectName);

    try {
        logger.info(`Fetching template: ${selected.displayName} …`);
        await downloadToTemp(selected.source, tempDir);
        await assertValidTemplate(tempDir);

        await runEngine(projectName, projectPath, selected.name, tempDir, params);
    } finally {
        await cleanupTemp(tempDir);
    }
};

/**
 * Route 3 & 4 — Local path (directory or catalog JSON)
 *   npx create-templar my-app --local ./drafts/my-template
 *   npx create-templar my-app --local ./catalog.json
 */
const handleLocalPath = async (
    localArg: string,
    projectName: string,
    cwd: string,
    params: Record<string, unknown>,
): Promise<void> => {
    const resolvedLocal = path.resolve(cwd, localArg);

    if (!(await fs.pathExists(resolvedLocal))) {
        throw new Error(`Local path does not exist: "${resolvedLocal}".`);
    }

    const stat = fs.statSync(resolvedLocal);

    if (stat.isDirectory()) {
        await assertValidTemplate(resolvedLocal);

        const projectPath = path.join(cwd, projectName);
        await assertTargetDirAvailable(projectPath, projectName);

        const templateName = path.basename(resolvedLocal);
        logger.info(`Using local template at "${resolvedLocal}" …`);
        await runEngine(projectName, projectPath, templateName, resolvedLocal, params);

    } else if (resolvedLocal.endsWith('.json')) {
        const catalog = await readLocalCatalog(resolvedLocal);
        const selected = await promptCatalogSelection(catalog);

        const catalogDir = path.dirname(resolvedLocal);
        const templatePath = path.resolve(catalogDir, selected.source);

        if (!(await fs.pathExists(templatePath))) {
            throw new Error(
                `Template path referenced in catalog does not exist: "${templatePath}".`,
            );
        }

        await assertValidTemplate(templatePath);

        const projectPath = path.join(cwd, projectName);
        await assertTargetDirAvailable(projectPath, projectName);

        logger.info(`Using local template: ${selected.displayName} …`);
        await runEngine(projectName, projectPath, selected.name, templatePath, params);

    } else {
        throw new Error(
            `--local must point to a directory or a .json catalog file. ` +
            `Got: "${resolvedLocal}".`,
        );
    }
};

/**
 * Route 5 — Interactive fallback (no source flags)
 *   npx create-templar
 *   npx create-templar my-app
 */
const handleInteractiveFallback = async (
    projectNameArg: string | undefined,
    cwd: string,
    params: Record<string, unknown>,
): Promise<void> => {
    // Refuse to block a CI pipeline on an interactive prompt.
    if (isCI()) {
        throw new Error(
            'Running in a CI environment. Interactive mode is disabled. ' +
            'Provide --template, --list, or --local flags explicitly.',
        );
    }

    const projectName = projectNameArg
        ? sanitizeProjectName(projectNameArg)
        : await promptProjectName();

    const { sourceType } = await inquirer.prompt<{ sourceType: string }>([
        {
            type: 'list',
            name: 'sourceType',
            message: 'How would you like to select a template?',
            choices: [
                { name: 'Browse official templates', value: 'official' },
                { name: 'Enter a GitHub source  (e.g. github:user/repo)', value: 'github' },
                { name: 'Use a local template directory or catalog', value: 'local' },
            ],
        },
    ]);

    if (sourceType === 'official') {
        await handleRemoteCatalog(REGISTRY_URL, projectName, cwd, params);

    } else if (sourceType === 'github') {
        const { source } = await inquirer.prompt<{ source: string }>([
            {
                type: 'input',
                name: 'source',
                message: 'GitHub source:',
                validate: (v: string) =>
                    v.trim().startsWith('github:')
                        ? true
                        : 'Must start with "github:"  (e.g. github:user/repo)',
            },
        ]);
        await handleDirectTemplate(source.trim(), projectName, cwd, params);

    } else {
        const { localPath } = await inquirer.prompt<{ localPath: string }>([
            {
                type: 'input',
                name: 'localPath',
                message: 'Path to local template directory or catalog.json:',
                validate: (v: string) =>
                    v.trim().length > 0 ? true : 'Required.',
            },
        ]);
        await handleLocalPath(localPath.trim(), projectName, cwd, params);
    }
};

// ---------------------------------------------------------------------------
// Exported run() — the testable entrypoint
// ---------------------------------------------------------------------------

/**
 * Parses argv and executes the CLI.
 * Exported so tests can call `run([...args])` directly without spawning
 * a child process or fighting module-level side effects.
 */
export async function run(argv: string[] = process.argv): Promise<void> {
    // A fresh Command instance per run() call avoids accumulated handler state
    // between test invocations.
    const program = new Command();

    program
        .name('templar')
        .description('A step-driven project scaffolding CLI')
        .version('1.0.1')
        .argument('[project-name]', 'Name of the project to scaffold')
        .option('--template <source>', 'Directly scaffold from a remote source (e.g. github:user/repo)')
        .option('--list <url>',        'Fetch a remote JSON catalog and pick a template interactively')
        .option('--local <path>',      'Use a local template directory or local catalog.json')
        // --dry-run is an example of a domain-specific passthrough param.
        // It is NOT handled specially by the router — it flows to context.params
        // via the generic spread, proving the extensibility contract.
        .option('--dry-run',           'Preview what the engine would do without executing steps')
        .action(async (
            projectNameArg: string | undefined,
            options: SourceFlags & Record<string, unknown>,
        ) => {
            const cwd = process.cwd();

            try {
                // --- Route 6: mutual exclusivity gate ---
                const activeSources = [options.template, options.list, options.local].filter(Boolean);
                if (activeSources.length > 1) {
                    throw new Error(
                        'Conflicting source flags detected. ' +
                        'Provide exactly one of: --template, --list, or --local.',
                    );
                }

                // Strip routing flags; everything else flows to the engine as params.
                // This is deliberately generic — the router has NO knowledge of what
                // params contain. Domain-specific flags (e.g. --dry-run, --table-name)
                // pass through automatically without any hardcoded exceptions here.
                const { template, list, local, ...params } = options;

                // Resolve project name. In CI, refuse to prompt — fail fast instead.
                const resolveProjectName = async (): Promise<string> => {
                    if (projectNameArg) return sanitizeProjectName(projectNameArg);
                    if (isCI()) {
                        throw new Error(
                            'Running in a CI environment. ' +
                            'Project name argument is required (positional, before flags).',
                        );
                    }
                    return promptProjectName();
                };

                // --- Dispatch ---
                if (template) {
                    const projectName = await resolveProjectName();
                    await handleDirectTemplate(template, projectName, cwd, params);

                } else if (list) {
                    const projectName = await resolveProjectName();
                    await handleRemoteCatalog(list, projectName, cwd, params);

                } else if (local) {
                    const projectName = await resolveProjectName();
                    await handleLocalPath(local, projectName, cwd, params);

                } else {
                    await handleInteractiveFallback(projectNameArg, cwd, params);
                }

                logger.success('Project generated successfully!');

            } catch (error: any) {
                logger.error(error.message);
                process.exit(1);
            }
        });

    await program.parseAsync(argv);
}

// ---------------------------------------------------------------------------
// Entry-point guard — only auto-run when executed directly, never on import
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
if (path.resolve(process.argv[1] ?? '') === path.resolve(__filename)) {
    run();
}
