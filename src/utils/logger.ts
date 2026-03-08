import chalk from 'chalk';

export const logger = {
    info: (msg: string) => console.log(chalk.blue('ℹ'), msg),
    success: (msg: string) => console.log(chalk.green('✔'), msg),
    warn: (msg: string) => console.log(chalk.yellow('⚠'), msg),
    error: (msg: string) => console.log(chalk.red('✖'), msg),
    step: (type: string, action: string) =>
        console.log(chalk.cyan(`➜ [${type}:${action}]`)),
};
