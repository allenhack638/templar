import { execa } from 'execa';
import type { TemplarContext } from '../../engine/context.js';
import { logger } from '../../utils/logger.js';

export interface CommandOptions {
    command: string;
    args?: string[];
    cwd?: string;
}

export const execute = async (
    options: CommandOptions,
    context: TemplarContext
) => {
    const cwd = options.cwd ? options.cwd : context.projectPath;

    logger.info(`Running command: ${options.command} ${(options.args || []).join(' ')}...`);

    await execa(options.command, options.args || [], {
        cwd,
        stdio: 'inherit',
        shell: true,
    });
};
