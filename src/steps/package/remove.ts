import { execa } from 'execa';
import type { TemplarContext } from '../../engine/context.js';
import { logger } from '../../utils/logger.js';

export interface PackageRemoveOptions {
    packages: string[];
}

export const execute = async (
    options: PackageRemoveOptions,
    context: TemplarContext
) => {
    logger.info(`Removing packages: ${options.packages.join(', ')}...`);

    await execa('pnpm', ['remove', ...options.packages], {
        cwd: context.projectPath,
        stdio: 'inherit',
    });
};
