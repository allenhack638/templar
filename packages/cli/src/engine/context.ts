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
    cwd: string = process.cwd(),
    templatesDir: string = path.resolve(cwd, 'templates')
): TemplarContext => {
    return {
        projectName,
        projectPath: path.resolve(cwd, projectName),
        templateName,
        templatePath: path.resolve(templatesDir, templateName),
    };
};
