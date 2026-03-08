import path from 'path';

export interface TemplarContext {
    projectName: string;
    projectPath: string;
    templateName: string;
    templatePath: string;
}

export const createContext = (
    projectName: string,
    templateName: string,
    cwd: string = process.cwd()
): TemplarContext => {
    return {
        projectName,
        projectPath: path.resolve(cwd, projectName),
        templateName,
        templatePath: path.resolve(cwd, 'templates', templateName),
    };
};
