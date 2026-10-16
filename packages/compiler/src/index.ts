import { createHash } from 'node:crypto';
import {
  projectSchema,
  stableStringify,
  collections,
  actionCatalog,
  normalizePhrase,
  type Project,
} from '../../domain/src/index';
import { validateProject, resolveTemplates } from './validation';
export { validateProject } from './validation';
export type { Issue } from './validation';
export type CompiledGame = {
  format: 'elsewhen-runtime';
  schemaVersion: 2;
  runtimeVersion: 2;
  hash: string;
  project: Project;
  vocabulary: Record<string, string[]>;
  grammar: {
    actionId: string;
    formId: string;
    parts: import('../../domain/src/action-library').FormPart[];
  }[];
};
export const contentHash = (p: unknown) =>
  createHash('sha256').update(stableStringify(p)).digest('hex');
function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
export function compile(input: Project): CompiledGame {
  const issues = validateProject(input).filter((i) => i.severity === 'error');
  if (issues.length) throw new Error(issues.map((i) => i.message).join('\n'));
  const project = resolveTemplates(projectSchema.parse(input));
  project.notes = '';
  project.migration = [];
  for (const c of collections) for (const item of project[c]) if ('notes' in item) item.notes = '';
  for (const c of project.characters) for (const t of c.topics) t.notes = '';
  for (const a of project.actions) a.privateExamples = [];
  for (const t of project.templates) for (const property of t.properties) property.notes = '';
  for (const property of project.propertyDefinitions) property.notes = '';
  const vocabulary: Record<string, string[]> = {};
  for (const entity of [
    ...project.locations,
    ...project.objects,
    ...project.characters,
    ...project.connections,
    ...project.characters.flatMap((c) => c.topics),
  ])
    for (const name of [entity.name, ...entity.aliases, ...entity.nouns, ...entity.plurals]) {
      const key = normalizePhrase(name);
      (vocabulary[key] ??= []).push(entity.id);
    }
  const grammar = actionCatalog(project).flatMap((a) =>
    a.forms.map((f) => ({ actionId: a.id, formId: f.id, parts: f.parts })),
  );
  const runtime = {
    format: 'elsewhen-runtime',
    schemaVersion: 2,
    runtimeVersion: 2,
    project,
    vocabulary,
    grammar,
  } as const;
  return freeze({
    ...runtime,
    hash: contentHash(runtime),
  });
}
