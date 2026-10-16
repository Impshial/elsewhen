import {
  actionCatalog,
  canonicalActionSchema,
  clone,
  type ActionResult,
  type CanonicalAction,
  type Condition,
  type Effect,
  type GameState,
  type Observation,
  type Placement,
  type PlayerView,
  type Project,
  type Rule,
  type Scalar,
  type StateChange,
  type Trace,
  type WorldObject,
} from '../../domain/src/index';

type Bindings = Record<string, Scalar>;
const indices = new WeakMap<
  Project,
  {
    objects: Map<string, Project['objects'][number]>;
    characters: Map<string, Project['characters'][number]>;
    locations: Map<string, Project['locations'][number]>;
  }
>();
function index(p: Project) {
  let data = indices.get(p);
  if (
    !data ||
    data.objects.size !== p.objects.length ||
    data.characters.size !== p.characters.length ||
    data.locations.size !== p.locations.length
  ) {
    data = {
      objects: new Map(p.objects.map((o) => [o.id, o])),
      characters: new Map(p.characters.map((c) => [c.id, c])),
      locations: new Map(p.locations.map((l) => [l.id, l])),
    };
    indices.set(p, data);
  }
  return data;
}
const resolve = (s: GameState, ref: string, b: Bindings): string =>
  ref === '$location' ? s.location : ref.startsWith('$') ? String(b[ref.slice(1)] ?? '') : ref;
const known = (s: GameState, id: string) => s.known.includes(id);
const remember = (s: GameState, id: string) => {
  if (!known(s, id)) s.known.push(id);
};
export function ancestry(s: GameState, id: string): Placement[] {
  const chain: Placement[] = [],
    seen = new Set([id]);
  let pl = id === 'player' ? s.playerPlacement : s.placements[id];
  while (pl) {
    chain.push(pl);
    if (!['inside', 'on', 'character', 'player'].includes(pl.kind)) break;
    const parent = pl.kind === 'player' ? 'player' : pl.id;
    if (seen.has(parent)) throw new Error('Containment cycle.');
    seen.add(parent);
    pl = parent === 'player' ? s.playerPlacement : s.placements[parent];
  }
  return chain;
}
export const carried = (s: GameState, id: string) =>
  ancestry(s, id).some((pl) => pl.kind === 'player');
export function effectiveRoom(s: GameState, id = 'player'): string {
  const root = ancestry(s, id).at(-1);
  return root?.kind === 'location' ? root.id : '';
}
function synchronizeActors(s: GameState) {
  s.location = effectiveRoom(s);
  for (const id of Object.keys(s.characters)) s.characters[id] = effectiveRoom(s, id);
}
function physical(
  p: Project,
  s: GameState,
  id: string,
  light = false,
): { near: boolean; visible: boolean; reachable: boolean } {
  const o = index(p).objects.get(id),
    character = index(p).characters.get(id);
  if (!o && !character) return { near: false, visible: false, reachable: false };
  const chain = ancestry(s, id),
    root = chain.at(-1),
    viewer = ancestry(s, 'player');
  const door =
    root?.kind === 'connection' &&
    p.connections.some((c) => c.doorId === id && (c.from === s.location || c.to === s.location));
  const near = !!door || (root?.kind === 'location' && root.id === s.location);
  let visible = near && (light || !s.objects[id]?.concealed),
    reachable = near && !s.objects[id]?.concealed;
  const interiors = (xs: Placement[]) =>
    new Set(xs.filter((pl) => pl.kind === 'inside').map((pl) => pl.id));
  const targetInside = interiors(chain),
    viewerInside = interiors(viewer);
  for (const parentId of new Set([...targetInside, ...viewerInside])) {
    if (parentId === id) continue;
    if (targetInside.has(parentId) === viewerInside.has(parentId)) continue;
    const parent = index(p).objects.get(parentId);
    if (parent?.capabilities.includes('openable') && !s.objects[parentId].open) {
      reachable = false;
      if (!parent.transparent) visible = false;
    }
    if (!light && s.objects[parentId]?.concealed) {
      visible = false;
      reachable = false;
    }
  }
  const owner = chain.find((pl) => pl.kind === 'character');
  if (owner) {
    const npc = index(p).characters.get(owner.id);
    if (!npc?.possessionsVisible) {
      visible = false;
      reachable = false;
    }
  }
  return { near, visible, reachable };
}
export function illuminated(p: Project, s: GameState): boolean {
  const ambient =
    !index(p).locations.get(s.location)?.dark &&
    !ancestry(s, 'player').some((pl) => {
      const o = index(p).objects.get(pl.id);
      return (
        pl.kind === 'inside' &&
        o?.capabilities.includes('openable') &&
        !s.objects[pl.id].open &&
        !o.transparent
      );
    });
  return (
    ambient ||
    p.objects.some(
      (o) =>
        o.capabilities.includes('light') &&
        s.objects[o.id].active &&
        physical(p, s, o.id, true).visible,
    )
  );
}
export function scope(
  p: Project,
  s: GameState,
  id: string,
  depth = 0,
): { visible: boolean; reachable: boolean; carried: boolean; accessible: boolean } {
  const base = physical(p, s, id),
    o = index(p).objects.get(id),
    isCarried = !!o && carried(s, id);
  const visible =
    base.visible &&
    (illuminated(p, s) || isCarried) &&
    depth < 12 &&
    (!o || evaluate(p, s, o.visibleWhen, {}, depth + 1));
  return {
    visible,
    reachable:
      base.reachable && (visible || isCarried || ancestry(s, 'player').some((pl) => pl.id === id)),
    carried: isCarried,
    accessible: isCarried && base.reachable,
  };
}
export function evaluate(
  p: Project,
  s: GameState,
  c: Condition,
  b: Bindings = {},
  depth = 0,
): boolean {
  if (depth > 20) throw new Error('Condition recursion limit exceeded.');
  if ('conditions' in c) {
    if (c.kind === 'all') return c.conditions.every((x) => evaluate(p, s, x, b, depth + 1));
    if (c.kind === 'any') return c.conditions.some((x) => evaluate(p, s, x, b, depth + 1));
    return !evaluate(p, s, c.conditions[0], b, depth + 1);
  }
  const ref = resolve(s, c.ref, b);
  if (c.kind === 'test') {
    let result: Scalar;
    if (['carried', 'visible', 'reachable'].includes(c.test))
      result = scope(p, s, ref, depth + 1)[c.test as 'carried' | 'visible' | 'reachable'];
    else if (c.test === 'known') result = known(s, ref);
    else if (c.test === 'fired') result = s.fired.includes(ref);
    else if (c.test === 'enabled') result = !!s.connections[ref]?.enabled;
    else if (c.test === 'at') return ancestry(s, ref).at(-1)?.id === c.value;
    else result = !!s.objects[ref]?.[c.test as 'open' | 'locked' | 'active' | 'worn'];
    return result === c.value;
  }
  const actual: Scalar | undefined =
    c.source === 'variable'
      ? s.variables[ref]
      : c.source === 'property'
        ? (s.objects[ref]?.properties ?? s.characterProperties[ref])?.[c.key]
        : c.source === 'argument'
          ? b[c.key]
          : c.source === 'turn'
            ? s.turn
            : c.source === 'previousLocation'
              ? s.previousLocation
              : s.location;
  switch (c.op) {
    case 'eq':
      return actual === c.value;
    case 'ne':
      return actual !== c.value;
    case 'normalized':
      return (
        String(actual ?? '')
          .trim()
          .toLocaleLowerCase() ===
        String(c.value ?? '')
          .trim()
          .toLocaleLowerCase()
      );
    case 'gt':
      return typeof actual === 'number' && typeof c.value === 'number' && actual > c.value;
    case 'lt':
      return typeof actual === 'number' && typeof c.value === 'number' && actual < c.value;
    case 'gte':
      return typeof actual === 'number' && typeof c.value === 'number' && actual >= c.value;
    case 'lte':
      return typeof actual === 'number' && typeof c.value === 'number' && actual <= c.value;
  }
}
export function renderText(p: Project, s: GameState, text: string, b: Bindings = {}): string {
  return text.replace(
    /\{\{(name|variable|argument):([^{}]+)\}\}/g,
    (_whole, kind: string, key: string) => {
      if (kind === 'variable') return String(s.variables[key] ?? '');
      if (kind === 'argument') return String(b[key] ?? '');
      const id = resolve(s, key, b);
      return [...p.locations, ...p.objects, ...p.characters].find((e) => e.id === id)?.name ?? '';
    },
  );
}
export function describe(p: Project, s: GameState, id: string, b: Bindings = {}): string {
  const e = [...p.locations, ...p.objects, ...p.characters].find((e) => e.id === id);
  if (!e) return '';
  if ('dark' in e && e.dark && !illuminated(p, s)) return e.darkDescription;
  const variants =
    'variants' in e
      ? e.variants
          .filter((v) => evaluate(p, s, v.condition, b))
          .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))
      : [];
  return renderText(
    p,
    s,
    [
      variants.find((v) => v.mode === 'replace')?.text ?? e.description,
      ...variants.filter((v) => v.mode === 'append').map((v) => v.text),
    ].join('\n\n'),
    b,
  );
}
function observe(p: Project, s: GameState, id: string, description?: string): void {
  const e = [
    ...p.locations,
    ...p.objects,
    ...p.characters,
    ...p.connections,
    ...p.characters.flatMap((c) => c.topics),
  ].find((e) => e.id === id);
  if (!e) return;
  const kind: Observation['kind'] =
    'category' in e
      ? 'location'
      : 'capabilities' in e
        ? 'object'
        : 'topics' in e
          ? 'character'
          : 'from' in e
            ? 'connection'
            : 'topic';
  remember(s, id);
  s.observations[id] = {
    id,
    nouns: clone(e.nouns),
    adjectives: clone(e.adjectives),
    plurals: clone(e.plurals),
    ...('pronouns' in e ? { pronouns: clone(e.pronouns) } : {}),
    ...('direction' in e
      ? { direction: e.direction, doorId: e.doorId, destination: known(s, e.to) ? e.to : undefined }
      : {}),
    name: e.name,
    aliases: clone(e.aliases),
    kind,
    description: description ?? s.observations[id]?.description ?? '',
    capabilities: 'capabilities' in e ? [...e.capabilities] : [],
  };
}
function describeScene(p: Project, s: GameState): string {
  const present = [
    ...p.objects.filter(
      (o) =>
        !o.capabilities.includes('scenery') &&
        !carried(s, o.id) &&
        scope(p, s, o.id).visible &&
        ['location', 'connection'].includes(s.placements[o.id]?.kind),
    ),
    ...p.characters.filter((c) => scope(p, s, c.id).visible),
  ].map((e) => e.name);
  return (
    describe(p, s, s.location) +
    (present.length ? '\n\nYou can see ' + present.join(', ') + '.' : '')
  );
}
export function refreshKnowledge(p: Project, s: GameState): void {
  observe(p, s, s.location, describe(p, s, s.location));
  if (!s.visited.includes(s.location)) s.visited.push(s.location);
  for (const e of [...p.objects, ...p.characters])
    if (scope(p, s, e.id).visible) observe(p, s, e.id);
  for (const c of p.connections)
    if (
      c.from === s.location &&
      !s.connections[c.id].concealed &&
      (illuminated(p, s) || c.inDark) &&
      evaluate(p, s, c.visibleWhen)
    ) {
      observe(p, s, c.id);
      if (c.revealDestination) observe(p, s, c.to);
    }
  for (const c of p.characters)
    if (s.characters[c.id] === s.location)
      for (const t of c.topics)
        if ((t.known && !s.forgottenTopics.includes(t.id)) || known(s, t.id)) observe(p, s, t.id);
}
export function projectPlayer(p: Project, s: GameState): PlayerView {
  const observation = (id: string): Observation => {
    const seen = s.observations[id],
      info = scope(p, s, id),
      pl = s.placements[id];
    if (!info.visible && !info.carried)
      return {
        ...seen,
        facts: {
          ...info,
          directlyHeld: false,
          worn: false,
          npcOwned: false,
          allowsTaking: false,
          parent: '',
          relation: '',
        },
      };
    const owner = ancestry(s, id).find((x) => x.kind === 'character');
    return {
      ...seen,
      facts: {
        ...info,
        directlyHeld: pl?.kind === 'player',
        worn: !!s.objects[id]?.worn,
        npcOwned: !!owner,
        allowsTaking: !!owner && !!index(p).characters.get(owner.id)?.allowsTaking,
        parent: pl?.id ?? '',
        relation: pl?.kind ?? '',
      },
    };
  };
  const entities = [...p.objects, ...p.characters]
    .filter((e) => scope(p, s, e.id).visible)
    .map((e) => observation(e.id))
    .filter(Boolean);
  const exits = p.connections
    .filter(
      (c) =>
        c.from === s.location &&
        known(s, c.id) &&
        !s.connections[c.id].concealed &&
        (illuminated(p, s) || c.inDark) &&
        evaluate(p, s, c.visibleWhen),
    )
    .map((c) => ({
      ...s.observations[c.id],
      direction: c.direction,
      doorId: c.doorId,
      destination: known(s, c.to) ? c.to : undefined,
    }));
  const knownLocations = p.locations.filter((l) => known(s, l.id));
  const nodes: PlayerView['nodes'] = knownLocations.map((l) => ({
    id: l.id,
    name: s.observations[l.id]?.name ?? l.name,
    category: l.category,
    position: clone(l.position),
    color: l.color,
    icon: l.icon,
    description: s.observations[l.id]?.description ?? '',
  }));
  const edges: PlayerView['edges'] = [];
  for (const c of p.connections)
    if (known(s, c.id) && known(s, c.from)) {
      const to = known(s, c.to) ? c.to : `unknown:${c.id}`;
      if (to !== c.to) {
        const from = p.locations.find((l) => l.id === c.from)!;
        nodes.push({
          id: to,
          name: 'Unexplored',
          category: 'Unknown destination',
          position: [from.position[0] + 3, from.position[1] - 1, from.position[2] + 2],
          color: '#718599',
          icon: 'unknown',
          description: 'This exit leads somewhere you have not yet visited.',
          unknown: true,
        });
      }
      edges.push({
        id: c.id,
        from: c.from,
        to,
        name: s.observations[c.id]?.name ?? c.name,
        kind: c.kind,
      });
    }
  return {
    title: p.title,
    occupancy: ['inside', 'on'].includes(s.playerPlacement.kind)
      ? { id: s.playerPlacement.id, relation: s.playerPlacement.kind }
      : undefined,
    location: s.observations[s.location],
    turn: s.turn,
    ending: s.ending,
    entities,
    inventory: p.objects
      .filter((o) => carried(s, o.id) && known(s, o.id))
      .map((o) => observation(o.id)),
    known: Object.values(s.observations).map((e) =>
      e.kind === 'object' || e.kind === 'character' ? observation(e.id) : e,
    ),
    exits,
    topics: p.characters
      .filter((c) => s.characters[c.id] === s.location)
      .flatMap((c) => c.topics.filter((t) => known(s, t.id)).map((t) => s.observations[t.id])),
    actions: actionCatalog(p)
      .filter((a) => a.known || known(s, a.id))
      .map((a) => ({ ...a, notes: '', privateExamples: [] })),
    nodes,
    edges,
  };
}
export function assertState(p: Project, s: GameState): void {
  ancestry(s, 'player');
  if (effectiveRoom(s) !== s.location)
    throw new Error('Player placement and effective room disagree.');
  if (!p.locations.some((l) => l.id === s.location)) throw new Error('Player location is invalid.');
  const counts = new Map<string, number>();
  for (const pl of Object.values(s.placements))
    if (pl.kind === 'inside' || pl.kind === 'on') counts.set(pl.id, (counts.get(pl.id) ?? 0) + 1);
  if (['inside', 'on'].includes(s.playerPlacement.kind))
    counts.set(s.playerPlacement.id, (counts.get(s.playerPlacement.id) ?? 0) + 1);
  for (const pl of [s.playerPlacement, ...p.characters.map((c) => s.placements[c.id])]) {
    if (!pl) throw new Error('Missing actor placement.');
    if (
      ['inside', 'on'].includes(pl.kind) &&
      !index(p)
        .objects.get(pl.id)
        ?.capabilities.includes(pl.kind === 'inside' ? 'container' : 'supporter')
    )
      throw new Error('Invalid actor containment capability.');
  }
  const validateValue = (v: Project['variables'][number], value: Scalar | undefined) => {
    const valid =
      v.type === 'number'
        ? typeof value === 'number' &&
          Number.isFinite(value) &&
          (v.min === null || value >= v.min) &&
          (v.max === null || value <= v.max)
        : v.type === 'boolean'
          ? typeof value === 'boolean'
          : v.type === 'text'
            ? typeof value === 'string'
            : v.type === 'enum'
              ? typeof value === 'string' && v.options.includes(value)
              : value === null ||
                (typeof value === 'string' &&
                  [...p.locations, ...p.objects, ...p.characters].some((e) => e.id === value));
    if (!valid) throw new Error(`Invalid ${v.type}: ${v.name}`);
  };
  for (const o of p.objects) {
    if (!s.objects[o.id] || !s.placements[o.id]) throw new Error('Missing object state.');
    ancestry(s, o.id);
    const pl = s.placements[o.id];
    if (pl.kind === 'location' && !p.locations.some((l) => l.id === pl.id))
      throw new Error('Invalid location placement.');
    if (pl.kind === 'character' && !p.characters.some((c) => c.id === pl.id))
      throw new Error('Invalid character placement.');
    if (pl.kind === 'connection' && !p.connections.some((c) => c.id === pl.id))
      throw new Error('Invalid door placement.');
    if (pl.kind === 'inside' || pl.kind === 'on') {
      const parent = index(p).objects.get(pl.id);
      if (!parent?.capabilities.includes(pl.kind === 'inside' ? 'container' : 'supporter'))
        throw new Error('Invalid parent capability.');
    }
    if (s.objects[o.id].open && s.objects[o.id].locked)
      throw new Error('An object cannot be open and locked.');
    if (s.objects[o.id].worn && !carried(s, o.id)) throw new Error('Worn objects must be carried.');
    if ((counts.get(o.id) ?? 0) > o.capacity) throw new Error(`Capacity exceeded: ${o.name}`);
    const definitions = new Map<string, Project['variables'][number]>(),
      seen = new Set<string>();
    let template = p.templates.find((t) => t.id === o.template);
    while (template && !seen.has(template.id)) {
      seen.add(template.id);
      for (const property of template.properties)
        if (!definitions.has(property.id)) definitions.set(property.id, property);
      template = p.templates.find((t) => t.id === template!.parent);
    }
    for (const property of p.propertyDefinitions)
      if (!definitions.has(property.id)) definitions.set(property.id, property);
    for (const property of definitions.values())
      validateValue(property, s.objects[o.id].properties[property.id]);
  }
  for (const v of p.variables) {
    const value = s.variables[v.id];
    validateValue(v, value);
    if (
      v.type === 'number' &&
      (typeof value !== 'number' ||
        !Number.isFinite(value) ||
        (v.min !== null && value < v.min) ||
        (v.max !== null && value > v.max))
    )
      throw new Error(`Invalid number: ${v.name}`);
    if (v.type === 'boolean' && typeof value !== 'boolean')
      throw new Error(`Invalid boolean: ${v.name}`);
    if (v.type === 'enum' && !v.options.includes(String(value)))
      throw new Error(`Invalid enum: ${v.name}`);
    if (v.type === 'text' && typeof value !== 'string') throw new Error(`Invalid text: ${v.name}`);
  }
  for (const c of p.connections)
    if (!s.connections[c.id]) throw new Error('Missing connection state.');
  for (const c of p.characters)
    if (
      (!p.locations.some((l) => l.id === s.characters[c.id]) &&
        !(s.characters[c.id] === '' && ancestry(s, c.id).at(-1)?.kind === 'offstage')) ||
      effectiveRoom(s, c.id) !== s.characters[c.id]
    )
      throw new Error('Invalid character location.');
  for (const c of p.characters) {
    if (!s.characterProperties[c.id]) throw new Error('Missing character property state.');
    for (const def of p.propertyDefinitions)
      if (def.id in s.characterProperties[c.id])
        validateValue(def, s.characterProperties[c.id][def.id]);
  }
  if (!Number.isInteger(s.turn) || s.turn < 0 || !Number.isInteger(s.rng))
    throw new Error('Invalid simulation clock.');
  for (const e of s.events)
    if (!p.rules.some((r) => r.id === e.id && r.phase === 'event') || !Number.isInteger(e.due))
      throw new Error('Invalid scheduled event.');
}
class Refusal extends Error {}
type EventItem = { name: string; bindings: Bindings; ruleId?: string; instanceId?: string };
class Transaction {
  output: string[] = [];
  trace: Trace[] = [];
  queue: EventItem[] = [];
  work = 0;
  resultingTurn: number;
  constructor(
    readonly p: Project,
    readonly s: GameState,
    public action: CanonicalAction,
    cost: number,
  ) {
    this.resultingTurn = s.turn + cost;
  }
  log(stage: string, message: string, passed?: boolean, ruleId?: string) {
    this.trace.push({ stage, message, passed, ruleId });
  }
  print(text: string, b: Bindings = this.action.args) {
    if (text) this.output.push(renderText(this.p, this.s, text, b));
  }
  tick() {
    if (++this.work > 100)
      throw new Error('Event/rule work limit (100) exceeded; transaction rolled back.');
  }
  movePlayer(to: string, b: Bindings) {
    if (!this.p.locations.some((l) => l.id === to)) throw new Error('Invalid move destination.');
    const from = this.s.location;
    this.s.previousLocation = from;
    this.s.location = to;
    this.s.playerPlacement = { kind: 'location', id: to };
    this.queue.push(
      { name: 'leave', bindings: { ...b, actor: 'player', from, to } },
      { name: 'enter', bindings: { ...b, actor: 'player', from, to } },
    );
  }
  effects(effects: Effect[], b: Bindings) {
    for (const e of effects) {
      if (this.s.ending) break;
      this.tick();
      const ref = resolve(this.s, e.ref, b);
      this.log('effect', `${e.kind}${ref ? ` · ${ref}` : ''}${e.key ? ` · ${e.key}` : ''}`);
      switch (e.kind) {
        case 'print':
          this.print(e.text, b);
          break;
        case 'set':
          if (!(ref in this.s.variables)) throw new Error('Unknown variable.');
          this.s.variables[ref] = e.value;
          break;
        case 'increment':
          if (typeof this.s.variables[ref] !== 'number' || typeof e.value !== 'number')
            throw new Error('Increment requires numbers.');
          this.s.variables[ref] += e.value;
          break;
        case 'property': {
          const properties = this.s.objects[ref]?.properties ?? this.s.characterProperties[ref];
          if (!properties) throw new Error('Unknown property owner.');
          properties[e.key] = e.value;
          break;
        }
        case 'state': {
          if (
            !['open', 'locked', 'worn', 'active', 'concealed'].includes(e.key) ||
            typeof e.value !== 'boolean'
          )
            throw new Error('Invalid object-state effect.');
          const o = this.s.objects[ref];
          if (!o) throw new Error('Unknown state owner.');
          (o as unknown as Record<string, Scalar>)[e.key] = e.value;
          break;
        }
        case 'move': {
          const pl = { ...e.placement, id: resolve(this.s, e.placement.id, b) };
          const oldRooms = Object.fromEntries(
            ['player', ...Object.keys(this.s.characters)].map((actor) => [
              actor,
              effectiveRoom(this.s, actor),
            ]),
          );
          if (ref === 'player') {
            if (pl.kind === 'location') this.movePlayer(pl.id, b);
            else {
              const from = this.s.playerPlacement.id;
              this.s.playerPlacement = pl;
              synchronizeActors(this.s);
              this.queue.push(
                { name: 'leave', bindings: { ...b, actor: 'player', from, to: pl.id } },
                { name: 'enter', bindings: { ...b, actor: 'player', from, to: pl.id } },
              );
            }
          } else if (ref in this.s.characters) {
            this.s.placements[ref] = pl;
            synchronizeActors(this.s);
          } else {
            if (!this.s.placements[ref]) throw new Error('Unknown moved object.');
            this.s.placements[ref] = pl;
            this.s.objects[ref].worn = false;
            synchronizeActors(this.s);
          }
          if (ref !== 'player')
            for (const actor of Object.keys(oldRooms)) {
              const to = effectiveRoom(this.s, actor),
                from = oldRooms[actor];
              if (from !== to)
                this.queue.push(
                  { name: 'leave', bindings: { ...b, actor, from, to } },
                  { name: 'enter', bindings: { ...b, actor, from, to } },
                );
            }
          break;
        }
        case 'enable':
          if (!this.s.connections[ref]) throw new Error('Unknown connection.');
          this.s.connections[ref].enabled = Boolean(e.value);
          break;
        case 'reveal': {
          this.s.forgottenTopics = this.s.forgottenTopics.filter((id) => id !== ref);
          if (this.s.objects[ref]) this.s.objects[ref].concealed = false;
          if (this.s.connections[ref]) this.s.connections[ref].concealed = false;
          remember(this.s, ref);
          observe(this.p, this.s, ref);
          break;
        }
        case 'forgetTopic':
          if (!this.s.forgottenTopics.includes(ref)) this.s.forgottenTopics.push(ref);
          this.s.known = this.s.known.filter((id) => id !== ref);
          delete this.s.observations[ref];
          break;
        case 'schedule':
          this.s.events.push({
            id: ref,
            sequence: ++this.s.eventSequence,
            instanceId: 'event-' + this.s.eventSequence,
            due: this.resultingTurn + Math.max(1, e.delay),
            bindings: clone(b),
          });
          break;
        case 'cancel':
          this.s.events = this.s.events.filter((x) => x.id !== ref && x.instanceId !== ref);
          this.queue = this.queue.filter((x) => x.ruleId !== ref && x.instanceId !== ref);
          break;
        case 'emit':
          this.queue.push({ name: ref, bindings: clone(b) });
          break;
        case 'random': {
          this.s.rng = (Math.imul(1664525, this.s.rng) + 1013904223) >>> 0;
          const index = Math.floor((this.s.rng / 4294967296) * e.branches.length);
          if (e.branches[index]) this.effects(e.branches[index], b);
          break;
        }
        case 'invoke': {
          const args = Object.fromEntries(
            Object.entries(e.arguments).map(([k, v]) => [
              k,
              typeof v === 'string' && v.startsWith('$') ? resolve(this.s, v, b) : v,
            ]),
          );
          try {
            this.perform({ actionId: ref, args });
          } catch (error) {
            if (!(error instanceof Refusal)) throw error;
            if (e.onRefusal === 'stop') throw error;
            if (e.onRefusal === 'report') this.print(error.message, b);
          }
          break;
        }
        case 'end':
          this.print(e.text, b);
          this.s.ending = ref || 'ending';
          break;
      }
    }
  }
  matching(phase: Rule['phase'], trigger: string, b: Bindings, ruleId?: string) {
    return this.p.rules
      .filter(
        (r) =>
          r.enabled &&
          r.phase === phase &&
          (ruleId ? r.id === ruleId : r.trigger === trigger) &&
          (!r.once || !this.s.fired.includes(r.id)) &&
          (!r.scope || r.scope === this.s.location || Object.values(b).includes(r.scope)) &&
          Object.entries(r.bindings).every(([key, value]) => b[key] === value) &&
          evaluate(this.p, this.s, r.appliesWhen, b),
      )
      .sort((a, b) => b.priority - a.priority || a.order - b.order || a.id.localeCompare(b.id));
  }
  checkRule(r: Rule, b: Bindings) {
    this.tick();
    const pass = evaluate(this.p, this.s, r.condition, b);
    this.log(r.phase, r.name, pass, r.id);
    return pass;
  }
  runRule(r: Rule, b: Bindings) {
    this.effects(r.effects, b);
    if (r.once && !this.s.fired.includes(r.id)) this.s.fired.push(r.id);
  }
  drain() {
    while (this.queue.length && !this.s.ending) {
      this.tick();
      const e = this.queue.shift()!;
      this.log('event', e.name);
      for (const r of this.matching('event', e.name, e.bindings, e.ruleId)) {
        if (this.s.ending) break;
        if (this.checkRule(r, e.bindings)) {
          try {
            this.runRule(r, e.bindings);
          } catch (error) {
            if (!(error instanceof Refusal)) throw error;
            this.print(error.message, e.bindings);
            this.log('event refusal', error.message, false, r.id);
          }
        }
      }
    }
  }
  /** All explicit, implicit and invoked actions share this transaction pipeline. */
  perform(raw: CanonicalAction) {
    this.tick();
    const previous = this.action,
      before = clone(this.s),
      outputAt = this.output.length,
      queueAt = this.queue.length;
    try {
      const { a, def } = validateAction(this.p, this.s, raw);
      this.action = a;
      for (const param of def.parameters) {
        if (a.args[param.id] === undefined && param.optional) continue;
        if (param.kind === 'entity' && !['none', 'known'].includes(param.scope)) {
          const info = scope(this.p, this.s, String(a.args[param.id]));
          if (!info[param.scope as keyof typeof info])
            throw new Refusal(
              param.scope === 'accessible'
                ? 'You must carry that item where you can reach it.'
                : 'You cannot reach that from here.',
            );
        }
        if (param.kind === 'entity') {
          const object = index(this.p).objects.get(String(a.args[param.id])),
            character = index(this.p).characters.get(String(a.args[param.id]));
          if (
            (param.entityKind === 'object' && !object) ||
            (param.entityKind === 'character' && !character)
          )
            throw new Refusal(`That is not a suitable ${param.name.toLowerCase()}.`);
          if (
            param.capability &&
            !object?.capabilities.includes(param.capability as WorldObject['capabilities'][number])
          )
            throw new Refusal('That object cannot be used that way.');
        }
      }
      this.log('scope', 'Scope checks passed', true);
      for (const r of this.matching('check', a.actionId, a.args)) {
        if (r.effects.length)
          throw new Error('Requirements cannot execute effects. Resolve the migration item.');
        if (!this.checkRule(r, a.args)) throw new Refusal(r.otherwise || 'You cannot do that yet.');
      }
      const handlers = this.matching('handle', a.actionId, a.args);
      const handler = handlers.find((r) => this.checkRule(r, a.args));
      const reportAt = this.output.length;
      if (handler) {
        if (handler.outcome === 'refusal')
          throw new Refusal(handler.otherwise || 'You cannot do that.');
        this.runRule(handler, a.args);
      } else {
        const refusal = handlers.find((r) => r.otherwise);
        if (refusal) throw new Refusal(refusal.otherwise);
        this.builtin();
      }
      const reportEnd = this.output.length;
      for (const r of this.matching('after', a.actionId, a.args)) {
        if (this.s.ending) break;
        if (this.checkRule(r, a.args)) this.runRule(r, a.args);
      }
      let replaced = false;
      for (const r of this.matching('response', a.actionId, a.args)) {
        if (this.s.ending) break;
        if (!this.checkRule(r, a.args)) continue;
        if (r.responseMode === 'replace') {
          if (replaced) continue;
          this.output.splice(reportAt, reportEnd - reportAt);
          replaced = true;
        }
        this.runRule(r, a.args);
      }
      assertState(this.p, this.s);
    } catch (error) {
      Object.assign(this.s, before);
      this.output.splice(outputAt);
      this.queue.splice(queueAt);
      throw error;
    } finally {
      this.action = previous;
    }
  }
  builtin() {
    const { actionId: a, args: b } = this.action,
      p = this.p,
      s = this.s,
      target = String(b.destination ?? b.recipient ?? b.target ?? b.item ?? ''),
      tool = String(b.instrument ?? b.item ?? ''),
      o = p.objects.find((o) => o.id === target),
      os = s.objects[target];
    const requireObject = (cap?: WorldObject['capabilities'][number]) => {
      if (!o || !os) throw new Refusal('That is not an object you can manipulate.');
      if (cap && !o.capabilities.includes(cap))
        throw new Refusal(
          `${o.name} cannot be ${cap === 'openable' ? 'opened' : cap === 'readable' ? 'read' : `used that way`}.`,
        );
      return o;
    };
    const contents = () =>
      p.objects
        .filter((x) => s.placements[x.id]?.id === target && scope(p, s, x.id).visible)
        .map((x) => x.name);
    switch (a) {
      case 'look':
        this.print(describeScene(p, s));
        break;
      case 'inventory':
        this.print(
          `You are carrying ${
            p.objects
              .filter((o) => carried(s, o.id) && known(s, o.id))
              .map((o) => o.name)
              .join(', ') || 'nothing'
          }.`,
        );
        break;
      case 'examine': {
        if (!scope(p, s, target).visible) throw new Refusal('You cannot see that here.');
        const desc = describe(p, s, target);
        this.print(desc);
        observe(p, s, target, desc);
        if (o?.capabilities.includes('openable'))
          this.print(`It is ${os.open ? 'open' : 'closed'}.`);
        if (o?.capabilities.includes('container') && (os.open || o.transparent))
          this.print(`Inside: ${contents().join(', ') || 'nothing'}.`);
        break;
      }
      case 'go': {
        const c = p.connections.find((c) => c.id === b.exit)!;
        if (!c || c.from !== s.location) throw new Refusal('That exit is not here.');
        if (
          s.connections[c.id].concealed ||
          !evaluate(p, s, c.visibleWhen, b) ||
          (!illuminated(p, s) && !c.inDark)
        )
          throw new Refusal('You cannot find that way here now.');
        if (s.playerPlacement.kind !== 'location')
          throw new Refusal('Get out of your current enclosure first.');
        if (!s.connections[c.id].enabled || !evaluate(p, s, c.traverseWhen, b))
          throw new Refusal(c.blocked);
        if (c.doorId) {
          const door = s.objects[c.doorId];
          if (door.locked) throw new Refusal('The way is locked.');
          if (!door.open) {
            this.perform({ actionId: 'open', args: { target: c.doorId } });
            if (s.ending) return;
            if (!s.objects[c.doorId].open) throw new Refusal('The door is still closed.');
            this.log('implicit', 'Open the unlocked shared door', true);
          }
        }
        this.print(c.departure);
        this.movePlayer(c.to, b);
        this.print(c.arrival);
        this.print(describeScene(p, s));
        break;
      }
      case 'take':
      case 'takeFrom':
        requireObject();
        if (!o!.capabilities.includes('portable'))
          throw new Refusal(`${o!.name} is fixed in place.`);
        {
          const owner = ancestry(s, target).find((pl) => pl.kind === 'character');
          if (owner && !index(p).characters.get(owner.id)?.allowsTaking)
            throw new Refusal('You do not have permission to take their possessions.');
          if (ancestry(s, 'player').some((pl) => pl.id === target))
            throw new Refusal('You cannot pick up something you are occupying.');
        }
        if (
          a === 'takeFrom' &&
          !ancestry(s, target).some(
            (pl) => ['inside', 'on'].includes(pl.kind) && pl.id === b.source,
          )
        )
          throw new Refusal('That item is not in or on the specified source.');
        if (s.placements[target].kind === 'player')
          throw new Refusal('You are already carrying that.');
        s.placements[target] = { kind: 'player', id: '' };
        this.print(`Taken: ${o!.name}.`);
        break;
      case 'drop':
        requireObject();
        if (s.placements[target].kind !== 'player')
          throw new Refusal('You are not holding that directly. Take it out first.');
        if (os.worn) throw new Refusal('Take it off first.');
        s.placements[target] = clone(s.playerPlacement);
        os.worn = false;
        this.print(`You set down ${o!.name}.`);
        break;
      case 'putInside':
      case 'putOn': {
        requireObject();
        if (s.placements[tool]?.kind !== 'player')
          throw new Refusal('You must hold the item directly.');
        if (s.objects[tool]?.worn) throw new Refusal('Take it off first.');
        if (!o!.capabilities.includes(a === 'putInside' ? 'container' : 'supporter'))
          throw new Refusal('That cannot hold objects.');
        if (a === 'putInside' && o!.capabilities.includes('openable') && !os.open)
          throw new Refusal('It is closed.');
        if (tool === target || ancestry(s, target).some((pl) => pl.id === tool))
          throw new Refusal('An object cannot contain itself.');
        if (p.objects.filter((x) => s.placements[x.id]?.id === target).length >= o!.capacity)
          throw new Refusal('There is no room for another item.');
        s.placements[tool] = {
          kind: a === 'putInside' ? 'inside' : 'on',
          id: target,
        };
        s.objects[tool].worn = false;
        this.print('You put it in place.');
        break;
      }
      case 'open':
        requireObject('openable');
        if (os.locked) throw new Refusal('It is locked.');
        if (os.open) throw new Refusal('It is already open.');
        os.open = true;
        refreshKnowledge(p, s);
        this.print(
          `You open ${o!.name}.${contents().length ? ` Inside you find ${contents().join(', ')}.` : ''}`,
        );
        break;
      case 'close':
        requireObject('openable');
        if (!os.open) throw new Refusal('It is already closed.');
        os.open = false;
        this.print(`You close ${o!.name}.`);
        break;
      case 'unlock':
      case 'lock':
        requireObject('lockable');
        if (o!.keyId !== tool) throw new Refusal('That does not fit the lock.');
        if (a === 'lock' && os.open) throw new Refusal('Close it first.');
        os.locked = a === 'lock';
        this.print(`You ${a} ${o!.name}.`);
        break;
      case 'wear':
        requireObject('wearable');
        if (!carried(s, target)) throw new Refusal('You must carry it first.');
        os.worn = true;
        this.print(`You put on ${o!.name}.`);
        break;
      case 'remove':
        requireObject('wearable');
        if (!os.worn) throw new Refusal('You are not wearing it.');
        os.worn = false;
        this.print(`You remove ${o!.name}.`);
        break;
      case 'read':
        requireObject('readable');
        if (!scope(p, s, target).visible || !illuminated(p, s))
          throw new Refusal('You cannot see the writing clearly.');
        this.print(o!.readText || 'There is nothing written here.');
        break;
      case 'give': {
        const recipient = p.characters.find((c) => c.id === target);
        if (!recipient) throw new Refusal('Give it to a character.');
        if (!recipient.acceptsGifts) throw new Refusal('They decline your gift.');
        if (s.placements[tool]?.kind !== 'player' || s.objects[tool].worn)
          throw new Refusal('You must hold the item directly and take it off first.');
        s.placements[tool] = { kind: 'character', id: target };
        s.objects[tool].worn = false;
        this.print('They accept your gift.');
        break;
      }
      case 'show':
        if (!p.characters.some((c) => c.id === target))
          throw new Refusal('Show it to a character.');
        this.print('They look at what you show them.');
        break;
      case 'switchOn':
      case 'switchOff':
        requireObject('switchable');
        if (os.active === (a === 'switchOn'))
          throw new Refusal(`It is already switched ${os.active ? 'on' : 'off'}.`);
        os.active = a === 'switchOn';
        this.print(`You switch ${o!.name} ${os.active ? 'on' : 'off'}.`);
        break;
      case 'eat':
      case 'drink':
        requireObject(a === 'eat' ? 'edible' : 'drinkable');
        s.placements[target] = { kind: 'offstage', id: '' };
        os.worn = false;
        if (!s.consumed.includes(target)) s.consumed.push(target);
        this.print(`You ${a} ${o!.name}.`);
        break;
      case 'enter': {
        requireObject('enterable');
        if (!o!.capabilities.some((c) => c === 'container' || c === 'supporter'))
          throw new Refusal('That has no space to enter.');
        const relation = o!.capabilities.includes('container') ? 'inside' : 'on';
        if (relation === 'inside' && o!.capabilities.includes('openable') && !os.open)
          throw new Refusal('It is closed.');
        if (carried(s, target)) throw new Refusal('Put it down first.');
        if (ancestry(s, 'player').some((pl) => pl.id === target))
          throw new Refusal('You are already there.');
        if (Object.values(s.placements).filter((pl) => pl.id === target).length >= o!.capacity)
          throw new Refusal('There is no room.');
        const from = s.playerPlacement.id;
        s.playerPlacement = { kind: relation, id: target };
        synchronizeActors(s);
        this.queue.push(
          { name: 'leave', bindings: { ...b, actor: 'player', from, to: target } },
          { name: 'enter', bindings: { ...b, actor: 'player', from, to: target } },
        );
        this.print(`You get ${relation === 'inside' ? 'into' : 'onto'} ${o!.name}.`);
        break;
      }
      case 'exit': {
        const pl = s.playerPlacement;
        if (!['inside', 'on'].includes(pl.kind))
          throw new Refusal('You are not inside or on anything.');
        const enclosure = index(p).objects.get(pl.id)!;
        if (
          pl.kind === 'inside' &&
          enclosure.capabilities.includes('openable') &&
          !s.objects[pl.id].open
        )
          throw new Refusal('It is closed. Open it first.');
        s.playerPlacement = clone(s.placements[pl.id]);
        synchronizeActors(s);
        this.queue.push(
          { name: 'leave', bindings: { actor: 'player', from: pl.id, to: s.playerPlacement.id } },
          { name: 'enter', bindings: { actor: 'player', from: pl.id, to: s.playerPlacement.id } },
        );
        this.print(`You get out of ${enclosure.name}.`);
        break;
      }
      case 'lookIn':
      case 'search':
        requireObject();
        if (!scope(p, s, target).visible) throw new Refusal('You cannot see that here.');
        if (o!.capabilities.includes('container')) {
          if (o!.capabilities.includes('openable') && !os.open && !o!.transparent)
            throw new Refusal('It is closed.');
          this.print(
            `Inside: ${
              p.objects
                .filter(
                  (x) =>
                    s.placements[x.id]?.kind === 'inside' &&
                    s.placements[x.id].id === target &&
                    scope(p, s, x.id).visible,
                )
                .map((x) => x.name)
                .join(', ') || 'nothing'
            }.`,
          );
        } else this.print('You find nothing else.');
        break;
      case 'lookUnder':
      case 'lookBehind':
        this.print('You find nothing else.');
        break;
      case 'speak':
        this.print(`You say, “${b.text}”.${b.recipient ? ' There is no reply.' : ''}`);
        break;
      case 'tell':
        this.print(p.characters.find((c) => c.id === target)?.fallback ?? 'There is no reply.');
        break;
      case 'push':
      case 'pull':
      case 'turn':
      case 'touch':
      case 'listen':
      case 'smell':
      case 'taste':
      case 'knock':
      case 'attack':
      case 'cut':
      case 'climb':
      case 'use':
        throw new Refusal(
          actionCatalog(p).find((x) => x.id === a)?.refusal ?? 'That has no effect.',
        );
      case 'talk':
      case 'ask':
      case 'askText': {
        const c = p.characters.find((c) => c.id === target);
        if (!c) throw new Refusal('There is no reply.');
        if (a === 'talk') {
          this.print(c.greeting);
          break;
        }
        const t = c.topics.find((t) => t.id === b.topic);
        if (t && known(s, t.id) && evaluate(p, s, t.condition, b)) {
          this.print(t.response);
          this.effects(t.effects, b);
        } else this.print(c.fallback);
        break;
      }
      case 'wait':
        this.print('A moment passes.');
        break;
      default:
        throw new Refusal(
          actionCatalog(p).find((x) => x.id === a)?.refusal ?? 'That has no effect.',
        );
    }
  }
}
function validateAction(p: Project, s: GameState, raw: unknown) {
  const a = canonicalActionSchema.parse(raw),
    def = actionCatalog(p).find((x) => x.id === a.actionId);
  if (!def) throw new Error('Invalid action identifier.');
  for (const key of Object.keys(a.args))
    if (!def.parameters.some((p) => p.id === key)) throw new Error('Unexpected action parameter.');
  for (const param of def.parameters) {
    const v = a.args[param.id];
    if (v === undefined) {
      if (param.optional) continue;
      throw new Error(`Missing ${param.name}.`);
    }
    if (
      (['text', 'entity', 'connection', 'topic'].includes(param.kind) && typeof v !== 'string') ||
      (param.kind === 'number' && typeof v !== 'number') ||
      (param.kind === 'boolean' && typeof v !== 'boolean')
    )
      throw new Error('Wrong action parameter type.');
    if (param.kind === 'entity') {
      const e = [...p.objects, ...p.characters].find((e) => e.id === v);
      if (!e) throw new Error('Invalid entity identifier.');
    }
    if (param.kind === 'connection' && !p.connections.some((c) => c.id === v))
      throw new Error('Invalid connection identifier.');
    if (param.kind === 'topic' && !p.characters.some((c) => c.topics.some((t) => t.id === v)))
      throw new Error('Invalid topic identifier.');
    if (['entity', 'connection', 'topic'].includes(param.kind) && !known(s, String(v)))
      throw new Error('An undiscovered identifier cannot be an action target.');
  }
  return { a, def };
}
export function diff(before: unknown, after: unknown, path = ''): StateChange[] {
  if (JSON.stringify(before) === JSON.stringify(after)) return [];
  if (
    before &&
    after &&
    typeof before === 'object' &&
    typeof after === 'object' &&
    !Array.isArray(before) &&
    !Array.isArray(after)
  ) {
    const a = before as Record<string, unknown>,
      b = after as Record<string, unknown>;
    return [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap((k) =>
      diff(a[k], b[k], path ? `${path}.${k}` : k),
    );
  }
  return [{ path, before, after }];
}
export function execute(p: Project, state: GameState, action: CanonicalAction): ActionResult {
  const failure = (error: string, trace: Trace[] = []): ActionResult => ({
    state,
    action,
    output: [],
    trace,
    changes: [],
    success: false,
    committed: false,
    error,
  });
  if (state.ending) return failure('The story has ended. Undo, restore, or restart to continue.');
  let tx: Transaction | undefined;
  try {
    const { a, def } = validateAction(p, state, action),
      s = clone(state);
    tx = new Transaction(p, s, a, def.turnCost);
    let success = true;
    try {
      tx.perform(a);
      tx.drain();
    } catch (e) {
      if (!(e instanceof Refusal)) throw e;
      success = false;
      tx.print(e.message);
      tx.log('refusal', e.message, false);
    }
    const cost = success || p.failedAttemptsCostTurn ? def.turnCost : 0;
    if (s.ending) s.turn += cost;
    else
      for (let tick = 0; tick < cost; tick++) {
        s.turn++;
        tx.resultingTurn = s.turn;
        const due = s.events
          .filter((e) => e.due <= s.turn)
          .sort(
            (a, b) =>
              a.due - b.due ||
              (p.rules.find((r) => r.id === b.id)?.priority ?? 0) -
                (p.rules.find((r) => r.id === a.id)?.priority ?? 0) ||
              a.sequence - b.sequence,
          );
        const dueIds = new Set(due.map((e) => e.instanceId));
        s.events = s.events.filter((e) => !dueIds.has(e.instanceId));
        due.forEach((e) =>
          tx!.queue.push({
            name: 'scheduled',
            ruleId: e.id,
            instanceId: e.instanceId,
            bindings: e.bindings,
          }),
        );
        tx.drain();
        if (s.ending) break;
        tx.queue.push({ name: 'turn', bindings: { ...a.args, action: a.actionId } });
        tx.drain();
        if (s.ending) break;
      }
    refreshKnowledge(p, s);
    assertState(p, s);
    tx.log('commit', `${cost} turn${cost === 1 ? '' : 's'} · turn ${s.turn}`, success);
    return {
      state: s,
      action: a,
      output: tx.output,
      trace: tx.trace,
      changes: diff(state, s),
      success,
      committed: true,
    };
  } catch (e) {
    return failure(e instanceof Error ? e.message : 'Engine error.', tx?.trace);
  }
}
export function startGame(p: Project): { state: GameState; output: string[]; trace: Trace[] } {
  const s: GameState = {
    location: p.start,
    previousLocation: '',
    placements: Object.fromEntries([
      ...p.objects.map((o) => [o.id, clone(o.placement)]),
      ...p.characters.map((c) => [
        c.id,
        clone(c.placement ?? { kind: 'location', id: c.location }),
      ]),
    ]),
    objects: Object.fromEntries(
      p.objects.map((o) => [
        o.id,
        {
          open: o.open,
          locked: o.locked,
          active: o.active,
          worn: o.worn,
          concealed: o.concealed,
          properties: clone(o.properties),
        },
      ]),
    ),
    characters: Object.fromEntries(p.characters.map((c) => [c.id, c.location])),
    characterProperties: Object.fromEntries(p.characters.map((c) => [c.id, clone(c.properties)])),
    playerPlacement: { kind: 'location', id: p.start },
    consumed: [],
    eventSequence: 0,
    variables: Object.fromEntries(p.variables.map((v) => [v.id, v.initial])),
    connections: Object.fromEntries(
      p.connections.map((c) => [c.id, { enabled: c.enabled, concealed: c.concealed }]),
    ),
    known: [],
    forgottenTopics: [],
    visited: [],
    observations: {},
    fired: [],
    events: [],
    turn: 0,
    rng: p.seed,
    ending: null,
  };
  const tx = new Transaction(p, s, { actionId: 'look', args: {} }, 0);
  tx.print(p.intro);
  tx.queue.push(
    { name: 'start', bindings: {} },
    { name: 'enter', bindings: { from: '', to: p.start } },
  );
  tx.drain();
  refreshKnowledge(p, s);
  tx.print(describeScene(p, s));
  assertState(p, s);
  return { state: s, output: tx.output, trace: tx.trace };
}
