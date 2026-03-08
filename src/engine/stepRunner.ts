import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import type { Step, StepsJSON } from '../types/step.js';
import type { TemplarContext } from './context.js';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface StepHandler {
    execute(options: any, context: TemplarContext): Promise<void>;
}

export const runSteps = async (stepsJSON: StepsJSON, context: TemplarContext) => {
    for (const step of stepsJSON.steps) {
        await runStep(step, context);
    }
};

export const runStep = async (step: Step, context: TemplarContext) => {
    const { type, action, options } = step;

    logger.step(type, action);

    try {
        // Dynamic import based on project structure
        const handlerPath = path.resolve(
            __dirname,
            '..',
            'steps',
            type,
            `${action}.ts`
        );

        // In a real build environment, these will be transpiled .js files
        // But since we use tsx or similar, we should handle extensions or just use import()
        // However, for modularity, a simple switch or mapping is safer if dynamic imports are tricky.
        // Let's use dynamic import but handle missing handlers.

        // Note: When running with tsx, this should work.
        const handlerModule = await import(pathToFileURL(handlerPath).href);
        const handler: StepHandler = handlerModule.default || handlerModule;

        if (typeof handler.execute !== 'function') {
            throw new Error(`Handler for ${type}:${action} does not implement execute()`);
        }

        await handler.execute(options, context);
    } catch (err: any) {
        if (err.code === 'MODULE_NOT_FOUND') {
            throw new Error(`No handler found for step type: "${type}" action: "${action}"`);
        }
        throw err;
    }
};
