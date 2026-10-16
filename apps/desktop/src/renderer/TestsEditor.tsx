import { useEffect, useState } from 'react';
import type { Scenario, ScenarioResult } from '../../../../packages/domain/src/scenarios';
import { Button, Field, Icon, TextField, Badge } from './components';
import { host, useEditor } from './store';
export function TestsEditor() {
  const project = useEditor((s) => s.project),
    notify = useEditor((s) => s.setToast),
    [scenarios, setScenarios] = useState<Scenario[]>([]),
    [selected, setSelected] = useState(''),
    [result, setResult] = useState<ScenarioResult | null>(null),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    host('getScenarios', null)
      .then((list) => {
        setScenarios(list);
        setSelected(list[0]?.id ?? '');
      })
      .catch((e) => notify(e.message));
  }, [project.id, notify]);
  const scenario = scenarios.find((s) => s.id === selected);
  const update = (patch: Partial<Scenario>) => {
    setScenarios((list) => list.map((s) => (s.id === selected ? { ...s, ...patch } : s)));
    setResult(null);
  };
  return (
    <div className="entity-editor">
      <div className="editor-heading">
        <span className="entity-emblem">
          <Icon name="success" size={30} />
        </span>
        <div>
          <h1>Story tests</h1>
          <p>Repeatable journeys through your world.</p>
        </div>
      </div>
      <div className="editor-form">
        <div className="row">
          <Button
            icon="plus"
            onClick={() => {
              const next = {
                id: crypto.randomUUID(),
                name: 'New scenario',
                commands: [],
                ending: '',
              };
              setScenarios((s) => [...s, next]);
              setSelected(next.id);
              setResult(null);
            }}
          >
            Scenario
          </Button>
          <Button
            icon="save"
            onClick={() =>
              void host('saveScenarios', scenarios)
                .then(() => notify('Scenario tests saved separately from the project.'))
                .catch((e) => notify(e.message))
            }
          >
            Save tests
          </Button>
        </div>
        <div className="scenario-tabs">
          {scenarios.map((s) => (
            <button
              key={s.id}
              className={s.id === selected ? 'selected' : ''}
              onClick={() => {
                setSelected(s.id);
                setResult(null);
              }}
            >
              <Icon name="document" />
              {s.name}
            </button>
          ))}
        </div>
        {scenario ? (
          <>
            <div className="form-grid">
              <TextField
                label="Scenario name"
                value={scenario.name}
                onChange={(name) => update({ name })}
              />
              <TextField
                label="Expected ending (optional)"
                value={scenario.ending}
                onChange={(ending) => update({ ending })}
              />
            </div>
            <Field label="Commands · one per line">
              <textarea
                className="scenario-commands"
                value={scenario.commands.join('\n')}
                onChange={(e) => update({ commands: e.target.value.split('\n') })}
              />
            </Field>
            <div className="row">
              <Button
                icon="play"
                variant="primary"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  host('runScenario', {
                    project,
                    scenario: { ...scenario, commands: scenario.commands.filter((c) => c.trim()) },
                  })
                    .then(setResult)
                    .catch((e) => notify(e.message))
                    .finally(() => setBusy(false));
                }}
              >
                {busy ? 'Running…' : 'Run scenario'}
              </Button>
              <span className="hint">
                Runs locally in an isolated session. Your current playtest is preserved.
              </span>
            </div>
            {result && (
              <div className="scenario-result">
                <h3>
                  <Badge tone={result.passed ? 'teal' : 'red'}>
                    {result.passed ? 'Passed' : 'Failed'}
                  </Badge>{' '}
                  Turn {result.turn} · {result.ending ?? 'No ending'}
                </h3>
                {result.steps.map((s, i) => (
                  <details key={i}>
                    <summary>
                      <Icon name={s.passed ? 'success' : 'warning'} />
                      <span>{s.command}</span>
                      <Badge>{s.passed ? 'Passed' : 'Stopped'}</Badge>
                    </summary>
                    <pre>{s.error ?? s.output.join('\n\n')}</pre>
                  </details>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="empty-state">
            <Icon name="success" size={35} />
            <h3>Keep your puzzles working.</h3>
            <p>
              Create a scenario, enter a sequence of conventional commands, and run it against the
              latest project.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
