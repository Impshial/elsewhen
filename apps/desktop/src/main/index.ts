import {
  scenariosSchema,
  scenarioSchema,
  type Scenario,
  type ScenarioResult,
} from '../../../../packages/domain/src/scenarios';
import { walkthrough } from '../../../../examples/the-folded-horizon/sample';
import { app, BrowserWindow, dialog, ipcMain, Menu, safeStorage } from 'electron';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import OpenAI from 'openai';
import {
  blankProject,
  projectSchema,
  stableStringify,
  type Project,
  scalar,
} from '../../../../packages/domain/src/index';
import { compile } from '../../../../packages/compiler/src/index';
import {
  atomicWrite,
  exportGame,
  importGame,
  ProjectFiles,
  readLimited,
  migrateProject,
} from '../../../../packages/persistence/src/index';
import { OpenAIParser, DEFAULT_MODEL } from '../../../../packages/parser/src/openai';
import { buildContext } from '../../../../packages/parser/src/index';
import { foldedHorizon } from '../../../../examples/the-folded-horizon/sample';
import { Session } from './session';
import type { Boot, Settings } from '../shared';
const dirname = path.dirname(fileURLToPath(import.meta.url));
let window: BrowserWindow,
  files: ProjectFiles,
  session: Session | null = null,
  project = foldedHorizon(),
  recent: string[] = [],
  drafts: { id: string; title: string }[] = [],
  key = '',
  config = { model: DEFAULT_MODEL, enabled: false, timeout: 30 };
const dataPath = () => app.getPath('userData');
const protectedStore = () =>
  safeStorage.isEncryptionAvailable() &&
  (process.platform !== 'linux' || safeStorage.getSelectedStorageBackend() !== 'basic_text');
const settings = (): Settings => ({
  ...config,
  hasKey: !!key,
  storage: protectedStore() ? 'protected' : 'session',
});
const boot = (): Boot => ({
  project,
  path: files.current,
  readOnly: files.readOnly,
  drafts,
  recent,
  settings: settings(),
  session: session?.view() ?? null,
});
let scenarios: Scenario[] = [
  {
    id: 'sample-walkthrough',
    name: 'Find the way home',
    commands: walkthrough,
    ending: 'homeward',
  },
];
const scenarioFile = () =>
  files.current
    ? path.join(path.dirname(files.current), 'tests', 'scenarios.json')
    : path.join(dataPath(), 'tests', project.id + '.json');
const needSession = () => {
  if (!session) throw new Error('Start a game or playtest first.');
  return session;
};
const endSession = () => {
  session?.cancel();
  session = null;
};
const saveConfig = () =>
  atomicWrite(
    path.join(dataPath(), 'settings.json'),
    stableStringify({ format: 'elsewhen-settings', schemaVersion: 1, ...config, recent }),
  );
async function addRecent(file: string) {
  recent = [file, ...recent.filter((f) => f !== file)].slice(0, 10);
  await saveConfig();
}
async function chooseSave(title: string, extension: string, defaultPath?: string) {
  return (
    await dialog.showSaveDialog(window, {
      title,
      defaultPath: defaultPath ?? path.join(app.getPath('documents'), `Untitled.${extension}`),
      filters: [{ name: 'ElseWhen', extensions: [extension] }],
    })
  ).filePath;
}
async function chooseOpen(title: string, extensions: string[]) {
  return (
    await dialog.showOpenDialog(window, {
      title,
      properties: ['openFile'],
      filters: [{ name: 'ElseWhen', extensions }],
    })
  ).filePaths[0];
}
function aiParser() {
  if (!key)
    throw new Error('No API key is configured. Add one in Settings or use conventional commands.');
  return new OpenAIParser(
    new OpenAI({ apiKey: key, timeout: config.timeout * 1000, maxRetries: 0 }),
    config.model,
  );
}
function safeError(error: unknown): string {
  if (error instanceof OpenAI.APIError) {
    if (error.status === 401) return 'OpenAI rejected this API key. Replace it in Settings.';
    if (error.status === 429)
      return 'OpenAI rate or usage limit reached. Try later or use conventional commands.';
    if (error.status === 404 || error.status === 400)
      return 'This model or structured-output request is not supported. Check the model in Settings.';
    return 'The OpenAI service could not complete the request. You can use conventional commands.';
  }
  if (error instanceof Error) {
    if (/abort|timeout/i.test(error.message))
      return 'Interpretation cancelled or timed out. No action was committed.';
    return error.message;
  }
  return 'The operation failed.';
}
async function invoke(method: string, raw: unknown): Promise<unknown> {
  switch (method) {
    case 'boot':
      return boot();
    case 'recoverDraft': {
      const id = z.string().min(1).max(200).parse(raw);
      if (!drafts.some((d) => d.id === id)) throw new Error('This recovery draft is unavailable.');
      const saved = JSON.parse((await readLimited(files.recoveryPath(id))).toString());
      const restored = migrateProject(saved.project);
      endSession();
      await files.release();
      files.current = null;
      files.readOnly = false;
      files.fingerprint = null;
      project = restored;
      scenarios = [];
      return { ...boot(), recovered: true };
    }
    case 'getScenarios':
      return scenarios;
    case 'saveScenarios': {
      if (files.readOnly)
        throw new Error('Use Save As before saving tests for a read-only project.');
      scenarios = z.array(scenarioSchema).max(100).parse(raw);
      await atomicWrite(
        scenarioFile(),
        stableStringify({ format: 'elsewhen-scenarios', schemaVersion: 1, scenarios }),
      );
      return null;
    }
    case 'runScenario': {
      const args = z
          .object({ project: projectSchema, scenario: scenarioSchema })
          .strict()
          .parse(raw),
        test = new Session(compile(args.project), true),
        result: ScenarioResult = { passed: true, steps: [], ending: null, turn: 0 };
      for (const command of args.scenario.commands) {
        await test.command(command);
        const passed =
          !!test.last?.success && !test.pending && test.transcript.at(-1)?.kind !== 'status';
        result.steps.push({
          command,
          passed,
          output: test.last?.output ?? [],
          error: test.last?.error,
        });
        if (!passed) {
          result.passed = false;
          break;
        }
      }
      result.ending = test.state.ending;
      result.turn = test.state.turn;
      if (args.scenario.ending && result.ending !== args.scenario.ending) result.passed = false;
      return result;
    }
    case 'debug': {
      const args = z
        .object({
          kind: z.enum(['teleport', 'grant', 'variable', 'revealMap']),
          ref: z.string(),
          value: scalar,
        })
        .strict()
        .parse(raw);
      return needSession().debugChange(args);
    }
    case 'close': {
      const args = z.object({ project: projectSchema, dirty: z.boolean() }).strict().parse(raw);
      if (args.dirty) {
        await files.recovery(args.project);
        const { response } = await dialog.showMessageBox(window, {
          title: 'Save before closing?',
          message: 'This project has unsaved changes.',
          detail: 'A recovery snapshot has been saved.',
          buttons: ['Save and close', 'Close without saving', 'Cancel'],
          defaultId: 0,
          cancelId: 2,
        });
        if (response === 2) return null;
        if (response === 0) {
          const file =
            files.current ??
            (await chooseSave(
              'Save project',
              'json',
              path.join(app.getPath('documents'), 'project.elsewhen.json'),
            ));
          if (!file) return null;
          await files.save(args.project, file);
        }
      }
      await files.release();
      app.exit(0);
      return null;
    }
    case 'newProject': {
      const { sample } = z.object({ sample: z.boolean() }).strict().parse(raw);
      endSession();
      await files.release();
      files.current = null;
      files.fingerprint = null;
      files.readOnly = false;
      project = sample ? foldedHorizon() : blankProject();
      scenarios = sample
        ? [
            {
              id: crypto.randomUUID(),
              name: 'Find the way home',
              commands: walkthrough,
              ending: 'homeward',
            },
          ]
        : [];
      return { ...boot(), newProject: true };
    }
    case 'openProject': {
      const args = z.object({ recent: z.string().optional() }).strict().parse(raw);
      if (args.recent && !recent.includes(args.recent))
        throw new Error('Choose a project through the Open dialog.');
      const file = args.recent ?? (await chooseOpen('Open project', ['json']));
      if (!file) return null;
      let loaded: Project;
      try {
        loaded = await files.open(file);
      } catch (e) {
        if (!(e instanceof Error) || !e.message.startsWith('PROJECT_LOCKED')) throw e;
        const { response } = await dialog.showMessageBox(window, {
          type: 'question',
          title: 'Project is already open',
          message: 'A project lock exists. Open read-only, take over an abandoned lock, or cancel.',
          buttons: ['Read-only', 'Take over', 'Cancel'],
          defaultId: 0,
          cancelId: 2,
        });
        if (response === 2) return null;
        loaded = await files.open(file, response === 0 ? 'readonly' : 'takeover');
      }
      let recovered = false;
      const recovery = await files.recover(loaded);
      if (recovery) {
        const { response } = await dialog.showMessageBox(window, {
          title: 'Recover unsaved work',
          message: 'A newer recovery snapshot is available.',
          detail: 'Restore the recovered project or use the last authoritative save.',
          buttons: ['Recover edits', 'Use saved file'],
          defaultId: 0,
        });
        if (response === 0) {
          loaded = recovery;
          recovered = true;
        }
      }
      project = loaded;
      endSession();
      try {
        scenarios = scenariosSchema.parse(
          JSON.parse((await readLimited(scenarioFile())).toString()),
        ).scenarios;
      } catch {
        scenarios = [];
      }
      await addRecent(file);
      return { ...boot(), recovered };
    }
    case 'saveProject': {
      const args = z.object({ project: projectSchema, saveAs: z.boolean() }).strict().parse(raw);
      const file =
        args.saveAs || !files.current
          ? await chooseSave(
              'Save project',
              'json',
              path.join(app.getPath('documents'), 'project.elsewhen.json'),
            )
          : files.current;
      if (!file) return null;
      await files.save(args.project, file);
      project = args.project;
      await atomicWrite(
        scenarioFile(),
        stableStringify({ format: 'elsewhen-scenarios', schemaVersion: 1, scenarios }),
      );
      await addRecent(file);
      return file;
    }
    case 'recovery': {
      const p = projectSchema.parse(raw);
      await files.recovery(p);
      return null;
    }
    case 'exportGame': {
      const p = projectSchema.parse(raw),
        bytes = exportGame(p),
        file = await chooseSave(
          'Export game',
          'elsegame',
          path.join(app.getPath('documents'), `${p.title.replace(/[^\w -]/g, '')}.elsegame`),
        );
      if (!file) return null;
      await atomicWrite(file, bytes);
      return file;
    }
    case 'openGame': {
      const file = await chooseOpen('Open game', ['elsegame']);
      if (!file) return null;
      const game = importGame(await readLimited(file));
      endSession();
      session = new Session(game, false);
      return session.view();
    }
    case 'play': {
      const p = projectSchema.parse(raw),
        compiled = compile(p);
      endSession();
      session = new Session(compiled, true);
      return session.view();
    }
    case 'command': {
      const command = z.string().min(1).max(8000).parse(raw);
      return needSession().command(command, config.enabled && key ? aiParser() : undefined);
    }
    case 'cancel':
      session?.cancel();
      return session?.view() ?? null;
    case 'travel':
      return needSession().travel(z.string().min(1).max(200).parse(raw));
    case 'stop':
      endSession();
      return null;
    case 'undo':
      return needSession().undo();
    case 'redo':
      return needSession().redo();
    case 'restart': {
      const old = needSession();
      old.cancel();
      session = new Session(old.game, old.debug);
      return session.view();
    }
    case 'saveGame': {
      const s = needSession(),
        file = await chooseSave(
          'Save game',
          'elsesave',
          path.join(dataPath(), 'saves', `${s.game.project.title}-turn-${s.state.turn}.elsesave`),
        );
      if (!file) return null;
      await atomicWrite(file, stableStringify(s.save()));
      return file;
    }
    case 'loadGame': {
      const file = await chooseOpen('Load saved game', ['elsesave']);
      if (!file) return null;
      const s = needSession();
      return s.restore(JSON.parse((await readLimited(file)).toString()));
    }
    case 'exportTranscript': {
      const s = needSession(),
        file = await chooseSave('Export transcript', 'txt');
      if (!file) return null;
      await atomicWrite(
        file,
        s.transcript.map((e) => (e.kind === 'command' ? `> ${e.text}` : e.text)).join('\n\n'),
      );
      return file;
    }
    case 'settings':
      return settings();
    case 'updateSettings': {
      const args = z
        .object({
          model: z.string().min(1).max(100),
          enabled: z.boolean(),
          timeout: z.number().int().min(5).max(120),
          key: z.string().max(500).optional(),
          removeKey: z.boolean().optional(),
          remember: z.boolean().optional(),
        })
        .strict()
        .parse(raw);
      config = { model: args.model, enabled: args.enabled, timeout: args.timeout };
      if (args.removeKey) {
        key = '';
        await fs.rm(path.join(dataPath(), 'credential.bin'), { force: true });
      } else if (args.key) {
        key = args.key;
        if (args.remember && protectedStore())
          await atomicWrite(
            path.join(dataPath(), 'credential.bin'),
            safeStorage.encryptString(key),
          );
        else await fs.rm(path.join(dataPath(), 'credential.bin'), { force: true });
      }
      await saveConfig();
      return settings();
    }
    case 'testConnection': {
      const test = new Session(compile(blankProject()), false),
        ctx = buildContext(test.view().view),
        result = await aiParser().parse('Look around', ctx);
      if (result.result.kind !== 'intent' || result.result.actionId !== 'look')
        throw new Error(
          'The provider responded, but the parser test did not return the expected action.',
        );
      return 'Connection verified. Structured interpretation returned “look”.';
    }
    default:
      throw new Error('Unknown host operation.');
  }
}
async function createWindow() {
  window = new BrowserWindow({
    width: 1536,
    height: 960,
    minWidth: 1100,
    minHeight: 720,
    title: 'ElseWhen',
    backgroundColor: '#11191f',
    show: false,
    webPreferences: {
      preload: path.join(dirname, '../preload/index.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    const current = window.webContents.getURL();
    if (url !== current) event.preventDefault();
  });
  window.webContents.session.setPermissionRequestHandler((_wc, _p, callback) => callback(false));
  const send = (action: string) => () => window.webContents.send('elsewhen:menu', action);
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: 'File',
        submenu: [
          { label: 'New Project', accelerator: 'CmdOrCtrl+N', click: send('new') },
          { label: 'Open Project…', accelerator: 'CmdOrCtrl+O', click: send('open') },
          { label: 'Save Project', accelerator: 'CmdOrCtrl+S', click: send('save') },
          { label: 'Save Project As…', accelerator: 'CmdOrCtrl+Shift+S', click: send('saveAs') },
          { type: 'separator' },
          { label: 'Open Game…', click: send('openGame') },
          { label: 'Export Game…', click: send('export') },
          { type: 'separator' },
          { role: 'quit' },
        ],
      },
      {
        label: 'Edit',
        submenu: [
          { label: 'Undo', accelerator: 'CmdOrCtrl+Z', click: send('undo') },
          { label: 'Redo', accelerator: 'CmdOrCtrl+Shift+Z', click: send('redo') },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'selectAll' },
        ],
      },
      {
        label: 'View',
        submenu: [
          { label: 'World Map', click: send('map') },
          { label: 'Command Palette', accelerator: 'CmdOrCtrl+K', click: send('palette') },
          { role: 'zoomIn' },
          { role: 'zoomOut' },
          { role: 'resetZoom' },
          { role: 'togglefullscreen' },
          ...(!app.isPackaged ? [{ role: 'toggleDevTools' as const }] : []),
        ],
      },
      {
        label: 'Project',
        submenu: [
          { label: 'Playtest', accelerator: 'F5', click: send('play') },
          { label: 'Validate', click: send('validate') },
        ],
      },
      { label: 'Tools', submenu: [{ label: 'Settings', click: send('settings') }] },
      {
        label: 'Help',
        submenu: [
          { label: 'Authoring Guide', click: send('help') },
          {
            label: 'About ElseWhen',
            click: () =>
              dialog.showMessageBox(window, {
                title: 'ElseWhen',
                message: 'ElseWhen 0.1.0',
                detail:
                  'A studio for impossible worlds.\nLocal authoring · deterministic play · optional OpenAI interpretation.',
              }),
          },
        ],
      },
    ]),
  );
  if (process.env.ELECTRON_RENDERER_URL) await window.loadURL(process.env.ELECTRON_RENDERER_URL);
  else await window.loadFile(path.join(dirname, '../renderer/index.html'));
  window.show();
  window.on('close', (event) => {
    event.preventDefault();
    window.webContents.send('elsewhen:menu', 'confirmClose');
  });
  window.webContents.on('will-prevent-unload', () => {
    window.webContents.send('elsewhen:menu', 'confirmClose');
  });
}
app.setName('ElseWhen');
if (process.env.ELSEWHEN_TEST_DATA) app.setPath('userData', process.env.ELSEWHEN_TEST_DATA);
app.whenReady().then(async () => {
  files = new ProjectFiles(path.join(dataPath(), 'recovery'));
  drafts = await files.drafts();
  try {
    const raw = JSON.parse(await fs.readFile(path.join(dataPath(), 'settings.json'), 'utf8'));
    config = z
      .object({ model: z.string(), enabled: z.boolean(), timeout: z.number().min(5).max(120) })
      .parse(raw);
    recent = z.array(z.string()).parse(raw.recent);
  } catch {
    /* First run uses local parsing. */
  }
  try {
    if (protectedStore())
      key = safeStorage.decryptString(await fs.readFile(path.join(dataPath(), 'credential.bin')));
  } catch {
    /* An unavailable OS store is session-only. */
  }
  if (!app.isPackaged && process.env.OPENAI_API_KEY) key = process.env.OPENAI_API_KEY;
  ipcMain.handle('elsewhen:invoke', async (event, method: unknown, payload: unknown) => {
    if (
      !window ||
      event.sender !== window.webContents ||
      event.senderFrame !== window.webContents.mainFrame
    )
      return { ok: false, error: 'Untrusted sender.' };
    try {
      return { ok: true, value: await invoke(z.string().parse(method), payload) };
    } catch (error) {
      return { ok: false, error: safeError(error) };
    }
  });
  const packagePath = process.argv.find((arg) => arg.endsWith('.elsegame'));
  if (packagePath) {
    try {
      session = new Session(importGame(await readLimited(packagePath)), false);
    } catch (error) {
      await dialog.showMessageBox({ type: 'error', message: safeError(error) });
    }
  }
  await createWindow();
});
app.on('before-quit', () => {
  session?.cancel();
});
app.on('window-all-closed', () => app.quit());
