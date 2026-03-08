export type StepType = 'file' | 'edit' | 'package' | 'command' | 'plugin';

export interface StepOptions {
    [key: string]: any;
}

export interface FileStepOptions extends StepOptions {
    from?: string;
    to?: string;
    file?: string;
    newName?: string;
}

export interface EditStepOptions extends StepOptions {
    file: string;
    content?: string;
    match?: string;
    data?: any;
}

export interface PackageStepOptions extends StepOptions {
    packages?: Record<string, string>;
    isDev?: boolean;
}

export interface CommandStepOptions extends StepOptions {
    command: string;
    args?: string[];
    cwd?: string;
}

export interface PluginStepOptions extends StepOptions {
    script: string;
}

export interface Step {
    type: StepType;
    action: string;
    options: StepOptions;
}

export interface StepsJSON {
    steps: Step[];
}
