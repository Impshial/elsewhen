import { Select } from './components';
import { ScalarInput } from './RuleEditor';
import type { Scalar } from '../../../../packages/domain/src/index';
import { useEffect, useRef, useState } from 'react';
import type { SessionView } from '../main/session';
import { Button, Badge, Icon, Section } from './components';
import { WorldMap } from './WorldMap';
import { Prose } from './Editors';
import { host, useEditor } from './store';
export function Player({
  session,
  gameView,
  onGameView,
  onSettings,
  changed = false,
}: {
  changed?: boolean;
  session: SessionView;
  gameView: boolean;
  onGameView: (v: boolean) => void;
  onSettings: () => void;
}) {
  const { view } = session,
    setSession = useEditor((s) => s.setSession),
    toast = useEditor((s) => s.setToast),
    [input, setInput] = useState(''),
    [busy, setBusy] = useState(false),
    [history, setHistory] = useState<string[]>([]),
    [historyIndex, setHistoryIndex] = useState(0),
    [inspector, setInspector] = useState('Rule trace'),
    [selected, setSelected] = useState(view.location.id),
    [inventoryId, setInventoryId] = useState(''),
    [fontSize, setFontSize] = useState(Number(localStorage.getItem('elsewhen-font-size') ?? 19)),
    [follow, setFollow] = useState(true),
    [search, setSearch] = useState('');
  const transcript = useRef<HTMLDivElement>(null),
    commandInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (follow && transcript.current)
      transcript.current.scrollTop = transcript.current.scrollHeight;
  }, [session.transcript.length, follow]);
  useEffect(() => {
    setSelected(view.location.id);
  }, [view.location.id]);
  async function control(
    method: 'undo' | 'redo' | 'restart' | 'saveGame' | 'loadGame' | 'exportTranscript',
  ) {
    try {
      const result = await host(method, null);
      if (result && typeof result === 'object') setSession(result);
      else if (result) toast(`Saved to ${result}`);
    } catch (e) {
      toast((e as Error).message);
    }
  }
  async function submit(command = input) {
    if (!command.trim() || busy) return;
    const meta = command.trim().toLowerCase();
    if (['undo', 'redo', 'restart', 'save', 'load'].includes(meta)) {
      await control(
        (({ save: 'saveGame', load: 'loadGame' } as Record<string, string>)[meta] as 'saveGame') ??
          (meta as 'undo'),
      );
      setInput('');
      return;
    }
    if (meta === 'help') {
      toast(
        'look · examine object · take object · go exit · open container · use tool on target · unlock door with key · ask character about topic · inventory · undo · save',
      );
      return;
    }
    setBusy(true);
    setHistory((h) => [...h, command]);
    setHistoryIndex(history.length + 1);
    const id = session.id;
    try {
      const next = await host('command', command),
        current = useEditor.getState().session;
      if (current?.id === id && next.revision >= current.revision) {
        setSession(next);
        if (next.transcript.at(-1)?.kind !== 'status') setInput('');
        if (next.pending) setInput('');
      }
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
      commandInput.current?.focus();
    }
  }
  const selectedNode = view.nodes.find((n) => n.id === selected),
    item = view.inventory.find((e) => e.id === inventoryId) ?? view.inventory[0];
  return (
    <div className={`player-workspace ${gameView ? 'game-view' : 'playtest-view'}`}>
      <div className="play-column">
        {changed && (
          <div className="snapshot-notice">
            <Icon name="info" size={15} />
            Project changed since this playtest started. Restart to use your edits.
          </div>
        )}
        <header className="play-heading">
          <div>
            <span className="eyebrow">{gameView ? 'THE FOLDED PATH' : 'LIVE PLAYTEST'}</span>
            <h1>
              <Icon name="pin" size={26} />
              {gameView ? view.location.name : `Playtest · ${view.location.name}`}
            </h1>
          </div>
          <div className="row">
            {session.debug && (
              <Button icon={gameView ? 'rules' : 'external'} onClick={() => onGameView(!gameView)}>
                {gameView ? 'Show debugger' : 'Game view'}
              </Button>
            )}
            <Badge tone={view.ending ? 'purple' : 'teal'}>
              {view.ending ? 'Story complete' : `Turn ${view.turn}`}
            </Badge>
          </div>
        </header>
        <div className="transcript-toolbar">
          <div className="transcript-search">
            <Icon name="search" size={14} />
            <input
              aria-label="Search transcript"
              placeholder="Find in transcript…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <label className="font-control" title="Transcript text size">
            Aa{' '}
            <input
              aria-label="Transcript text size"
              type="range"
              min={15}
              max={26}
              value={fontSize}
              onChange={(e) => {
                const size = Number(e.target.value);
                setFontSize(size);
                localStorage.setItem('elsewhen-font-size', String(size));
              }}
            />
          </label>
          <Button
            icon="download"
            title="Export transcript"
            onClick={() => void control('exportTranscript')}
          />
        </div>
        <div
          className="transcript"
          ref={transcript}
          style={{ '--prose-size': `${fontSize}px` } as React.CSSProperties}
          onScroll={() => {
            const el = transcript.current!;
            setFollow(el.scrollHeight - el.scrollTop - el.clientHeight < 70);
          }}
        >
          {session.transcript
            .filter((e) => !search || e.text.toLowerCase().includes(search.toLowerCase()))
            .map((entry, i) => (
              <div className={`transcript-entry ${entry.kind}`} key={i}>
                {entry.kind === 'command' ? (
                  <>
                    <span>›</span>
                    {entry.text}
                  </>
                ) : (
                  <Prose text={entry.text} />
                )}
              </div>
            ))}
          <div className="transcript-live" aria-live="polite" aria-atomic="true">
            {session.transcript.at(-1)?.text}
          </div>
          {view.ending && (
            <div className="ending-card">
              <Icon name="feather" size={30} />
              <h2>The end</h2>
              <p>
                {view.title} · {view.ending}
              </p>
              <Button icon="reset" variant="outline" onClick={() => void control('restart')}>
                Begin again
              </Button>
            </div>
          )}
        </div>
        {!follow && (
          <button className="jump-latest" onClick={() => setFollow(true)}>
            New text · Jump to latest <Icon name="arrowDown" size={14} />
          </button>
        )}
        <div className="visible-exits">
          <span>Visible exits</span>
          {view.exits.map((e) => (
            <button
              key={e.id}
              onClick={() => void submit(`go ${e.name}`)}
              disabled={busy || !!view.ending}
            >
              {e.name}
              <Icon name="arrow" size={13} />
            </button>
          ))}
        </div>
        {session.remainder.length > 0 && (
          <div className="queue-remainder">
            <span>Queue stopped. {session.remainder.length} remaining.</span>
            <button onClick={() => setInput(session.remainder.join('; '))}>
              Edit remaining commands
            </button>
          </div>
        )}
        {session.pending && (
          <div className="clarification-bar">
            <Icon name="dialogue" />
            <span>Awaiting clarification</span>
            {session.pending.candidates.map((c, i) => (
              <Button key={c.id} variant="outline small" onClick={() => void submit(String(i + 1))}>
                {view.known.find((e) => e.id === c.id)?.name ?? String(i + 1)}
              </Button>
            ))}
            <Button
              icon="x"
              title="Cancel clarification"
              onClick={() => void host('cancel', null).then((s) => s && setSession(s))}
            />
          </div>
        )}
        <form
          className="command-bar"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <span className="command-prompt">›</span>
          <input
            ref={commandInput}
            aria-label="Enter command"
            placeholder={
              view.ending
                ? 'Your journey is complete. Undo or restart to play again.'
                : session.pending
                  ? 'Your answer…'
                  : 'What will you do?'
            }
            autoComplete="off"
            value={input}
            disabled={!!view.ending}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                const i = Math.max(0, historyIndex - 1);
                setHistoryIndex(i);
                setInput(history[i] ?? '');
              }
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                const i = Math.min(history.length, historyIndex + 1);
                setHistoryIndex(i);
                setInput(history[i] ?? '');
              }
            }}
          />
          {busy ? (
            <Button
              icon="stop"
              variant="outline"
              onClick={() =>
                void host('cancel', null).then((s) => {
                  if (s) setSession(s);
                  setBusy(false);
                })
              }
            >
              Cancel
            </Button>
          ) : (
            <Button
              type="submit"
              variant="primary"
              icon="send"
              disabled={!!view.ending || !input.trim()}
            >
              Send
            </Button>
          )}
        </form>
        <div className="player-foot">
          <span>
            <i className={`status-dot ${busy ? 'amber' : ''}`} />
            {busy
              ? 'Interpreting…'
              : session.pending
                ? 'Waiting for your answer'
                : view.ending
                  ? 'Adventure complete'
                  : 'Ready for your next move'}
          </span>
          <div className="row">
            <Button
              icon="undo"
              title="Undo game action"
              disabled={!session.canUndo}
              onClick={() => void control('undo')}
            />
            <Button
              icon="redo"
              title="Redo game action"
              disabled={!session.canRedo}
              onClick={() => void control('redo')}
            />
            <Button icon="save" title="Save game" onClick={() => void control('saveGame')} />
            <Button icon="folder" title="Load game" onClick={() => void control('loadGame')} />
            <Button icon="settings" title="Parser settings" onClick={onSettings} />
          </div>
        </div>
      </div>
      <aside className="play-side">
        {gameView ? (
          <>
            <Section
              title="Inventory"
              icon="objects"
              action={<span className="muted">{view.inventory.length} items</span>}
            >
              <div className="inventory-layout">
                <div className="inventory-items">
                  {view.inventory.map((e) => (
                    <button
                      key={e.id}
                      className={item?.id === e.id ? 'selected' : ''}
                      onClick={() => setInventoryId(e.id)}
                    >
                      <Icon
                        name={
                          e.capabilities.includes('light')
                            ? 'light'
                            : e.capabilities.includes('readable')
                              ? 'book'
                              : 'objects'
                        }
                      />
                      {e.name}
                    </button>
                  ))}
                  {!view.inventory.length && <p className="empty-note">Your hands are empty.</p>}
                </div>
                {item && (
                  <div className="inventory-detail">
                    <Icon name="objects" size={40} />
                    <h3>{item.name}</h3>
                    <Prose text={item.description || 'Examine this item to learn more.'} />
                    <div className="row">
                      <Button
                        icon="eye"
                        variant="outline small"
                        onClick={() => void submit(`examine ${item.name}`)}
                      >
                        Examine
                      </Button>
                      <Button
                        variant="ghost small"
                        onClick={() => void submit(`drop ${item.name}`)}
                      >
                        Drop
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </Section>
            <section className="discovered-map">
              <header>
                <Icon name="map" />
                <h3>Discovered world</h3>
                <Badge>{view.nodes.filter((n) => !n.unknown).length} known</Badge>
              </header>
              <WorldMap
                compact
                nodes={view.nodes}
                edges={view.edges}
                selected={selected}
                current={view.location.id}
                onSelect={setSelected}
              />
              {selectedNode && (
                <div className="map-selection">
                  <strong>{selectedNode.name}</strong>
                  <small>
                    {selectedNode.description || 'You have not explored this place yet.'}
                  </small>
                </div>
              )}
              {view.exits.some((e) => e.id === selected) && (
                <div className="map-selection">
                  <strong>{view.exits.find((e) => e.id === selected)?.name}</strong>
                  <Button
                    icon="play"
                    variant="outline small"
                    onClick={() =>
                      void host('travel', selected)
                        .then(setSession)
                        .catch((e) => toast(e.message))
                    }
                  >
                    Travel
                  </Button>
                </div>
              )}
            </section>
          </>
        ) : (
          <>
            <header className="debug-heading">
              <Icon name="search" />
              <h3>Action inspector</h3>
              <Badge>{session.source}</Badge>
            </header>
            <nav className="editor-subtabs">
              {['Intent', 'Rule trace', 'State'].map((t) => (
                <button
                  key={t}
                  className={inspector === t ? 'active' : ''}
                  onClick={() => setInspector(t)}
                >
                  {t}
                </button>
              ))}
            </nav>
            <DebugControls session={session} />
            <div className="debug-content">
              {session.last ? (
                <>
                  {inspector === 'Intent' ? (
                    <>
                      <span className="eyebrow">VALIDATED INTERPRETATION</span>
                      <p className="hint">
                        Prompt elsewhen-intent-v1 · {session.latency} ms
                        {session.usage
                          ? ' · ' +
                            session.usage.input +
                            ' input / ' +
                            session.usage.output +
                            ' output tokens'
                          : ''}
                      </p>
                      <pre>{JSON.stringify(session.last.action, null, 2)}</pre>
                      <h4>Public parser context</h4>
                      <pre>{JSON.stringify(session.context, null, 2)}</pre>
                    </>
                  ) : inspector === 'Rule trace' ? (
                    <>
                      <div className="intent-summary">
                        <span>
                          Action<strong>{session.last.action.actionId}</strong>
                        </span>
                        {Object.entries(session.last.action.args).map(([key, value]) => (
                          <span key={key}>
                            {key}
                            <strong>
                              {view.known.find((e) => e.id === value)?.name ?? String(value)}
                            </strong>
                          </span>
                        ))}
                      </div>
                      <div className="trace-list">
                        {session.last.trace.map((trace, i) => (
                          <div
                            className={`trace-item ${trace.passed === false ? 'failed' : ''}`}
                            key={i}
                          >
                            <Icon
                              name={
                                trace.passed === false
                                  ? 'warning'
                                  : trace.stage === 'effect'
                                    ? 'actions'
                                    : 'success'
                              }
                            />
                            <span>
                              <small>{trace.stage}</small>
                              {trace.message}
                            </span>
                          </div>
                        ))}
                      </div>
                      {session.last.error && <p className="error-text">{session.last.error}</p>}
                    </>
                  ) : (
                    <>
                      <h4>State changes</h4>
                      <StateChanges session={session} />
                    </>
                  )}
                </>
              ) : (
                <div className="empty-state">
                  <Icon name="rules" size={36} />
                  <h3>Follow the story’s logic.</h3>
                  <p>
                    Enter a command to see its interpretation, scope checks, selected rules, and
                    effects.
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </aside>
      {!gameView && (
        <div className="playtest-changes">
          <header>
            <Icon name="layers" />
            <h3>State changes</h3>
            <Badge>{session.last?.changes.length ?? 0}</Badge>
          </header>
          <StateChanges session={session} />
        </div>
      )}
    </div>
  );
}
function StateChanges({ session }: { session: SessionView }) {
  return (
    <div className="changes-scroll">
      <table className="state-table">
        <thead>
          <tr>
            <th>Property</th>
            <th>Before</th>
            <th>After</th>
          </tr>
        </thead>
        <tbody>
          {session.last?.changes.map((c, i) => (
            <tr key={i}>
              <td>{c.path}</td>
              <td>
                <code>{formatValue(c.before)}</code>
              </td>
              <td>
                <code className="changed-value">{formatValue(c.after)}</code>
              </td>
            </tr>
          ))}
          {!session.last?.changes.length && (
            <tr>
              <td colSpan={3} className="muted">
                No state changes to show.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
function formatValue(value: unknown) {
  const text = typeof value === 'string' ? value : (JSON.stringify(value) ?? '—');
  return text.length > 150 ? text.slice(0, 147) + '…' : text;
}
function DebugControls({ session }: { session: SessionView }) {
  const [kind, setKind] = useState<'teleport' | 'grant' | 'variable' | 'revealMap'>('teleport'),
    [ref, setRef] = useState(''),
    [value, setValue] = useState<Scalar>(''),
    setSession = useEditor((s) => s.setSession),
    notify = useEditor((s) => s.setToast),
    p = session.snapshot;
  if (!p) return null;
  const options =
    kind === 'teleport'
      ? p.locations
      : kind === 'grant'
        ? p.objects.filter((o) => !o.capabilities.includes('door'))
        : p.variables;
  return (
    <details className="debug-controls">
      <summary>
        <Icon name="settings" size={14} />
        <span>Designer controls</span>
        {session.modified && <Badge tone="amber">Modified</Badge>}
      </summary>
      <div>
        <Select
          label="Debug operation"
          value={kind}
          options={[
            { value: 'teleport', label: 'Teleport player' },
            { value: 'grant', label: 'Grant object' },
            { value: 'variable', label: 'Set variable' },
            { value: 'revealMap', label: 'Reveal map' },
          ]}
          onChange={(v) => {
            setKind(v as typeof kind);
            setRef('');
          }}
        />
        {kind !== 'revealMap' && (
          <Select
            label="Reference"
            value={ref}
            options={[
              { value: '', label: 'Select…' },
              ...options.map((e) => ({ value: e.id, label: e.name })),
            ]}
            onChange={(ref) => {
              setRef(ref);
              if (kind === 'variable')
                setValue(p.variables.find((v) => v.id === ref)?.initial ?? '');
            }}
          />
        )}
        {kind === 'variable' && <ScalarInput label="New value" value={value} onChange={setValue} />}
        <Button
          variant="outline small"
          onClick={() =>
            void host('debug', { kind, ref, value })
              .then(setSession)
              .catch((e) => notify(e.message))
          }
        >
          Apply debug change
        </Button>
        <small>Debug edits are undoable and do not modify your source project.</small>
      </div>
    </details>
  );
}
