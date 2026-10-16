import { useState } from 'react';
import {
  actionCatalog,
  capabilities,
  builtinActions,
  parameterSchema,
  ruleSchema,
  variableSchema,
  type ActionDefinition,
  type Project,
} from '../../../../packages/domain/src/index';
import { ScalarInput } from './RuleEditor';
import { resolveTemplates, validateProject } from '../../../../packages/compiler/src/validation';
import { startGame, projectPlayer } from '../../../../packages/engine/src/index';
import { buildContext, interpret, clarificationText } from '../../../../packages/parser/src/index';
import { Button, Field, Select, TextField } from './components';
import { useEditor } from './store';
export function Chips({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
  hint?: string;
}) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const next = draft.trim();
    if (next && !value.includes(next)) onChange([...value, next]);
    setDraft('');
  };
  return (
    <Field label={label} hint={hint}>
      <div className="word-chips">
        {value.map((word) => (
          <span className="word-chip" key={word}>
            {word}
            <button
              type="button"
              aria-label={'Remove ' + word}
              onClick={() => onChange(value.filter((v) => v !== word))}
            >
              ×
            </button>
          </span>
        ))}
        <input
          aria-label={'Add ' + label.toLowerCase()}
          value={draft}
          placeholder="Add a word or phrase…"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          onBlur={add}
        />
      </div>
    </Field>
  );
}
const shapes = [
  { name: 'No target', roles: [], parts: [] },
  { name: 'One target', roles: ['target'], parts: ['target'] },
  {
    name: 'Target with tool',
    roles: ['target', 'instrument'],
    parts: ['target', 'with', 'instrument'],
  },
  {
    name: 'Item inside destination',
    roles: ['item', 'destination'],
    parts: ['item', 'in', 'destination'],
  },
  {
    name: 'Item on destination',
    roles: ['item', 'destination'],
    parts: ['item', 'on', 'destination'],
  },
  { name: 'Item to recipient', roles: ['item', 'recipient'], parts: ['item', 'to', 'recipient'] },
  {
    name: 'Recipient about text',
    roles: ['recipient', 'text'],
    parts: ['recipient', 'about', 'text'],
  },
  {
    name: 'Quoted speech to recipient',
    roles: ['text', 'recipient'],
    parts: ['text', 'to', 'recipient'],
  },
  { name: 'Number', roles: ['number'], parts: ['number'] },
];
export function ActionForms({ action }: { action: ActionDefinition }) {
  const edit = useEditor((s) => s.edit),
    open = useEditor((s) => s.open),
    [shape, setShape] = useState(1),
    [verb, setVerb] = useState(action.name.toLowerCase());
  const update = (fn: (a: ActionDefinition) => void) =>
    edit('Action grammar', (p) => fn(p.actions.find((a) => a.id === action.id)!));
  const addForm = () => {
    const selected = shapes[shape];
    if (!verb.trim()) return;
    update((a) => {
      for (const role of selected.roles)
        if (!a.parameters.some((p) => p.id === role))
          a.parameters.push(
            parameterSchema.parse({
              id: role,
              name: role === 'instrument' ? 'Tool' : role[0].toUpperCase() + role.slice(1),
              kind: role === 'text' ? 'text' : role === 'number' ? 'number' : 'entity',
              scope: ['text', 'number'].includes(role) ? 'none' : 'reachable',
            }),
          );
      a.forms.push({
        id: crypto.randomUUID(),
        parts: [
          { kind: 'literal', text: verb.trim() },
          ...selected.parts.map((part) =>
            selected.roles.includes(part)
              ? { kind: 'role' as const, role: part }
              : { kind: 'literal' as const, text: part },
          ),
        ],
      });
    });
  };
  return (
    <section className="action-forms">
      <h3>Command forms</h3>
      <p className="hint">
        Choose how the player supplies the target and any additional information. Literal words and
        role chips form the sentence.
      </p>
      <div className="form-grid">
        <TextField label="Verb phrase" value={verb} onChange={setVerb} placeholder="ring" />
        <Select
          label="Command shape"
          value={String(shape)}
          options={shapes.map((s, i) => ({ value: String(i), label: s.name }))}
          onChange={(v) => setShape(Number(v))}
        />
      </div>
      <Button icon="plus" variant="outline" onClick={addForm}>
        Add command form
      </Button>
      {action.forms.map((form, i) => (
        <div className="form-production" key={form.id}>
          {form.parts.map((part, j) =>
            part.kind === 'literal' ? (
              <input
                key={j}
                aria-label="Literal phrase"
                value={part.text}
                onChange={(e) =>
                  update((a) => {
                    a.forms[i].parts[j] = { kind: 'literal', text: e.target.value };
                  })
                }
              />
            ) : (
              <span className="role-chip" key={j}>
                {action.parameters.find((p) => p.id === part.role)?.name ?? part.role}
              </span>
            ),
          )}
          <Button
            icon="trash"
            title="Remove command form"
            onClick={() =>
              update((a) => {
                a.forms.splice(i, 1);
              })
            }
          />
        </div>
      ))}
      <h4>Roles</h4>
      {action.parameters.map((param, i) => (
        <div className="form-grid" key={param.id}>
          <TextField
            label="Role label"
            value={param.name}
            onChange={(name) =>
              update((a) => {
                a.parameters[i].name = name;
              })
            }
          />
          <Select
            label="Role type"
            value={param.kind}
            options={['entity', 'connection', 'topic', 'text', 'number', 'boolean']}
            onChange={(kind) =>
              update((a) => {
                a.parameters[i].kind = kind as typeof param.kind;
              })
            }
          />
          <Select
            label="Required access"
            value={param.scope}
            options={[
              { value: 'known', label: 'Known to player' },
              { value: 'visible', label: 'Visible now' },
              { value: 'reachable', label: 'Within reach' },
              { value: 'accessible', label: 'Carried and reachable' },
              { value: 'none', label: 'No physical requirement' },
            ]}
            onChange={(scope) =>
              update((a) => {
                a.parameters[i].scope = scope as typeof param.scope;
              })
            }
          />
          {param.kind === 'entity' && (
            <>
              <Select
                label="Entity kind"
                value={param.entityKind}
                options={[
                  { value: 'any', label: 'Any entity' },
                  { value: 'object', label: 'Object' },
                  { value: 'character', label: 'Character' },
                ]}
                onChange={(value) =>
                  update((a) => {
                    a.parameters[i].entityKind = value as typeof param.entityKind;
                  })
                }
              />
              <Select
                label="Required capability"
                value={param.capability}
                options={[
                  { value: '', label: 'Any capability' },
                  ...capabilities.map((value) => ({ value, label: value })),
                ]}
                onChange={(value) =>
                  update((a) => {
                    a.parameters[i].capability = value;
                  })
                }
              />
            </>
          )}
        </div>
      ))}
      <h4>Behavior</h4>
      <div className="row">
        {(['check', 'handle', 'after', 'response'] as const).map((phase) => (
          <Button
            key={phase}
            onClick={() => {
              const rule = ruleSchema.parse({
                id: crypto.randomUUID(),
                name:
                  action.name +
                  ' ' +
                  {
                    check: 'requirement',
                    handle: 'consequences',
                    after: 'after action',
                    response: 'response',
                  }[phase],
                phase,
                trigger: action.id,
              });
              edit('Add action rule', (p) => p.rules.push(rule));
              open(rule.id);
            }}
          >
            Add{' '}
            {
              {
                check: 'requirement',
                handle: 'consequences',
                after: 'after rule',
                response: 'response',
              }[phase]
            }
          </Button>
        ))}
      </div>
    </section>
  );
}
export function TryCommand({ project }: { project: Project }) {
  const [input, setInput] = useState(''),
    [result, setResult] = useState('');
  return (
    <section>
      <h3>Try a command</h3>
      <p className="hint">
        Interpret against the starting scene. This preview never changes the world or consumes a
        turn.
      </p>
      <div className="row">
        <input
          aria-label="Try command"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="ring bell"
        />
        <Button
          onClick={() => {
            try {
              const p = resolveTemplates(project),
                r = interpret(input, buildContext(projectPlayer(p, startGame(p).state)));
              setResult(
                r.kind === 'resolved'
                  ? r.actions
                      .map(
                        (a) =>
                          (actionCatalog(p).find((x) => x.id === a.actionId)?.name ?? a.actionId) +
                          ': ' +
                          Object.entries(a.args)
                            .map(
                              ([role, id]) =>
                                role +
                                ' = ' +
                                ([
                                  ...p.locations,
                                  ...p.objects,
                                  ...p.characters,
                                  ...p.connections,
                                  ...p.characters.flatMap((c) => c.topics),
                                ].find((x) => x.id === id)?.name ?? String(id)),
                            )
                            .join(', '),
                      )
                      .join('\n')
                  : r.kind === 'diagnostic'
                    ? r.message
                    : clarificationText(r),
              );
            } catch (e) {
              setResult((e as Error).message);
            }
          }}
        >
          Interpret
        </Button>
      </div>
      <p className="try-result" role="status">
        {result}
      </p>
    </section>
  );
}
export function VocabularyEditor({ onOpen }: { onOpen?: (id: string) => void }) {
  const p = useEditor((s) => s.project),
    edit = useEditor((s) => s.edit),
    [actionId, setActionId] = useState('take'),
    [formId, setFormId] = useState('take-0'),
    [verb, setVerb] = useState('');
  const action = builtinActions().find((a) => a.id === actionId)!;
  return (
    <div className="modal-body vocabulary-editor">
      <h3>Standard actions</h3>
      <Select
        label="Action"
        value={actionId}
        options={builtinActions().map((a) => ({ value: a.id, label: a.name }))}
        onChange={(id) => {
          setActionId(id);
          setFormId(builtinActions().find((a) => a.id === id)?.forms[0]?.id ?? '');
        }}
      />
      <p>{action.description}</p>
      <p className="hint">
        Turn cost: {action.turnCost}. Help sentences are examples; only listed command forms and
        configured synonyms are grammar.
      </p>
      <ul>
        {action.forms.map((f) => (
          <li key={f.id}>
            {f.parts.map((p) => (p.kind === 'literal' ? p.text : '‹' + p.role + '›')).join(' ')}
          </li>
        ))}
      </ul>
      <h3>Add a verb synonym</h3>
      <Select
        label="Map synonym to form"
        value={formId}
        options={action.forms.map((f) => ({
          value: f.id,
          label: f.parts.map((p) => (p.kind === 'literal' ? p.text : p.role)).join(' '),
        }))}
        onChange={setFormId}
      />
      <TextField label="New verb phrase" value={verb} onChange={setVerb} />
      <Button
        disabled={!verb.trim() || !formId}
        onClick={() => {
          edit('Verb synonym', (p) => p.verbAliases.push({ actionId, formId, verb: verb.trim() }));
          setVerb('');
        }}
      >
        Add synonym
      </Button>
      {p.verbAliases.map((v, i) => (
        <div className="row" key={i}>
          <span>
            {v.verb} → {builtinActions().find((a) => a.id === v.actionId)?.name}
          </span>
          <Button
            icon="trash"
            title="Remove synonym"
            onClick={() =>
              edit('Remove synonym', (p) => {
                p.verbAliases.splice(i, 1);
              })
            }
          />
        </div>
      ))}
      <TryCommand project={p} />
      <NounVocabulary onOpen={onOpen} />
      {validateProject(p)
        .filter((issue) =>
          ['GRAMMAR_CONFLICT', 'RESERVED_COMMAND', 'GRAMMAR_ROLE'].includes(issue.code),
        )
        .map((issue, i) => (
          <p role="status" key={i}>
            {issue.message} Change the phrase or narrow its roles.
          </p>
        ))}
      <AuthoringRegistry />
      {p.migration.length > 0 && (
        <section>
          <h3>Migration review</h3>
          {p.migration.map((m, i) => (
            <div key={i} className="migration-item">
              <p>{m.message}</p>
              {m.entityId && onOpen && (
                <Button onClick={() => onOpen(m.entityId)}>Open affected entity</Button>
              )}
              {m.blocking && (
                <Button
                  onClick={() =>
                    edit('Resolve migration item', (p) => {
                      p.migration[i].blocking = false;
                    })
                  }
                >
                  Mark reviewed after fixing
                </Button>
              )}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
function NounVocabulary({ onOpen }: { onOpen?: (id: string) => void }) {
  const p = useEditor((s) => s.project),
    [filter, setFilter] = useState(''),
    [limit, setLimit] = useState(100);
  const entities = [
    ...p.locations,
    ...p.objects,
    ...p.characters,
    ...p.connections,
    ...p.characters.flatMap((c) => c.topics),
  ];
  const words = new Map<string, string[]>();
  for (const entity of entities)
    for (const word of new Set(
      [entity.name, ...entity.aliases, ...entity.nouns, ...entity.plurals]
        .map((w) => w.toLowerCase().trim())
        .filter(Boolean),
    ))
      words.set(word, [...(words.get(word) ?? []), entity.id]);
  const visible = entities.filter((entity) =>
    [entity.name, ...entity.aliases, ...entity.nouns, ...entity.adjectives, ...entity.plurals].some(
      (w) => w.toLowerCase().includes(filter.toLowerCase()),
    ),
  );
  return (
    <section>
      <h3>Project noun vocabulary</h3>
      <TextField
        label="Find vocabulary"
        value={filter}
        onChange={(v) => {
          setFilter(v);
          setLimit(100);
        }}
      />
      {visible.slice(0, limit).map((entity) => (
        <div key={entity.id} className="migration-item">
          <strong>{entity.name}</strong>
          <p>
            {[...entity.aliases, ...entity.nouns, ...entity.adjectives, ...entity.plurals].join(
              ' · ',
            ) || 'Name only'}
          </p>
          {[entity.name, ...entity.aliases, ...entity.nouns, ...entity.plurals].some(
            (word) => (words.get(word.toLowerCase().trim())?.length ?? 0) > 1,
          ) && (
            <p className="hint">
              Shares vocabulary with another entity. Add distinguishing words; equal matches ask the
              player to choose.
            </p>
          )}
          {onOpen && <Button onClick={() => onOpen(entity.id)}>Edit vocabulary</Button>}
        </div>
      ))}
      {visible.length > limit && (
        <Button onClick={() => setLimit(limit + 100)}>Show more vocabulary</Button>
      )}
    </section>
  );
}
function AuthoringRegistry() {
  const p = useEditor((s) => s.project),
    edit = useEditor((s) => s.edit),
    [name, setName] = useState(''),
    [kind, setKind] = useState('events');
  return (
    <section>
      <h3>Named events, endings & properties</h3>
      <p className="hint">
        Create a name here, then select it in your rules. Internal identifiers are generated
        automatically.
      </p>
      <div className="form-grid">
        <TextField label="New definition name" value={name} onChange={setName} />
        <Select
          label="Definition kind"
          value={kind}
          options={[
            { value: 'events', label: 'World event' },
            { value: 'endings', label: 'Story ending' },
            { value: 'propertyDefinitions', label: 'Entity property' },
          ]}
          onChange={setKind}
        />
      </div>
      <Button
        disabled={!name.trim()}
        onClick={() => {
          edit('Create named definition', (p) => {
            const identity = { id: crypto.randomUUID(), name: name.trim() };
            if (kind === 'propertyDefinitions')
              p.propertyDefinitions.push(
                variableSchema.parse({ ...identity, type: 'boolean', initial: false }),
              );
            else p[kind as 'events' | 'endings'].push(identity);
          });
          setName('');
        }}
      >
        Create definition
      </Button>
      {[
        ...p.events.map((e) => ({ ...e, label: 'Event' })),
        ...p.endings.map((e) => ({ ...e, label: 'Ending' })),
      ].map((e) => (
        <p key={e.id}>
          {e.label} · {e.name}
        </p>
      ))}
      {p.propertyDefinitions.map((v, i) => (
        <div className="form-grid" key={v.id}>
          <TextField
            label="Property name"
            value={v.name}
            onChange={(name) =>
              edit('Property name', (p) => {
                p.propertyDefinitions[i].name = name;
              })
            }
          />
          <Select
            label="Value type"
            value={v.type}
            options={['boolean', 'number', 'text', 'enum', 'entity']}
            onChange={(type) =>
              edit('Property type', (p) => {
                p.propertyDefinitions[i] = {
                  ...v,
                  type: type as typeof v.type,
                  initial:
                    type === 'boolean'
                      ? false
                      : type === 'number'
                        ? 0
                        : type === 'entity'
                          ? null
                          : '',
                };
              })
            }
          />
          {v.type === 'enum' && (
            <Chips
              label="Allowed values"
              value={v.options}
              onChange={(options) =>
                edit('Property options', (p) => {
                  p.propertyDefinitions[i].options = options;
                  p.propertyDefinitions[i].initial = options[0] ?? '';
                })
              }
            />
          )}
          <ScalarInput
            label="Default value"
            value={v.initial}
            definition={v}
            onChange={(initial) =>
              edit('Property default', (p) => {
                p.propertyDefinitions[i].initial = initial;
              })
            }
          />
        </div>
      ))}
    </section>
  );
}
