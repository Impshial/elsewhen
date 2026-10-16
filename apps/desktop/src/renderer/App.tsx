import { TestsEditor } from './TestsEditor';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  actionSchema,
  characterSchema,
  collections,
  connectionSchema,
  locationSchema,
  objectSchema,
  ruleSchema,
  templateSchema,
  variableSchema,
  type Collection,
} from '../../../../packages/domain/src/index';
import { validateProject } from '../../../../packages/compiler/src/validation';
import type { Boot, Settings } from '../shared';
import {
  Badge,
  Button,
  Colors,
  Field,
  Icon,
  Modal,
  Section,
  Select,
  TextField,
  Toggle,
} from './components';
import { EntityEditor, Contents, type AddContext, type AddEntity } from './Editors';
import { WorldMap } from './WorldMap';
import { Player } from './Player';
import { host, locate, useEditor } from './store';
const labels: Record<Collection, string> = {
  locations: 'Locations',
  objects: 'Objects',
  characters: 'Characters',
  connections: 'Connections',
  actions: 'Actions',
  rules: 'Rules & events',
  variables: 'Variables',
  templates: 'Reusable types',
};
export function App() {
  const [showDesigner, setShowDesigner] = useState(false),
    [mapRegion, setMapRegion] = useState(''),
    [playtestSource, setPlaytestSource] = useState(''),
    [pages, setPages] = useState<Partial<Record<Collection, number>>>({});
  const editor = useEditor(),
    { project, tab, selected, session, theme } = editor;
  const mapNodes = useMemo(
    () => project.locations.filter((l) => !mapRegion || l.region === mapRegion),
    [project.locations, mapRegion],
  );
  const mapEdges = useMemo(
    () => project.connections.map((c) => ({ ...c, name: c.kind === 'passage' ? c.name : c.kind })),
    [project.connections],
  );
  const [boot, setBoot] = useState<Boot | null>(null),
    [welcome, setWelcome] = useState(true),
    [modal, setModal] = useState(''),
    [addKind, setAddKind] = useState<Collection>('locations'),
    [addContext, setAddContext] = useState<AddContext>({}),
    [query, setQuery] = useState(''),
    [expanded, setExpanded] = useState<Collection[]>(['locations', 'objects']),
    [bottom, setBottom] = useState(true),
    [gameView, setGameView] = useState(false),
    [busy, setBusy] = useState(''),
    [deleteId, setDeleteId] = useState(''),
    [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [issues, setIssues] = useState(() => validateProject(project));
  const errors = issues.filter((i) => i.severity === 'error');
  useEffect(() => {
    const timer = setTimeout(() => setIssues(validateProject(project)), 250);
    return () => clearTimeout(timer);
  }, [project]);
  useEffect(() => setPages({}), [query]);
  const notify = editor.setToast;
  useEffect(() => {
    host('boot', null)
      .then((b) => {
        setBoot(b);
        useEditor.getState().load(b);
        if (b.session) {
          useEditor.getState().setSession(b.session);
          setWelcome(false);
          setGameView(true);
        }
      })
      .catch((e) => notify(e.message));
  }, [notify]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  useEffect(() => {
    if (!editor.dirty || !boot) return;
    const timer = setTimeout(() => {
      void host('recovery', project).catch((e) =>
        notify(`Recovery could not be saved: ${e.message}`),
      );
    }, 2000);
    return () => clearTimeout(timer);
  }, [project, editor.dirty, boot, notify]);
  useEffect(() => {
    if (!editor.toast) return;
    const timer = setTimeout(() => notify(''), 6500);
    return () => clearTimeout(timer);
  }, [editor.toast, notify]);
  const run = useCallback(
    async (label: string, fn: () => Promise<void>) => {
      setBusy(label);
      try {
        await fn();
      } catch (e) {
        notify((e as Error).message);
      } finally {
        setBusy('');
      }
    },
    [notify],
  );
  const save = useCallback(
    (saveAs = false) =>
      run('Saving project', async () => {
        const s = useEditor.getState(),
          file = await host('saveProject', { project: s.project, saveAs });
        if (file) {
          s.markSaved(file);
          notify('Project saved.');
        }
      }),
    [run, notify],
  );
  function guard(action: () => void) {
    if (editor.dirty && !welcome) {
      setPendingAction(() => action);
      setModal('unsaved');
    } else action();
  }
  const loadBoot = (b: Boot) => {
    setBoot(b);
    editor.load(b);
    setWelcome(false);
    setGameView(false);
    setModal('');
  };
  const newProject = (sample = false) =>
    guard(
      () =>
        void run('Creating project', async () => loadBoot(await host('newProject', { sample }))),
    );
  const openProject = (recent?: string) =>
    guard(
      () =>
        void run('Opening project', async () => {
          const b = await host('openProject', { recent });
          if (b) loadBoot(b);
        }),
    );
  const openGame = () =>
    guard(
      () =>
        void run('Opening game', async () => {
          const s = await host('openGame', null);
          if (s) {
            editor.setSession(s);
            setGameView(true);
            setShowDesigner(false);
            setWelcome(false);
          }
        }),
    );
  const play = () =>
    void run('Starting playtest', async () => {
      const currentIssues = validateProject(project);
      setIssues(currentIssues);
      const blocking = currentIssues.filter((i) => i.severity === 'error');
      if (blocking.length) {
        setBottom(true);
        notify(
          `Fix ${blocking.length} blocking ${blocking.length === 1 ? 'issue' : 'issues'} before playtesting.`,
        );
        return;
      }
      editor.setSession(await host('play', project));
      setPlaytestSource(JSON.stringify(project));
      setShowDesigner(false);
      setGameView(false);
      setWelcome(false);
    });
  const add: AddEntity = (kind, context = {}) => {
    setAddKind(kind);
    setAddContext(context);
    setModal('add');
  };
  const menuAction = useRef<(action: string) => void>(() => {});
  menuAction.current = (action) => {
    switch (action) {
      case 'confirmClose':
        void host('close', {
          project: useEditor.getState().project,
          dirty: useEditor.getState().dirty,
        }).catch((e) => notify(e.message));
        break;
      case 'new':
        newProject();
        break;
      case 'open':
        openProject();
        break;
      case 'openGame':
        openGame();
        break;
      case 'save':
        void save();
        break;
      case 'saveAs':
        void save(true);
        break;
      case 'play':
        play();
        break;
      case 'undo':
        if (session)
          void host('undo', null)
            .then(editor.setSession)
            .catch((e) => notify(e.message));
        else editor.undo();
        break;
      case 'redo':
        if (session)
          void host('redo', null)
            .then(editor.setSession)
            .catch((e) => notify(e.message));
        else editor.redo();
        break;
      case 'map':
        editor.open('map');
        break;
      case 'validate':
        setBottom(true);
        notify(
          errors.length
            ? `${errors.length} blocking issues.`
            : 'Validation complete. No blocking issues.',
        );
        break;
      case 'export':
        void run('Exporting game', async () => {
          const file = await host('exportGame', project);
          if (file) notify(`Game exported to ${file}`);
        });
        break;
      case 'palette':
        setModal('palette');
        break;
      case 'settings':
        setModal('settings');
        break;
      case 'help':
        setModal('help');
        break;
    }
  };
  useEffect(() => {
    const closing = (event: BeforeUnloadEvent) => {
      if (useEditor.getState().dirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', closing);
    return () => window.removeEventListener('beforeunload', closing);
  }, []);
  useEffect(() => window.elsewhen.onMenu((action) => menuAction.current(action)), []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setModal('palette');
      }
      if (e.key === 'Escape') setModal('');
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  const nameOf = (id: string) =>
    id === 'map'
      ? 'World Map'
      : id === 'tests'
        ? 'Story tests'
        : (collections
            .flatMap((c) => project[c] as { id: string; name: string }[])
            .find((e) => e.id === id)?.name ?? 'Removed entity');
  const selectedKind = locate(project, selected);
  const selectedLocation = project.locations.find((l) => l.id === selected);
  const references = deleteId
    ? collections.flatMap((c) =>
        (project[c] as { id: string; name: string }[]).filter(
          (e) => e.id !== deleteId && JSON.stringify(e).includes(`"${deleteId}"`),
        ),
      )
    : [];
  const duplicate = () => {
    if (!selectedKind) return;
    const original = project[selectedKind].find((e) => e.id === selected)!;
    const next = structuredClone(original);
    next.id = crypto.randomUUID();
    next.name += ' copy';
    if ('reverseId' in next) next.reverseId = '';
    editor.edit('Duplicate entity', (p) => {
      (p[selectedKind] as (typeof next)[]).push(next);
    });
    editor.open(next.id);
  };
  function resize(event: React.PointerEvent, which: 'left' | 'right') {
    event.preventDefault();
    const start = event.clientX,
      root = document.documentElement,
      current =
        parseInt(
          getComputedStyle(root).getPropertyValue(
            which === 'left' ? '--sidebar-width' : '--inspector-width',
          ),
        ) || 280;
    const move = (e: PointerEvent) => {
      const size = Math.max(
        which === 'left' ? 190 : 250,
        Math.min(
          which === 'left' ? 400 : 530,
          current + (e.clientX - start) * (which === 'left' ? 1 : -1),
        ),
      );
      root.style.setProperty(
        which === 'left' ? '--sidebar-width' : '--inspector-width',
        `${size}px`,
      );
      localStorage.setItem(`elsewhen-${which}-width`, String(size));
    };
    const end = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
  }
  useEffect(() => {
    for (const [key, variable] of [
      ['left', '--sidebar-width'],
      ['right', '--inspector-width'],
    ]) {
      const size = localStorage.getItem(`elsewhen-${key}-width`);
      if (size) document.documentElement.style.setProperty(variable, `${size}px`);
    }
  }, []);
  if (!boot)
    return (
      <div className="app-loading">
        <Icon name="feather" size={46} />
        <h1>ElseWhen</h1>
        <span>Opening your story studio…</span>
      </div>
    );
  return (
    <div className="app">
      <header className="app-toolbar">
        <button
          className="brand"
          onClick={() => guard(() => setWelcome(true))}
          title="Welcome to ElseWhen"
        >
          <span className="brand-mark">
            <Icon name="feather" size={25} />
          </span>
          <strong>ElseWhen</strong>
          <span className="brand-tag">STORY STUDIO</span>
        </button>
        <div className="toolbar-divider" />
        <button className="project-title" onClick={() => setModal('project')}>
          <Icon name="document" size={17} />
          <span>{project.title}</span>
          {editor.dirty && <i title="Unsaved changes" />}
          <Icon name="down" size={13} />
        </button>
        <div className="toolbar-spacer" />
        <button
          className={`workspace-mode ${!session || showDesigner ? 'active' : ''}`}
          onClick={() => {
            setShowDesigner(true);
            setWelcome(false);
          }}
        >
          <Icon name="layers" size={16} />
          Design
        </button>
        <div className="toolbar-divider" />
        <Button
          icon={theme === 'dark' ? 'sun' : 'moon'}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          onClick={editor.toggleTheme}
        />
        <Button icon="settings" title="Settings" onClick={() => setModal('settings')} />
        {session ? (
          <>
            {showDesigner && (
              <Button icon="play" variant="primary" onClick={() => setShowDesigner(false)}>
                Resume playtest
              </Button>
            )}
            <Button
              icon="reset"
              onClick={() => {
                if (session.debug) play();
                else void host('restart', null).then(editor.setSession);
              }}
            >
              Restart
            </Button>
            <Button
              icon="stop"
              variant="outline"
              onClick={() => {
                void host('stop', null);
                editor.setSession(null);
              }}
            >
              Stop
            </Button>
          </>
        ) : (
          <>
            <Button icon="save" onClick={() => void save()} disabled={!!busy}>
              Save
            </Button>
            <Button icon="play" variant="primary" onClick={play} disabled={!!busy}>
              Playtest
            </Button>
          </>
        )}
      </header>
      {welcome ? (
        <Welcome
          onNew={() => newProject()}
          onSample={() => newProject(true)}
          onOpen={() => openProject()}
          onGame={openGame}
          recent={boot.recent}
          onRecent={openProject}
          drafts={boot.drafts}
          onRecover={(id) =>
            void run('Restoring draft', async () => loadBoot(await host('recoverDraft', id)))
          }
        />
      ) : session && !showDesigner ? (
        <div className={`session-layout ${gameView ? 'full-game' : ''}`}>
          {!gameView && (
            <aside className="playtest-explorer">
              <Explorer />
            </aside>
          )}
          <Player
            key={session.id}
            session={session}
            changed={
              session.debug && !!playtestSource && playtestSource !== JSON.stringify(project)
            }
            gameView={gameView}
            onGameView={setGameView}
            onSettings={() => setModal('settings')}
          />
        </div>
      ) : (
        <main className="designer-layout">
          <aside className="project-explorer">
            <header>
              <span>PROJECT</span>
              <Button icon="plus" title="Add entity" onClick={() => add('locations')} />
            </header>
            <div className="explorer-search">
              <Icon name="search" size={15} />
              <input
                aria-label="Search project"
                placeholder="Search your world…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <kbd>⌘ K</kbd>
            </div>
            <div className="explorer-tree">
              {collections.map((kind) => {
                const entries = project[kind].filter(
                  (e) => !query || JSON.stringify(e).toLowerCase().includes(query.toLowerCase()),
                );
                if (query && !entries.length) return null;
                const isExpanded = expanded.includes(kind) || !!query;
                return (
                  <section key={kind} className={`tree-group ${kind}`}>
                    <div className="tree-group-heading">
                      <button
                        onClick={() =>
                          setExpanded((v) =>
                            v.includes(kind) ? v.filter((k) => k !== kind) : [...v, kind],
                          )
                        }
                      >
                        <Icon name={isExpanded ? 'down' : 'right'} size={13} />
                        <Icon name={kind} size={18} />
                        <strong>{labels[kind]}</strong>
                        <span>{project[kind].length}</span>
                      </button>
                      <button
                        aria-label={`Add ${labels[kind]}`}
                        title={`Add ${labels[kind]}`}
                        onClick={() => add(kind)}
                      >
                        <Icon name="plus" size={14} />
                      </button>
                    </div>
                    {isExpanded && (
                      <div className="tree-items">
                        {entries
                          .slice((pages[kind] ?? 0) * 100, (pages[kind] ?? 0) * 100 + 100)
                          .map((entity) => (
                            <button
                              key={entity.id}
                              className={`tree-item ${selected === entity.id ? 'selected' : ''}`}
                              onClick={() => editor.open(entity.id)}
                            >
                              <Icon name={kind === 'locations' ? 'pin' : kind} size={15} />
                              <span>{entity.name}</span>
                              {entity.id === project.start && (
                                <span className="start-marker" title="Starting location" />
                              )}
                            </button>
                          ))}
                        {entries.length > 100 && (
                          <div className="explorer-pagination">
                            <button
                              disabled={!pages[kind]}
                              onClick={() =>
                                setPages((p) => ({ ...p, [kind]: (p[kind] ?? 0) - 1 }))
                              }
                            >
                              Previous
                            </button>
                            <span>
                              {(pages[kind] ?? 0) + 1} / {Math.ceil(entries.length / 100)}
                            </span>
                            <button
                              disabled={((pages[kind] ?? 0) + 1) * 100 >= entries.length}
                              onClick={() =>
                                setPages((p) => ({ ...p, [kind]: (p[kind] ?? 0) + 1 }))
                              }
                            >
                              Next
                            </button>
                          </div>
                        )}
                        {!entries.length && (
                          <button className="tree-empty" onClick={() => add(kind)}>
                            + Add your first {labels[kind].toLowerCase().replace(/s$/, '')}
                          </button>
                        )}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
            <div className="explorer-bottom">
              <button onClick={() => editor.open('tests')}>
                <Icon name="success" size={17} />
                <span>Story tests</span>
                <Icon name="right" size={13} />
              </button>
              <button onClick={() => setModal('help')}>
                <Icon name="book" size={17} />
                <span>Authoring guide</span>
                <Icon name="external" size={13} />
              </button>
              <button onClick={() => setModal('palette')}>
                <Icon name="command" size={17} />
                <span>Command palette</span>
                <kbd>Ctrl K</kbd>
              </button>
            </div>
            <div className="panel-resizer left" onPointerDown={(e) => resize(e, 'left')} />
          </aside>
          <section className="workspace">
            <nav className="workspace-tabs">
              {editor.tabs.map((id) => (
                <div key={id} className={`workspace-tab ${tab === id ? 'active' : ''}`}>
                  <button onClick={() => editor.open(id)}>
                    <Icon
                      name={id === 'map' ? 'map' : (locate(project, id) ?? 'document')}
                      size={17}
                    />
                    {nameOf(id)}
                  </button>
                  {id !== 'map' && (
                    <button aria-label={`Close ${nameOf(id)}`} onClick={() => editor.closeTab(id)}>
                      <Icon name="x" size={13} />
                    </button>
                  )}
                </div>
              ))}
              <Button icon="plus" title="Add new entity" onClick={() => add('locations')} />
            </nav>
            <div className="workspace-content">
              {tab === 'map' ? (
                <>
                  <div className="map-toolbar">
                    <div>
                      <span className="eyebrow">YOUR STORY, CONNECTED</span>
                      <h2>
                        World map <span>{project.locations.length} locations</span>
                      </h2>
                    </div>
                    <div className="row">
                      <Select
                        label="Map region"
                        value={mapRegion}
                        options={[
                          { value: '', label: 'All regions' },
                          ...Array.from(
                            new Set(project.locations.map((l) => l.region).filter(Boolean)),
                          ).map((region) => ({ value: region, label: region })),
                        ]}
                        onChange={setMapRegion}
                      />
                      <Button icon="plus" onClick={() => add('locations')}>
                        Location
                      </Button>
                      <Button
                        icon="connections"
                        onClick={() => add('connections', { from: selectedLocation?.id })}
                      >
                        Connection
                      </Button>
                      <Button
                        icon="layers"
                        title="Arrange unpinned locations"
                        onClick={() =>
                          editor.edit('Auto arrange map', (p) => {
                            const free = p.locations.filter((l) => !l.pinned);
                            free.forEach((l, i) => {
                              const angle = (i / free.length) * Math.PI * 2;
                              l.position = [
                                Math.cos(angle) * 7,
                                Math.sin(i * 1.7),
                                Math.sin(angle) * 6,
                              ];
                            });
                          })
                        }
                      />
                    </div>
                  </div>
                  <WorldMap
                    nodes={mapNodes}
                    edges={mapEdges}
                    selected={selected}
                    onSelect={editor.select}
                    onOpen={editor.open}
                    onCreate={() => add('locations')}
                    onConnect={(from, to) => add('connections', { from, to })}
                    onMove={(id, position) =>
                      editor.edit('Move map location', (p) => {
                        p.locations.find((l) => l.id === id)!.position = position;
                      })
                    }
                  />
                </>
              ) : tab === 'tests' ? (
                <TestsEditor />
              ) : (
                <EntityEditor key={tab} id={tab} onAdd={add} />
              )}
            </div>
            <section className={`validation-drawer ${bottom ? 'expanded' : ''}`}>
              <button className="drawer-heading" onClick={() => setBottom(!bottom)}>
                <Icon name={errors.length ? 'warning' : 'success'} size={17} />
                <strong>Validation</strong>
                <Badge tone={errors.length ? 'amber' : 'teal'}>{issues.length}</Badge>
                <span>
                  {errors.length
                    ? `${errors.length} blocking issues`
                    : 'Your world is ready to explore'}
                </span>
                <Icon name={bottom ? 'down' : 'chevronUp'} size={15} />
              </button>
              {bottom && (
                <div className="validation-content">
                  {!issues.length ? (
                    <div className="validation-success">
                      <span>
                        <Icon name="check" size={19} />
                      </span>
                      <div>
                        <strong>No issues found</strong>
                        <small>
                          All references and rules are valid. Your next adventure is ready.
                        </small>
                      </div>
                      <Button variant="ghost" icon="play" onClick={play}>
                        Playtest
                      </Button>
                    </div>
                  ) : (
                    issues.map((issue, i) => (
                      <button
                        key={`${issue.code}-${i}`}
                        className="validation-issue"
                        onClick={() => {
                          if (issue.entityId) editor.open(issue.entityId);
                        }}
                      >
                        <Icon name="warning" size={16} />
                        <Badge tone={issue.severity === 'error' ? 'red' : 'amber'}>
                          {issue.severity}
                        </Badge>
                        <span>{issue.message}</span>
                        <Icon name="right" size={14} />
                      </button>
                    ))
                  )}
                </div>
              )}
            </section>
          </section>
          <aside className="context-inspector">
            <div className="panel-resizer right" onPointerDown={(e) => resize(e, 'right')} />
            <Inspector selected={selected} onAdd={add} />
            {selectedKind && (
              <div className="entity-actions">
                <Button icon="copy" variant="ghost small" onClick={duplicate}>
                  Duplicate
                </Button>
                <Button
                  icon="trash"
                  variant="ghost small danger"
                  onClick={() => {
                    setDeleteId(selected);
                    setModal('delete');
                  }}
                >
                  Delete
                </Button>
              </div>
            )}
          </aside>
        </main>
      )}
      <footer className="app-status">
        <span>
          <Icon name={editor.dirty ? 'document' : 'success'} size={15} />
          {busy ||
            (editor.readOnly
              ? 'Read-only'
              : editor.dirty
                ? 'Unsaved changes'
                : 'All changes saved')}
        </span>
        <i />
        <span>
          {session
            ? `Turn ${session.view.turn} · ${session.debug ? 'Playtest' : 'Player'}`
            : welcome
              ? 'A place for every possibility'
              : `${project.locations.length} locations · ${project.objects.length} objects`}
        </span>
        <div className="toolbar-spacer" />
        <button onClick={() => setModal('settings')}>
          <i className="status-dot" />
          {boot.settings.enabled ? 'OpenAI parser enabled' : 'Conventional parser'}
          <Icon name="down" size={13} />
        </button>
        <span className="version">v0.1.0</span>
      </footer>
      {editor.toast && (
        <div className="toast" role="status">
          <Icon name="info" />
          {editor.toast}
          <Button icon="x" title="Dismiss notification" onClick={() => notify('')} />
        </div>
      )}
      {modal === 'add' && (
        <AddDialog
          kind={addKind}
          context={addContext}
          onClose={() => setModal('')}
          onKind={setAddKind}
        />
      )}
      {modal === 'settings' && (
        <SettingsDialog
          onClose={() => setModal('')}
          onSaved={(settings) => setBoot({ ...boot, settings })}
        />
      )}
      {modal === 'project' && (
        <Modal title="Project settings" onClose={() => setModal('')}>
          <div className="modal-body">
            <TextField
              label="Title"
              value={project.title}
              onChange={(title) =>
                editor.edit('Project title', (p) => {
                  p.title = title;
                })
              }
            />
            <div className="form-grid">
              <TextField
                label="Author"
                value={project.author}
                onChange={(author) =>
                  editor.edit('Project author', (p) => {
                    p.author = author;
                  })
                }
              />
              <TextField
                label="Version"
                value={project.version}
                onChange={(version) =>
                  editor.edit('Project version', (p) => {
                    p.version = version;
                  })
                }
              />
            </div>
            <TextField
              label="Introduction"
              multiline
              value={project.intro}
              onChange={(intro) =>
                editor.edit('Project introduction', (p) => {
                  p.intro = intro;
                })
              }
            />
            <Select
              label="Starting location"
              value={project.start}
              options={project.locations.map((l) => ({ value: l.id, label: l.name }))}
              onChange={(start) =>
                editor.edit('Starting location', (p) => {
                  p.start = start;
                })
              }
            />
            <Toggle
              label="Refused physical attempts consume a turn"
              checked={project.failedAttemptsCostTurn}
              onChange={(v) =>
                editor.edit('Turn policy', (p) => {
                  p.failedAttemptsCostTurn = v;
                })
              }
            />
            <div className="modal-footer">
              <Button icon="download" onClick={() => menuAction.current('export')}>
                Export game
              </Button>
              <Button variant="primary" onClick={() => setModal('')}>
                Done
              </Button>
            </div>
          </div>
        </Modal>
      )}
      {modal === 'delete' && (
        <Modal title={`Delete ${nameOf(deleteId)}?`} onClose={() => setModal('')}>
          <div className="modal-body">
            <p>
              {references.length
                ? `${references.length} entities refer to this item. These references will remain as visible draft errors until you repair them.`
                : 'This entity will be removed. You can undo this change.'}
            </p>
            {references.map((r) => (
              <p key={r.id} className="reference-row">
                <Icon name="connections" />
                {r.name}
              </p>
            ))}
            {project.start === deleteId && (
              <p className="error-text">
                This is the starting location. Choose a new start before playtesting.
              </p>
            )}
            <div className="modal-footer">
              <Button onClick={() => setModal('')}>Cancel</Button>
              <Button
                variant="danger-solid"
                onClick={() => {
                  const kind = locate(project, deleteId)!;
                  editor.edit('Delete entity', (p) => {
                    Object.assign(p, { [kind]: p[kind].filter((e) => e.id !== deleteId) });
                  });
                  editor.closeTab(deleteId);
                  editor.select(project.start === deleteId ? '' : project.start);
                  setModal('');
                }}
              >
                Delete entity
              </Button>
            </div>
          </div>
        </Modal>
      )}
      {modal === 'unsaved' && (
        <Modal
          title="Keep your changes?"
          onClose={() => {
            setModal('');
            setPendingAction(null);
          }}
        >
          <div className="modal-body">
            <p>
              Your project has unsaved changes. Save before continuing, or continue with the latest
              recovery snapshot retained.
            </p>
            <div className="modal-footer">
              <Button onClick={() => setModal('')}>Cancel</Button>
              <Button
                onClick={() => {
                  setModal('');
                  pendingAction?.();
                }}
              >
                Continue without saving
              </Button>
              <Button
                variant="primary"
                onClick={() =>
                  void save().then(() => {
                    if (!useEditor.getState().dirty) {
                      setModal('');
                      pendingAction?.();
                    }
                  })
                }
              >
                Save and continue
              </Button>
            </div>
          </div>
        </Modal>
      )}
      {modal === 'palette' && (
        <Palette
          onClose={() => setModal('')}
          onAction={(a) => {
            setModal('');
            menuAction.current(a);
          }}
        />
      )}
      {modal === 'help' && (
        <Modal title="Your first world" onClose={() => setModal('')} wide>
          <div className="modal-body help-content">
            <span className="eyebrow">ELSEWHEN FIELD GUIDE</span>
            <h2>A story begins with a place.</h2>
            <ol>
              <li>
                <strong>Create a location.</strong> Use + beside Locations, give it a name, and
                write what the player sees. Mark it as the starting location.
              </li>
              <li>
                <strong>Connect somewhere new.</strong> Add another location, then choose Connection
                on the map. A two-way link creates a pair of directed exits.
              </li>
              <li>
                <strong>Place something to find.</strong> Create an object, choose its initial
                location, and enable Portable. Use Container and Openable to build a box with
                contents.
              </li>
              <li>
                <strong>Make the world respond.</strong> Create a rule. Choose an action under WHEN,
                conditions under IF, and ordered effects under THEN.
              </li>
              <li>
                <strong>Step into the story.</strong> Press Playtest. Try “look”, “take object”, or
                “go exit”. The Action inspector explains the actual checks and effects.
              </li>
              <li>
                <strong>Share your world.</strong> Save the source project, then export an .elsegame
                package through Project settings or the File menu.
              </li>
            </ol>
            <div className="help-tip">
              <Icon name="info" />
              <p>
                Graph coordinates organize ideas. Only authored connections determine where a player
                can travel. You can build a cave, a dream, or a different century in exactly the
                same way.
              </p>
            </div>
            <h3>Familiar commands</h3>
            <p className="command-examples">
              look · examine object · take object · open container · put item in container · unlock
              gate with key · use tool on target · ask character about topic · say “words” to target
              · wait
            </p>
            <p>
              Try the sample from the welcome screen for a complete short adventure. Use 2D mode if
              3D graphics are unavailable. Ctrl+K opens navigation and commands.
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}
function Welcome({
  onNew,
  onSample,
  onOpen,
  onGame,
  recent,
  onRecent,
  drafts,
  onRecover,
}: {
  onNew: () => void;
  onSample: () => void;
  onOpen: () => void;
  onGame: () => void;
  recent: string[];
  onRecent: (p: string) => void;
  drafts: Boot['drafts'];
  onRecover: (id: string) => void;
}) {
  return (
    <main className="welcome">
      <div className="welcome-orbit orbit-one" />
      <div className="welcome-orbit orbit-two" />
      <div className="welcome-content">
        <span className="eyebrow">A PLACE FOR EVERY POSSIBILITY</span>
        <h1>
          Somewhere.
          <br />
          Somewhen.
          <br />
          <em>Your world.</em>
        </h1>
        <p>
          Build places that couldn’t exist. Write stories that could only be yours. Bring them
          together in ElseWhen.
        </p>
        <div className="row">
          <Button icon="plus" variant="primary large" onClick={onNew}>
            Create a world
          </Button>
          <Button icon="folder" variant="large" onClick={onOpen}>
            Open project
          </Button>
        </div>
        <div className="welcome-links">
          <button onClick={onGame}>
            <Icon name="play" size={16} />
            Open a game
          </button>
          <span>No account needed. Your worlds stay local.</span>
        </div>
        {recent.length > 0 && (
          <div className="recent-projects">
            <h4>RECENT PROJECTS</h4>
            {recent.slice(0, 4).map((p) => (
              <button key={p} onClick={() => onRecent(p)}>
                <Icon name="document" />
                <span>
                  {p.split(/[\\/]/).at(-1)}
                  <small>{p}</small>
                </span>
                <Icon name="arrow" />
              </button>
            ))}
          </div>
        )}
        {drafts.length > 0 && (
          <div className="recent-projects">
            <h4>RECOVER UNSAVED WORK</h4>
            {drafts.map((d) => (
              <button key={d.id} onClick={() => onRecover(d.id)}>
                <Icon name="document" />
                <span>
                  {d.title}
                  <small>Recovered draft · never saved to a project file</small>
                </span>
                <Icon name="arrow" />
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="welcome-sample">
        <div className="sample-art">
          <div className="sample-portal">
            <span />
            <span />
            <span />
            <Icon name="orbit" size={62} />
          </div>
          <div className="sample-star s1" />
          <div className="sample-star s2" />
          <div className="sample-star s3" />
          <div className="sample-line l1" />
          <div className="sample-line l2" />
          <div className="sample-node n1">
            <Icon name="gem" />
            Crystal Cavern
          </div>
          <div className="sample-node n2">
            <Icon name="telescope" />
            Observatory
          </div>
          <span className="sample-overline">AN ELSEWHEN ADVENTURE</span>
        </div>
        <div className="sample-copy">
          <Badge tone="purple">Included sample world</Badge>
          <h2>The Folded Horizon</h2>
          <p>Seven impossible places. A name written between the stars. Somewhere, a way home.</p>
          <button onClick={onSample}>
            Explore the sample <Icon name="arrow" />
          </button>
          <small>Open in the designer · Play offline · Make it your own</small>
        </div>
      </div>
    </main>
  );
}
function Inspector({ selected, onAdd }: { selected: string; onAdd: AddEntity }) {
  const p = useEditor((s) => s.project),
    edit = useEditor((s) => s.edit),
    open = useEditor((s) => s.open),
    kind = locate(p, selected),
    location = p.locations.find((l) => l.id === selected),
    object = p.objects.find((o) => o.id === selected),
    rule = p.rules.find((r) => r.id === selected),
    entity = kind ? p[kind].find((e) => e.id === selected) : undefined;
  const update = (key: string, value: unknown) =>
    edit(`inspector:${selected}:${key}`, (p) =>
      Object.assign(
        p[kind!].find((e) => e.id === selected)!,
        { [key]: value },
      ),
    );
  return (
    <>
      <header className="inspector-title">
        <span>
          {location
            ? 'LOCATION'
            : rule
              ? 'RULE PROPERTIES'
              : kind
                ? labels[kind].toUpperCase()
                : 'WORLD OVERVIEW'}
        </span>
        <Icon name="more" size={17} />
      </header>
      {entity ? (
        <>
          <div className="inspector-identity">
            <span
              className={`entity-emblem ${kind}`}
              style={location ? { color: location.color } : undefined}
            >
              <Icon name={location?.icon ?? kind!} size={28} />
            </span>
            <div>
              <h2>{entity.name}</h2>
              <Badge tone={location ? 'purple' : 'neutral'}>
                {location?.category ??
                  (rule
                    ? rule.phase
                    : object?.capabilities.includes('container')
                      ? 'Container'
                      : labels[kind!].replace(/s$/, ''))}
              </Badge>
            </div>
          </div>
          <div className="inspector-fields">
            <TextField label="Name" value={entity.name} onChange={(v) => update('name', v)} />
            {location && (
              <>
                <TextField
                  label="Region"
                  value={location.region}
                  onChange={(v) => update('region', v)}
                  placeholder="No region"
                />
                <TextField
                  label="Description"
                  multiline
                  value={location.description}
                  onChange={(v) => update('description', v)}
                />
                <Field label="Map color">
                  <Colors value={location.color} onChange={(v) => update('color', v)} />
                </Field>
                <div className="form-grid three">
                  {location.position.map((v, i) => (
                    <TextField
                      key={i}
                      label={['X', 'Y', 'Z'][i]}
                      type="number"
                      value={Number(v.toFixed(2))}
                      onChange={(value) =>
                        update(
                          'position',
                          location.position.map((v, j) => (i === j ? Number(value) : v)),
                        )
                      }
                    />
                  ))}
                </div>
                <Toggle
                  label="Pin map position"
                  checked={location.pinned}
                  onChange={(v) => update('pinned', v)}
                />
              </>
            )}
            {rule && (
              <>
                <Select
                  label="Scope"
                  value={rule.scope}
                  options={[
                    { value: '', label: 'Global' },
                    ...[...p.locations, ...p.objects, ...p.characters].map((e) => ({
                      value: e.id,
                      label: e.name,
                    })),
                  ]}
                  onChange={(v) => update('scope', v)}
                />
                <TextField
                  label="Priority"
                  type="number"
                  value={rule.priority}
                  onChange={(v) => update('priority', Number(v))}
                />
                <Toggle label="Run once" checked={rule.once} onChange={(v) => update('once', v)} />
                <p className="hint">
                  Higher priority runs first. Ties use author order, then stable ID.
                </p>
              </>
            )}
            {object && (
              <div className="summary-grid">
                <span>Placement</span>
                <strong>
                  {[...p.locations, ...p.objects, ...p.characters].find(
                    (e) => e.id === object.placement.id,
                  )?.name ?? object.placement.kind}
                </strong>
                <span>State</span>
                <strong>{object.open ? 'Open' : 'Closed'}</strong>
                <span>Lock</span>
                <strong>{object.locked ? 'Locked' : 'Unlocked'}</strong>
                <span>Contents</span>
                <strong>{p.objects.filter((o) => o.placement.id === selected).length} items</strong>
              </div>
            )}
          </div>
          {location && (
            <Section
              title="Connections"
              icon="connections"
              action={
                <Button
                  icon="plus"
                  title="Add connection"
                  onClick={() => onAdd('connections', { from: selected })}
                />
              }
            >
              <div className="inspector-connections">
                {p.connections
                  .filter((c) => c.from === selected)
                  .map((c) => (
                    <button key={c.id} onClick={() => open(c.id)}>
                      <span className={`connection-dot ${c.kind === 'wormhole' ? 'purple' : ''}`} />
                      <span>{c.name}</span>
                      <Icon name="arrow" size={14} />
                      <small>{p.locations.find((l) => l.id === c.to)?.name ?? 'Missing'}</small>
                    </button>
                  ))}
                {!p.connections.some((c) => c.from === selected) && (
                  <p className="empty-note">No outgoing connections yet.</p>
                )}
              </div>
            </Section>
          )}
          {(location || object?.capabilities.includes('container')) && (
            <Section title="Contents" icon="objects">
              <Contents parent={selected} onAdd={onAdd} />
            </Section>
          )}
          <div className="inspector-open">
            <Button icon="document" variant="outline" onClick={() => open(selected)}>
              Open {rule ? 'rule' : 'entity'} editor
            </Button>
          </div>
          <Section title="References" icon="connections">
            <div className="reference-list">
              {collections
                .flatMap((c) =>
                  (p[c] as { id: string; name: string }[]).filter(
                    (e) => e.id !== selected && JSON.stringify(e).includes(`"${selected}"`),
                  ),
                )
                .slice(0, 12)
                .map((e) => (
                  <button key={e.id} onClick={() => open(e.id)}>
                    <Icon name={locate(p, e.id) ?? 'connections'} size={16} />
                    {e.name}
                    <Icon name="right" size={13} />
                  </button>
                ))}
            </div>
          </Section>
        </>
      ) : (
        <div className="empty-state">
          <Icon name="map" size={38} />
          <h3>A world of possibilities.</h3>
          <p>Select a place on the map to edit its story and connections.</p>
          <Button variant="outline" icon="plus" onClick={() => onAdd('locations')}>
            Add location
          </Button>
        </div>
      )}
    </>
  );
}
function Explorer() {
  const p = useEditor((s) => s.project);
  return (
    <>
      <header>PROJECT SNAPSHOT</header>
      {['locations', 'objects', 'rules'].map((c) => (
        <section key={c}>
          <h4>
            <Icon name={c} />
            {labels[c as Collection]}
          </h4>
          {p[c as Collection].map((e) => (
            <span key={e.id}>
              <Icon name={c} size={14} />
              {e.name}
            </span>
          ))}
        </section>
      ))}
    </>
  );
}
function AddDialog({
  kind,
  context,
  onClose,
  onKind,
}: {
  kind: Collection;
  context: AddContext;
  onClose: () => void;
  onKind: (k: Collection) => void;
}) {
  const p = useEditor((s) => s.project),
    edit = useEditor((s) => s.edit),
    open = useEditor((s) => s.open),
    [name, setName] = useState(''),
    [from, setFrom] = useState(context.from ?? p.start),
    [to, setTo] = useState(context.to ?? p.locations.find((l) => l.id !== from)?.id ?? p.start),
    [twoWay, setTwoWay] = useState(true);
  const create = () => {
    if (!name.trim()) return;
    const id = crypto.randomUUID(),
      base = { id, name: name.trim() };
    edit(`Create ${kind}`, (p) => {
      switch (kind) {
        case 'locations':
          p.locations.push(
            locationSchema.parse({
              ...base,
              position: [(p.locations.length % 4) * 5, 0, Math.floor(p.locations.length / 4) * 5],
            }),
          );
          break;
        case 'objects':
          p.objects.push(
            objectSchema.parse({
              ...base,
              placement: context.placement ?? { kind: 'location', id: from },
              capabilities: ['portable'],
            }),
          );
          break;
        case 'characters':
          p.characters.push(characterSchema.parse({ ...base, location: from }));
          break;
        case 'connections': {
          const reverseId = twoWay ? crypto.randomUUID() : '';
          p.connections.push(connectionSchema.parse({ ...base, from, to, reverseId }));
          if (twoWay)
            p.connections.push(
              connectionSchema.parse({ ...base, id: reverseId, from: to, to: from, reverseId: id }),
            );
          break;
        }
        case 'rules':
          p.rules.push(ruleSchema.parse({ ...base, scope: context.from ?? '' }));
          break;
        case 'variables':
          p.variables.push(variableSchema.parse({ ...base, type: 'boolean', initial: false }));
          break;
        case 'actions':
          p.actions.push(actionSchema.parse({ ...base, aliases: [name.trim().toLowerCase()] }));
          break;
        case 'templates':
          p.templates.push(templateSchema.parse(base));
      }
    });
    open(id);
    onClose();
  };
  return (
    <Modal title="Add to your world" onClose={onClose}>
      <form
        className="modal-body"
        onSubmit={(e) => {
          e.preventDefault();
          create();
        }}
      >
        <Select
          label="Entity type"
          value={kind}
          options={collections.map((c) => ({ value: c, label: labels[c] }))}
          onChange={(v) => onKind(v as Collection)}
        />
        <Field label="Name">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={
              kind === 'locations'
                ? 'The place between…'
                : kind === 'objects'
                  ? 'A curious object…'
                  : 'Give it a name'
            }
            required
          />
        </Field>
        {['connections', 'objects', 'characters'].includes(kind) && !context.placement && (
          <Select
            label={kind === 'connections' ? 'From' : 'Initial location'}
            value={from}
            options={p.locations.map((l) => ({ value: l.id, label: l.name }))}
            onChange={setFrom}
          />
        )}{' '}
        {kind === 'connections' && (
          <>
            <Select
              label="Destination"
              value={to}
              options={p.locations.map((l) => ({ value: l.id, label: l.name }))}
              onChange={setTo}
            />
            <Toggle label="Create a two-way connection" checked={twoWay} onChange={setTwoWay} />
            <p className="hint">
              Creates two directed exits. Each side can have its own conditions and aliases.
            </p>
          </>
        )}
        <div className="modal-footer">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" icon="plus" variant="primary" disabled={!name.trim()}>
            Create
          </Button>
        </div>
      </form>
    </Modal>
  );
}
function SettingsDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (s: Settings) => void;
}) {
  const [settings, setSettings] = useState<Settings | null>(null),
    [remember, setRemember] = useState(true),
    [status, setStatus] = useState(''),
    [working, setWorking] = useState(false),
    key = useRef<HTMLInputElement>(null);
  useEffect(() => {
    host('settings', null).then(setSettings);
  }, []);
  const save = async () => {
    if (!settings) return;
    setWorking(true);
    try {
      const next = await host('updateSettings', {
        model: settings.model,
        enabled: settings.enabled,
        timeout: settings.timeout,
        key: key.current?.value || undefined,
        remember,
      });
      if (key.current) key.current.value = '';
      setSettings(next);
      onSaved(next);
      setStatus('Settings saved.');
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setWorking(false);
    }
  };
  return (
    <Modal title="Preferences & parser" onClose={onClose}>
      <div className="modal-body">
        {settings && (
          <>
            <div className="settings-intro">
              <span className="brand-mark">
                <Icon name="feather" />
              </span>
              <div>
                <h3>Your words. Your world.</h3>
                <p>
                  Conventional commands always work offline. Enable OpenAI to interpret natural
                  phrasing.
                </p>
              </div>
            </div>
            <Toggle
              label="Enable OpenAI interpretation"
              checked={settings.enabled}
              onChange={(enabled) => setSettings({ ...settings, enabled })}
            />
            <Field
              label="OpenAI API key"
              hint={
                settings.hasKey
                  ? `A key is configured · ${settings.storage === 'protected' ? 'OS-protected storage available' : 'Session-only storage'}`
                  : 'Keys are kept by the desktop host and are never included in projects or exported games.'
              }
            >
              <input
                ref={key}
                type="password"
                autoComplete="off"
                placeholder={settings.hasKey ? 'Enter a replacement key' : 'sk-…'}
              />
            </Field>
            <Toggle
              label="Remember key with OS protection"
              checked={remember}
              onChange={setRemember}
              hint={
                settings.storage === 'session'
                  ? 'Protected storage is unavailable. Credentials will last for this session only.'
                  : undefined
              }
            />
            <div className="form-grid">
              <TextField
                label="Model ID"
                value={settings.model}
                onChange={(model) => setSettings({ ...settings, model })}
              />
              <TextField
                label="Timeout (seconds)"
                type="number"
                value={settings.timeout}
                onChange={(v) => setSettings({ ...settings, timeout: Number(v) })}
              />
            </div>
            <p className="privacy-note">
              <Icon name="lock" size={16} />
              When enabled, unrecognized commands and relevant player-visible context are sent to
              OpenAI. Hidden world data and private author notes are excluded. API usage is billed
              by your provider.
            </p>
            <div className="row">
              <Button
                icon="play"
                disabled={working}
                onClick={() => {
                  setWorking(true);
                  host('testConnection', null)
                    .then(setStatus)
                    .catch((e) => setStatus(e.message))
                    .finally(() => setWorking(false));
                }}
              >
                Test saved connection
              </Button>
              <Button
                variant="ghost danger"
                disabled={!settings.hasKey}
                onClick={() =>
                  void host('updateSettings', {
                    model: settings.model,
                    enabled: false,
                    timeout: settings.timeout,
                    removeKey: true,
                  }).then((s) => {
                    setSettings(s);
                    onSaved(s);
                    setStatus('Key removed.');
                  })
                }
              >
                Remove key
              </Button>
            </div>
            {status && (
              <p className="settings-result" role="status">
                {status}
              </p>
            )}
            <div className="modal-footer">
              <Button onClick={onClose}>Close</Button>
              <Button variant="primary" icon="save" disabled={working} onClick={() => void save()}>
                Save preferences
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
function Palette({ onClose, onAction }: { onClose: () => void; onAction: (a: string) => void }) {
  const [query, setQuery] = useState(''),
    p = useEditor((s) => s.project),
    open = useEditor((s) => s.open);
  const commands = [
    ['new', 'New project'],
    ['open', 'Open project'],
    ['save', 'Save project'],
    ['play', 'Start playtest'],
    ['export', 'Export game'],
    ['settings', 'Preferences & parser'],
    ['help', 'Authoring guide'],
  ];
  return (
    <Modal title="Go anywhere" onClose={onClose}>
      <div className="modal-body">
        <Field label="Find an entity or command">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your world…"
          />
        </Field>
        <div className="palette-results">
          {commands
            .filter(([, name]) => name.toLowerCase().includes(query.toLowerCase()))
            .map(([id, name]) => (
              <button key={id} onClick={() => onAction(id)}>
                <Icon name="command" />
                {name}
              </button>
            ))}
          {collections
            .flatMap((c) =>
              p[c]
                .filter((e) => JSON.stringify(e).toLowerCase().includes(query.toLowerCase()))
                .map((e) => ({ id: e.id, name: e.name, kind: c })),
            )
            .slice(0, 60)
            .map((e) => (
              <button
                key={e.id}
                onClick={() => {
                  open(e.id);
                  onClose();
                }}
              >
                <Icon name={e.kind} />
                {e.name}
                <small>{labels[e.kind]}</small>
              </button>
            ))}
        </div>
      </div>
    </Modal>
  );
}
