import path from 'path';
import { pathToFileURL } from 'url';
import type { TemplarContext } from '../../engine/context.js';
import { logger } from '../../utils/logger.js';

export interface PluginOptions {
    script: string;
    options?: any;
}

export const execute = async (
    options: PluginOptions,
    context: TemplarContext
) => {
    const pluginPath = path.resolve(context.templatePath, 'plugins', `${options.script}.ts`);

    logger.info(`Executing plugin: ${options.script}...`);

    try {
        const pluginModule = await import(pathToFileURL(pluginPath).href);
        const plugin = pluginModule.default || pluginModule;

        if (typeof plugin.execute !== 'function') {
            throw new Error(`Plugin ${options.script} does not implement execute(context)`);
        }

        await plugin.execute(context, options.options);
    } catch (err: any) {
        if (err.code === 'ERR_MODULE_NOT_FOUND') {
            // Try .js if .ts not found (for production etc)
            const jsPluginPath = path.resolve(context.templatePath, 'plugins', `${options.script}.js`);
            const pluginModule = await import(pathToFileURL(jsPluginPath).href);
            const plugin = pluginModule.default || pluginModule;
            await plugin.execute(context, options.options);
        } else {
            throw err;
        }
    }
};
