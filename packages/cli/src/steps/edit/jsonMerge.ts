import fs from 'fs-extra';
import path from 'path';
import type { TemplarContext } from '../../engine/context.js';
import { mergeJson } from '../../utils/fileUtils.js';
import { logger } from '../../utils/logger.js';

export interface JsonMergeOptions {
    file: string;
    data: any;
}

export const execute = async (
    options: JsonMergeOptions,
    context: TemplarContext
) => {
    const filePath = path.resolve(context.projectPath, options.file);

    if (!(await fs.pathExists(filePath))) {
        logger.warn(`File to merge JSON not found: ${options.file}. Creating new file.`);
        await fs.ensureDir(path.dirname(filePath));
        await fs.writeJson(filePath, options.data, { spaces: 2 });
        return;
    }

    const originalData = await fs.readJson(filePath);
    const newData = mergeJson(originalData, options.data);

    logger.info(`Merging JSON data into ${options.file}...`);
    await fs.writeJson(filePath, newData, { spaces: 2 });
};
