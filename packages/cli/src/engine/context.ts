export interface TemplarContext {
    projectName: string;
    projectPath: string;
    templateName: string;
    templatePath: string;
    params: Record<string, unknown>;
}

export interface CreateContextConfig {
    projectName: string;
    projectPath: string;
    templateName: string;
    templatePath: string;
    params?: Record<string, unknown>;
}

export const createContext = (config: CreateContextConfig): TemplarContext => {
    return {
        projectName: config.projectName,
        projectPath: config.projectPath,
        templateName: config.templateName,
        templatePath: config.templatePath,
        params: config.params ?? {},
    };
};
