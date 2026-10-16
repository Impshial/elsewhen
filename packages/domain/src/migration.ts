import {
  projectSchema,
  legacyRoles,
  directionAliases,
  normalizePhrase,
  type Project,
} from './index';
type Data = Record<string, unknown>;
const records = (v: unknown): Data[] => (Array.isArray(v) ? (v as Data[]) : []);
/** Never mutates the supplied object. ProjectFiles requires Save As for upgraded sources. */
export function migrateProject(raw: unknown): Project {
  if (!raw || typeof raw !== 'object') throw new Error('This is not an ElseWhen project.');
  const p = structuredClone(raw) as Data;
  if (p.schemaVersion === 2) return projectSchema.parse(p);
  if (![undefined, 0, 1].includes(p.schemaVersion as number | undefined))
    throw new Error(
      `Unsupported project schema ${p.schemaVersion}. This application supports schema 2; the original is unchanged.`,
    );
  if (p.schemaVersion === 0 && p.name && !p.title) {
    p.title = p.name;
    delete p.name;
  }
  const report: Project['migration'] = [];
  const note = (entityId: string, message: string, legacy?: unknown, blocking = false) =>
    report.push({ entityId, message, legacy, blocking });
  const rewrite = (v: unknown, roles: Record<string, string>): unknown => {
    if (typeof v === 'string')
      return v
        .replace(/\$([a-zA-Z]+)/g, (all, key: string) => (roles[key] ? '$' + roles[key] : all))
        .replace(/\{\{argument:([^}]+)\}\}/g, (all, key: string) =>
          roles[key] ? '{{argument:' + roles[key] + '}}' : all,
        );
    if (Array.isArray(v)) return v.map((x) => rewrite(x, roles));
    if (v && typeof v === 'object') {
      const d = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, rewrite(x, roles)]));
      if (d.source === 'argument' && typeof d.key === 'string') d.key = roles[d.key] ?? d.key;
      return d;
    }
    return v;
  };
  p.rules = records(p.rules).map((r) => {
    const roles = legacyRoles[String(r.trigger)] ?? {};
    const updated = rewrite(r, roles) as Data;
    updated.bindings = Object.fromEntries(
      Object.entries((r.bindings ?? {}) as Data).map(([k, v]) => [roles[k] ?? k, v]),
    );
    if (r.trigger === 'put') {
      updated.trigger = 'putInside';
      note(
        String(r.id),
        'Legacy Put selected its relation at runtime. Review this rule and choose Put inside or Put on.',
        r,
        true,
      );
    }
    if (r.phase === 'check' && records(r.effects).length) {
      note(
        String(r.id),
        'The old engine ignored these requirement effects. Move them to an Instead or After rule, then resolve this migration item.',
        r.effects,
        true,
      );
      updated.effects = [];
    }
    if (r.phase === 'event' && /\$(tool|target)\b/.test(JSON.stringify(r.effects ?? [])))
      note(
        String(r.id),
        'This event captures a legacy action role. Select the intended item, target or instrument role explicitly.',
        r,
        true,
      );
    return updated;
  });
  p.connections = records(p.connections).map((c) => {
    const rawDirection = String(c.direction ?? ''),
      direction = directionAliases[normalizePhrase(rawDirection)] ?? '';
    if (rawDirection && !direction)
      note(
        String(c.id),
        `Unusual direction “${rawDirection}” was retained as an exit alias. Choose a compass direction if appropriate.`,
      );
    return {
      ...c,
      direction,
      revealDestination: c.revealDestination ?? false,
      aliases: [
        ...new Set([
          ...((c.aliases as string[]) ?? []),
          ...(rawDirection && !direction ? [rawDirection] : []),
        ]),
      ],
    };
  });
  p.actions = records(p.actions).filter((a) => {
    if (
      a.id === 'speak' &&
      records(a.parameters).every((r) => ['target', 'text'].includes(String(r.id)))
    ) {
      note(
        'speak',
        'The prototype speech action now uses the built-in Say action. Its original authoring metadata is retained here.',
        a,
      );
      return false;
    }
    if (!Array.isArray(a.forms) || !a.forms.length)
      note(
        String(a.id),
        'Add command forms in Custom Actions. Old descriptive examples are retained but are not executable grammar.',
        undefined,
        true,
      );
    return true;
  });
  const endings = new Map(records(p.endings).map((e) => [String(e.id), e]));
  const collect = (value: unknown) => {
    if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === 'object') {
      const e = value as Data;
      if (e.kind === 'end' && typeof e.ref === 'string' && e.ref && !endings.has(e.ref))
        endings.set(e.ref, { id: e.ref, name: e.ref.replace(/[-_]/g, ' ') });
      Object.values(e).forEach(collect);
    }
  };
  collect(p.rules);
  collect(p.characters);
  p.endings = [...endings.values()];
  const eventNames = new Map(records(p.events).map((e) => [String(e.id), e]));
  for (const r of records(p.rules))
    if (
      r.phase === 'event' &&
      typeof r.trigger === 'string' &&
      !['start', 'enter', 'leave', 'turn', 'scheduled'].includes(r.trigger) &&
      !eventNames.has(r.trigger)
    )
      eventNames.set(r.trigger, { id: r.trigger, name: r.trigger.replace(/[-_]/g, ' ') });
  p.events = [...eventNames.values()];
  p.schemaVersion = 2;
  p.format = 'elsewhen-project';
  p.migration = report;
  return projectSchema.parse(p);
}
