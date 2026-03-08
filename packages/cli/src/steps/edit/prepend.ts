import path from 'path';
import type { TemplarContext } from '../../engine/context.js';
import { readFile, writeFile, prependToFile } from '../../utils/fileUtils.js';
import { logger } from '../../utils/logger.js';

export interface EditOptions {
    file: string;
    content: string;
}

export const execute = async (
    options: EditOptions,
    context: TemplarContext
) => {
    const filePath = path.resolve(context.projectPath, options.file);

    const content = await readFile(filePath);
    const updated = prependToFile(content, options.content);

    logger.info(`Prepending content to ${options.file}...`);
    await writeFile(filePath, updated);
};
