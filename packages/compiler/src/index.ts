import { createHash } from 'node:crypto';
import { projectSchema, stableStringify, collections, type Project } from '../../domain/src/index';
import { validateProject, resolveTemplates } from './validation';
export { validateProject } from './validation';
export type { Issue } from './validation';
export type CompiledGame = {
  format: 'elsewhen-runtime';
  schemaVersion: 1;
  runtimeVersion: 1;
  hash: string;
  project: Project;
};
export const contentHash = (p: unknown) =>
  createHash('sha256').update(stableStringify(p)).digest('hex');
export function compile(input: Project): CompiledGame {
  const issues = validateProject(input).filter((i) => i.severity === 'error');
  if (issues.length) throw new Error(issues.map((i) => i.message).join('\n'));
  const project = resolveTemplates(projectSchema.parse(input));
  project.notes = '';
  for (const c of collections) for (const item of project[c]) if ('notes' in item) item.notes = '';
  for (const c of project.characters) for (const t of c.topics) t.notes = '';
  for (const a of project.actions) a.privateExamples = [];
  for (const t of project.templates) for (const property of t.properties) property.notes = '';
  return {
    format: 'elsewhen-runtime',
    schemaVersion: 1,
    runtimeVersion: 1,
    project,
    hash: contentHash(project),
  };
}
