import fs from 'fs-extra';
import path from 'path';
import type { StepsJSON } from '../types/step.js';

export const loadTemplateSteps = async (templatePath: string): Promise<StepsJSON> => {
    const stepsPath = path.join(templatePath, 'steps.json');

    if (!(await fs.pathExists(stepsPath))) {
        throw new Error(`Template definition (steps.json) is missing. This template might be corrupted.`);
    }

    try {
        const stepsJson: StepsJSON = await fs.readJson(stepsPath);
        return stepsJson;
    } catch (err) {
        throw new Error(`Invalid template definition. The steps.json file is malformed.`);
    }
};
