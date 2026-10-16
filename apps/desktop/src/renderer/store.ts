import { create } from 'zustand';
import {
  blankProject,
  clone,
  type Project,
  type Collection,
} from '../../../../packages/domain/src/index';
import type { Boot, HostMethods } from '../shared';
import type { SessionView } from '../main/session';
export async function host<K extends keyof HostMethods>(
  method: K,
  input: HostMethods[K]['input'],
): Promise<HostMethods[K]['output']> {
  const r = await window.elsewhen.invoke(method, input);
  if (!r.ok) throw new Error(r.error);
  return r.value;
}
type EditorState = {
  project: Project;
  path: string | null;
  readOnly: boolean;
  dirty: boolean;
  past: Project[];
  future: Project[];
  selected: string;
  tabs: string[];
  tab: string;
  session: SessionView | null;
  theme: 'dark' | 'light';
  lastEdit: string;
  lastTime: number;
  toast: string;
  setToast: (text: string) => void;
  load: (boot: Boot) => void;
  edit: (label: string, fn: (p: Project) => void) => void;
  undo: () => void;
  redo: () => void;
  open: (id: string) => void;
  select: (id: string) => void;
  closeTab: (id: string) => void;
  setSession: (s: SessionView | null) => void;
  toggleTheme: () => void;
  markSaved: (path: string) => void;
};
export const useEditor = create<EditorState>((set, get) => ({
  project: blankProject(),
  path: null,
  readOnly: false,
  dirty: false,
  past: [],
  future: [],
  selected: '',
  tabs: ['map'],
  tab: 'map',
  session: null,
  theme: localStorage.getItem('elsewhen-theme') === 'light' ? 'light' : 'dark',
  lastEdit: '',
  lastTime: 0,
  toast: '',
  setToast: (text) => set({ toast: text }),
  load: (boot) =>
    set({
      project: boot.project,
      path: boot.path,
      readOnly: boot.readOnly,
      dirty: !!boot.newProject || !!boot.recovered,
      past: [],
      future: [],
      selected: boot.project.start,
      tabs: ['map'],
      tab: 'map',
      session: null,
      lastEdit: '',
    }),
  edit: (label, fn) => {
    const s = get();
    if (s.readOnly) {
      set({ toast: 'This project is read-only. Use Save As to create an editable copy.' });
      return;
    }
    const project = clone(s.project);
    fn(project);
    if (JSON.stringify(project) === JSON.stringify(s.project)) return;
    const coalesce = s.lastEdit === label && Date.now() - s.lastTime < 700;
    set({
      project,
      dirty: true,
      past: coalesce ? s.past : [...s.past.slice(-99), s.project],
      future: [],
      lastEdit: label,
      lastTime: Date.now(),
    });
  },
  undo: () => {
    const s = get(),
      p = s.past.at(-1);
    if (p)
      set({
        project: p,
        past: s.past.slice(0, -1),
        future: [...s.future, s.project],
        dirty: true,
        lastEdit: '',
      });
  },
  redo: () => {
    const s = get(),
      p = s.future.at(-1);
    if (p)
      set({
        project: p,
        past: [...s.past, s.project],
        future: s.future.slice(0, -1),
        dirty: true,
        lastEdit: '',
      });
  },
  open: (id) =>
    set((s) => ({ tab: id, selected: id, tabs: s.tabs.includes(id) ? s.tabs : [...s.tabs, id] })),
  select: (id) => set({ selected: id }),
  closeTab: (id) =>
    set((s) => ({ tabs: s.tabs.filter((t) => t !== id), tab: s.tab === id ? 'map' : s.tab })),
  setSession: (session) => set({ session }),
  toggleTheme: () =>
    set((s) => {
      const theme = s.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem('elsewhen-theme', theme);
      return { theme };
    }),
  markSaved: (path) => set({ path, dirty: false, readOnly: false }),
}));
export function locate(p: Project, id: string): Collection | undefined {
  return (
    [
      'locations',
      'objects',
      'characters',
      'connections',
      'variables',
      'actions',
      'rules',
      'templates',
    ] as Collection[]
  ).find((c) => p[c].some((e) => e.id === id));
}
