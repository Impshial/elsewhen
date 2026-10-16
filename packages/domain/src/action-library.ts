/** The shared language/action registry. UI help, compilation and parsing use these same forms. */
export type FormPart = { kind: 'literal'; text: string } | { kind: 'role'; role: string };
export type StandardAction = {
  id: string;
  name: string;
  description: string;
  cost: number;
  roles: { id: string; kind?: string; scope?: string; optional?: boolean }[];
  forms: string[];
};
const one = (
  id: string,
  name: string,
  forms: string[],
  description: string,
  cost = 1,
): StandardAction => ({ id, name, forms, description, cost, roles: [{ id: 'target' }] });
export const standardActions: StandardAction[] = [
  {
    id: 'look',
    name: 'Look',
    description: 'Describe your surroundings.',
    cost: 0,
    roles: [],
    forms: ['look', 'l'],
  },
  {
    id: 'inventory',
    name: 'Inventory',
    description: 'List what you carry.',
    cost: 0,
    roles: [],
    forms: ['inventory', 'i'],
  },
  {
    id: 'wait',
    name: 'Wait',
    description: 'Let one turn pass.',
    cost: 1,
    roles: [],
    forms: ['wait', 'z'],
  },
  one(
    'examine',
    'Examine',
    ['examine {target}', 'inspect {target}', 'look at {target}', 'x {target}'],
    'Inspect something visible.',
    0,
  ),
  one('read', 'Read', ['read {target}'], 'Read visible writing.', 0),
  ...[
    ['lookIn', 'Look inside', ['look in {target}', 'look inside {target}']],
    ['lookUnder', 'Look under', ['look under {target}']],
    ['lookBehind', 'Look behind', ['look behind {target}']],
    ['search', 'Search', ['search {target}']],
    ['open', 'Open', ['open {target}']],
    ['close', 'Close', ['close {target}', 'shut {target}']],
    ['wear', 'Wear', ['wear {target}', 'put on {target}', 'put {target} on']],
    ['remove', 'Take off', ['remove {target}', 'take off {target}', 'take {target} off']],
    [
      'switchOn',
      'Switch on',
      ['switch on {target}', 'turn on {target}', 'switch {target} on', 'turn {target} on'],
    ],
    [
      'switchOff',
      'Switch off',
      ['switch off {target}', 'turn off {target}', 'switch {target} off', 'turn {target} off'],
    ],
    ['eat', 'Eat', ['eat {target}']],
    ['drink', 'Drink', ['drink {target}']],
    [
      'enter',
      'Enter',
      ['enter {target}', 'get in {target}', 'get into {target}', 'sit on {target}'],
    ],
    ...[
      'push',
      'pull',
      'turn',
      'touch',
      'listen',
      'smell',
      'taste',
      'knock',
      'attack',
      'climb',
    ].map((x) => [
      x,
      x[0].toUpperCase() + x.slice(1),
      [
        `${x} {target}`,
        ...(x === 'listen' ? ['listen to {target}'] : x === 'knock' ? ['knock on {target}'] : []),
      ],
    ]),
  ].map(([id, name, forms]) =>
    one(
      id as string,
      name as string,
      forms as string[],
      `${name} a target; authored rules can customize the result.`,
      ['lookIn', 'lookUnder', 'lookBehind'].includes(id as string) ? 0 : 1,
    ),
  ),
  {
    id: 'exit',
    name: 'Exit',
    description: 'Leave your current container or supporter.',
    cost: 1,
    roles: [],
    forms: ['exit', 'get out', 'get off', 'leave'],
  },
  {
    id: 'go',
    name: 'Go',
    description: 'Travel through an outgoing exit by direction, name, door or known destination.',
    cost: 1,
    roles: [{ id: 'exit', kind: 'connection', scope: 'known' }],
    forms: [
      'go {exit}',
      'go to {exit}',
      'go through {exit}',
      'walk to {exit}',
      'walk through {exit}',
      'enter {exit}',
    ],
  },
  {
    id: 'take',
    name: 'Take',
    description: 'Pick up a reachable portable item.',
    cost: 1,
    roles: [{ id: 'item' }],
    forms: ['take {item}', 'get {item}', 'pick up {item}', 'pick {item} up', 'grab {item}'],
  },
  {
    id: 'takeFrom',
    name: 'Take from',
    description: 'Take an item from a specific source.',
    cost: 1,
    roles: [{ id: 'item' }, { id: 'source' }],
    forms: ['take {item} from {source}', 'get {item} from {source}', 'remove {item} from {source}'],
  },
  {
    id: 'drop',
    name: 'Drop',
    description: 'Put down a directly held, unworn item.',
    cost: 1,
    roles: [{ id: 'item', scope: 'accessible' }],
    forms: ['drop {item}', 'put down {item}'],
  },
  ...(['putInside', 'putOn'] as const).map((id) => ({
    id,
    name: id === 'putInside' ? 'Put inside' : 'Put on',
    description: 'Place a carried item using the specified relation.',
    cost: 1,
    roles: [{ id: 'item', scope: 'accessible' }, { id: 'destination' }],
    forms:
      id === 'putInside'
        ? [
            'put {item} in {destination}',
            'put {item} into {destination}',
            'insert {item} into {destination}',
          ]
        : ['put {item} on {destination}', 'place {item} onto {destination}'],
  })),
  ...['unlock', 'lock', 'cut'].map((id) => ({
    id,
    name: id[0].toUpperCase() + id.slice(1),
    description: `${id} a target with an instrument.`,
    cost: 1,
    roles: [{ id: 'target' }, { id: 'instrument', scope: 'accessible' }],
    forms: [`${id} {target} with {instrument}`],
  })),
  {
    id: 'use',
    name: 'Use',
    description: 'Use an item, optionally on a target; consequences are authored.',
    cost: 1,
    roles: [
      { id: 'item', scope: 'accessible' },
      { id: 'target', optional: true },
    ],
    forms: ['use {item} on {target}', 'use {item} with {target}', 'use {item}'],
  },
  ...['give', 'show'].map((id) => ({
    id,
    name: id[0].toUpperCase() + id.slice(1),
    description:
      id === 'give'
        ? 'Offer an item to a character.'
        : 'Show an item without transferring ownership.',
    cost: 1,
    roles: [{ id: 'item', scope: 'accessible' }, { id: 'recipient' }],
    forms: [`${id} {item} to {recipient}`],
  })),
  {
    id: 'talk',
    name: 'Talk',
    description: 'Start a conversation.',
    cost: 1,
    roles: [{ id: 'recipient' }],
    forms: ['talk to {recipient}', 'talk with {recipient}', 'talk {recipient}'],
  },
  {
    id: 'ask',
    name: 'Ask about topic',
    description: 'Ask about a known conversation topic.',
    cost: 1,
    roles: [{ id: 'recipient' }, { id: 'topic', kind: 'topic', scope: 'known' }],
    forms: [],
  },
  ...['askText', 'tell'].map((id) => ({
    id,
    name: id === 'tell' ? 'Tell' : 'Ask',
    description: 'Discuss a subject with a character.',
    cost: 1,
    roles: [{ id: 'recipient' }, { id: 'text', kind: 'text', scope: 'none' }],
    forms: [`${id === 'tell' ? 'tell' : 'ask'} {recipient} about {text}`],
  })),
  {
    id: 'speak',
    name: 'Say',
    description: 'Say quoted words, optionally to a person or object.',
    cost: 1,
    roles: [
      { id: 'text', kind: 'text', scope: 'none' },
      { id: 'recipient', optional: true },
    ],
    forms: ['say {text} to {recipient}', 'say {text}', 'speak {text} to {recipient}'],
  },
];
export function formParts(form: string): FormPart[] {
  return form
    .split(/(\{[^}]+\})/)
    .filter((x) => x.trim())
    .map((x) =>
      x.startsWith('{')
        ? { kind: 'role', role: x.slice(1, -1) }
        : { kind: 'literal', text: x.trim() },
    );
}
export const directionAliases: Record<string, string> = {
  north: 'north',
  n: 'north',
  northeast: 'northeast',
  'north-east': 'northeast',
  ne: 'northeast',
  east: 'east',
  e: 'east',
  southeast: 'southeast',
  'south-east': 'southeast',
  se: 'southeast',
  south: 'south',
  s: 'south',
  southwest: 'southwest',
  'south-west': 'southwest',
  sw: 'southwest',
  west: 'west',
  w: 'west',
  northwest: 'northwest',
  'north-west': 'northwest',
  nw: 'northwest',
  up: 'up',
  u: 'up',
  down: 'down',
  d: 'down',
  in: 'in',
  out: 'out',
};
export const normalizePhrase = (s: string) =>
  s.normalize('NFKC').toLowerCase().trim().replace(/\s+/g, ' ');
/** Mechanical v1 role mapping; used by migration, never as a player grammar. */
export const legacyRoles: Record<string, Record<string, string>> = {
  take: { target: 'item' },
  takeFrom: { target: 'item' },
  drop: { target: 'item' },
  put: { tool: 'item', target: 'destination' },
  use: { tool: 'item' },
  unlock: { tool: 'instrument' },
  lock: { tool: 'instrument' },
  give: { tool: 'item', target: 'recipient' },
  talk: { target: 'recipient' },
  ask: { target: 'recipient' },
  askText: { target: 'recipient' },
  speak: { target: 'recipient' },
};
