import { Command } from 'commander';
import inquirer from 'inquirer';
import fs from 'fs-extra';
import path from 'path';
import { logger } from '../utils/logger.js';
import { loadTemplateSteps } from '../engine/templateLoader.js';
import { createContext } from '../engine/context.js';
import { runSteps } from '../engine/stepRunner.js';

const program = new Command();

const getTemplates = async () => {
    const templatesPath = path.resolve(process.cwd(), 'templates');
    const items = await fs.readdir(templatesPath);
    return items.filter((item) => fs.statSync(path.join(templatesPath, item)).isDirectory());
};

program
    .name('templar')
    .description('A step-driven project scaffolding CLI')
    .version('1.0.0')
    .argument('[template]', 'Template name')
    .argument('[project-name]', 'Project folder name')
    .action(async (templateArg, projectNameArg) => {
        try {
            let template = templateArg;
            let projectName = projectNameArg;

            // Handle missing arguments interactively
            if (!template && !projectName) {
                const templates = await getTemplates();
                const answers = await inquirer.prompt([
                    {
                        type: 'list',
                        name: 'template',
                        message: 'Select a template:',
                        choices: templates,
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
            } else if (template && !projectName) {
                // If only one arg is provided, the first arg is the PROJECT NAME, and template is missing.
                // Wait, the prompt says:
                /*
                  If the user runs:
                  npx templar my-app
                  The CLI should ask for the template only.
                */
                projectName = templateArg; // Re-assign
                const templates = await getTemplates();
                const answers = await inquirer.prompt([
                    {
                        type: 'list',
                        name: 'template',
                        message: 'Select a template:',
                        choices: templates,
                    },
                ]);
                template = answers.template;
            }

            logger.info(`Generating ${template} project: ${projectName}...`);

            const context = createContext(projectName, template);
            const stepsJson = await loadTemplateSteps(context.templatePath);

            await runSteps(stepsJson, context);

            logger.success('Project generated successfully!');

        } catch (error: any) {
            logger.error(error.message);
            process.exit(1);
        }
    });

program.parse(process.argv);
