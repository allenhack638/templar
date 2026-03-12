#!/usr/bin/env node
import { Command } from 'commander';
import inquirer from 'inquirer';
import fs from 'fs-extra';
import path from 'path';
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
}

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

const cleanupTemp = async (tempDir: string): Promise<void> => {
    if (await fs.pathExists(tempDir)) {
        await fs.remove(tempDir);
    }
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
 *
 * Downloads the giget source to a temp folder, validates it,
 * runs the engine, then deletes the temp folder.
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
 *
 * Fetches the JSON catalog, shows an interactive menu,
 * downloads the selected template to a temp folder, runs the engine,
 * then deletes the temp folder.
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
 *
 * Uses fs.statSync to distinguish a directory (Route 3) from
 * a .json file (Route 4). No network calls, no temp folder.
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
        // Route 3: direct local template directory
        await assertValidTemplate(resolvedLocal);

        const projectPath = path.join(cwd, projectName);
        await assertTargetDirAvailable(projectPath, projectName);

        const templateName = path.basename(resolvedLocal);
        logger.info(`Using local template at "${resolvedLocal}" …`);
        await runEngine(projectName, projectPath, templateName, resolvedLocal, params);

    } else if (resolvedLocal.endsWith('.json')) {
        // Route 4: local catalog JSON
        const catalog = await readLocalCatalog(resolvedLocal);
        const selected = await promptCatalogSelection(catalog);

        // Catalog entry sources are resolved relative to the catalog file's location.
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
 *
 * Guides the user through selecting a source type, then delegates
 * to the appropriate route handler above.
 */
const handleInteractiveFallback = async (
    projectNameArg: string | undefined,
    cwd: string,
    params: Record<string, unknown>,
): Promise<void> => {
    // Step 1: resolve project name
    const projectName = projectNameArg
        ? sanitizeProjectName(projectNameArg)
        : await promptProjectName();

    // Step 2: choose source type
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
// CLI definition
// ---------------------------------------------------------------------------

const program = new Command();

program
    .name('templar')
    .description('A step-driven project scaffolding CLI')
    .version('1.0.1')
    .argument('[project-name]', 'Name of the project to scaffold')
    .option('--template <source>', 'Directly scaffold from a remote source (e.g. github:user/repo)')
    .option('--list <url>',        'Fetch a remote JSON catalog and pick a template interactively')
    .option('--local <path>',      'Use a local template directory or local catalog.json')
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

            // Strip routing flags; everything else is passed through to the engine as params.
            const { template, list, local, ...params } = options;

            // Resolve project name for flag-based routes (prompt only if arg is missing).
            const resolveProjectName = async (): Promise<string> =>
                projectNameArg
                    ? sanitizeProjectName(projectNameArg)
                    : promptProjectName();

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
                // Interactive fallback — project name resolution handled inside.
                await handleInteractiveFallback(projectNameArg, cwd, params);
            }

            logger.success('Project generated successfully!');

        } catch (error: any) {
            logger.error(error.message);
            process.exit(1);
        }
    });

program.parse(process.argv);
