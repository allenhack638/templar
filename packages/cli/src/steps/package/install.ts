import type { TemplarContext } from '../../engine/context.js';
import { installPackages } from '../../utils/packageUtils.js';
import { logger } from '../../utils/logger.js';

export interface PackageInstallOptions {
    packages: Record<string, string>;
}

export const execute = async (
    options: PackageInstallOptions,
    context: TemplarContext
) => {
    logger.info(`Installing packages: ${Object.keys(options.packages).join(', ')}...`);

    await installPackages(context.projectPath, options.packages, false);
};
