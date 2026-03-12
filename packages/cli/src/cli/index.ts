#!/usr/bin/env node
import { Command } from 'commander';
import inquirer from 'inquirer';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { downloadTemplate } from 'giget';
import { logger } from '../utils/logger.js';
import { loadTemplateSteps } from '../engine/templateLoader.js';
import { createContext } from '../engine/context.js';
import { runSteps } from '../engine/stepRunner.js';

// --- Configuration & Constants ---
const GITHUB_REPO = 'allenhack638/templar';
const REGISTRY_URL = `https://raw.githubusercontent.com/${GITHUB_REPO}/master/packages/templates/templates.json`;

const __filename = fileURLToPath(import.meta.url);
console.log(__filename)
const __dirname = path.dirname(__filename);
console.log(__dirname)


const program = new Command();

interface TemplateMetadata {
    name: string;
    displayName: string;
    description: string;
}

// --- Helper Functions ---

/**
 * Detects if the CLI is running inside your local development workspace.
 */
const getDevTemplatesDir = async (): Promise<string | null> => {
    // Check for the local monorepo structure
    const localPath = path.resolve(__dirname, '../../templates');
    if (await fs.pathExists(localPath) && await fs.pathExists(path.join(localPath, 'templates.json'))) {
        return localPath;
    }
    return null;
};

/**
 * PHASE 1: Fetches the menu (templates.json)
 */
const getTemplates = async (): Promise<TemplateMetadata[]> => {
    const devDir = await getDevTemplatesDir();

    if (devDir) {
        logger.info('🧪 Dev Mode: Using local template registry');
        return await fs.readJson(path.join(devDir, 'templates.json'));
    }

    try {
        const response = await fetch(REGISTRY_URL);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json() as TemplateMetadata[];
    } catch (error) {
        throw new Error('Could not fetch template registry from GitHub. Please check your internet connection.');
    }
};

/**
 * PHASE 2: Downloads/Copies the actual template files
 */
const downloadOrCopyTemplate = async (templateName: string, destination: string) => {
    const devDir = await getDevTemplatesDir();

    if (devDir) {
        const source = path.join(devDir, templateName);
        await fs.copy(source, destination);
        return;
    }

    // Production: Targeted Fetch using giget (Strategy 2)
    const githubPath = `github:${GITHUB_REPO}/packages/templates/${templateName}`;
    await downloadTemplate(githubPath, {
        dir: destination,
        force: true,
    });
};

const sanitizeProjectName = (name: string): string => {
    return name
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-_]/g, '')
        .replace(/-+/g, '-');
};

// --- CLI Main Action ---

program
    .name('templar')
    .description('A step-driven project scaffolding CLI')
    .version('1.0.0')
    .argument('[template]', 'Template name')
    .argument('[project-name]', 'Project folder name')
    .action(async (templateArg, projectNameArg) => {
        try {
            // 1. Load Registry
            const templates = await getTemplates();
            if (templates.length === 0) throw new Error('No valid templates found.');

            let template = '';
            let projectName = '';

            // --- Argument & Prompt Resolution Logic ---
            if (templateArg && projectNameArg) {
                // Scenario: npx templar react-basic my-app
                template = templateArg;
                projectName = sanitizeProjectName(projectNameArg);
            } else if (templateArg) {
                const exists = templates.some(t => t.name === templateArg);
                if (exists) {
                    // Scenario: npx templar react-basic -> Prompt for Name
                    template = templateArg;
                    const answers = await inquirer.prompt([{
                        type: 'input',
                        name: 'projectName',
                        message: 'Project name:',
                        prefix: '🚀',
                        validate: (input) => {
                            const sanitized = sanitizeProjectName(input);
                            return sanitized.length > 0 ? true : 'Project name is required (letters, numbers, hyphens only)';
                        }
                    }]);
                    projectName = sanitizeProjectName(answers.projectName);
                } else {
                    // Scenario: npx templar my-app -> Prompt for Template
                    projectName = sanitizeProjectName(templateArg);
                    const answers = await inquirer.prompt([{
                        type: 'list',
                        name: 'template',
                        message: 'Select a template:',
                        choices: templates.map(t => ({ name: `${t.displayName} - ${t.description}`, value: t.name })),
                    }]);
                    template = answers.template;
                }
            } else {
                // Scenario: npx templar -> Prompt for both
                const answers = await inquirer.prompt([
                    {
                        type: 'list',
                        name: 'template',
                        message: 'Select a template:',
                        choices: templates.map(t => ({ name: `${t.displayName} - ${t.description}`, value: t.name })),
                    },
                    {
                        type: 'input',
                        name: 'projectName',
                        message: 'Project name:',
                        validate: (input) => {
                            const sanitized = sanitizeProjectName(input);
                            return sanitized.length > 0 ? true : 'Project name is required';
                        }
                    },
                ]);
                template = answers.template;
                projectName = sanitizeProjectName(answers.projectName);
            }

            // Final sanity check before file system operations
            if (!projectName) {
                throw new Error('A valid project name is required to continue.');
            }
            projectName = sanitizeProjectName(projectName);
            const targetPath = path.join(process.cwd(), projectName);

            // 3. Execution
            logger.info(`Generating ${template} project in ${projectName}...`);

            // Download/Copy the template files into the target path
            await downloadOrCopyTemplate(template, targetPath);

            // Run Engine Steps (Loading steps.json from the newly created project folder)
            const context = createContext(projectName, template, process.cwd(), targetPath);
            const stepsJson = await loadTemplateSteps(targetPath);

            await runSteps(stepsJson, context);

            logger.success('Project generated successfully!');

        } catch (error: any) {
            logger.error(error.message);
            process.exit(1);
        }
    });

program.parse(process.argv);