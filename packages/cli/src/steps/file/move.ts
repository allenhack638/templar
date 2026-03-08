import fs from 'fs-extra';
import path from 'path';
import type { TemplarContext } from '../../engine/context.js';
import { logger } from '../../utils/logger.js';

export interface FileMoveOptions {
    from: string;
    to: string;
}

export const execute = async (
    options: FileMoveOptions,
    context: TemplarContext
) => {
    const sourcePath = path.resolve(context.projectPath, options.from);
    const targetPath = path.resolve(context.projectPath, options.to);

    if (!(await fs.pathExists(sourcePath))) {
        throw new Error(`Source path for file:move not found: ${sourcePath}`);
    }

    await fs.ensureDir(path.dirname(targetPath));

    logger.info(`Moving ${options.from} to ${options.to}...`);
    await fs.move(sourcePath, targetPath);
};
