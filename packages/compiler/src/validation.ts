import {
  clone,
  collections,
  projectSchema,
  actionCatalog,
  type Condition,
  type Effect,
  type Project,
  type Variable,
} from '../../domain/src/index';
export type Issue = {
  code: string;
  severity: 'error' | 'warning';
  message: string;
  entityId: string;
  field: string;
};
export function valueValid(v: Variable, value: unknown, p: Project): boolean {
  if (v.type === 'boolean') return typeof value === 'boolean';
  if (v.type === 'number')
    return (
      typeof value === 'number' &&
      Number.isFinite(value) &&
      (v.min === null || value >= v.min) &&
      (v.max === null || value <= v.max)
    );
  if (v.type === 'enum') return typeof value === 'string' && v.options.includes(value);
  if (v.type === 'entity')
    return (
      value === null || [...p.objects, ...p.locations, ...p.characters].some((e) => e.id === value)
    );
  return typeof value === 'string';
}
export function validateProject(input: unknown): Issue[] {
  const parsed = projectSchema.safeParse(input);
  if (!parsed.success)
    return parsed.error.issues.map((i) => ({
      code: 'SCHEMA',
      severity: 'error',
      message: i.message,
      entityId: '',
      field: i.path.join('.'),
    }));
  const p = resolveTemplates(parsed.data),
    issues: Issue[] = [];
  const add = (
    code: string,
    message: string,
    entityId = '',
    field = '',
    severity: Issue['severity'] = 'error',
  ) => issues.push({ code, message, entityId, field, severity });
  const all = collections.flatMap((c) => p[c] as { id: string; name: string }[]),
    ids = new Set<string>();
  all.push(...p.characters.flatMap((c) => c.topics));
  all.push(...p.events, ...p.endings);
  for (const e of all) {
    if (ids.has(e.id)) add('DUPLICATE_ID', 'Stable IDs must be unique.', e.id);
    ids.add(e.id);
  }
  const locations = new Set(p.locations.map((e) => e.id)),
    objects = new Map(p.objects.map((e) => [e.id, e])),
    connections = new Map(p.connections.map((e) => [e.id, e]));
  const ref = (
    value: string,
    owner: string,
    field: string,
    allowed: Set<string> | Map<string, unknown> = ids,
  ) => {
    if (value && !value.startsWith('$') && !allowed.has(value))
      add('MISSING_REFERENCE', `The reference “${value}” does not exist.`, owner, field);
  };
  if (!locations.has(p.start)) add('START', 'Choose a valid starting location.', p.start, 'start');
  const actions = new Map(actionCatalog(p).map((a) => [a.id, a]));
  if (actions.size !== actionCatalog(p).length)
    add('ACTION_ID', 'Custom action IDs cannot shadow built-in actions.');
  for (const c of p.connections) {
    ref(c.from, c.id, 'from', locations);
    ref(c.to, c.id, 'to', locations);
    if (c.doorId) {
      ref(c.doorId, c.id, 'doorId', objects);
      if (!objects.get(c.doorId)?.capabilities.includes('door'))
        add('DOOR', 'A connection door must have the Door capability.', c.id, 'doorId');
    }
    if (c.reverseId) {
      const r = connections.get(c.reverseId);
      if (!r || r.from !== c.to || r.to !== c.from || r.reverseId !== c.id)
        add('REVERSE', 'Paired connections must point back to each other.', c.id, 'reverseId');
    }
  }
  for (const o of p.objects) {
    const pl = o.placement;
    if (pl.kind === 'location') ref(pl.id, o.id, 'placement', locations);
    if (pl.kind === 'character')
      ref(pl.id, o.id, 'placement', new Set(p.characters.map((c) => c.id)));
    if (pl.kind === 'connection') {
      ref(pl.id, o.id, 'placement', connections);
      if (!o.capabilities.includes('door'))
        add('DOOR_PLACEMENT', 'Only shared doors can occupy connections.', o.id);
    }
    if (['inside', 'on'].includes(pl.kind)) {
      ref(pl.id, o.id, 'placement', objects);
      if (
        !objects.get(pl.id)?.capabilities.includes(pl.kind === 'inside' ? 'container' : 'supporter')
      )
        add(
          'PARENT_TYPE',
          'Choose a container or supporter that accepts this placement.',
          o.id,
          'placement',
        );
    }
    const seen = new Set([o.id]);
    let current = pl;
    while (current.kind === 'inside' || current.kind === 'on') {
      if (seen.has(current.id)) {
        add(
          'CONTAINMENT_CYCLE',
          'Objects cannot contain themselves, even indirectly.',
          o.id,
          'placement',
        );
        break;
      }
      seen.add(current.id);
      current = objects.get(current.id)?.placement ?? { kind: 'offstage', id: '' };
    }
    if (o.keyId) ref(o.keyId, o.id, 'keyId', objects);
    if (
      o.capabilities.includes('door') &&
      (pl.kind !== 'connection' || o.capabilities.includes('portable'))
    )
      add('DOOR', 'Shared doors must be fixed and placed at a connection.', o.id);
    if (o.locked && !o.capabilities.includes('lockable'))
      add('LOCK', 'A locked object requires the Lockable capability.', o.id);
    if (o.open && o.locked) add('LOCK', 'An open object cannot be locked.', o.id);
    if (o.template) ref(o.template, o.id, 'template', new Set(p.templates.map((t) => t.id)));
  }
  for (const c of p.characters) ref(c.location, c.id, 'location', locations);
  const placements = new Map([
    ...p.objects.map((o) => [o.id, o.placement] as const),
    ...p.characters.map(
      (c) => [c.id, c.placement ?? { kind: 'location' as const, id: c.location }] as const,
    ),
  ]);
  for (const [id, placement] of placements) {
    const seen = new Set([id]);
    let current = placement;
    while (['inside', 'on', 'character'].includes(current.kind)) {
      if (seen.has(current.id)) {
        add(
          'ACTOR_CONTAINMENT_CYCLE',
          'Objects and characters cannot contain or possess their own enclosing entity.',
          id,
          'placement',
        );
        break;
      }
      seen.add(current.id);
      const parent = placements.get(current.id);
      if (!parent) {
        add('PLACEMENT_PARENT', 'Choose an existing parent for this placement.', id, 'placement');
        break;
      }
      current = parent;
    }
  }
  for (const v of p.variables)
    if (!valueValid(v, v.initial, p))
      add('VALUE_TYPE', `The initial value does not match ${v.name}'s type.`, v.id, 'initial');
  const checkCondition = (c: Condition, owner: string, depth = 0) => {
    if (depth > 12) {
      add('CONDITION_DEPTH', 'Condition groups are limited to 12 levels.', owner);
      return;
    }
    if ('conditions' in c) {
      if (c.kind === 'not' && c.conditions.length !== 1)
        add('NOT_GROUP', 'Not requires exactly one child condition.', owner);
      c.conditions.forEach((x) => checkCondition(x, owner, depth + 1));
    } else if (c.kind === 'test') ref(c.ref, owner, 'condition');
    else if (c.source === 'variable')
      ref(c.ref, owner, 'condition', new Set(p.variables.map((v) => v.id)));
    else if (c.source === 'property')
      ref(c.ref, owner, 'condition', new Set([...p.objects, ...p.characters].map((e) => e.id)));
  };
  const checkEffects = (es: Effect[], owner: string, depth = 0) => {
    if (depth > 8) {
      add('EFFECT_DEPTH', 'Random branches are limited to eight levels.', owner);
      return;
    }
    es.forEach((e, i) => {
      if (e.kind === 'end' && i !== es.length - 1)
        add('ENDING_ORDER', 'An ending must be the last effect.', owner);
      if (['set', 'increment'].includes(e.kind)) {
        ref(e.ref, owner, 'effects', new Set(p.variables.map((v) => v.id)));
        const v = p.variables.find((v) => v.id === e.ref);
        if (v && e.kind === 'set' && !valueValid(v, e.value, p))
          add('EFFECT_VALUE', 'The variable effect has an incompatible value.', owner);
      }
      if (
        ['property', 'state', 'move', 'enable', 'reveal', 'forgetTopic'].includes(e.kind) &&
        e.ref !== 'player'
      )
        ref(e.ref, owner, 'effects');
      if (e.kind === 'schedule')
        ref(
          e.ref,
          owner,
          'effects',
          new Set(p.rules.filter((r) => r.phase === 'event').map((r) => r.id)),
        );
      if (e.kind === 'move' && !['offstage', 'player'].includes(e.placement.kind))
        ref(e.placement.id, owner, 'effects');
      e.branches.forEach((b) => checkEffects(b, owner, depth + 1));
    });
  };
  for (const r of p.rules) {
    if (r.phase === 'check' && r.effects.length)
      add(
        'CHECK_EFFECTS',
        'Requirements are pure. Move consequences to Instead or After.',
        r.id,
        'effects',
      );
    checkCondition(r.appliesWhen, r.id);
    if (r.phase !== 'event' && !actions.has(r.trigger))
      add('ACTION', 'Choose a valid action trigger.', r.id, 'trigger');
    if (r.scope) ref(r.scope, r.id, 'scope');
    Object.entries(r.bindings).forEach(([key, val]) => {
      if (r.phase !== 'event' && !actions.get(r.trigger)?.parameters.some((p) => p.id === key))
        add(
          'BINDING_ROLE',
          'This binding no longer belongs to the selected action. Choose the role again.',
          r.id,
          'bindings',
        );
      if (
        actions.get(r.trigger)?.parameters.find((p) => p.id === key)?.kind === 'entity' &&
        typeof val === 'string'
      )
        ref(val, r.id, 'bindings');
    });
    checkCondition(r.condition, r.id);
    checkEffects(r.effects, r.id);
  }
  const productions = new Map<string, string>();
  for (const a of actions.values())
    for (const form of a.forms) {
      if (
        form.parts[0]?.kind === 'literal' &&
        [
          'help',
          'commands',
          'save',
          'restore',
          'load',
          'undo',
          'redo',
          'restart',
          'again',
          'g',
          'cancel',
        ].includes(form.parts[0].text.trim().toLowerCase().split(/\s+/)[0])
      )
        add(
          'RESERVED_COMMAND',
          `“${form.parts[0].text}” begins with a reserved session command. Choose another verb phrase.`,
          a.id,
          'forms',
        );
      for (const part of form.parts)
        if (part.kind === 'role' && !a.parameters.some((p) => p.id === part.role))
          add(
            'GRAMMAR_ROLE',
            `A command form for ${a.name} refers to a removed role.`,
            a.id,
            'forms',
          );
      const pattern = form.parts
        .map((part) =>
          part.kind === 'literal'
            ? part.text.toLowerCase().trim()
            : '<' + (a.parameters.find((p) => p.id === part.role)?.kind ?? 'role') + '>',
        )
        .join(' ');
      const other = productions.get(pattern);
      if (other && other !== a.id)
        add(
          'GRAMMAR_CONFLICT',
          `The form “${pattern}” is shared by ${a.name} and ${actions.get(other)?.name}. Players may need to clarify.`,
          a.id,
          'forms',
          'warning',
        );
      productions.set(pattern, a.id);
    }
  for (const item of p.migration)
    if (item.blocking) add('MIGRATION_REVIEW', item.message, item.entityId, 'migration');
  for (const c of p.connections) {
    checkCondition(c.visibleWhen, c.id);
    checkCondition(c.traverseWhen, c.id);
  }
  for (const o of p.objects) checkCondition(o.visibleWhen, o.id);
  for (const l of [...p.locations, ...p.objects])
    for (const v of l.variants) checkCondition(v.condition, l.id);
  for (const c of p.characters)
    for (const t of c.topics) {
      checkCondition(t.condition, c.id);
      checkEffects(t.effects, c.id);
    }
  for (const t of p.templates) {
    const seen = new Set([t.id]);
    let parent = t.parent;
    while (parent) {
      if (seen.has(parent)) {
        add('TYPE_CYCLE', 'Reusable types cannot inherit in a cycle.', t.id);
        break;
      }
      seen.add(parent);
      const next = p.templates.find((x) => x.id === parent);
      if (!next) {
        add('TYPE_PARENT', 'The parent type is missing.', t.id);
        break;
      }
      parent = next.parent;
    }
  }
  const reached = new Set([p.start]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const c of p.connections)
      if (reached.has(c.from) && !reached.has(c.to)) {
        reached.add(c.to);
        changed = true;
      }
  }
  for (const l of p.locations)
    if (!reached.has(l.id))
      add(
        'UNREACHABLE',
        'No directed graph path from the start. Teleport effects may make this intentional.',
        l.id,
        '',
        'warning',
      );
  return issues;
}
export function resolveTemplates(input: Project): Project {
  const p = clone(input);
  for (const o of p.objects) {
    const chain = [];
    let t = p.templates.find((t) => t.id === o.template);
    const seen = new Set<string>();
    while (t && !seen.has(t.id)) {
      seen.add(t.id);
      chain.unshift(t);
      t = p.templates.find((x) => x.id === t!.parent);
    }
    const defaults: Record<string, import('../../domain/src/index').Scalar> = Object.fromEntries(
      p.propertyDefinitions.map((v) => [v.id, v.initial]),
    );
    for (const template of chain) {
      o.capabilities = Array.from(new Set([...template.capabilities, ...o.capabilities]));
      for (const prop of template.properties) defaults[prop.id] = prop.initial;
    }
    o.properties = { ...defaults, ...o.properties };
  }
  for (const c of p.characters)
    c.properties = {
      ...Object.fromEntries(p.propertyDefinitions.map((v) => [v.id, v.initial])),
      ...c.properties,
    };
  return p;
}
