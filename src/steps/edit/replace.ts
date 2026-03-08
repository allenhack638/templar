import path from 'path';
import type { TemplarContext } from '../../engine/context.js';
import { readFile, writeFile, replaceInFile } from '../../utils/fileUtils.js';
import { logger } from '../../utils/logger.js';

export interface EditOptions {
    file: string;
    match: string;
    content: string;
}

export const execute = async (
    options: EditOptions,
    context: TemplarContext
) => {
    const filePath = path.resolve(context.projectPath, options.file);

    const content = await readFile(filePath);
    const updated = replaceInFile(content, options.match, options.content);

    logger.info(`Replacing content in ${options.file}...`);
    await writeFile(filePath, updated);
};
