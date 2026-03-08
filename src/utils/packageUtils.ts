import { execa } from 'execa';

export const installPackages = async (
    projectPath: string,
    packages: Record<string, string>,
    isDev: boolean = false
) => {
    const pkgList = Object.entries(packages).map(([name, version]) =>
        version === 'latest' ? name : `${name}@${version}`
    );

    const command = 'pnpm';
    const args = ['add', ...pkgList];
    if (isDev) args.push('-D');

    await execa(command, args, {
        cwd: projectPath,
        stdio: 'inherit',
    });
};
