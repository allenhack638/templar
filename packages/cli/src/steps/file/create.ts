import fs from 'fs-extra';
import path from 'path';
import type { TemplarContext } from '../../engine/context.js';
import { logger } from '../../utils/logger.js';

export interface FileCreateOptions {
    file: string;
    content: string;
}

export const execute = async (
    options: FileCreateOptions,
    context: TemplarContext
) => {
    const targetPath = path.resolve(context.projectPath, options.file);

    await fs.ensureDir(path.dirname(targetPath));

    logger.info(`Creating file ${options.file}...`);
    await fs.writeFile(targetPath, options.content);
};
