import fs from 'fs-extra';
import path from 'path';

export const readFile = async (filePath: string) => {
    return fs.readFile(filePath, 'utf-8');
};

export const writeFile = async (filePath: string, content: string) => {
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, content, 'utf-8');
};

export const appendToFile = (original: string, content: string) => {
    return original + '\n' + content;
};

export const prependToFile = (original: string, content: string) => {
    return content + '\n' + original;
};

export const insertAfter = (original: string, match: string, content: string) => {
    const index = original.indexOf(match);
    if (index === -1) return original;
    return original.slice(0, index + match.length) + '\n' + content + original.slice(index + match.length);
};

export const insertBefore = (original: string, match: string, content: string) => {
    const index = original.indexOf(match);
    if (index === -1) return original;
    return original.slice(0, index) + content + '\n' + original.slice(index);
};

export const replaceInFile = (original: string, match: string, content: string) => {
    return original.split(match).join(content);
};

export const mergeJson = (original: any, merge: any) => {
    // Simple recursive merge
    const result = { ...original };
    for (const key in merge) {
        if (merge[key] && typeof merge[key] === 'object' && !Array.isArray(merge[key])) {
            result[key] = mergeJson(result[key] || {}, merge[key]);
        } else {
            result[key] = merge[key];
        }
    }
    return result;
};
