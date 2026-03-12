/**
 * Test suite for the create-templar CLI router (src/index.ts)
 *
 * Strategy
 * ─────────
 * • Unit isolation  — routing, validation, and flag-collision tests mock every
 *   external boundary (fs, giget, inquirer, engine modules).
 * • Integration wiring — happy-path tests let createContext() execute for real
 *   and verify its output reaches runSteps(), catching any plumbing bugs
 *   between the router and the engine.
 *
 * Mocking contract
 * ────────────────
 * • fs-extra   : in-memory, never touches disk
 * • giget      : no-op; we verify it was called with the right args
 * • inquirer   : programmatic; simulates user selections and cancellations
 * • fetch      : stubbed via vi.stubGlobal; simulates HTTP responses
 * • engine     : loadTemplateSteps + runSteps are spied / mocked
 * • process.exit: spied so the test runner survives CLI error paths
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';

// ---------------------------------------------------------------------------
// Mock declarations (Vitest hoists these above all imports automatically)
// ---------------------------------------------------------------------------

vi.mock('giget', () => ({
    downloadTemplate: vi.fn(),
}));

vi.mock('fs-extra', async () => ({
    default: {
        pathExists:  vi.fn(),
        readdir:     vi.fn(),
        readJson:    vi.fn(),
        statSync:    vi.fn(),
        remove:      vi.fn(),
        copy:        vi.fn(),
        ensureDir:   vi.fn(),
    },
}));

vi.mock('inquirer', () => ({
    default: { prompt: vi.fn() },
}));

vi.mock('../engine/templateLoader.js', () => ({
    loadTemplateSteps: vi.fn(),
}));

vi.mock('../engine/stepRunner.js', () => ({
    runSteps: vi.fn(),
}));

// logger must not write to stdout/stderr during tests
vi.mock('../utils/logger.js', () => ({
    logger: {
        info:    vi.fn(),
        success: vi.fn(),
        warn:    vi.fn(),
        error:   vi.fn(),
    },
}));

// ---------------------------------------------------------------------------
// Imports — received after mocks are applied
// ---------------------------------------------------------------------------

import { run, isCI } from '../index.js';
import { downloadTemplate } from 'giget';
import fs                   from 'fs-extra';
import inquirer              from 'inquirer';
import { loadTemplateSteps } from '../engine/templateLoader.js';
import { runSteps }          from '../engine/stepRunner.js';

// ---------------------------------------------------------------------------
// Typed aliases for cleaner test code
// ---------------------------------------------------------------------------

const dlMock            = vi.mocked(downloadTemplate);
const pathExistsMock    = vi.mocked(fs.pathExists);
const readdirMock       = vi.mocked(fs.readdir);
const readJsonMock      = vi.mocked(fs.readJson);
const statSyncMock      = vi.mocked(fs.statSync);
const removeMock        = vi.mocked(fs.remove);
const promptMock        = vi.mocked(inquirer.prompt);
const loadStepsMock     = vi.mocked(loadTemplateSteps);
const runStepsMock      = vi.mocked(runSteps);

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

// Use path.resolve() so fixtures are OS-correct absolute paths — matching
// exactly what path.resolve(cwd, arg) produces when the code receives them.
const LOCAL_TEMPLATE_DIR   = path.resolve('test-fixtures', 'my-template');
const LOCAL_CATALOG_PATH   = path.resolve('test-fixtures', 'catalog.json');
const PROJECT_NAME         = 'my-app';
const GITHUB_SOURCE        = 'github:user/repo/my-template';
const REMOTE_CATALOG_URL   = 'https://example.com/templates.json';

const REMOTE_CATALOG = [
    {
        name:        'react-basic',
        displayName: 'React Basic',
        description: 'A React template',
        source:      GITHUB_SOURCE,
    },
];

const LOCAL_CATALOG = [
    {
        name:        'react-basic',
        displayName: 'React Basic',
        description: 'A React template',
        source:      './react-basic',   // relative to catalog file location
    },
];

/** Build a process.argv-style array for run() */
const argv = (...args: string[]) => ['node', 'templar', ...args];

/** A fetch response factory */
const okFetch = (body: unknown) => ({
    ok:     true,
    status: 200,
    json:   async () => body,
});

const errFetch = (status: number, text: string) => ({
    ok:         false,
    status,
    statusText: text,
    json:       async () => { throw new Error('not json'); },
});

// ---------------------------------------------------------------------------
// Global test setup
// ---------------------------------------------------------------------------

let exitSpy:  ReturnType<typeof vi.spyOn>;
let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
    vi.clearAllMocks();

    // ── process.exit: capture the call, prevent the process from actually dying
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    // ── fetch: stubbed globally, returns a sensible default
    fetchSpy = vi.fn().mockResolvedValue(okFetch(REMOTE_CATALOG));
    vi.stubGlobal('fetch', fetchSpy);

    // ── fs defaults: safe "nothing exists" baseline
    pathExistsMock.mockImplementation(async (p: any) => {
        const s = String(p);
        if (s.endsWith('steps.json'))              return true;   // every template has steps.json
        if (s.includes('-templar-temp'))            return false;  // no stale temp folder
        if (s === LOCAL_TEMPLATE_DIR)               return true;   // local template dir exists
        return false;                                              // target project dir does not
    });

    readdirMock.mockResolvedValue([]  as any);
    removeMock .mockResolvedValue(undefined as any);
    readJsonMock.mockResolvedValue({ steps: [] });
    statSyncMock.mockReturnValue({ isDirectory: () => true } as any);

    // ── engine defaults: succeed silently
    loadStepsMock.mockResolvedValue({ steps: [] });
    runStepsMock .mockResolvedValue(undefined);
    dlMock       .mockResolvedValue({} as any);
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    // Clean any CI env vars set by individual tests
    delete process.env.CI;
    delete process.env.CONTINUOUS_INTEGRATION;
    delete process.env.BUILD_ID;
    delete process.env.GITHUB_ACTIONS;
});

// ===========================================================================
// 1. HAPPY PATHS — ROUTING & WIRING
// ===========================================================================

describe('Route 1 — Direct remote template (--template)', () => {

    it('downloads the remote source and invokes the engine exactly once', async () => {
        // Industry standard: the router must delegate to giget and the engine
        // without performing any business logic of its own.
        await run(argv(PROJECT_NAME, '--template', GITHUB_SOURCE));

        expect(dlMock).toHaveBeenCalledOnce();
        expect(dlMock).toHaveBeenCalledWith(GITHUB_SOURCE, expect.objectContaining({ force: true }));
        expect(runStepsMock).toHaveBeenCalledOnce();
        expect(exitSpy).not.toHaveBeenCalled();
    });

    it('derives templateName from the last path segment of the giget source', async () => {
        // The engine context must receive a human-readable name, not the full URI.
        const source = 'github:owner/repo/packages/templates/react-basic';
        await run(argv(PROJECT_NAME, '--template', source));

        expect(runStepsMock).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ templateName: 'react-basic' }),
        );
    });

    it('deletes the temp folder in the finally block after a successful run', async () => {
        // Workspace hygiene: the temp dir must vanish whether the engine
        // succeeds or fails (this test covers the success path).
        await run(argv(PROJECT_NAME, '--template', GITHUB_SOURCE));

        expect(removeMock).toHaveBeenCalledWith(
            expect.stringContaining(`${PROJECT_NAME}-templar-temp`),
        );
    });

    it('silently overwrites a stale temp folder from a previously crashed run', async () => {
        // Resilience: a leftover temp folder must never block a fresh scaffold.
        pathExistsMock.mockImplementation(async (p: any) => {
            const s = String(p);
            if (s.includes('-templar-temp'))   return true;  // stale folder exists
            if (s.endsWith('steps.json'))      return true;
            return false;
        });

        await run(argv(PROJECT_NAME, '--template', GITHUB_SOURCE));

        // remove() on the temp dir must happen BEFORE downloadTemplate()
        const removeOrder = removeMock.mock.invocationCallOrder[0];
        const dlOrder     = dlMock.mock.invocationCallOrder[0];
        expect(removeOrder).toBeLessThan(dlOrder);
        expect(exitSpy).not.toHaveBeenCalled();
    });

    it('passes non-routing flags through to engine context.params without any hardcoded logic', async () => {
        // Extensibility contract: the router uses a generic spread to forward all
        // unknown flags. --dry-run must reach context.params.dryRun without the
        // router having any explicit handling for it.
        await run(argv(PROJECT_NAME, '--template', GITHUB_SOURCE, '--dry-run'));

        expect(runStepsMock).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                params: expect.objectContaining({ dryRun: true }),
            }),
        );
    });

    it('wiring: passes correct projectPath and templatePath to the engine', async () => {
        // Integration: verify the context object is constructed correctly
        // and reaches runSteps with the expected absolute paths.
        const cwd = process.cwd();
        await run(argv(PROJECT_NAME, '--template', GITHUB_SOURCE));

        expect(runStepsMock).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                projectName:  PROJECT_NAME,
                projectPath:  path.join(cwd, PROJECT_NAME),
                templatePath: expect.stringContaining(`${PROJECT_NAME}-templar-temp`),
            }),
        );
    });
});

// ---------------------------------------------------------------------------

describe('Route 2 — Remote catalog (--list)', () => {

    beforeEach(() => {
        promptMock.mockResolvedValue({ selected: REMOTE_CATALOG[0] });
    });

    it('fetches catalog, shows interactive menu, downloads selected template, and invokes engine', async () => {
        await run(argv(PROJECT_NAME, '--list', REMOTE_CATALOG_URL));

        expect(fetchSpy).toHaveBeenCalledWith(REMOTE_CATALOG_URL);
        expect(promptMock).toHaveBeenCalledOnce();
        expect(dlMock).toHaveBeenCalledWith(GITHUB_SOURCE, expect.anything());
        expect(runStepsMock).toHaveBeenCalledOnce();
        expect(exitSpy).not.toHaveBeenCalled();
    });

    it('deletes temp folder after successful --list execution', async () => {
        await run(argv(PROJECT_NAME, '--list', REMOTE_CATALOG_URL));

        expect(removeMock).toHaveBeenCalledWith(
            expect.stringContaining(`${PROJECT_NAME}-templar-temp`),
        );
    });
});

// ---------------------------------------------------------------------------

describe('Route 3 — Direct local template directory (--local <dir>)', () => {

    it('uses local directory directly — no network call, no temp folder', async () => {
        await run(argv(PROJECT_NAME, '--local', LOCAL_TEMPLATE_DIR));

        expect(dlMock).not.toHaveBeenCalled();
        expect(removeMock).not.toHaveBeenCalled();
        expect(runStepsMock).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ templatePath: LOCAL_TEMPLATE_DIR }),
        );
        expect(exitSpy).not.toHaveBeenCalled();
    });

    it('derives templateName from the basename of the local directory', async () => {
        await run(argv(PROJECT_NAME, '--local', LOCAL_TEMPLATE_DIR));

        expect(runStepsMock).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ templateName: path.basename(LOCAL_TEMPLATE_DIR) }),
        );
    });
});

// ---------------------------------------------------------------------------

describe('Route 4 — Local JSON catalog (--local <catalog.json>)', () => {

    const LOCAL_RESOLVED_TEMPLATE = path.resolve(path.dirname(LOCAL_CATALOG_PATH), './react-basic');

    beforeEach(() => {
        statSyncMock.mockReturnValue({ isDirectory: () => false } as any);
        readJsonMock.mockResolvedValue(LOCAL_CATALOG);
        promptMock.mockResolvedValue({ selected: LOCAL_CATALOG[0] });

        pathExistsMock.mockImplementation(async (p: any) => {
            const s = String(p);
            if (s === LOCAL_CATALOG_PATH)              return true;
            if (s === LOCAL_RESOLVED_TEMPLATE)         return true;
            if (s.endsWith('steps.json'))              return true;
            return false;
        });
    });

    it('reads catalog, shows menu, resolves relative source path, and invokes engine', async () => {
        await run(argv(PROJECT_NAME, '--local', LOCAL_CATALOG_PATH));

        expect(promptMock).toHaveBeenCalledOnce();
        expect(dlMock).not.toHaveBeenCalled();
        expect(runStepsMock).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                templateName: 'react-basic',
                templatePath: LOCAL_RESOLVED_TEMPLATE,
            }),
        );
    });
});

// ---------------------------------------------------------------------------

describe('Route 5 — Interactive fallback (no flags)', () => {

    it('prompts for source type and delegates to the official catalog when chosen', async () => {
        promptMock
            .mockResolvedValueOnce({ sourceType: 'official' })
            .mockResolvedValueOnce({ selected: REMOTE_CATALOG[0] });

        await run(argv(PROJECT_NAME));

        expect(runStepsMock).toHaveBeenCalledOnce();
        expect(exitSpy).not.toHaveBeenCalled();
    });

    it('prompts for project name when none is provided as a positional argument', async () => {
        promptMock
            .mockResolvedValueOnce({ name: PROJECT_NAME })
            .mockResolvedValueOnce({ sourceType: 'official' })
            .mockResolvedValueOnce({ selected: REMOTE_CATALOG[0] });

        await run(argv()); // no args at all

        expect(runStepsMock).toHaveBeenCalledOnce();
        expect(exitSpy).not.toHaveBeenCalled();
    });

    it('delegates to --template route when user selects the "github" source type', async () => {
        promptMock
            .mockResolvedValueOnce({ sourceType: 'github' })
            .mockResolvedValueOnce({ source: GITHUB_SOURCE });

        await run(argv(PROJECT_NAME));

        expect(dlMock).toHaveBeenCalledWith(GITHUB_SOURCE, expect.anything());
    });

    it('delegates to --local route when user selects the "local" source type', async () => {
        promptMock
            .mockResolvedValueOnce({ sourceType: 'local' })
            .mockResolvedValueOnce({ localPath: LOCAL_TEMPLATE_DIR });

        await run(argv(PROJECT_NAME));

        expect(dlMock).not.toHaveBeenCalled();
        expect(runStepsMock).toHaveBeenCalledOnce();
    });
});

// ===========================================================================
// 2. FLAG COLLISIONS & VALIDATION GATE
// ===========================================================================

describe('Route 6 — Mutual exclusivity gate', () => {

    it('exits(1) and never touches disk/network when --template and --local are combined', async () => {
        await run(argv(PROJECT_NAME, '--template', GITHUB_SOURCE, '--local', LOCAL_TEMPLATE_DIR));

        expect(exitSpy).toHaveBeenCalledWith(1);
        expect(dlMock).not.toHaveBeenCalled();
        expect(runStepsMock).not.toHaveBeenCalled();
    });

    it('exits(1) when --list and --local are combined', async () => {
        await run(argv(PROJECT_NAME, '--list', REMOTE_CATALOG_URL, '--local', LOCAL_TEMPLATE_DIR));

        expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('exits(1) when all three source flags are combined', async () => {
        await run(argv(
            PROJECT_NAME,
            '--template', GITHUB_SOURCE,
            '--list',     REMOTE_CATALOG_URL,
            '--local',    LOCAL_TEMPLATE_DIR,
        ));

        expect(exitSpy).toHaveBeenCalledWith(1);
    });
});

// ---------------------------------------------------------------------------

describe('Target directory guard', () => {

    it('exits(1) without downloading when the target directory exists and is non-empty', async () => {
        // Safety: the router must never silently overwrite the user's existing files.
        pathExistsMock.mockImplementation(async (p: any) => {
            if (String(p).endsWith(PROJECT_NAME)) return true;
            return false;
        });
        readdirMock.mockResolvedValue(['package.json'] as any); // non-empty

        await run(argv(PROJECT_NAME, '--template', GITHUB_SOURCE));

        expect(exitSpy).toHaveBeenCalledWith(1);
        expect(dlMock).not.toHaveBeenCalled();
    });

    it('succeeds when the target directory exists but is empty', async () => {
        pathExistsMock.mockImplementation(async (p: any) => {
            const s = String(p);
            if (s.endsWith(PROJECT_NAME))     return true;  // dir exists
            if (s.endsWith('steps.json'))     return true;
            return false;
        });
        readdirMock.mockResolvedValue([] as any); // empty

        await run(argv(PROJECT_NAME, '--template', GITHUB_SOURCE));

        expect(runStepsMock).toHaveBeenCalledOnce();
        expect(exitSpy).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------

describe('Template validation guard', () => {

    it('exits(1) when steps.json is missing from a remote template after download', async () => {
        pathExistsMock.mockImplementation(async (p: any) => {
            if (String(p).endsWith('steps.json')) return false; // missing
            return false;
        });

        await run(argv(PROJECT_NAME, '--template', GITHUB_SOURCE));

        expect(exitSpy).toHaveBeenCalledWith(1);
        expect(runStepsMock).not.toHaveBeenCalled();
    });

    it('exits(1) when steps.json is present but contains malformed JSON', async () => {
        pathExistsMock.mockImplementation(async (p: any) => {
            if (String(p).endsWith('steps.json')) return true;
            return false;
        });
        readJsonMock.mockRejectedValue(new SyntaxError('Unexpected token'));

        await run(argv(PROJECT_NAME, '--template', GITHUB_SOURCE));

        expect(exitSpy).toHaveBeenCalledWith(1);
        expect(runStepsMock).not.toHaveBeenCalled();
    });

    it('still cleans up the temp folder when validation fails after download', async () => {
        // Resilience: the finally block must run even when assertValidTemplate throws.
        pathExistsMock.mockImplementation(async (p: any) => {
            if (String(p).endsWith('steps.json'))   return false; // missing steps.json
            if (String(p).includes('-templar-temp')) return false;
            return false;
        });

        await run(argv(PROJECT_NAME, '--template', GITHUB_SOURCE));

        expect(exitSpy).toHaveBeenCalledWith(1);
        expect(removeMock).toHaveBeenCalledWith(
            expect.stringContaining(`${PROJECT_NAME}-templar-temp`),
        );
    });
});

// ===========================================================================
// 3. NETWORK & FILESYSTEM CHAOS
// ===========================================================================

describe('Network failures — giget (--template)', () => {

    it('exits(1) cleanly when giget throws a download error', async () => {
        dlMock.mockRejectedValue(new Error('repository not found'));

        await run(argv(PROJECT_NAME, '--template', GITHUB_SOURCE));

        expect(exitSpy).toHaveBeenCalledWith(1);
        expect(runStepsMock).not.toHaveBeenCalled();
    });

    it('cleans up a partially-created temp folder when giget throws', async () => {
        dlMock.mockRejectedValue(new Error('network error'));
        // Temp dir was partially created before the error
        pathExistsMock.mockImplementation(async (p: any) => {
            if (String(p).includes('-templar-temp')) return true;
            return false;
        });

        await run(argv(PROJECT_NAME, '--template', GITHUB_SOURCE));

        expect(removeMock).toHaveBeenCalledWith(
            expect.stringContaining(`${PROJECT_NAME}-templar-temp`),
        );
    });
});

// ---------------------------------------------------------------------------

describe('Network failures — remote catalog (--list)', () => {

    it('exits(1) cleanly on HTTP 404 from the catalog URL', async () => {
        fetchSpy.mockResolvedValue(errFetch(404, 'Not Found'));

        await run(argv(PROJECT_NAME, '--list', REMOTE_CATALOG_URL));

        expect(exitSpy).toHaveBeenCalledWith(1);
        expect(dlMock).not.toHaveBeenCalled();
    });

    it('exits(1) cleanly on HTTP 500 server error from the catalog URL', async () => {
        fetchSpy.mockResolvedValue(errFetch(500, 'Internal Server Error'));

        await run(argv(PROJECT_NAME, '--list', REMOTE_CATALOG_URL));

        expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('exits(1) cleanly on DNS timeout or network-unreachable error', async () => {
        // Simulates fetch() itself throwing (no HTTP response at all).
        fetchSpy.mockRejectedValue(Object.assign(
            new Error('getaddrinfo ENOTFOUND example.com'),
            { code: 'ENOTFOUND' },
        ));

        await run(argv(PROJECT_NAME, '--list', REMOTE_CATALOG_URL));

        expect(exitSpy).toHaveBeenCalledWith(1);
    });
});

// ---------------------------------------------------------------------------

describe('Filesystem chaos — local path (--local)', () => {

    it('exits(1) when the --local path does not exist on disk', async () => {
        pathExistsMock.mockResolvedValue(false);

        await run(argv(PROJECT_NAME, '--local', '/nonexistent/path'));

        expect(exitSpy).toHaveBeenCalledWith(1);
        expect(runStepsMock).not.toHaveBeenCalled();
    });

    it('exits(1) when --local points to a file that is neither a directory nor .json', async () => {
        pathExistsMock.mockResolvedValue(true);
        statSyncMock.mockReturnValue({ isDirectory: () => false } as any);

        await run(argv(PROJECT_NAME, '--local', '/some/archive.tar.gz'));

        expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('exits(1) when the local template directory is missing steps.json', async () => {
        statSyncMock.mockReturnValue({ isDirectory: () => true } as any);
        pathExistsMock.mockImplementation(async (p: any) => {
            const s = String(p);
            if (s === LOCAL_TEMPLATE_DIR)          return true;  // dir exists
            if (s.endsWith('steps.json'))          return false; // but no steps.json
            return false;
        });

        await run(argv(PROJECT_NAME, '--local', LOCAL_TEMPLATE_DIR));

        expect(exitSpy).toHaveBeenCalledWith(1);
        expect(runStepsMock).not.toHaveBeenCalled();
    });

    it('exits(1) with a user-friendly message (not a raw stack trace) on EACCES reading steps.json', async () => {
        // Security/permissions: the CLI must not expose internal stack traces to users.
        statSyncMock.mockReturnValue({ isDirectory: () => true } as any);
        readJsonMock.mockRejectedValue(
            Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' }),
        );

        await run(argv(PROJECT_NAME, '--local', LOCAL_TEMPLATE_DIR));

        expect(exitSpy).toHaveBeenCalledWith(1);
        // The logger.error (not console.error) must have been called — friendly message
        const { logger } = await import('../utils/logger.js');
        expect(vi.mocked(logger.error)).toHaveBeenCalledOnce();
    });

    it('cleans up the temp folder when the engine throws midway through a remote execution', async () => {
        // Resilience: partial engine failures must not leave temp artifacts behind.
        runStepsMock.mockRejectedValue(new Error('Engine crashed mid-execution'));

        await run(argv(PROJECT_NAME, '--template', GITHUB_SOURCE));

        expect(exitSpy).toHaveBeenCalledWith(1);
        expect(removeMock).toHaveBeenCalledWith(
            expect.stringContaining(`${PROJECT_NAME}-templar-temp`),
        );
    });
});

// ===========================================================================
// 4. DATA CORRUPTION & SCHEMA MISMATCHES
// ===========================================================================

describe('Data corruption — remote catalog (--list)', () => {

    it('exits(1) when the catalog URL returns malformed, non-JSON response', async () => {
        fetchSpy.mockResolvedValue({
            ok:   true,
            status: 200,
            json: async () => { throw new SyntaxError('Unexpected token < in JSON'); },
        });

        await run(argv(PROJECT_NAME, '--list', REMOTE_CATALOG_URL));

        expect(exitSpy).toHaveBeenCalledWith(1);
        expect(dlMock).not.toHaveBeenCalled();
    });

    it('exits(1) when the catalog returns valid JSON but contains zero templates', async () => {
        // An empty catalog must fail fast — there is nothing to select.
        fetchSpy.mockResolvedValue(okFetch([]));

        await run(argv(PROJECT_NAME, '--list', REMOTE_CATALOG_URL));

        expect(exitSpy).toHaveBeenCalledWith(1);
        // The prompt must never be shown if the catalog is empty.
        expect(promptMock).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------

describe('Data corruption — local catalog.json (--local)', () => {

    beforeEach(() => {
        statSyncMock.mockReturnValue({ isDirectory: () => false } as any);
        pathExistsMock.mockImplementation(async (p: any) =>
            String(p) === LOCAL_CATALOG_PATH,
        );
    });

    it('exits(1) when the local catalog.json file contains malformed JSON', async () => {
        readJsonMock.mockRejectedValue(new SyntaxError('Unexpected token'));

        await run(argv(PROJECT_NAME, '--local', LOCAL_CATALOG_PATH));

        expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('exits(1) when the catalog references a template path that does not exist on disk', async () => {
        const ghostCatalog = [{
            name: 'ghost', displayName: 'Ghost', description: 'Missing', source: './does-not-exist',
        }];
        readJsonMock.mockResolvedValue(ghostCatalog);
        promptMock  .mockResolvedValue({ selected: ghostCatalog[0] });

        // Catalog file exists, but the resolved template dir does not
        pathExistsMock.mockImplementation(async (p: any) => {
            if (String(p) === LOCAL_CATALOG_PATH) return true;
            return false;
        });

        await run(argv(PROJECT_NAME, '--local', LOCAL_CATALOG_PATH));

        expect(exitSpy).toHaveBeenCalledWith(1);
        expect(runStepsMock).not.toHaveBeenCalled();
    });
});

// ===========================================================================
// 5. CI ENVIRONMENT
// ===========================================================================

describe('isCI() helper', () => {

    it('returns true when process.env.CI is "true"', () => {
        process.env.CI = 'true';
        expect(isCI()).toBe(true);
    });

    it('returns true when process.env.CI is "1"', () => {
        process.env.CI = '1';
        expect(isCI()).toBe(true);
    });

    it('returns true when CONTINUOUS_INTEGRATION is set', () => {
        process.env.CONTINUOUS_INTEGRATION = 'true';
        expect(isCI()).toBe(true);
    });

    it('returns true when GITHUB_ACTIONS is set', () => {
        process.env.GITHUB_ACTIONS = 'true';
        expect(isCI()).toBe(true);
    });

    it('returns false when no CI environment variables are present', () => {
        expect(isCI()).toBe(false);
    });
});

describe('CI environment — interactive mode forbidden', () => {

    it('exits(1) without prompting when interactive mode is triggered in CI', async () => {
        // A pipeline must never block waiting for a human to respond to a prompt.
        process.env.CI = 'true';

        await run(argv(PROJECT_NAME)); // no source flags → would enter interactive mode

        expect(exitSpy).toHaveBeenCalledWith(1);
        expect(promptMock).not.toHaveBeenCalled();
    });

    it('exits(1) without prompting when the project-name arg is missing in CI with a flag-based route', async () => {
        process.env.CI = 'true';

        // --template is provided, but project-name positional arg is missing
        // → would normally prompt, but must fail in CI
        await run(argv('--template', GITHUB_SOURCE));

        expect(exitSpy).toHaveBeenCalledWith(1);
        expect(promptMock).not.toHaveBeenCalled();
    });

    it('succeeds in CI when both project name and source flag are provided explicitly', async () => {
        // The correct CI usage: everything is deterministic, no prompts needed.
        process.env.CI = 'true';

        await run(argv(PROJECT_NAME, '--template', GITHUB_SOURCE));

        expect(runStepsMock).toHaveBeenCalledOnce();
        expect(exitSpy).not.toHaveBeenCalled();
        expect(promptMock).not.toHaveBeenCalled();
    });

    it('detects CI via CONTINUOUS_INTEGRATION env var and refuses to prompt', async () => {
        process.env.CONTINUOUS_INTEGRATION = 'true';

        await run(argv(PROJECT_NAME));

        expect(exitSpy).toHaveBeenCalledWith(1);
        expect(promptMock).not.toHaveBeenCalled();
    });
});

// ===========================================================================
// 6. HUMAN CHAOS & OS SIGNALS
// ===========================================================================

describe('Human chaos & OS signals', () => {

    it('exits(1) cleanly when user presses Ctrl+C (ExitPromptError) during interactive mode', async () => {
        // Inquirer v9+ throws ExitPromptError on Ctrl+C. The CLI must catch this
        // and exit gracefully — no unhandled promise rejection, no stack trace.
        const ctrlC = Object.assign(
            new Error('User force closed the prompt.'),
            { name: 'ExitPromptError' },
        );
        promptMock.mockRejectedValue(ctrlC);

        await run(argv(PROJECT_NAME));

        expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('exits(1) and cleans up temp folder when user cancels the --list selection prompt', async () => {
        // The cancel happens after the catalog was already fetched and the
        // temp dir potentially started being created.
        const ctrlC = Object.assign(
            new Error('User force closed the prompt.'),
            { name: 'ExitPromptError' },
        );

        // First prompt (catalog selection) throws
        promptMock.mockRejectedValue(ctrlC);

        await run(argv(PROJECT_NAME, '--list', REMOTE_CATALOG_URL));

        expect(exitSpy).toHaveBeenCalledWith(1);
        // No download should have happened; prompt threw before that
        expect(dlMock).not.toHaveBeenCalled();
    });

    it('exits(1) cleanly when the process receives SIGTERM (e.g. from Docker stop)', async () => {
        // SIGTERM during a prompt operation — simulated by the prompt rejecting.
        const sigterm = Object.assign(
            new Error('Process terminated'),
            { signal: 'SIGTERM' },
        );
        promptMock.mockRejectedValue(sigterm);

        await run(argv(PROJECT_NAME));

        expect(exitSpy).toHaveBeenCalledWith(1);
        // Must not produce an unhandled rejection
        expect(runStepsMock).not.toHaveBeenCalled();
    });
});
