import fs from 'fs-extra';
import path from 'path';
import type { TemplarContext } from '../../engine/context.js';
import { logger } from '../../utils/logger.js';

export interface FileCopyOptions {
    from: string;
    to: string;
}

export const execute = async (
    options: FileCopyOptions,
    context: TemplarContext
) => {
    const sourcePath = path.resolve(context.templatePath, options.from);
    const targetPath = path.resolve(context.projectPath, options.to);

    if (!(await fs.pathExists(sourcePath))) {
        throw new Error(`Source path for file:copy not found: ${sourcePath}`);
    }

    // Ensure target folder exists
    await fs.ensureDir(path.dirname(targetPath));

    logger.info(`Copying ${options.from} to ${options.to}...`);
    await fs.copy(sourcePath, targetPath);
};
