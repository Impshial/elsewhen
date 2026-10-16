import { runScenario } from './scenarios';
import {
  scenariosSchema,
  scenarioSchema,
  type Scenario,
} from '../../../../packages/domain/src/scenarios';
import { walkthrough } from '../../../../examples/the-folded-horizon/sample';
import { app, BrowserWindow, dialog, ipcMain, Menu, screen } from 'electron';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
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
  config: Settings = { showCommandHints: true };
let unrelatedPreferences: Record<string, unknown> = {};
let playerWindow: BrowserWindow | null = null;
const presentationSchema = z
  .object({
    input: z.string().max(8000),
    history: z.array(z.string().max(8000)).max(1000),
    historyIndex: z.number().int(),
    selected: z.string(),
    inventoryId: z.string(),
    fontSize: z.number().min(15).max(26),
    follow: z.boolean(),
    search: z.string().max(8000),
    scrollTop: z.number().nonnegative(),
  })
  .strict();
function broadcastSession() {
  if (session) session.showCommandHints = config.showCommandHints;
  if (window && !window.isDestroyed())
    window.webContents.send('elsewhen:session', session?.view() ?? null);
  if (playerWindow && !playerWindow.isDestroyed())
    playerWindow.webContents.send('elsewhen:session', session?.view(false) ?? null);
}
async function detachPlayer() {
  const s = needSession();
  if (s.busy) throw new Error('Wait for the current action to finish.');
  s.detached = true;
  if (playerWindow && !playerWindow.isDestroyed()) {
    playerWindow.show();
    playerWindow.focus();
    return;
  }
  const saved = z
    .object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() })
    .safeParse(unrelatedPreferences.playerBounds);
  const area = screen.getDisplayMatching(
    saved.success ? saved.data : screen.getPrimaryDisplay().workArea,
  ).workArea;
  const width = Math.min(area.width, Math.max(900, saved.success ? saved.data.width : 1200)),
    height = Math.min(area.height, Math.max(650, saved.success ? saved.data.height : 850));
  const x = Math.max(
      area.x,
      Math.min(saved.success ? saved.data.x : area.x + 40, area.x + area.width - width),
    ),
    y = Math.max(
      area.y,
      Math.min(saved.success ? saved.data.y : area.y + 40, area.y + area.height - height),
    );
  const player = new BrowserWindow({
    x,
    y,
    width,
    height,
    minWidth: Math.min(800, area.width),
    minHeight: Math.min(600, area.height),
    title: 'Game Player — ' + s.game.project.title,
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
  playerWindow = player;
  player.setMenu(null);
  player.on('page-title-updated', (event) => event.preventDefault());
  player.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  player.webContents.on('will-navigate', (event) => event.preventDefault());
  player.on('close', () => {
    if (session) session.detached = false;
    unrelatedPreferences.playerBounds = player.getNormalBounds();
    void saveConfig().catch(() => {});
    broadcastSession();
  });
  player.on('closed', () => {
    if (playerWindow === player) playerWindow = null;
  });
  if (process.env.ELECTRON_RENDERER_URL)
    await player.loadURL(process.env.ELECTRON_RENDERER_URL + '?player=1');
  else
    await player.loadFile(path.join(dirname, '../renderer/index.html'), { query: { player: '1' } });
  player.show();
  player.focus();
}
const dataPath = () => app.getPath('userData');
const settings = (): Settings => ({ ...config });
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
    assertions: [],
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
  playerWindow?.close();
  session?.cancel();
  session = null;
};
const saveConfig = () =>
  atomicWrite(
    path.join(dataPath(), 'settings.json'),
    stableStringify({
      format: 'elsewhen-settings',
      schemaVersion: 2,
      ...unrelatedPreferences,
      ...config,
      recent,
    }),
  );
async function addRecent(file: string) {
  recent = [file, ...recent.filter((f) => f !== file)].slice(0, 10);
  await saveConfig();
}
async function chooseSave(title: string, extension: string, defaultPath?: string) {
  return (
    await dialog.showSaveDialog(BrowserWindow.getFocusedWindow() ?? window, {
      title,
      defaultPath: defaultPath ?? path.join(app.getPath('documents'), `Untitled.${extension}`),
      filters: [{ name: 'ElseWhen', extensions: [extension] }],
    })
  ).filePath;
}
async function chooseOpen(title: string, extensions: string[]) {
  return (
    await dialog.showOpenDialog(BrowserWindow.getFocusedWindow() ?? window, {
      title,
      properties: ['openFile'],
      filters: [{ name: 'ElseWhen', extensions }],
    })
  ).filePaths[0];
}
function safeError(error: unknown): string {
  return error instanceof Error ? error.message : 'The operation failed.';
}
async function invoke(method: string, raw: unknown): Promise<unknown> {
  switch (method) {
    case 'playerBoot':
      return needSession().view(false);
    case 'playerPresentation':
      needSession().presentation = presentationSchema.parse(raw);
      return null;
    case 'focusPlayer':
      playerWindow?.show();
      playerWindow?.focus();
      return null;
    case 'detachPlayer':
      needSession().presentation = presentationSchema.parse(raw);
      await detachPlayer();
      return needSession().view();
    case 'returnPlayer':
      needSession().presentation = presentationSchema.parse(raw);
      playerWindow?.close();
      needSession().detached = false;
      return needSession().view();
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
        stableStringify({ format: 'elsewhen-scenarios', schemaVersion: 2, scenarios }),
      );
      return null;
    }
    case 'runScenario': {
      const args = z
        .object({ project: projectSchema, scenario: scenarioSchema })
        .strict()
        .parse(raw);
      return runScenario(args.project, args.scenario);
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
              assertions: [],
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
      if (['save', 'restore', 'load', 'restart'].includes(command.trim().toLowerCase())) {
        await invoke(
          command.trim().toLowerCase() === 'save'
            ? 'saveGame'
            : command.trim().toLowerCase() === 'restart'
              ? 'restart'
              : 'loadGame',
          null,
        );
        return needSession().view();
      }
      return needSession().command(command);
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
      session.detached = old.detached;
      session.presentation = { ...old.presentation, input: '' };
      return session.view();
    }
    case 'saveGame': {
      const s = needSession(),
        snapshot = s.save(),
        file = await chooseSave(
          'Save game',
          'elsesave',
          path.join(dataPath(), 'saves', `${s.game.project.title}-turn-${s.state.turn}.elsesave`),
        );
      if (!file) return null;
      await atomicWrite(file, stableStringify(snapshot));
      return file;
    }
    case 'loadGame': {
      const s = needSession(),
        revision = s.revision;
      const file = await chooseOpen('Load saved game', ['elsesave']);
      if (!file) return null;
      const raw = JSON.parse((await readLimited(file)).toString());
      if (session !== s || s.revision !== revision)
        throw new Error(
          'The play session changed while choosing a save. Restore again in the current session.',
        );
      return s.restore(raw);
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
      config = z.object({ showCommandHints: z.boolean() }).strict().parse(raw);
      await saveConfig();
      return settings();
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
                message: `ElseWhen ${app.getVersion()}`,
                detail:
                  'A studio for impossible worlds.\nLocal authoring · deterministic English parser · offline play.',
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
    recent = z.array(z.string()).catch([]).parse(raw.recent);
    config = {
      showCommandHints: typeof raw.showCommandHints === 'boolean' ? raw.showCommandHints : true,
    };
    const obsolete = new Set([
      'model',
      'enabled',
      'timeout',
      'key',
      'apiKey',
      'hasKey',
      'storage',
      'format',
      'schemaVersion',
      'recent',
      'showCommandHints',
    ]);
    unrelatedPreferences = Object.fromEntries(
      Object.entries(raw).filter(([key]) => !obsolete.has(key)),
    );
  } catch {
    /* New installations use local defaults. */
  }
  // Delete only this application's retired credential file; never read or decrypt it.
  await fs.rm(path.join(dataPath(), 'credential.bin'), { force: true }).catch(() => {});
  await saveConfig().catch(() => {});
  ipcMain.handle('elsewhen:invoke', async (event, method: unknown, payload: unknown) => {
    const fromPlayer =
      !!playerWindow &&
      event.sender === playerWindow.webContents &&
      event.senderFrame === playerWindow.webContents.mainFrame;
    const fromDesigner =
      !!window &&
      event.sender === window.webContents &&
      event.senderFrame === window.webContents.mainFrame;
    if (!fromPlayer && !fromDesigner) return { ok: false, error: 'Untrusted sender.' };
    try {
      const operation = z.string().parse(method);
      const playerMethods = new Set([
        'playerBoot',
        'playerPresentation',
        'returnPlayer',
        'command',
        'travel',
        'cancel',
        'undo',
        'redo',
        'restart',
        'saveGame',
        'loadGame',
        'exportTranscript',
      ]);
      if (fromPlayer && !playerMethods.has(operation))
        throw new Error('This operation is available only in the designer.');
      if (
        fromDesigner &&
        session?.detached &&
        ['command', 'travel', 'cancel', 'undo', 'redo'].includes(operation)
      )
        throw new Error('Use the Game Player window, or return it to the designer first.');
      let value = await invoke(operation, payload);
      if (operation !== 'playerPresentation') broadcastSession();
      if (fromPlayer && value && typeof value === 'object' && 'transcript' in value)
        value = needSession().view(false);
      return { ok: true, value };
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
app.on('window-all-closed', () => app.quit());
app.on('before-quit', (event) => {
  if (window && !window.isDestroyed()) {
    event.preventDefault();
    window.webContents.send('elsewhen:menu', 'confirmClose');
  }
});
