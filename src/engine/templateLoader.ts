import fs from 'fs-extra';
import path from 'path';
import type { StepsJSON } from '../types/step.js';

export const loadTemplateSteps = async (templatePath: string): Promise<StepsJSON> => {
    const stepsPath = path.join(templatePath, 'steps.json');

    if (!(await fs.pathExists(stepsPath))) {
        throw new Error(`Template steps.json not found at ${stepsPath}`);
    }

    const stepsJson: StepsJSON = await fs.readJson(stepsPath);
    return stepsJson;
};
