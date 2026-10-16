import { Chips, ActionForms, TryCommand } from './VocabularyEditor';
import { useRef, useState } from 'react';
import {
  always,
  capabilities,
  topicSchema,
  variantSchema,
  variableSchema,
  type Project,
  type Collection,
  type Placement,
  type Character,
} from '../../../../packages/domain/src/index';
import { Badge, Button, Colors, Field, Icon, Select, TextField, Toggle } from './components';
import { ConditionEditor, EffectsEditor, RuleEditor, ScalarInput } from './RuleEditor';
import { locate, useEditor } from './store';
export type AddContext = { from?: string; to?: string; placement?: Placement };
export type AddEntity = (kind: Collection, context?: AddContext) => void;
const labels: Record<Collection, string> = {
  locations: 'Location',
  objects: 'Object',
  characters: 'Character',
  connections: 'Connection',
  actions: 'Action',
  rules: 'Rule',
  variables: 'Variable',
  templates: 'Reusable type',
};
const placementLabel = (p: Project, pl: Placement) =>
  pl.kind === 'player'
    ? 'Player inventory'
    : pl.kind === 'offstage'
      ? 'Offstage'
      : ([...p.locations, ...p.objects, ...p.characters, ...p.connections].find(
          (e) => e.id === pl.id,
        )?.name ?? 'Missing placement');
export function RichText({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const wrap = (mark: string) => {
    const el = ref.current;
    if (!el) return;
    const a = el.selectionStart,
      b = el.selectionEnd;
    onChange(value.slice(0, a) + mark + value.slice(a, b) + mark + value.slice(b));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(a + mark.length, b + mark.length);
    });
  };
  return (
    <Field label={label}>
      <div className="rich-text">
        <div className="format-toolbar">
          <span>Normal text</span>
          <i />
          <button
            type="button"
            title="Bold selection"
            aria-label="Bold selection"
            onClick={() => wrap('**')}
          >
            <b>B</b>
          </button>
          <button
            type="button"
            title="Italic selection"
            aria-label="Italic selection"
            onClick={() => wrap('*')}
          >
            <em>I</em>
          </button>
          <i />
          <small>Plain text · **bold** · *italic*</small>
        </div>
        <textarea
          aria-label={label}
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck
        />
      </div>
    </Field>
  );
}
export function Prose({ text }: { text: string }) {
  return (
    <div className="prose">
      {text
        .split(/(\*\*[^*]+\*\*|\*[^*]+\*)/)
        .map((s, i) =>
          s.startsWith('**') ? (
            <strong key={i}>{s.slice(2, -2)}</strong>
          ) : s.startsWith('*') ? (
            <em key={i}>{s.slice(1, -1)}</em>
          ) : (
            s
          ),
        )}
    </div>
  );
}
export function Contents({
  parent,
  onAdd,
  depth = 0,
  seen = [],
}: {
  parent: string;
  onAdd: AddEntity;
  depth?: number;
  seen?: string[];
}) {
  const p = useEditor((s) => s.project),
    open = useEditor((s) => s.open);
  if (seen.includes(parent)) return <p className="error-text">Containment cycle</p>;
  const objects = p.objects.filter((o) => o.placement.id === parent),
    characters = p.characters.filter((c) => c.location === parent);
  return (
    <div className="contents-list">
      {objects.map((o) => (
        <div key={o.id}>
          <button onClick={() => open(o.id)} style={{ paddingLeft: 12 + depth * 18 }}>
            <Icon name="objects" />
            <span>
              {o.name}
              <small>
                {o.capabilities.includes('container')
                  ? 'Container'
                  : o.capabilities.includes('portable')
                    ? 'Portable object'
                    : 'Fixed object'}
              </small>
            </span>
            <Icon name="right" size={14} />
          </button>
          {o.capabilities.some((c) => ['container', 'supporter'].includes(c)) && (
            <Contents parent={o.id} onAdd={onAdd} depth={depth + 1} seen={[...seen, parent]} />
          )}
        </div>
      ))}
      {characters.map((c) => (
        <button key={c.id} onClick={() => open(c.id)}>
          <Icon name="characters" />
          <span>
            {c.name}
            <small>Character</small>
          </span>
          <Icon name="right" size={14} />
        </button>
      ))}
      {depth === 0 && (
        <div className="contents-add">
          <Button
            variant="outline"
            icon="plus"
            onClick={() =>
              onAdd('objects', {
                placement: {
                  kind: p.characters.some((c) => c.id === parent)
                    ? 'character'
                    : p.objects.some((o) => o.id === parent)
                      ? p.objects.find((o) => o.id === parent)!.capabilities.includes('container')
                        ? 'inside'
                        : 'on'
                      : 'location',
                  id: parent,
                },
              })
            }
          >
            Object
          </Button>
          {p.locations.some((l) => l.id === parent) && (
            <Button
              variant="outline"
              icon="plus"
              onClick={() => onAdd('characters', { from: parent })}
            >
              Character
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
export function PlacementFields({
  value,
  onChange,
}: {
  value: Placement;
  onChange: (v: Placement) => void;
}) {
  const p = useEditor((s) => s.project),
    options =
      value.kind === 'location'
        ? p.locations
        : value.kind === 'character'
          ? p.characters
          : value.kind === 'connection'
            ? p.connections
            : p.objects.filter((o) =>
                o.capabilities.includes(value.kind === 'on' ? 'supporter' : 'container'),
              );
  return (
    <div className="form-grid">
      <Select
        label="Placement"
        value={value.kind}
        options={[
          { value: 'location', label: 'In a location' },
          { value: 'inside', label: 'Inside a container' },
          { value: 'on', label: 'On a supporter' },
          { value: 'character', label: 'Carried by a character' },
          { value: 'player', label: 'Player inventory' },
          { value: 'offstage', label: 'Offstage' },
          { value: 'connection', label: 'Shared door on a connection' },
        ]}
        onChange={(kind) => onChange({ kind: kind as Placement['kind'], id: '' })}
      />
      {!['player', 'offstage'].includes(value.kind) && (
        <Select
          label="Parent"
          value={value.id}
          options={[
            { value: '', label: 'Choose placement…' },
            ...options.map((e) => ({ value: e.id, label: e.name })),
          ]}
          onChange={(id) => onChange({ ...value, id })}
        />
      )}
    </div>
  );
}
function Dialogue({ character }: { character: Character }) {
  const edit = useEditor((s) => s.edit),
    [selected, setSelected] = useState(character.topics[0]?.id ?? ''),
    topic = character.topics.find((t) => t.id === selected);
  const update = (patch: Partial<Character['topics'][number]>) =>
    edit(`topic:${selected}:${Object.keys(patch)}`, (p) =>
      Object.assign(
        p.characters.find((c) => c.id === character.id)!.topics.find((t) => t.id === selected)!,
        patch,
      ),
    );
  return (
    <div className="dialogue-editor">
      <div className="topic-list">
        <h4>TOPICS</h4>
        {character.topics.map((t) => (
          <button
            key={t.id}
            className={t.id === selected ? 'selected' : ''}
            onClick={() => setSelected(t.id)}
          >
            <Icon name="dialogue" />
            {t.name}
          </button>
        ))}
        <Button
          icon="plus"
          variant="outline"
          onClick={() => {
            const topic = topicSchema.parse({ id: crypto.randomUUID(), name: 'New topic' });
            edit('Add topic', (p) =>
              p.characters.find((c) => c.id === character.id)!.topics.push(topic),
            );
            setSelected(topic.id);
          }}
        >
          Topic
        </Button>
      </div>
      <div className="topic-editor">
        {topic ? (
          <>
            <div className="form-grid">
              <TextField label="Topic" value={topic.name} onChange={(name) => update({ name })} />
              <TextField
                label="Aliases"
                value={topic.aliases.join(', ')}
                onChange={(v) =>
                  update({
                    aliases: v
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
              />
            </div>
            <Toggle
              label="Known when character is present"
              checked={topic.known}
              onChange={(known) => update({ known })}
            />
            <h4>Available when</h4>
            <ConditionEditor
              value={topic.condition}
              onChange={(condition) => update({ condition })}
            />
            <RichText
              label="Response"
              value={topic.response}
              onChange={(response) => update({ response })}
            />
            <h4>On response</h4>
            <EffectsEditor value={topic.effects} onChange={(effects) => update({ effects })} />
            <Button
              icon="trash"
              variant="ghost danger"
              onClick={() => {
                edit('Delete topic', (p) => {
                  const c = p.characters.find((c) => c.id === character.id)!;
                  c.topics = c.topics.filter((t) => t.id !== selected);
                });
                setSelected('');
              }}
            >
              Delete topic
            </Button>
          </>
        ) : (
          <div className="empty-state">
            <Icon name="dialogue" size={36} />
            <h3>A conversation starts with a topic.</h3>
            <p>Add a subject and write the character’s response.</p>
          </div>
        )}
      </div>
    </div>
  );
}
export function EntityEditor({ id, onAdd }: { id: string; onAdd: AddEntity }) {
  const p = useEditor((s) => s.project),
    edit = useEditor((s) => s.edit),
    open = useEditor((s) => s.open),
    kind = locate(p, id),
    [tab, setTab] = useState('General');
  if (!kind)
    return (
      <div className="empty-state">
        <Icon name="document" size={36} />
        <h3>This entity has been removed.</h3>
        <p>Undo the deletion to restore it.</p>
      </div>
    );
  const item = p[kind].find((e) => e.id === id)!;
  const update = (key: string, value: unknown) =>
    edit(`${id}:${key}`, (p) =>
      Object.assign(
        p[kind].find((e) => e.id === id)!,
        { [key]: value },
      ),
    );
  if (kind === 'rules') return <RuleEditor rule={p.rules.find((r) => r.id === id)!} />;
  const location = p.locations.find((e) => e.id === id),
    object = p.objects.find((e) => e.id === id),
    character = p.characters.find((e) => e.id === id),
    connection = p.connections.find((e) => e.id === id),
    variable = p.variables.find((e) => e.id === id),
    action = p.actions.find((e) => e.id === id),
    template = p.templates.find((e) => e.id === id);
  const tabs = location
    ? ['General', 'Connections', 'Contents', 'Descriptions', 'Map', 'Rules', 'Notes']
    : object
      ? ['General', 'Capabilities', 'Contents', 'Properties', 'Descriptions', 'Rules', 'Notes']
      : character
        ? ['General', 'Inventory', 'Dialogue', 'Properties', 'Rules', 'Notes']
        : connection
          ? ['General', 'Conditions', 'Notes']
          : ['General', 'Notes'];
  const aliases = 'aliases' in item ? item.aliases : [];
  const props = 'properties' in item && !Array.isArray(item.properties) ? item.properties : null;
  return (
    <div className="entity-editor">
      <div className="editor-heading">
        <span className={`entity-emblem ${kind}`}>
          <Icon name={location?.icon ?? kind} size={33} />
        </span>
        <div>
          <h1>{item.name}</h1>
          <p>
            {labels[kind]}
            {object && (
              <>
                {' '}
                <span className="dot-divider">·</span>{' '}
                {object.capabilities.includes('container')
                  ? 'Container'
                  : placementLabel(p, object.placement)}
              </>
            )}
            {character && (
              <>
                {' '}
                <span className="dot-divider">·</span>{' '}
                {p.locations.find((l) => l.id === character.location)?.name}
              </>
            )}
          </p>
        </div>
      </div>
      <nav className="editor-subtabs">
        {tabs.map((t) => (
          <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </nav>
      <div className="editor-form">
        {tab === 'General' && (
          <>
            <div className="form-grid">
              <TextField label="Name" value={item.name} onChange={(v) => update('name', v)} />
              {'aliases' in item && (
                <Chips
                  label="Aliases"
                  value={aliases}
                  onChange={(v) => update('aliases', v)}
                  hint="The display name is understood automatically. Add other player phrases here."
                />
              )}
              {location && (
                <Field label="Location type" hint="Choose an existing type or enter a new one.">
                  <input
                    list="location-types"
                    value={location.category}
                    onChange={(e) => update('category', e.target.value)}
                  />
                  <datalist id="location-types">
                    {[
                      ...new Set([
                        'Place',
                        'Room',
                        'Cavern',
                        'Dimension',
                        ...p.locations.map((l) => l.category),
                      ]),
                    ].map((v) => (
                      <option key={v} value={v} />
                    ))}
                  </datalist>
                </Field>
              )}
            </div>
            {'nouns' in item && (
              <div className="form-grid">
                <Chips
                  label="Noun phrases"
                  value={item.nouns}
                  onChange={(v) => update('nouns', v)}
                />
                <Chips
                  label="Adjectives"
                  value={item.adjectives}
                  onChange={(v) => update('adjectives', v)}
                />
                <Chips
                  label="Plural forms"
                  value={item.plurals}
                  onChange={(v) => update('plurals', v)}
                />
              </div>
            )}
            {object && (
              <PlacementFields value={object.placement} onChange={(v) => update('placement', v)} />
            )}
            {character && (
              <Select
                label="Initial location"
                value={character.location}
                options={p.locations.map((l) => ({ value: l.id, label: l.name }))}
                onChange={(v) => update('location', v)}
              />
            )}
            {'description' in item && (
              <RichText
                label={action ? 'Public semantics' : 'Description'}
                value={item.description}
                onChange={(v) => update('description', v)}
              />
            )}
            {location && (
              <>
                <div className="form-grid">
                  <Field label="Region">
                    <input
                      aria-label="Region"
                      list="world-regions"
                      value={location.region}
                      onChange={(e) => update('region', e.target.value)}
                      placeholder="Choose or create a region"
                    />
                    <datalist id="world-regions">
                      {[...new Set(p.locations.map((l) => l.region).filter(Boolean))].map(
                        (region) => (
                          <option key={region} value={region} />
                        ),
                      )}
                    </datalist>
                  </Field>
                  <TextField
                    label="Tags"
                    value={location.tags.join(', ')}
                    onChange={(v) =>
                      update(
                        'tags',
                        v
                          .split(',')
                          .map((s) => s.trim())
                          .filter(Boolean),
                      )
                    }
                  />
                </div>
                <div className="row">
                  <Toggle
                    label="Starting location"
                    checked={p.start === id}
                    onChange={(v) => {
                      if (v)
                        edit('Starting location', (p) => {
                          p.start = id;
                        });
                    }}
                  />
                  <Toggle
                    label="Dark location"
                    checked={location.dark}
                    onChange={(v) => update('dark', v)}
                  />
                </div>
                {location.dark && (
                  <TextField
                    label="Dark description"
                    multiline
                    value={location.darkDescription}
                    onChange={(v) => update('darkDescription', v)}
                  />
                )}
                <div className="map-appearance">
                  <strong>Map appearance</strong>
                  <Select
                    label="Map icon"
                    value={location.icon}
                    options={[
                      'pin',
                      'orbit',
                      'gem',
                      'door',
                      'book',
                      'telescope',
                      'waves',
                      'compass',
                    ]}
                    onChange={(v) => update('icon', v)}
                  />
                  <Field label="Map color">
                    <Colors value={location.color} onChange={(v) => update('color', v)} />
                  </Field>
                  <span style={{ color: location.color }}>
                    <Icon name={location.icon} /> {location.name}
                  </span>
                </div>
              </>
            )}
            {object && (
              <>
                <Select
                  label="Reusable type"
                  value={object.template}
                  onChange={(v) => update('template', v)}
                  options={[
                    { value: '', label: 'No template' },
                    ...p.templates.map((t) => ({ value: t.id, label: t.name })),
                  ]}
                />
                <h4>Capabilities</h4>
                <div className="capability-grid">
                  {capabilities.map((cap) => (
                    <Toggle
                      key={cap}
                      label={
                        {
                          portable: 'Can be picked up',
                          container: 'Can hold things inside',
                          supporter: 'Can hold things on top',
                          openable: 'Can be opened',
                          lockable: 'Can be locked',
                          wearable: 'Can be worn',
                          readable: 'Has writing',
                          light: 'Emits light',
                          scenery: 'Part of the scenery',
                          door: 'Connects two places',
                          switchable: 'Can be switched on/off',
                          edible: 'Can be eaten',
                          drinkable: 'Can be drunk',
                          enterable: 'Can be entered',
                        }[cap]
                      }
                      checked={object.capabilities.includes(cap)}
                      onChange={(v) =>
                        update(
                          'capabilities',
                          v
                            ? [...object.capabilities, cap]
                            : object.capabilities.filter((c) => c !== cap),
                        )
                      }
                    />
                  ))}
                </div>
                <div className="form-grid">
                  <Select
                    label="Open state"
                    value={object.open ? 'Open' : 'Closed'}
                    options={['Closed', 'Open']}
                    onChange={(v) => update('open', v === 'Open')}
                  />
                  <TextField
                    label="Capacity (direct items)"
                    type="number"
                    value={object.capacity}
                    onChange={(v) => update('capacity', Math.max(0, Number(v)))}
                  />
                </div>
              </>
            )}
            {character && (
              <>
                <Select
                  label="Character pronouns"
                  value={character.pronouns[0] ?? 'they'}
                  options={[
                    { value: 'they', label: 'They / them' },
                    { value: 'she', label: 'She / her' },
                    { value: 'he', label: 'He / him' },
                  ]}
                  onChange={(v) => update('pronouns', [v])}
                />
                <Toggle
                  label="Possessions are visible"
                  checked={character.possessionsVisible}
                  onChange={(v) => update('possessionsVisible', v)}
                />
                <Toggle
                  label="Allows player to take possessions"
                  checked={character.allowsTaking}
                  onChange={(v) => update('allowsTaking', v)}
                />
                <Toggle
                  label="Accepts gifts by default"
                  checked={character.acceptsGifts}
                  onChange={(v) => update('acceptsGifts', v)}
                />
                <RichText
                  label="Greeting"
                  value={character.greeting}
                  onChange={(v) => update('greeting', v)}
                />
                <RichText
                  label="Fallback response"
                  value={character.fallback}
                  onChange={(v) => update('fallback', v)}
                />
                <Button icon="dialogue" variant="outline" onClick={() => setTab('Dialogue')}>
                  Edit dialogue topics
                </Button>
              </>
            )}
            {connection && (
              <>
                <div className="form-grid">
                  <Select
                    label="From"
                    value={connection.from}
                    options={p.locations.map((l) => ({ value: l.id, label: l.name }))}
                    onChange={(v) => update('from', v)}
                  />
                  <Select
                    label="Destination"
                    value={connection.to}
                    options={p.locations.map((l) => ({ value: l.id, label: l.name }))}
                    onChange={(v) => update('to', v)}
                  />
                  <TextField
                    label="Transition type"
                    value={connection.kind}
                    onChange={(v) => update('kind', v)}
                  />
                  <Select
                    options={[
                      '',
                      'north',
                      'northeast',
                      'east',
                      'southeast',
                      'south',
                      'southwest',
                      'west',
                      'northwest',
                      'up',
                      'down',
                      'in',
                      'out',
                    ]}
                    label="Travel direction (optional)"
                    value={connection.direction}
                    onChange={(v) => update('direction', v)}
                  />
                  <Select
                    label="Shared door"
                    value={connection.doorId}
                    options={[
                      { value: '', label: 'No door' },
                      ...p.objects
                        .filter((o) => o.capabilities.includes('door'))
                        .map((o) => ({ value: o.id, label: o.name })),
                    ]}
                    onChange={(v) => update('doorId', v)}
                  />
                  <Select
                    label="Paired reverse connection"
                    value={connection.reverseId}
                    options={[
                      { value: '', label: 'One-way' },
                      ...p.connections
                        .filter(
                          (c) =>
                            c.id !== id && c.from === connection.to && c.to === connection.from,
                        )
                        .map((c) => ({ value: c.id, label: c.name })),
                    ]}
                    onChange={(v) =>
                      edit('Pair connections', (p) => {
                        const current = p.connections.find((c) => c.id === id)!;
                        if (current.reverseId) {
                          const old = p.connections.find((c) => c.id === current.reverseId);
                          if (old) old.reverseId = '';
                        }
                        current.reverseId = v;
                        const reverse = p.connections.find((c) => c.id === v);
                        if (reverse) reverse.reverseId = id;
                      })
                    }
                  />
                </div>
                <div className="capability-grid">
                  <Toggle
                    label="Enabled at start"
                    checked={connection.enabled}
                    onChange={(v) => update('enabled', v)}
                  />
                  <Toggle
                    label="Hidden at start"
                    checked={connection.concealed}
                    onChange={(v) => update('concealed', v)}
                  />
                  <Toggle
                    label="Reveal destination name"
                    checked={connection.revealDestination}
                    onChange={(v) => update('revealDestination', v)}
                  />
                  <Toggle
                    label="Navigable in darkness"
                    checked={connection.inDark}
                    onChange={(v) => update('inDark', v)}
                  />
                </div>
                <TextField
                  label="Departure text"
                  multiline
                  value={connection.departure}
                  onChange={(v) => update('departure', v)}
                />
                <TextField
                  label="Arrival text"
                  multiline
                  value={connection.arrival}
                  onChange={(v) => update('arrival', v)}
                />
                <TextField
                  label="Blocked response"
                  value={connection.blocked}
                  onChange={(v) => update('blocked', v)}
                />
              </>
            )}
            {variable && (
              <>
                <Select
                  label="Value type"
                  value={variable.type}
                  options={['boolean', 'number', 'text', 'enum', 'entity']}
                  onChange={(type) => {
                    update('type', type);
                    update(
                      'initial',
                      type === 'boolean'
                        ? false
                        : type === 'number'
                          ? 0
                          : type === 'entity'
                            ? null
                            : '',
                    );
                  }}
                />
                {variable.type === 'enum' && (
                  <TextField
                    label="Allowed values (comma separated)"
                    value={variable.options.join(', ')}
                    onChange={(v) =>
                      update(
                        'options',
                        v.split(',').map((s) => s.trim()),
                      )
                    }
                  />
                )}
                {variable.type === 'enum' ? (
                  <Select
                    label="Initial value"
                    value={String(variable.initial)}
                    options={variable.options}
                    onChange={(v) => update('initial', v)}
                  />
                ) : variable.type === 'entity' ? (
                  <Select
                    label="Initial reference"
                    value={String(variable.initial ?? '')}
                    options={[
                      { value: '', label: 'None' },
                      ...[...p.objects, ...p.characters, ...p.locations].map((e) => ({
                        value: e.id,
                        label: e.name,
                      })),
                    ]}
                    onChange={(v) => update('initial', v || null)}
                  />
                ) : (
                  <ScalarInput
                    label="Initial value"
                    type={variable.type}
                    definition={variable}
                    value={variable.initial}
                    onChange={(v) => update('initial', v)}
                  />
                )}
                <Toggle
                  label="Public metadata"
                  checked={variable.public}
                  onChange={(v) => update('public', v)}
                />
                {variable.type === 'number' && (
                  <div className="form-grid">
                    <TextField
                      label="Minimum (blank for none)"
                      type="number"
                      value={variable.min ?? ''}
                      onChange={(v) => update('min', v === '' ? null : Number(v))}
                    />
                    <TextField
                      label="Maximum (blank for none)"
                      type="number"
                      value={variable.max ?? ''}
                      onChange={(v) => update('max', v === '' ? null : Number(v))}
                    />
                  </div>
                )}
              </>
            )}
            {action && (
              <>
                <div className="form-grid">
                  <TextField
                    label="Turn cost"
                    type="number"
                    value={action.turnCost}
                    onChange={(v) => update('turnCost', Math.max(0, Number(v)))}
                  />
                  <Toggle
                    label="Known at start"
                    checked={action.known}
                    onChange={(v) => update('known', v)}
                  />
                </div>
                <ActionForms action={action} />
                <TryCommand project={p} />
                <TextField
                  label="Default refusal"
                  value={action.refusal}
                  onChange={(v) => update('refusal', v)}
                />
                <TextField
                  label="Public help examples (one per line)"
                  multiline
                  value={action.examples.join('\n')}
                  onChange={(v) => update('examples', v.split('\n'))}
                />
              </>
            )}
            {template && (
              <>
                <Select
                  label="Parent type"
                  value={template.parent}
                  options={[
                    { value: '', label: 'No parent' },
                    ...p.templates
                      .filter((t) => t.id !== id)
                      .map((t) => ({ value: t.id, label: t.name })),
                  ]}
                  onChange={(v) => update('parent', v)}
                />
                <h4>Inherited capabilities</h4>
                <div className="capability-grid">
                  {capabilities.map((cap) => (
                    <Toggle
                      key={cap}
                      label={
                        {
                          portable: 'Can be picked up',
                          container: 'Can hold things inside',
                          supporter: 'Can hold things on top',
                          openable: 'Can be opened',
                          lockable: 'Can be locked',
                          wearable: 'Can be worn',
                          readable: 'Has writing',
                          light: 'Emits light',
                          scenery: 'Part of the scenery',
                          door: 'Connects two places',
                          switchable: 'Can be switched on/off',
                          edible: 'Can be eaten',
                          drinkable: 'Can be drunk',
                          enterable: 'Can be entered',
                        }[cap]
                      }
                      checked={template.capabilities.includes(cap)}
                      onChange={(v) =>
                        update(
                          'capabilities',
                          v
                            ? [...template.capabilities, cap]
                            : template.capabilities.filter((c) => c !== cap),
                        )
                      }
                    />
                  ))}
                </div>
                <h4>Typed properties</h4>
                {template.properties.map((prop, i) => (
                  <div className="parameter-row" key={prop.id}>
                    <TextField
                      label="Name"
                      value={prop.name}
                      onChange={(name) =>
                        update(
                          'properties',
                          template.properties.map((x, j) => (i === j ? { ...x, name } : x)),
                        )
                      }
                    />
                    <Select
                      label="Type"
                      value={prop.type}
                      options={['text', 'number', 'boolean']}
                      onChange={(type) =>
                        update(
                          'properties',
                          template.properties.map((x, j) =>
                            i === j
                              ? {
                                  ...x,
                                  type,
                                  initial: type === 'boolean' ? false : type === 'number' ? 0 : '',
                                }
                              : x,
                          ),
                        )
                      }
                    />
                    <ScalarInput
                      label="Default"
                      value={prop.initial}
                      definition={prop}
                      onChange={(initial) =>
                        update(
                          'properties',
                          template.properties.map((x, j) => (i === j ? { ...x, initial } : x)),
                        )
                      }
                    />
                  </div>
                ))}
                <Button
                  icon="plus"
                  variant="outline"
                  onClick={() =>
                    update('properties', [
                      ...template.properties,
                      variableSchema.parse({
                        id: crypto.randomUUID(),
                        name: 'Property',
                        type: 'text',
                        initial: '',
                      }),
                    ])
                  }
                >
                  Property
                </Button>
              </>
            )}
          </>
        )}
        {tab === 'Capabilities' && object && (
          <>
            <div className="capability-grid">
              {capabilities.map((cap) => (
                <Toggle
                  key={cap}
                  label={
                    {
                      portable: 'Can be picked up',
                      container: 'Can hold things inside',
                      supporter: 'Can hold things on top',
                      openable: 'Can be opened',
                      lockable: 'Can be locked',
                      wearable: 'Can be worn',
                      readable: 'Has writing',
                      light: 'Emits light',
                      scenery: 'Part of the scenery',
                      door: 'Connects two places',
                      switchable: 'Can be switched on/off',
                      edible: 'Can be eaten',
                      drinkable: 'Can be drunk',
                      enterable: 'Can be entered',
                    }[cap]
                  }
                  checked={object.capabilities.includes(cap)}
                  onChange={(v) =>
                    update(
                      'capabilities',
                      v
                        ? [...object.capabilities, cap]
                        : object.capabilities.filter((c) => c !== cap),
                    )
                  }
                />
              ))}
            </div>
            <h4>Initial state</h4>
            <div className="capability-grid">
              {(['open', 'locked', 'active', 'worn', 'concealed', 'transparent'] as const)
                .filter(
                  (key) =>
                    key === 'concealed' ||
                    object.capabilities.includes(
                      {
                        open: 'openable',
                        locked: 'lockable',
                        active: 'switchable',
                        worn: 'wearable',
                        transparent: 'container',
                      }[key] as (typeof capabilities)[number],
                    ) ||
                    (key === 'active' && object.capabilities.includes('light')),
                )
                .map((key) => (
                  <Toggle
                    key={key}
                    label={key[0].toUpperCase() + key.slice(1)}
                    checked={object[key]}
                    onChange={(v) => update(key, v)}
                  />
                ))}
            </div>
            {object.capabilities.includes('lockable') && (
              <Select
                label="Key for lock"
                value={object.keyId}
                options={[
                  { value: '', label: 'No key' },
                  ...p.objects
                    .filter((o) => o.id !== id)
                    .map((o) => ({ value: o.id, label: o.name })),
                ]}
                onChange={(v) => update('keyId', v)}
              />
            )}
            {object.capabilities.includes('readable') && (
              <RichText
                label="Readable text"
                value={object.readText}
                onChange={(v) => update('readText', v)}
              />
            )}
            <h4>Visibility condition</h4>
            <ConditionEditor
              value={object.visibleWhen}
              onChange={(v) => update('visibleWhen', v)}
            />
          </>
        )}
        {tab === 'Connections' && location && (
          <>
            <div className="connection-cards">
              {p.connections
                .filter((c) => c.from === id)
                .map((c) => (
                  <button key={c.id} onClick={() => open(c.id)}>
                    <Icon name="connections" />
                    <span>
                      <strong>{c.name}</strong>
                      <small>
                        {p.locations.find((l) => l.id === c.to)?.name ?? 'Missing destination'} ·{' '}
                        {c.kind}
                      </small>
                    </span>
                    {c.concealed && <Badge tone="purple">Hidden</Badge>}
                    <Icon name="right" />
                  </button>
                ))}
            </div>
            <Button
              variant="outline"
              icon="plus"
              onClick={() => onAdd('connections', { from: id })}
            >
              Add connection
            </Button>
          </>
        )}
        {(tab === 'Contents' || tab === 'Inventory') && <Contents parent={id} onAdd={onAdd} />}
        {tab === 'Dialogue' && character && <Dialogue character={character} />}
        {tab === 'Properties' && props && (
          <>
            <h4>Instance property overrides</h4>
            {Object.entries(props).map(([key, value]) => (
              <ScalarInput
                key={key}
                definition={[
                  ...p.propertyDefinitions,
                  ...p.templates.flatMap((t) => t.properties),
                ].find((v) => v.id === key)}
                label={
                  [...p.propertyDefinitions, ...p.templates.flatMap((t) => t.properties)].find(
                    (v) => v.id === key,
                  )?.name ?? key
                }
                value={value}
                onChange={(v) => update('properties', { ...props, [key]: v })}
              />
            ))}
            <Select
              label="Add property override"
              value=""
              options={[
                { value: '', label: 'Choose a declared property…' },
                ...[...p.propertyDefinitions, ...p.templates.flatMap((t) => t.properties)]
                  .filter((v) => !(v.id in props))
                  .map((v) => ({ value: v.id, label: v.name })),
              ]}
              onChange={(id) => {
                const def = [
                  ...p.propertyDefinitions,
                  ...p.templates.flatMap((t) => t.properties),
                ].find((v) => v.id === id);
                if (def) update('properties', { ...props, [id]: def.initial });
              }}
            />
            {object?.template && (
              <p className="hint">
                Unspecified properties inherit from the reusable type. Capabilities are combined
                with template defaults.
              </p>
            )}
          </>
        )}
        {tab === 'Descriptions' && (object || location) && (
          <>
            <RichText
              label="Base description"
              value={(object ?? location)!.description}
              onChange={(v) => update('description', v)}
            />
            {(object ?? location)!.variants.map((v, i) => (
              <div className="description-variant" key={v.id}>
                <div className="form-grid">
                  <Select
                    label="Mode"
                    value={v.mode}
                    options={['replace', 'append']}
                    onChange={(mode) =>
                      update(
                        'variants',
                        (object ?? location)!.variants.map((v, j) =>
                          j === i ? { ...v, mode } : v,
                        ),
                      )
                    }
                  />
                  <TextField
                    label="Priority"
                    type="number"
                    value={v.priority}
                    onChange={(priority) =>
                      update(
                        'variants',
                        (object ?? location)!.variants.map((v, j) =>
                          j === i ? { ...v, priority: Number(priority) } : v,
                        ),
                      )
                    }
                  />
                </div>
                <ConditionEditor
                  value={v.condition}
                  onChange={(condition) =>
                    update(
                      'variants',
                      (object ?? location)!.variants.map((v, j) =>
                        j === i ? { ...v, condition } : v,
                      ),
                    )
                  }
                />
                <RichText
                  label="Conditional text"
                  value={v.text}
                  onChange={(text) =>
                    update(
                      'variants',
                      (object ?? location)!.variants.map((v, j) => (j === i ? { ...v, text } : v)),
                    )
                  }
                />
                <Button
                  icon="trash"
                  title="Delete description variant"
                  onClick={() =>
                    update(
                      'variants',
                      (object ?? location)!.variants.filter((_, j) => j !== i),
                    )
                  }
                />
              </div>
            ))}
            <Button
              icon="plus"
              variant="outline"
              onClick={() =>
                update('variants', [
                  ...(object ?? location)!.variants,
                  variantSchema.parse({
                    id: crypto.randomUUID(),
                    mode: 'append',
                    condition: always(),
                    text: '',
                  }),
                ])
              }
            >
              Conditional description
            </Button>
          </>
        )}
        {tab === 'Map' && location && (
          <>
            <div className="form-grid three">
              {location.position.map((v, i) => (
                <TextField
                  key={i}
                  label={`${['X', 'Y', 'Z'][i]} position`}
                  type="number"
                  value={v}
                  onChange={(value) =>
                    update(
                      'position',
                      location.position.map((v, j) => (j === i ? Number(value) : v)),
                    )
                  }
                />
              ))}
            </div>
            <Toggle
              label="Pin in automatic layout"
              checked={location.pinned}
              onChange={(v) => update('pinned', v)}
            />
            <Colors value={location.color} onChange={(v) => update('color', v)} />
            <p className="hint">
              Coordinates organize the graph. Travel is determined by authored connections.
            </p>
          </>
        )}
        {tab === 'Conditions' && connection && (
          <>
            <h4>Visible when</h4>
            <ConditionEditor
              value={connection.visibleWhen}
              onChange={(v) => update('visibleWhen', v)}
            />
            <h4>Traversable when</h4>
            <ConditionEditor
              value={connection.traverseWhen}
              onChange={(v) => update('traverseWhen', v)}
            />
          </>
        )}
        {tab === 'Rules' && (
          <>
            <div className="connection-cards">
              {p.rules
                .filter((r) => r.scope === id || JSON.stringify(r.bindings).includes(id))
                .map((r) => (
                  <button key={r.id} onClick={() => open(r.id)}>
                    <Icon name="rules" />
                    <span>
                      <strong>{r.name}</strong>
                      <small>
                        {r.phase} · {r.trigger}
                      </small>
                    </span>
                    <Icon name="right" />
                  </button>
                ))}
            </div>
            <Button icon="plus" variant="outline" onClick={() => onAdd('rules', { from: id })}>
              Rule
            </Button>
          </>
        )}
        {tab === 'Notes' && (
          <TextField
            label="Private author notes"
            multiline
            value={'notes' in item ? item.notes : ''}
            onChange={(v) => update('notes', v)}
            hint="Author notes are removed from exported games and never sent to the language parser."
          />
        )}
      </div>
      {'description' in item && tab === 'General' && (
        <div className="description-preview">
          <header>
            <Icon name="eye" />
            <strong>Description preview</strong>
            <Badge>Base description</Badge>
          </header>
          <div>
            <h2>{item.name}</h2>
            <Prose text={item.description || 'Your description will appear here.'} />
          </div>
        </div>
      )}
    </div>
  );
}
