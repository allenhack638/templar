import { Command } from 'commander';
import inquirer from 'inquirer';
import fs from 'fs-extra';
import path from 'path';
import { logger } from '../utils/logger.js';
import { loadTemplateSteps } from '../engine/templateLoader.js';
import { createContext } from '../engine/context.js';
import { runSteps } from '../engine/stepRunner.js';

const program = new Command();

interface TemplateMetadata {
    name: string;
    displayName: string;
    description: string;
}

const getTemplatesDir = async (): Promise<string> => {
    const localTemplates = path.resolve(process.cwd(), 'templates');
    if (await fs.pathExists(localTemplates)) return localTemplates;

    const monorepoTemplates = path.resolve(process.cwd(), 'packages', 'templates');
    if (await fs.pathExists(monorepoTemplates)) return monorepoTemplates;

    // Fallback to local even if it doesn't exist yet (for errors)
    return localTemplates;
};

const getTemplates = async (): Promise<TemplateMetadata[]> => {
    const templatesDir = await getTemplatesDir();
    const templatesJsonPath = path.join(templatesDir, 'templates.json');

    if (!(await fs.pathExists(templatesJsonPath))) {
        throw new Error(`Templates registry is missing or corrupted.`);
    }
    const metadata: TemplateMetadata[] = await fs.readJson(templatesJsonPath);

    // Filter to only existing template folders
    const validTemplates: TemplateMetadata[] = [];
    for (const item of metadata) {
        const itemPath = path.join(templatesDir, item.name);
        if (await fs.pathExists(itemPath)) {
            validTemplates.push(item);
        }
    }
    return validTemplates;
};

const sanitizeProjectName = (name: string): string => {
    return name
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-_]/g, '')
        .replace(/-+/g, '-');
};

const validateTemplateExists = async (templateName: string): Promise<boolean> => {
    const templates = await getTemplates();
    const existsInMeta = templates.some(t => t.name === templateName);
    if (!existsInMeta) return false;

    const templatesDir = await getTemplatesDir();
    const templatePath = path.join(templatesDir, templateName);
    return await fs.pathExists(templatePath);
};

program
    .name('templar')
    .description('A step-driven project scaffolding CLI')
    .version('1.0.0')
    .argument('[template]', 'Template name')
    .argument('[project-name]', 'Project folder name')
    .action(async (templateArg, projectNameArg) => {
        try {
            const templates = await getTemplates();
            if (templates.length === 0) {
                throw new Error('No valid templates found in the registry. Please check your "templates" directory.');
            }

            let template = '';
            let projectName = '';

            if (templateArg && projectNameArg) {
                // Both provided: template project-name
                if (!(await validateTemplateExists(templateArg))) {
                    throw new Error(`Invalid template: "${templateArg}". Please select from the list.`);
                }
                template = templateArg;
                projectName = projectNameArg;
            } else if (templateArg) {
                // One arg: could be template OR project name
                if (await validateTemplateExists(templateArg)) {
                    template = templateArg;
                    const answers = await inquirer.prompt([
                        {
                            type: 'input',
                            name: 'projectName',
                            message: 'Project name:',
                            validate: (input) => (input ? true : 'Project name is required'),
                        },
                    ]);
                    projectName = answers.projectName;
                } else {
                    // Not a template, assume it's the project name
                    projectName = templateArg;
                    const answers = await inquirer.prompt([
                        {
                            type: 'list',
                            name: 'template',
                            message: 'Select a template:',
                            choices: templates.map(t => ({
                                name: `${t.displayName} - ${t.description}`,
                                value: t.name
                            })),
                        },
                    ]);
                    template = answers.template;
                }
            } else {
                // No args: prompt for both
                const answers = await inquirer.prompt([
                    {
                        type: 'list',
                        name: 'template',
                        message: 'Select a template:',
                        choices: templates.map(t => ({
                            name: `${t.displayName} - ${t.description}`,
                            value: t.name
                        })),
                    },
                    {
                        type: 'input',
                        name: 'projectName',
                        message: 'Project name:',
                        validate: (input) => (input ? true : 'Project name is required'),
                    },
                ]);
                template = answers.template;
                projectName = answers.projectName;
            }

            projectName = sanitizeProjectName(projectName);

            logger.info(`Generating ${template} project: ${projectName}...`);

            const templatesDir = await getTemplatesDir();
            const context = createContext(projectName, template, process.cwd(), templatesDir);
            const stepsJson = await loadTemplateSteps(context.templatePath);

            await runSteps(stepsJson, context);

            logger.success('Project generated successfully!');

        } catch (error: any) {
            logger.error(error.message);
            process.exit(1);
        }
    });

program.parse(process.argv);
