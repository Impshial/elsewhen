import {
  actionCatalog,
  always,
  effect,
  type Condition,
  type Effect,
  type Project,
  type Rule,
  type Scalar,
  type Variable,
} from '../../../../packages/domain/src/index';
import { Button, Icon, Select, TextField, Toggle } from './components';
import { useEditor } from './store';
const entityOptions = (p: Project) => [
  { value: '', label: 'Choose an entity…' },
  ...p.locations.map((e) => ({ value: e.id, label: `${e.name} · Location` })),
  ...p.objects.map((e) => ({ value: e.id, label: `${e.name} · Object` })),
  ...p.characters.map((e) => ({ value: e.id, label: `${e.name} · Character` })),
  ...p.connections.map((e) => ({ value: e.id, label: `${e.name} · Connection` })),
  ...p.characters.flatMap((c) =>
    c.topics.map((t) => ({ value: t.id, label: `${t.name} · Topic` })),
  ),
  ...p.actions.map((a) => ({ value: a.id, label: `${a.name} · Action` })),
  { value: '$target', label: 'Action target' },
  ...['item', 'instrument', 'destination', 'source', 'recipient', 'actor', 'from', 'to'].map(
    (role) => ({ value: '$' + role, label: 'Supplied ' + role }),
  ),
  { value: '$location', label: 'Current location' },
  { value: 'player', label: 'Player' },
];
export function ScalarInput({
  label,
  value,
  onChange,
  type,
  definition,
}: {
  label: string;
  value: Scalar;
  onChange: (v: Scalar) => void;
  type?: string;
  definition?: Variable;
}) {
  const p = useEditor((s) => s.project);
  type = definition?.type ?? type;
  if (type === 'entity')
    return (
      <Select
        label={label}
        value={String(value ?? '')}
        options={[
          { value: '', label: 'None' },
          ...[...p.locations, ...p.objects, ...p.characters].map((e) => ({
            value: e.id,
            label: e.name,
          })),
        ]}
        onChange={(v) => onChange(v || null)}
      />
    );
  if (type === 'enum')
    return (
      <Select
        label={label}
        value={String(value ?? '')}
        options={definition?.options ?? []}
        onChange={onChange}
      />
    );
  return typeof value === 'boolean' || type === 'boolean' ? (
    <Select
      label={label}
      value={String(value ?? false)}
      onChange={(v) => onChange(v === 'true')}
      options={[
        { value: 'true', label: 'Yes' },
        { value: 'false', label: 'No' },
      ]}
    />
  ) : (
    <TextField
      label={label}
      type={type === 'number' || typeof value === 'number' ? 'number' : 'text'}
      value={value === null ? '' : String(value)}
      onChange={(v) => onChange(type === 'number' || typeof value === 'number' ? Number(v) : v)}
    />
  );
}
export function ConditionEditor({
  value,
  onChange,
  depth = 0,
}: {
  value: Condition;
  onChange: (c: Condition) => void;
  depth?: number;
}) {
  const p = useEditor((s) => s.project);
  if ('conditions' in value)
    return (
      <div className={`condition-group depth-${depth % 3}`}>
        <div className="condition-heading">
          <select
            aria-label="Condition group"
            value={value.kind}
            onChange={(e) =>
              onChange({
                kind: e.target.value as 'all' | 'any' | 'not',
                conditions:
                  e.target.value === 'not' ? [value.conditions[0] ?? always()] : value.conditions,
              })
            }
          >
            <option value="all">All conditions are true</option>
            <option value="any">Any condition is true</option>
            <option value="not">Condition is not true</option>
          </select>
          <span className="muted">
            {value.conditions.length} {value.conditions.length === 1 ? 'condition' : 'conditions'}
          </span>
        </div>
        {value.conditions.map((c, i) => (
          <div className="condition-child" key={i}>
            <ConditionEditor
              value={c}
              depth={depth + 1}
              onChange={(next) =>
                onChange({
                  ...value,
                  conditions: value.conditions.map((c, j) => (i === j ? next : c)),
                })
              }
            />
            <Button
              icon="trash"
              title="Remove condition"
              onClick={() =>
                onChange({ ...value, conditions: value.conditions.filter((_, j) => i !== j) })
              }
            />
          </div>
        ))}
        {(value.kind !== 'not' || !value.conditions.length) && (
          <div className="row">
            <Button
              variant="outline small"
              icon="plus"
              onClick={() =>
                onChange({
                  ...value,
                  conditions: [
                    ...value.conditions,
                    { kind: 'test', test: 'carried', ref: p.objects[0]?.id ?? '', value: true },
                  ],
                })
              }
            >
              Condition
            </Button>
            {depth < 10 && (
              <Button
                variant="ghost small"
                icon="plus"
                onClick={() => onChange({ ...value, conditions: [...value.conditions, always()] })}
              >
                Group
              </Button>
            )}
          </div>
        )}
      </div>
    );
  const comparison = value.kind === 'compare';
  return (
    <div className="condition-leaf">
      <Select
        label="Condition"
        value={comparison ? value.source : value.test}
        options={[
          { value: 'variable', label: 'Variable value' },
          { value: 'property', label: 'Object property' },
          { value: 'argument', label: 'Supplied argument' },
          { value: 'location', label: 'Current location' },
          { value: 'previousLocation', label: 'Previous location' },
          { value: 'turn', label: 'Turn number' },
          ...[
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
          ].map((v) => ({
            value: v,
            label: (
              {
                carried: 'Player carries',
                visible: 'Player can see',
                reachable: 'Player can reach',
                known: 'Player has discovered',
                open: 'Object is open',
                locked: 'Object is locked',
                active: 'Object is active',
                worn: 'Object is worn',
                enabled: 'Connection enabled',
                fired: 'Rule has fired',
                at: 'Entity is at',
              } as Record<string, string>
            )[v],
          })),
        ]}
        onChange={(v) =>
          onChange(
            ['variable', 'property', 'argument', 'turn', 'location', 'previousLocation'].includes(v)
              ? {
                  kind: 'compare',
                  source: v as 'variable',
                  ref: p.variables[0]?.id ?? '',
                  key: 'text',
                  op: 'eq',
                  value: v === 'turn' ? 0 : '',
                }
              : { kind: 'test', test: v as 'carried', ref: p.objects[0]?.id ?? '', value: true },
          )
        }
      />
      {comparison ? (
        <>
          {['variable', 'property'].includes(value.source) && (
            <Select
              label={value.source === 'variable' ? 'Variable' : 'Entity'}
              value={value.ref}
              onChange={(ref) =>
                onChange({
                  ...value,
                  ref,
                  value:
                    value.source === 'variable'
                      ? (p.variables.find((v) => v.id === ref)?.initial ?? '')
                      : value.value,
                })
              }
              options={
                value.source === 'variable'
                  ? [
                      { value: '', label: 'Choose variable…' },
                      ...p.variables.map((v) => ({ value: v.id, label: v.name })),
                    ]
                  : entityOptions(p)
              }
            />
          )}{' '}
          {['property', 'argument'].includes(value.source) && (
            <Select
              label="Property / parameter"
              value={value.key}
              options={
                value.source === 'property'
                  ? [...p.propertyDefinitions, ...p.templates.flatMap((t) => t.properties)].map(
                      (v) => ({ value: v.id, label: v.name }),
                    )
                  : [
                      ...new Map(
                        actionCatalog(p)
                          .flatMap((a) => a.parameters)
                          .map((v) => [v.id, { value: v.id, label: v.name }]),
                      ).values(),
                    ]
              }
              onChange={(key) => onChange({ ...value, key })}
            />
          )}
          <Select
            label="Comparison"
            value={value.op}
            onChange={(op) => onChange({ ...value, op: op as 'eq' })}
            options={[
              { value: 'eq', label: 'equals' },
              { value: 'ne', label: 'does not equal' },
              { value: 'normalized', label: 'equals (ignore case)' },
              { value: 'gt', label: 'greater than' },
              { value: 'lt', label: 'less than' },
              { value: 'gte', label: 'at least' },
              { value: 'lte', label: 'at most' },
            ]}
          />
          {value.source === 'location' || value.source === 'previousLocation' ? (
            <Select
              label="Location"
              value={String(value.value)}
              onChange={(v) => onChange({ ...value, value: v })}
              options={p.locations.map((l) => ({ value: l.id, label: l.name }))}
            />
          ) : (
            <ScalarInput
              label="Value"
              value={value.value}
              definition={
                value.source === 'variable'
                  ? p.variables.find((v) => v.id === value.ref)
                  : value.source === 'property'
                    ? [...p.propertyDefinitions, ...p.templates.flatMap((t) => t.properties)].find(
                        (v) => v.id === value.key,
                      )
                    : undefined
              }
              onChange={(v) => onChange({ ...value, value: v })}
            />
          )}
        </>
      ) : (
        <>
          <Select
            label="Reference"
            value={value.ref}
            onChange={(ref) => onChange({ ...value, ref })}
            options={
              value.test === 'fired'
                ? p.rules.map((r) => ({ value: r.id, label: r.name }))
                : entityOptions(p)
            }
          />
          {value.test === 'at' ? (
            <Select
              label="Location or parent"
              value={String(value.value)}
              onChange={(v) => onChange({ ...value, value: v })}
              options={entityOptions(p)}
            />
          ) : (
            <Select
              label="Is"
              value={String(value.value)}
              onChange={(v) => onChange({ ...value, value: v === 'true' })}
              options={['true', 'false']}
            />
          )}
        </>
      )}
    </div>
  );
}
const effectLabels: Record<Effect['kind'], string> = {
  invoke: 'Invoke action',
  print: 'Display text',
  set: 'Set variable',
  increment: 'Change number',
  property: 'Set object property',
  move: 'Move entity',
  state: 'Set object state',
  enable: 'Enable connection',
  reveal: 'Reveal',
  forgetTopic: 'Forget topic',
  schedule: 'Schedule event',
  cancel: 'Cancel event',
  emit: 'Emit named event',
  random: 'Random branch',
  end: 'End game',
};
export function EffectsEditor({
  value,
  onChange,
  depth = 0,
}: {
  value: Effect[];
  onChange: (v: Effect[]) => void;
  depth?: number;
}) {
  const p = useEditor((s) => s.project);
  const change = (i: number, patch: Partial<Effect>) =>
    onChange(value.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  return (
    <div className="effects-editor">
      {value.map((e, i) => (
        <div key={i} className="effect-row">
          <span className="effect-number">{i + 1}</span>
          <div className="effect-fields">
            <Select
              label="Effect"
              value={e.kind}
              options={Object.entries(effectLabels).map(([value, label]) => ({ value, label }))}
              onChange={(kind) => change(i, effect(kind as Effect['kind']))}
            />
            {['set', 'increment'].includes(e.kind) && (
              <>
                <Select
                  label="Variable"
                  value={e.ref}
                  options={[
                    { value: '', label: 'Choose variable…' },
                    ...p.variables.map((v) => ({ value: v.id, label: v.name })),
                  ]}
                  onChange={(ref) =>
                    change(i, {
                      ref,
                      value:
                        e.kind === 'increment'
                          ? 1
                          : (p.variables.find((v) => v.id === ref)?.initial ?? ''),
                    })
                  }
                />
                <ScalarInput
                  label={e.kind === 'increment' ? 'Amount' : 'Value'}
                  value={e.value}
                  definition={
                    e.kind === 'set' ? p.variables.find((v) => v.id === e.ref) : undefined
                  }
                  type={e.kind === 'increment' ? 'number' : undefined}
                  onChange={(value) => change(i, { value })}
                />
              </>
            )}
            {['state', 'property', 'move', 'enable', 'reveal', 'forgetTopic'].includes(e.kind) && (
              <Select
                label="Reference"
                value={e.ref}
                options={entityOptions(p)}
                onChange={(ref) => change(i, { ref })}
              />
            )}
            {e.kind === 'property' && (
              <>
                <Select
                  label="Property"
                  value={e.key}
                  options={[
                    ...p.propertyDefinitions,
                    ...p.templates.flatMap((t) => t.properties),
                  ].map((v) => ({ value: v.id, label: v.name }))}
                  onChange={(key) =>
                    change(i, {
                      key,
                      value:
                        [
                          ...p.propertyDefinitions,
                          ...p.templates.flatMap((t) => t.properties),
                        ].find((v) => v.id === key)?.initial ?? '',
                    })
                  }
                />
                <ScalarInput
                  label="Value"
                  value={e.value}
                  definition={[
                    ...p.propertyDefinitions,
                    ...p.templates.flatMap((t) => t.properties),
                  ].find((v) => v.id === e.key)}
                  onChange={(value) => change(i, { value })}
                />
              </>
            )}
            {e.kind === 'state' && (
              <>
                <Select
                  label="State"
                  value={e.key}
                  options={['', 'open', 'locked', 'active', 'worn', 'concealed']}
                  onChange={(key) => change(i, { key, value: false })}
                />
                <ScalarInput
                  label="Value"
                  value={e.value}
                  type="boolean"
                  onChange={(value) => change(i, { value })}
                />
              </>
            )}
            {e.kind === 'enable' && (
              <ScalarInput
                label="Enabled"
                value={e.value}
                type="boolean"
                onChange={(value) => change(i, { value })}
              />
            )}
            {e.kind === 'move' && (
              <>
                <Select
                  label="Placement"
                  value={e.placement.kind}
                  options={['location', 'inside', 'on', 'player', 'character', 'offstage']}
                  onChange={(kind) =>
                    change(i, { placement: { ...e.placement, kind: kind as 'location' } })
                  }
                />
                {!['offstage', 'player'].includes(e.placement.kind) && (
                  <Select
                    label="Destination"
                    value={e.placement.id}
                    options={entityOptions(p)}
                    onChange={(id) => change(i, { placement: { ...e.placement, id } })}
                  />
                )}
              </>
            )}
            {['schedule', 'cancel'].includes(e.kind) && (
              <Select
                label="Event"
                value={e.ref}
                options={[
                  { value: '', label: 'Choose event…' },
                  ...p.rules
                    .filter((r) => r.phase === 'event')
                    .map((r) => ({ value: r.id, label: r.name })),
                ]}
                onChange={(ref) => change(i, { ref })}
              />
            )}
            {e.kind === 'schedule' && (
              <TextField
                label="Delay (turns)"
                type="number"
                value={e.delay}
                onChange={(v) => change(i, { delay: Math.max(1, Number(v)) })}
              />
            )}
            {e.kind === 'emit' && (
              <Select
                label="Event"
                value={e.ref}
                options={p.events.map((e) => ({ value: e.id, label: e.name }))}
                onChange={(ref) => change(i, { ref })}
              />
            )}
            {e.kind === 'end' && (
              <Select
                label="Ending"
                value={e.ref}
                options={p.endings.map((e) => ({ value: e.id, label: e.name }))}
                onChange={(ref) => change(i, { ref })}
              />
            )}
            {e.kind === 'invoke' && (
              <>
                <Select
                  label="Action to invoke"
                  value={e.ref}
                  options={actionCatalog(p).map((a) => ({ value: a.id, label: a.name }))}
                  onChange={(ref) => change(i, { ref, arguments: {} })}
                />
                {actionCatalog(p)
                  .find((a) => a.id === e.ref)
                  ?.parameters.map((param) =>
                    ['entity', 'connection', 'topic'].includes(param.kind) ? (
                      <Select
                        key={param.id}
                        label={param.name}
                        value={String(e.arguments[param.id] ?? '')}
                        options={entityOptions(p)}
                        onChange={(value) =>
                          change(i, { arguments: { ...e.arguments, [param.id]: value } })
                        }
                      />
                    ) : (
                      <TextField
                        key={param.id}
                        label={param.name}
                        value={String(e.arguments[param.id] ?? '')}
                        onChange={(value) =>
                          change(i, {
                            arguments: {
                              ...e.arguments,
                              [param.id]: param.kind === 'number' ? Number(value) : value,
                            },
                          })
                        }
                      />
                    ),
                  )}
                <Select
                  label="If the invoked action refuses"
                  value={e.onRefusal}
                  options={[
                    { value: 'stop', label: 'Stop this handler' },
                    { value: 'report', label: 'Report refusal and continue' },
                    { value: 'ignore', label: 'Continue quietly' },
                  ]}
                  onChange={(v) => change(i, { onRefusal: v as Effect['onRefusal'] })}
                />
              </>
            )}
            {['print', 'end'].includes(e.kind) && (
              <TextField
                label={e.kind === 'end' ? 'Ending passage' : 'Authored text'}
                multiline
                value={e.text}
                onChange={(text) => change(i, { text })}
              />
            )}
            {e.kind === 'random' && depth < 6 && (
              <div className="full-width">
                {e.branches.map((branch, j) => (
                  <div className="random-branch" key={j}>
                    <h4>Branch {j + 1}</h4>
                    <EffectsEditor
                      depth={depth + 1}
                      value={branch}
                      onChange={(v) =>
                        change(i, { branches: e.branches.map((b, k) => (k === j ? v : b)) })
                      }
                    />
                  </div>
                ))}
                <Button icon="plus" onClick={() => change(i, { branches: [...e.branches, []] })}>
                  Branch
                </Button>
              </div>
            )}
            {['print', 'end'].includes(e.kind) && (
              <Select
                label="Insert text token"
                value=""
                options={[
                  { value: '', label: 'Insert a name or value…' },
                  ...entityOptions(p)
                    .filter((o) => o.value)
                    .map((o) => ({
                      value: '{{name:' + o.value + '}}',
                      label: o.label + ' · name',
                    })),
                  ...p.variables.map((v) => ({
                    value: '{{variable:' + v.id + '}}',
                    label: v.name + ' · value',
                  })),
                  ...['text', 'number'].map((role) => ({
                    value: '{{argument:' + role + '}}',
                    label: 'Supplied ' + role,
                  })),
                ]}
                onChange={(token) => change(i, { text: e.text + token })}
              />
            )}
          </div>
          <div className="effect-tools">
            <Button
              icon="up"
              title="Move effect up"
              disabled={i === 0}
              onClick={() => {
                const a = [...value];
                [a[i - 1], a[i]] = [a[i], a[i - 1]];
                onChange(a);
              }}
            />
            <Button
              icon="copy"
              title="Duplicate effect"
              onClick={() =>
                onChange([...value.slice(0, i + 1), structuredClone(e), ...value.slice(i + 1)])
              }
            />
            <Button
              icon="trash"
              title="Remove effect"
              onClick={() => onChange(value.filter((_, j) => j !== i))}
            />
          </div>
        </div>
      ))}
      <Button
        variant="outline small"
        icon="plus"
        onClick={() => onChange([...value, effect('print')])}
      >
        Effect
      </Button>
    </div>
  );
}
export function RuleEditor({ rule }: { rule: Rule }) {
  const p = useEditor((s) => s.project),
    edit = useEditor((s) => s.edit),
    actions = actionCatalog(p),
    action = actions.find((a) => a.id === rule.trigger);
  const update = (patch: Partial<Rule>) =>
    edit(`rule:${rule.id}:${Object.keys(patch).join()}`, (p) =>
      Object.assign(
        p.rules.find((r) => r.id === rule.id)!,
        patch,
      ),
    );
  return (
    <div className="rule-editor">
      <div className="editor-heading">
        <span className="entity-emblem purple">
          <Icon name="rules" size={30} />
        </span>
        <div>
          <h1>{rule.name}</h1>
          <p>
            Visual rule editor <span className="dot-divider">·</span>{' '}
            {rule.phase === 'event' ? 'World event' : 'Action behavior'}
          </p>
        </div>
        <label className="enabled-switch">
          <input
            type="checkbox"
            checked={rule.enabled}
            onChange={(e) => update({ enabled: e.target.checked })}
          />
          {rule.enabled ? 'Enabled' : 'Disabled'}
        </label>
      </div>
      <div className="rule-block when">
        <div className="rule-label">
          <Icon name="settings" />
          <strong>WHEN</strong>
        </div>
        <div className="rule-content">
          <div className="form-grid">
            <Select
              label="Phase"
              value={rule.phase}
              options={[
                { value: 'check', label: 'Check · requirement' },
                { value: 'handle', label: 'Handle · action outcome' },
                { value: 'after', label: 'After · successful action' },
                { value: 'response', label: 'Response · customize narration' },
                { value: 'event', label: 'Event · world behavior' },
              ]}
              onChange={(phase) =>
                update({
                  phase: phase as Rule['phase'],
                  trigger: phase === 'event' ? 'enter' : 'use',
                  bindings: {},
                })
              }
            />
            {rule.phase === 'event' ? (
              <Select
                label="Event trigger"
                value={rule.trigger}
                onChange={(trigger) => update({ trigger })}
                options={[
                  ...['start', 'enter', 'leave', 'turn', 'scheduled'].map((value) => ({
                    value,
                    label: value[0].toUpperCase() + value.slice(1),
                  })),
                  ...p.events.map((e) => ({ value: e.id, label: e.name })),
                ]}
              />
            ) : (
              <Select
                label="Action"
                value={rule.trigger}
                options={actions.map((a) => ({ value: a.id, label: a.name }))}
                onChange={(trigger) => update({ trigger, bindings: {} })}
              />
            )}
          </div>
          {rule.phase === 'event' ? (
            <Select
              label="Entering location (optional)"
              value={String(rule.bindings.to ?? '')}
              options={[
                { value: '', label: 'Any location' },
                ...p.locations.map((l) => ({ value: l.id, label: l.name })),
              ]}
              onChange={(to) => update({ bindings: to ? { to } : {} })}
            />
          ) : (
            <div className="form-grid">
              {action?.parameters.map((param) => {
                const bind = (v: string | number | boolean) => {
                  const bindings = { ...rule.bindings };
                  if (v === '') delete bindings[param.id];
                  else bindings[param.id] = v;
                  update({ bindings });
                };
                if (param.kind === 'text' || param.kind === 'number')
                  return (
                    <TextField
                      key={param.id}
                      label={`${param.name} binding`}
                      type={param.kind === 'number' ? 'number' : 'text'}
                      value={String(rule.bindings[param.id] ?? '')}
                      hint="Leave blank for any value"
                      onChange={(v) =>
                        bind(v === '' ? '' : param.kind === 'number' ? Number(v) : v)
                      }
                    />
                  );
                if (param.kind === 'boolean')
                  return (
                    <Select
                      key={param.id}
                      label={`${param.name} binding`}
                      value={String(rule.bindings[param.id] ?? '')}
                      options={[
                        { value: '', label: 'Any value' },
                        { value: 'true', label: 'True' },
                        { value: 'false', label: 'False' },
                      ]}
                      onChange={(v) => bind(v === '' ? '' : v === 'true')}
                    />
                  );
                const options =
                  param.kind === 'connection'
                    ? p.connections
                    : param.kind === 'topic'
                      ? p.characters.flatMap((c) => c.topics)
                      : [...p.objects, ...p.characters];
                return (
                  <Select
                    key={param.id}
                    label={`${param.name} binding`}
                    value={String(rule.bindings[param.id] ?? '')}
                    options={[
                      { value: '', label: 'Any value' },
                      ...options.map((o) => ({ value: o.id, label: o.name })),
                    ]}
                    onChange={bind}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>
      <div className="rule-block if">
        <div className="rule-label">
          <Icon name="connections" />
          <strong>IF</strong>
        </div>
        <div className="rule-content">
          <h4>Applies when</h4>
          <ConditionEditor
            value={rule.appliesWhen}
            onChange={(appliesWhen) => update({ appliesWhen })}
          />
          <h4>{rule.phase === 'check' ? 'Requirement' : 'Condition'}</h4>
          <ConditionEditor value={rule.condition} onChange={(condition) => update({ condition })} />
        </div>
      </div>
      <div className="rule-block then">
        <div className="rule-label">
          <Icon name="actions" />
          <strong>THEN</strong>
        </div>
        <div className="rule-content">
          {rule.phase === 'check' || (rule.phase === 'handle' && rule.outcome === 'refusal') ? (
            <div className="success-note">
              <Icon name="check" />
              {rule.outcome === 'refusal'
                ? 'Report the refusal without committing effects'
                : 'Allow the action to continue'}
            </div>
          ) : (
            <EffectsEditor value={rule.effects} onChange={(effects) => update({ effects })} />
          )}
        </div>
      </div>
      {['check', 'handle'].includes(rule.phase) && (
        <div className="rule-block otherwise">
          <div className="rule-label">
            <Icon name="rules" />
            <strong>OTHERWISE</strong>
          </div>
          <div className="rule-content">
            <TextField
              label="Refusal response"
              multiline
              value={rule.otherwise}
              onChange={(otherwise) => update({ otherwise })}
            />
            <small className="muted">
              {rule.phase === 'check'
                ? 'A failed requirement stops the action.'
                : 'Used only when no matching handler succeeds. Refusal does not change state.'}
            </small>
          </div>
        </div>
      )}
      <div className="form-grid rule-settings">
        {rule.phase === 'handle' && (
          <Select
            label="Instead outcome"
            value={rule.outcome}
            options={[
              { value: 'success', label: 'Successful action' },
              { value: 'refusal', label: 'Refuse without changing the world' },
            ]}
            onChange={(v) => update({ outcome: v as Rule['outcome'] })}
          />
        )}
        {rule.phase === 'response' && (
          <Select
            label="Report behavior"
            value={rule.responseMode}
            options={[
              { value: 'replace', label: 'Replace standard report' },
              { value: 'append', label: 'Append to standard report' },
            ]}
            onChange={(v) => update({ responseMode: v as Rule['responseMode'] })}
          />
        )}
        <TextField label="Rule name" value={rule.name} onChange={(name) => update({ name })} />
        <TextField
          label="Priority"
          type="number"
          value={rule.priority}
          onChange={(v) => update({ priority: Number(v) })}
        />
        <TextField
          label="Author order"
          type="number"
          value={rule.order}
          onChange={(v) => update({ order: Number(v) })}
        />
        <Toggle label="Run once" checked={rule.once} onChange={(once) => update({ once })} />
      </div>
    </div>
  );
}
