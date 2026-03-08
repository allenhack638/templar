import fs from 'fs-extra';
import path from 'path';
import type { TemplarContext } from '../../engine/context.js';
import { logger } from '../../utils/logger.js';

export interface FileDeleteOptions {
    file: string;
}

export const execute = async (
    options: FileDeleteOptions,
    context: TemplarContext
) => {
    const targetPath = path.resolve(context.projectPath, options.file);

    if (await fs.pathExists(targetPath)) {
        logger.info(`Deleting ${options.file}...`);
        await fs.remove(targetPath);
    } else {
        logger.warn(`File to delete not found: ${options.file}`);
    }
};
