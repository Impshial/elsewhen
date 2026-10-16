import type { Project } from '../../../packages/domain/src/index';
import type { SessionView } from './main/session';
import type { Scenario, ScenarioResult } from '../../../packages/domain/src/scenarios';
export type Settings = { showCommandHints: boolean };
export type Boot = {
  project: Project;
  path: string | null;
  readOnly: boolean;
  recovered?: boolean;
  newProject?: boolean;
  drafts: { id: string; title: string }[];
  recent: string[];
  settings: Settings;
  session: SessionView | null;
};
export type HostResult<T> = { ok: true; value: T } | { ok: false; error: string };
export interface HostMethods {
  playerBoot: { input: null; output: SessionView };
  detachPlayer: { input: SessionView['presentation']; output: SessionView };
  returnPlayer: { input: SessionView['presentation']; output: SessionView };
  playerPresentation: { input: SessionView['presentation']; output: null };
  focusPlayer: { input: null; output: null };
  boot: { input: null; output: Boot };
  recoverDraft: { input: string; output: Boot };
  getScenarios: { input: null; output: Scenario[] };
  saveScenarios: { input: Scenario[]; output: null };
  runScenario: { input: { project: Project; scenario: Scenario }; output: ScenarioResult };
  close: { input: { project: Project; dirty: boolean }; output: null };
  debug: {
    input: {
      kind: 'teleport' | 'grant' | 'variable' | 'revealMap';
      ref: string;
      value: string | number | boolean | null;
    };
    output: SessionView;
  };
  newProject: { input: { sample: boolean }; output: Boot };
  openProject: { input: { recent?: string }; output: Boot | null };
  saveProject: { input: { project: Project; saveAs: boolean }; output: string | null };
  recovery: { input: Project; output: null };
  exportGame: { input: Project; output: string | null };
  openGame: { input: null; output: SessionView | null };
  play: { input: Project; output: SessionView };
  command: { input: string; output: SessionView };
  travel: { input: string; output: SessionView };
  cancel: { input: null; output: SessionView | null };
  stop: { input: null; output: null };
  undo: { input: null; output: SessionView };
  redo: { input: null; output: SessionView };
  restart: { input: null; output: SessionView };
  saveGame: { input: null; output: string | null };
  loadGame: { input: null; output: SessionView | null };
  exportTranscript: { input: null; output: string | null };
  settings: { input: null; output: Settings };
  updateSettings: { input: Settings; output: Settings };
}
export type HostAPI = {
  invoke: <K extends keyof HostMethods>(
    method: K,
    payload: HostMethods[K]['input'],
  ) => Promise<HostResult<HostMethods[K]['output']>>;
  onMenu: (callback: (action: string) => void) => () => void;
  onSession: (callback: (session: SessionView | null) => void) => () => void;
};
declare global {
  interface Window {
    elsewhen: HostAPI;
  }
}
