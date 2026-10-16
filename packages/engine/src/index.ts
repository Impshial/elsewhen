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
  let pl = s.placements[id];
  while (pl) {
    chain.push(pl);
    if (!['inside', 'on'].includes(pl.kind)) break;
    if (seen.has(pl.id)) throw new Error('Containment cycle.');
    seen.add(pl.id);
    pl = s.placements[pl.id];
  }
  return chain;
}
export const carried = (s: GameState, id: string) =>
  ancestry(s, id).some((p) => p.kind === 'player');
function physical(
  p: Project,
  s: GameState,
  id: string,
): { near: boolean; visible: boolean; reachable: boolean } {
  const o = index(p).objects.get(id);
  if (!o) {
    const c = index(p).characters.get(id);
    const near = !!c && s.characters[id] === s.location;
    return { near, visible: near, reachable: near };
  }
  const chain = ancestry(s, id),
    root = chain.at(-1);
  const door =
    root?.kind === 'connection' &&
    p.connections.some((c) => c.doorId === id && (c.from === s.location || c.to === s.location));
  const near = !!(
    door ||
    root?.kind === 'player' ||
    (root?.kind === 'location' && root.id === s.location)
  );
  let visible = near && !s.objects[id].concealed,
    reachable = near && !s.objects[id].concealed;
  for (const pl of chain)
    if (pl.kind === 'inside') {
      const parent = index(p).objects.get(pl.id)!;
      if (parent.capabilities.includes('openable') && !s.objects[pl.id].open) {
        reachable = false;
        if (!parent.transparent) visible = false;
      }
      if (s.objects[pl.id].concealed) {
        visible = false;
        reachable = false;
      }
    }
  return { near, visible, reachable };
}
export function illuminated(p: Project, s: GameState): boolean {
  if (!index(p).locations.get(s.location)?.dark) return true;
  return p.objects.some(
    (o) =>
      o.capabilities.includes('light') && s.objects[o.id].active && physical(p, s, o.id).visible,
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
    reachable: base.reachable && (visible || isCarried),
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
        ? s.objects[ref]?.properties[c.key]
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
    name: e.name,
    aliases: clone(e.aliases),
    kind,
    description: description ?? s.observations[id]?.description ?? '',
    capabilities: 'capabilities' in e ? [...e.capabilities] : [],
  };
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
  const entities = [...p.objects, ...p.characters]
    .filter((e) => scope(p, s, e.id).visible)
    .map((e) => s.observations[e.id])
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
    .map((c) => s.observations[c.id]);
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
    location: s.observations[s.location],
    turn: s.turn,
    ending: s.ending,
    entities,
    inventory: p.objects
      .filter((o) => carried(s, o.id) && known(s, o.id))
      .map((o) => s.observations[o.id]),
    known: Object.values(s.observations),
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
  if (!p.locations.some((l) => l.id === s.location)) throw new Error('Player location is invalid.');
  const counts = new Map<string, number>();
  for (const pl of Object.values(s.placements))
    if (pl.kind === 'inside' || pl.kind === 'on') counts.set(pl.id, (counts.get(pl.id) ?? 0) + 1);
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
    if (!p.locations.some((l) => l.id === s.characters[c.id]))
      throw new Error('Invalid character location.');
  if (!Number.isInteger(s.turn) || s.turn < 0 || !Number.isInteger(s.rng))
    throw new Error('Invalid simulation clock.');
  for (const e of s.events)
    if (!p.rules.some((r) => r.id === e.id && r.phase === 'event') || !Number.isInteger(e.due))
      throw new Error('Invalid scheduled event.');
}
class Refusal extends Error {}
type EventItem = { name: string; bindings: Bindings; ruleId?: string };
class Transaction {
  output: string[] = [];
  trace: Trace[] = [];
  queue: EventItem[] = [];
  work = 0;
  resultingTurn: number;
  constructor(
    readonly p: Project,
    readonly s: GameState,
    readonly action: CanonicalAction,
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
    this.queue.push(
      { name: 'leave', bindings: { ...b, from, to } },
      { name: 'enter', bindings: { ...b, from, to } },
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
        case 'property':
          if (!this.s.objects[ref]) throw new Error('Unknown property owner.');
          this.s.objects[ref].properties[e.key] = e.value;
          break;
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
          if (ref === 'player') this.movePlayer(pl.id, b);
          else if (this.s.characters[ref]) this.s.characters[ref] = pl.id;
          else {
            if (!this.s.placements[ref]) throw new Error('Unknown moved object.');
            this.s.placements[ref] = pl;
            this.s.objects[ref].worn = false;
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
            due: this.resultingTurn + Math.max(1, e.delay),
            bindings: clone(b),
          });
          break;
        case 'cancel':
          this.s.events = this.s.events.filter((x) => x.id !== ref);
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
          Object.entries(r.bindings).every(([key, value]) => b[key] === value),
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
        if (this.checkRule(r, e.bindings)) this.runRule(r, e.bindings);
      }
    }
  }
  builtin() {
    const { actionId: a, args: b } = this.action,
      p = this.p,
      s = this.s,
      target = String(b.target ?? ''),
      tool = String(b.tool ?? ''),
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
        this.print(describe(p, s, s.location));
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
        if (c.from !== s.location) throw new Refusal('That exit is not here.');
        if (!s.connections[c.id].enabled || !evaluate(p, s, c.traverseWhen, b))
          throw new Refusal(c.blocked);
        if (c.doorId) {
          const door = s.objects[c.doorId];
          if (door.locked) throw new Refusal('The way is locked.');
          if (!door.open) {
            door.open = true;
            this.print(`You open ${p.objects.find((o) => o.id === c.doorId)!.name}.`);
            this.log('implicit', 'Open the unlocked shared door', true);
          }
        }
        this.print(c.departure);
        this.movePlayer(c.to, b);
        this.print(c.arrival);
        this.print(describe(p, s, s.location));
        break;
      }
      case 'take':
      case 'takeFrom':
        requireObject('portable');
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
        s.placements[target] = { kind: 'location', id: s.location };
        os.worn = false;
        this.print(`You set down ${o!.name}.`);
        break;
      case 'put': {
        requireObject();
        if (!o!.capabilities.includes('container') && !o!.capabilities.includes('supporter'))
          throw new Refusal('That cannot hold objects.');
        if (o!.capabilities.includes('openable') && !os.open) throw new Refusal('It is closed.');
        if (tool === target || ancestry(s, target).some((pl) => pl.id === tool))
          throw new Refusal('An object cannot contain itself.');
        if (p.objects.filter((x) => s.placements[x.id]?.id === target).length >= o!.capacity)
          throw new Refusal('There is no room for another item.');
        s.placements[tool] = {
          kind: o!.capabilities.includes('container') ? 'inside' : 'on',
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
        this.print(o!.readText || 'There is nothing written here.');
        break;
      case 'give': {
        if (!p.characters.some((c) => c.id === target))
          throw new Refusal('Give it to a character.');
        s.placements[tool] = { kind: 'character', id: target };
        s.objects[tool].worn = false;
        this.print('They accept your gift.');
        break;
      }
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
    if (v === undefined) throw new Error(`Missing ${param.name}.`);
    if (
      (['text', 'entity', 'connection', 'topic'].includes(param.kind) && typeof v !== 'string') ||
      (param.kind === 'number' && typeof v !== 'number') ||
      (param.kind === 'boolean' && typeof v !== 'boolean')
    )
      throw new Error('Wrong action parameter type.');
    if (param.kind === 'entity') {
      const e = [...p.objects, ...p.characters].find((e) => e.id === v);
      if (!e) throw new Error('Invalid entity identifier.');
      if (
        (param.entityKind === 'object' && !('capabilities' in e)) ||
        (param.entityKind === 'character' && !('topics' in e))
      )
        throw new Error('Incompatible entity kind.');
      if (
        param.capability &&
        (!('capabilities' in e) ||
          !e.capabilities.includes(param.capability as WorldObject['capabilities'][number]))
      )
        throw new Error('Incompatible parameter capability.');
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
      for (const param of def.parameters)
        if (param.kind === 'entity' && !['none', 'known'].includes(param.scope)) {
          const info = scope(p, s, String(a.args[param.id]));
          if (!info[param.scope as keyof typeof info])
            throw new Refusal(
              param.scope === 'accessible'
                ? 'You must carry that item where you can reach it.'
                : 'You cannot reach that from here.',
            );
        }
      tx.log('scope', 'Scope checks passed', true);
      for (const r of tx.matching('check', a.actionId, a.args))
        if (!tx.checkRule(r, a.args)) throw new Refusal(r.otherwise || 'You cannot do that yet.');
      const handlers = tx.matching('handle', a.actionId, a.args);
      const handler = handlers.find((r) => tx!.checkRule(r, a.args));
      if (handler) tx.runRule(handler, a.args);
      else {
        const refusal = handlers.find((r) => r.otherwise);
        if (refusal) throw new Refusal(refusal.otherwise);
        tx.builtin();
      }
      for (const r of tx.matching('after', a.actionId, a.args)) {
        if (s.ending) break;
        if (tx.checkRule(r, a.args)) tx.runRule(r, a.args);
      }
      tx.drain();
    } catch (e) {
      if (!(e instanceof Refusal)) throw e;
      success = false;
      tx.print(e.message);
      tx.log('refusal', e.message, false);
    }
    const cost = success || p.failedAttemptsCostTurn ? def.turnCost : 0;
    s.turn += cost;
    if (cost && !s.ending) {
      const due = s.events.filter((e) => e.due <= s.turn);
      s.events = s.events.filter((e) => e.due > s.turn);
      due.forEach((e) => tx!.queue.push({ name: 'scheduled', ruleId: e.id, bindings: e.bindings }));
      tx.drain();
      tx.queue.push({ name: 'turn', bindings: { ...a.args, action: a.actionId } });
      tx.drain();
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
    placements: Object.fromEntries(p.objects.map((o) => [o.id, clone(o.placement)])),
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
  tx.print(describe(p, s, s.location));
  assertState(p, s);
  return { state: s, output: tx.output, trace: tx.trace };
}
