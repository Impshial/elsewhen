import { standardActions, formParts } from './action-library';
export * from './action-library';
import { z } from 'zod';

export const id = z.string().min(1).max(160);
const text = z.string().max(100000);
export const scalar = z.union([z.string(), z.number().finite(), z.boolean(), z.null()]);
export type Scalar = z.infer<typeof scalar>;
export const values = z.record(z.string(), scalar);
export const placementSchema = z
  .object({
    kind: z.enum(['location', 'inside', 'on', 'character', 'player', 'offstage', 'connection']),
    id: z.string().default(''),
  })
  .strict();
export type Placement = z.infer<typeof placementSchema>;
export type Condition =
  | { kind: 'all' | 'any' | 'not'; conditions: Condition[] }
  | {
      kind: 'compare';
      source: 'variable' | 'property' | 'argument' | 'turn' | 'location' | 'previousLocation';
      ref: string;
      key: string;
      op: 'eq' | 'ne' | 'gt' | 'lt' | 'gte' | 'lte' | 'normalized';
      value: Scalar;
    }
  | {
      kind: 'test';
      test:
        | 'carried'
        | 'visible'
        | 'reachable'
        | 'known'
        | 'open'
        | 'locked'
        | 'active'
        | 'worn'
        | 'enabled'
        | 'fired'
        | 'at';
      ref: string;
      value: Scalar;
    };
export const conditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    z
      .object({
        kind: z.enum(['all', 'any', 'not']),
        conditions: z.array(conditionSchema).max(100),
      })
      .strict(),
    z
      .object({
        kind: z.literal('compare'),
        source: z.enum([
          'variable',
          'property',
          'argument',
          'turn',
          'location',
          'previousLocation',
        ]),
        ref: z.string(),
        key: z.string(),
        op: z.enum(['eq', 'ne', 'gt', 'lt', 'gte', 'lte', 'normalized']),
        value: scalar,
      })
      .strict(),
    z
      .object({
        kind: z.literal('test'),
        test: z.enum([
          'carried',
          'visible',
          'reachable',
          'known',
          'open',
          'locked',
          'active',
          'worn',
          'enabled',
          'fired',
          'at',
        ]),
        ref: z.string(),
        value: scalar,
      })
      .strict(),
  ]),
);
export const always = (): Condition => ({ kind: 'all', conditions: [] });
export type Effect = {
  kind:
    | 'print'
    | 'set'
    | 'increment'
    | 'property'
    | 'move'
    | 'state'
    | 'enable'
    | 'reveal'
    | 'forgetTopic'
    | 'schedule'
    | 'cancel'
    | 'emit'
    | 'random'
    | 'invoke'
    | 'end';
  ref: string;
  key: string;
  value: Scalar;
  text: string;
  placement: Placement;
  delay: number;
  branches: Effect[][];
  arguments: Record<string, Scalar>;
  onRefusal: 'stop' | 'report' | 'ignore';
};
export const effectSchema: z.ZodType<Effect> = z.lazy(() =>
  z
    .object({
      kind: z.enum([
        'print',
        'set',
        'increment',
        'property',
        'move',
        'state',
        'enable',
        'reveal',
        'forgetTopic',
        'schedule',
        'cancel',
        'emit',
        'random',
        'invoke',
        'end',
      ]),
      ref: z.string().default(''),
      key: z.string().default(''),
      value: scalar.default(null),
      text: text.default(''),
      placement: placementSchema.default({ kind: 'offstage', id: '' }),
      delay: z.number().int().min(0).max(100000).default(1),
      branches: z.array(z.array(effectSchema)).max(20).default([]),
      arguments: values.default({}),
      onRefusal: z.enum(['stop', 'report', 'ignore']).default('stop'),
    })
    .strict(),
);
export const effect = (kind: Effect['kind'], rest: Partial<Effect> = {}): Effect =>
  effectSchema.parse({ kind, ...rest });
const identity = {
  id,
  name: z.string().min(1).max(300),
  aliases: z.array(z.string().max(300)).default([]),
  nouns: z.array(z.string().max(300)).default([]),
  adjectives: z.array(z.string().max(100)).default([]),
  plurals: z.array(z.string().max(300)).default([]),
  description: text.default(''),
  notes: text.default(''),
};
export const variantSchema = z
  .object({
    id,
    mode: z.enum(['replace', 'append']),
    priority: z.number().default(0),
    condition: conditionSchema,
    text,
  })
  .strict();
export const locationSchema = z
  .object({
    ...identity,
    category: z.string().default('Place'),
    region: z.string().default(''),
    tags: z.array(z.string()).default([]),
    position: z
      .tuple([z.number().finite(), z.number().finite(), z.number().finite()])
      .default([0, 0, 0]),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .default('#24c7c8'),
    icon: z.string().default('pin'),
    pinned: z.boolean().default(false),
    dark: z.boolean().default(false),
    darkDescription: text.default('It is too dark to see.'),
    variants: z.array(variantSchema).default([]),
  })
  .strict();
export type Location = z.infer<typeof locationSchema>;
export const capabilities = [
  'portable',
  'container',
  'supporter',
  'openable',
  'lockable',
  'wearable',
  'readable',
  'light',
  'scenery',
  'door',
  'switchable',
  'edible',
  'drinkable',
  'enterable',
] as const;
export const objectSchema = z
  .object({
    ...identity,
    template: z.string().default(''),
    placement: placementSchema,
    capabilities: z.array(z.enum(capabilities)).default([]),
    open: z.boolean().default(false),
    locked: z.boolean().default(false),
    active: z.boolean().default(false),
    worn: z.boolean().default(false),
    concealed: z.boolean().default(false),
    transparent: z.boolean().default(false),
    capacity: z.number().int().min(0).default(10),
    keyId: z.string().default(''),
    readText: text.default(''),
    properties: values.default({}),
    visibleWhen: conditionSchema.default(always()),
    variants: z.array(variantSchema).default([]),
  })
  .strict();
export type WorldObject = z.infer<typeof objectSchema>;
export const topicSchema = z
  .object({
    ...identity,
    known: z.boolean().default(true),
    condition: conditionSchema.default(always()),
    response: text.default(''),
    effects: z.array(effectSchema).default([]),
  })
  .strict();
export const characterSchema = z
  .object({
    ...identity,
    location: id,
    placement: placementSchema.optional(),
    pronouns: z.array(z.enum(['he', 'she', 'they'])).default(['they']),
    possessionsVisible: z.boolean().default(true),
    allowsTaking: z.boolean().default(false),
    acceptsGifts: z.boolean().default(true),
    properties: values.default({}),
    topics: z.array(topicSchema).default([]),
    greeting: text.default('Hello, traveler.'),
    fallback: text.default('They have nothing to say about that.'),
  })
  .strict();
export type Character = z.infer<typeof characterSchema>;
export const connectionSchema = z
  .object({
    ...identity,
    from: id,
    to: id,
    kind: z.string().default('passage'),
    direction: z.string().default(''),
    enabled: z.boolean().default(true),
    concealed: z.boolean().default(false),
    revealDestination: z.boolean().default(true),
    inDark: z.boolean().default(true),
    doorId: z.string().default(''),
    reverseId: z.string().default(''),
    visibleWhen: conditionSchema.default(always()),
    traverseWhen: conditionSchema.default(always()),
    departure: text.default(''),
    arrival: text.default(''),
    blocked: text.default('You cannot go that way yet.'),
    order: z.number().default(0),
  })
  .strict();
export type Connection = z.infer<typeof connectionSchema>;
export const variableSchema = z
  .object({
    id,
    name: z.string().min(1),
    type: z.enum(['boolean', 'number', 'text', 'enum', 'entity']),
    initial: scalar,
    options: z.array(z.string()).default([]),
    min: z.number().nullable().default(null),
    max: z.number().nullable().default(null),
    public: z.boolean().default(false),
    notes: text.default(''),
  })
  .strict();
export type Variable = z.infer<typeof variableSchema>;
export const parameterSchema = z
  .object({
    id,
    name: z.string(),
    kind: z.enum(['entity', 'connection', 'topic', 'text', 'number', 'boolean']),
    scope: z
      .enum(['known', 'visible', 'reachable', 'carried', 'accessible', 'none'])
      .default('known'),
    entityKind: z.enum(['any', 'object', 'character']).default('any'),
    capability: z.string().default(''),
    optional: z.boolean().default(false),
  })
  .strict();
export const actionSchema = z
  .object({
    ...identity,
    parameters: z.array(parameterSchema).default([]),
    turnCost: z.number().int().min(0).max(10).default(1),
    known: z.boolean().default(true),
    examples: z.array(z.string()).default([]),
    privateExamples: z.array(z.string()).default([]),
    forms: z
      .array(
        z
          .object({
            id,
            parts: z
              .array(
                z.union([
                  z.object({ kind: z.literal('literal'), text: z.string().min(1) }).strict(),
                  z.object({ kind: z.literal('role'), role: z.string().min(1) }).strict(),
                ]),
              )
              .min(1)
              .max(24),
          })
          .strict(),
      )
      .max(100)
      .default([]),
    refusal: text.default('That has no effect.'),
  })
  .strict();
export type ActionDefinition = z.infer<typeof actionSchema>;
export const ruleSchema = z
  .object({
    ...identity,
    phase: z.enum(['check', 'handle', 'after', 'response', 'event']).default('handle'),
    appliesWhen: conditionSchema.default(always()),
    outcome: z.enum(['success', 'refusal']).default('success'),
    responseMode: z.enum(['replace', 'append']).default('replace'),
    trigger: z.string().default('use'),
    bindings: values.default({}),
    scope: z.string().default(''),
    priority: z.number().int().default(0),
    order: z.number().int().default(0),
    enabled: z.boolean().default(true),
    once: z.boolean().default(false),
    condition: conditionSchema.default(always()),
    effects: z.array(effectSchema).max(100).default([]),
    otherwise: text.default(''),
  })
  .strict();
export type Rule = z.infer<typeof ruleSchema>;
export const templateSchema = z
  .object({
    id,
    name: z.string().min(1),
    parent: z.string().default(''),
    capabilities: z.array(z.enum(capabilities)).default([]),
    properties: z.array(variableSchema).default([]),
  })
  .strict();
export const projectSchema = z
  .object({
    format: z.literal('elsewhen-project').default('elsewhen-project'),
    schemaVersion: z.literal(2).default(2),
    id,
    title: z.string().min(1).max(300),
    author: z.string().default(''),
    version: z.string().default('1.0.0'),
    description: text.default(''),
    intro: text.default(''),
    start: id,
    failedAttemptsCostTurn: z.boolean().default(true),
    seed: z.number().int().default(4271),
    locations: z.array(locationSchema).max(10000),
    objects: z.array(objectSchema).max(50000).default([]),
    characters: z.array(characterSchema).default([]),
    connections: z.array(connectionSchema).max(30000).default([]),
    variables: z.array(variableSchema).default([]),
    actions: z.array(actionSchema).default([]),
    verbAliases: z
      .array(z.object({ actionId: id, formId: id, verb: z.string().min(1).max(200) }).strict())
      .default([]),
    rules: z.array(ruleSchema).max(10000).default([]),
    templates: z.array(templateSchema).default([]),
    propertyDefinitions: z.array(variableSchema).default([]),
    endings: z.array(z.object({ id, name: z.string().min(1) }).strict()).default([]),
    events: z.array(z.object({ id, name: z.string().min(1) }).strict()).default([]),
    migration: z
      .array(
        z
          .object({
            entityId: z.string(),
            message: z.string(),
            blocking: z.boolean(),
            legacy: z.unknown().optional(),
          })
          .strict(),
      )
      .default([]),
    notes: text.default(''),
  })
  .strict();
export type Project = z.infer<typeof projectSchema>;
export type Collection =
  | 'locations'
  | 'objects'
  | 'characters'
  | 'connections'
  | 'variables'
  | 'actions'
  | 'rules'
  | 'templates';
export const collections: Collection[] = [
  'locations',
  'objects',
  'characters',
  'connections',
  'actions',
  'rules',
  'variables',
  'templates',
];
export function blankProject(): Project {
  const start = crypto.randomUUID();
  return projectSchema.parse({
    id: crypto.randomUUID(),
    title: 'Untitled World',
    start,
    intro: 'Every story begins somewhere.',
    locations: [
      { id: start, name: 'The Beginning', description: 'A quiet place, waiting for a story.' },
    ],
  });
}
export function builtinActions(): ActionDefinition[] {
  return standardActions.map((a) =>
    actionSchema.parse({
      id: a.id,
      name: a.name,
      description: a.description,
      turnCost: a.cost,
      parameters: a.roles.map((r) => ({
        name: r.id,
        kind: 'entity',
        scope: r.id === 'target' && a.id === 'examine' ? 'known' : 'reachable',
        ...r,
      })),
      forms: a.forms.map((form, i) => ({ id: a.id + '-' + i, parts: formParts(form) })),
      examples: a.forms,
    }),
  );
}
export const actionCatalog = (p: Project) =>
  [...builtinActions(), ...p.actions].map((a) => ({
    ...a,
    forms: [
      ...a.forms,
      ...p.verbAliases
        .filter((v) => v.actionId === a.id)
        .flatMap((v) => {
          const original = a.forms.find((f) => f.id === v.formId);
          return original
            ? [
                {
                  id: 'alias-' + v.formId + '-' + v.verb,
                  parts: original.parts.map((part, i) =>
                    i === 0 ? { kind: 'literal' as const, text: v.verb } : part,
                  ),
                },
              ]
            : [];
        }),
    ],
  }));
export const canonicalActionSchema = z.object({ actionId: id, args: values }).strict();
export type CanonicalAction = z.infer<typeof canonicalActionSchema>;
export type ObjectState = Pick<
  WorldObject,
  'open' | 'locked' | 'active' | 'worn' | 'concealed' | 'properties'
>;
export type Observation = {
  id: string;
  name: string;
  aliases: string[];
  kind: 'object' | 'character' | 'location' | 'connection' | 'topic';
  description: string;
  capabilities: string[];
  nouns?: string[];
  adjectives?: string[];
  plurals?: string[];
  pronouns?: string[];
  direction?: string;
  destination?: string;
  doorId?: string;
  facts?: {
    visible: boolean;
    reachable: boolean;
    carried: boolean;
    accessible: boolean;
    directlyHeld: boolean;
    worn: boolean;
    npcOwned: boolean;
    allowsTaking: boolean;
    parent: string;
    relation: string;
  };
};
export type GameState = {
  location: string;
  previousLocation: string;
  placements: Record<string, Placement>;
  objects: Record<string, ObjectState>;
  characters: Record<string, string>;
  characterProperties: Record<string, Record<string, Scalar>>;
  playerPlacement: Placement;
  consumed: string[];
  eventSequence: number;
  variables: Record<string, Scalar>;
  connections: Record<string, { enabled: boolean; concealed: boolean }>;
  known: string[];
  forgottenTopics: string[];
  visited: string[];
  observations: Record<string, Observation>;
  fired: string[];
  events: {
    id: string;
    instanceId: string;
    sequence: number;
    due: number;
    bindings: Record<string, Scalar>;
  }[];
  turn: number;
  rng: number;
  ending: string | null;
};
export type Trace = { stage: string; message: string; passed?: boolean; ruleId?: string };
export type StateChange = { path: string; before: unknown; after: unknown };
export type ActionResult = {
  state: GameState;
  output: string[];
  trace: Trace[];
  changes: StateChange[];
  success: boolean;
  committed: boolean;
  action: CanonicalAction;
  error?: string;
};
export type TranscriptEntry = { kind: 'command' | 'narration' | 'status'; text: string };
export type MapNode = {
  id: string;
  name: string;
  category: string;
  position: [number, number, number];
  color: string;
  icon: string;
  description: string;
  unknown?: boolean;
};
export type MapEdge = {
  id: string;
  from: string;
  to: string;
  name: string;
  kind: string;
  concealed?: boolean;
  enabled?: boolean;
};
export type PlayerView = {
  occupancy?: { id: string; relation: string };
  title: string;
  location: Observation;
  turn: number;
  ending: string | null;
  entities: Observation[];
  inventory: Observation[];
  known: Observation[];
  exits: Observation[];
  topics: Observation[];
  actions: ActionDefinition[];
  nodes: MapNode[];
  edges: MapEdge[];
};
export const clone = <T>(v: T): T => structuredClone(v);
export function stableStringify(value: unknown): string {
  return JSON.stringify(
    value,
    (_key, v: unknown) =>
      v && typeof v === 'object' && !Array.isArray(v)
        ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
        : v,
    2,
  );
}
