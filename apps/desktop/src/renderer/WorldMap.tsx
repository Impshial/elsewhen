import {
  Component,
  Suspense,
  useMemo,
  useRef,
  useState,
  useEffect,
  useLayoutEffect,
  type ReactNode,
  type RefObject,
} from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Html, Line, Grid, TransformControls } from '@react-three/drei';
import {
  Quaternion,
  Vector3,
  Color,
  Object3D,
  BufferGeometry,
  Float32BufferAttribute,
  type Mesh,
  type InstancedMesh,
} from 'three';
import type { MapNode, MapEdge } from '../../../../packages/domain/src/index';
import { Button, Icon } from './components';
type Props = {
  nodes: MapNode[];
  edges: MapEdge[];
  selected: string;
  onSelect: (id: string, additive?: boolean) => void;
  onOpen?: (id: string) => void;
  onMove?: (id: string, position: [number, number, number]) => void;
  compact?: boolean;
  current?: string;
  onCreate?: () => void;
  onConnect?: (from: string, to?: string) => void;
  multi?: string[];
};
class MapBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
function NodeCard({
  node,
  selected,
  onSelect,
  onOpen,
}: {
  node: MapNode;
  selected: boolean;
  onSelect: (additive?: boolean) => void;
  onOpen?: () => void;
}) {
  return (
    <button
      className={`map-node ${selected ? 'selected' : ''} ${node.unknown ? 'unknown' : ''}`}
      style={{ '--node-color': node.color } as React.CSSProperties}
      onClick={(e) => onSelect(e.ctrlKey || e.metaKey)}
      onDoubleClick={onOpen}
      aria-label={`Location ${node.name}`}
    >
      <span className="node-symbol">
        <Icon name={node.icon} size={28} />
      </span>
      <span>
        <strong>{node.name}</strong>
        <small>{node.category}</small>
      </span>
      {selected && <span className="node-dot" />}
    </button>
  );
}
function DenseGraph({
  nodes,
  edges,
  selected,
  onSelect,
  onOpen,
  portal,
  multi = [],
}: Pick<Props, 'nodes' | 'edges' | 'selected' | 'onSelect' | 'onOpen' | 'multi'> & {
  portal: RefObject<HTMLElement>;
}) {
  const mesh = useRef<InstancedMesh>(null!),
    arrows = useRef<InstancedMesh>(null!);
  const data = useMemo(() => {
    const byId = new Map(nodes.map((n) => [n.id, n])),
      positions: number[] = [],
      colors: number[] = [],
      links: MapEdge[] = [],
      arrows: { position: Vector3; rotation: Quaternion; color: Color }[] = [];
    for (const edge of edges) {
      const from = byId.get(edge.from),
        to = byId.get(edge.to);
      if (!from || !to) continue;
      const start = new Vector3(...from.position),
        end = new Vector3(...to.position),
        delta = end.clone().sub(start),
        side = new Vector3(-delta.z, 0, delta.x).normalize().multiplyScalar(0.6),
        mid = start.clone().lerp(end, 0.5).add(side),
        color = new Color(['wormhole', 'rift'].includes(edge.kind) ? '#a87cda' : '#589cc4');
      if (edge.concealed || edge.enabled === false) color.multiplyScalar(0.45);
      const points = Array.from({ length: 13 }, (_, i) => {
        const t = i / 12;
        return edge.from === edge.to
          ? start
              .clone()
              .add(
                new Vector3(
                  Math.sin(t * Math.PI * 2) * 1.8,
                  0,
                  (1 - Math.cos(t * Math.PI * 2)) * 1.8,
                ),
              )
          : start
              .clone()
              .multiplyScalar((1 - t) ** 2)
              .add(mid.clone().multiplyScalar(2 * (1 - t) * t))
              .add(end.clone().multiplyScalar(t * t));
      });
      for (let i = 0; i < 12; i++) {
        positions.push(...points[i].toArray(), ...points[i + 1].toArray());
        colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
      }
      arrows.push({
        position: points[9],
        rotation: new Quaternion().setFromUnitVectors(
          new Vector3(0, 1, 0),
          points[10].clone().sub(points[9]).normalize(),
        ),
        color,
      });
      links.push(edge);
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
    return { geometry, links, arrows };
  }, [nodes, edges]);
  useEffect(() => () => data.geometry.dispose(), [data]);
  useLayoutEffect(() => {
    const object = new Object3D();
    nodes.forEach((node, i) => {
      object.position.set(...node.position);
      object.scale.setScalar(node.id === selected || multi.includes(node.id) ? 1.4 : 1);
      object.updateMatrix();
      mesh.current.setMatrixAt(i, object.matrix);
      mesh.current.setColorAt(i, new Color(node.color));
    });
    mesh.current.instanceMatrix.needsUpdate = true;
    if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true;
    mesh.current.computeBoundingSphere();
    data.arrows.forEach((arrow, i) => {
      object.position.copy(arrow.position);
      object.scale.setScalar(1);
      object.quaternion.copy(arrow.rotation);
      object.updateMatrix();
      arrows.current.setMatrixAt(i, object.matrix);
      arrows.current.setColorAt(i, arrow.color);
    });
    if (data.arrows.length) {
      arrows.current.instanceMatrix.needsUpdate = true;
      if (arrows.current.instanceColor) arrows.current.instanceColor.needsUpdate = true;
      arrows.current.computeBoundingSphere();
    }
  }, [nodes, data, selected, multi]);
  const node = nodes.find((n) => n.id === selected);
  return (
    <>
      <instancedMesh
        ref={mesh}
        args={[undefined, undefined, nodes.length]}
        onClick={(event) => {
          event.stopPropagation();
          if (event.instanceId !== undefined)
            onSelect(nodes[event.instanceId].id, event.ctrlKey || event.metaKey);
        }}
        onDoubleClick={(event) => {
          if (event.instanceId !== undefined) onOpen?.(nodes[event.instanceId].id);
        }}
      >
        <sphereGeometry args={[0.2, 8, 6]} />
        <meshBasicMaterial />
      </instancedMesh>
      <lineSegments
        geometry={data.geometry}
        onClick={(event) => {
          event.stopPropagation();
          const edge = data.links[Math.floor((event.index ?? 0) / 24)];
          if (edge) onSelect(edge.id);
        }}
      >
        <lineBasicMaterial vertexColors />
      </lineSegments>
      <instancedMesh
        ref={arrows}
        args={[undefined, undefined, data.arrows.length]}
        onClick={(event) => {
          event.stopPropagation();
          if (event.instanceId !== undefined) onSelect(data.links[event.instanceId].id);
        }}
      >
        <coneGeometry args={[0.09, 0.3, 5]} />
        <meshBasicMaterial />
      </instancedMesh>
      {node && (
        <Html
          portal={portal}
          position={[node.position[0], node.position[1] + 0.4, node.position[2]]}
          center
        >
          <NodeCard
            node={node}
            selected
            onSelect={() => onSelect(node.id)}
            onOpen={() => onOpen?.(node.id)}
          />
        </Html>
      )}
    </>
  );
}
function Map3D({
  nodes,
  edges,
  selected,
  onSelect,
  onOpen,
  view,
  reset,
  portal,
  focus,
  moving,
  snap,
  onMove,
  multi = [],
}: {
  portal: RefObject<HTMLElement>;
  nodes: MapNode[];
  edges: MapEdge[];
  selected: string;
  onSelect: Props['onSelect'];
  onOpen?: Props['onOpen'];
  view: string;
  reset: number;
  focus: string[];
  moving: boolean;
  snap: boolean;
  onMove?: Props['onMove'];
  multi?: string[];
}) {
  const moveTarget = useRef<Mesh>(null!);
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const focusNodes = useMemo(
    () => (focus.length ? nodes.filter((n) => focus.includes(n.id)) : nodes),
    [nodes, focus],
  );
  const center = useMemo(() => {
    const sum = focusNodes.reduce((sum, n) => sum.add(new Vector3(...n.position)), new Vector3());
    return sum.divideScalar(focusNodes.length || 1);
  }, [focusNodes]);
  const distance = Math.max(
    12,
    ...focusNodes.map((n) => new Vector3(...n.position).distanceTo(center) * 2.5),
  );
  const camera: [number, number, number] =
    view === 'Top'
      ? [center.x, center.y + distance, center.z + 0.01]
      : view === 'Front'
        ? [center.x, center.y + 1, center.z + distance]
        : view === 'Side'
          ? [center.x + distance, center.y, center.z]
          : [center.x, center.y + distance * 0.5, center.z + distance * 0.82];
  return (
    <Canvas
      key={`${view}-${reset}`}
      camera={{
        position: camera,
        fov: 40,
        near: 0.1,
        far: 10000,
        zoom: view === '3D' ? 1 : 660 / distance,
      }}
      orthographic={view !== '3D'}
      dpr={[1, 1.5]}
      gl={{ antialias: true, alpha: true }}
    >
      <ambientLight intensity={1.5} />
      <directionalLight position={[2, 10, 3]} intensity={2} />
      <Grid
        position={[0, -2.5, 0]}
        args={[100, 100]}
        cellSize={1}
        sectionSize={5}
        cellColor="#497079"
        sectionColor="#497079"
        cellThickness={0.35}
        sectionThickness={0.5}
        fadeDistance={40}
        fadeStrength={2}
      />
      {nodes.length >= 150 && (
        <DenseGraph
          nodes={nodes}
          edges={edges}
          selected={selected}
          onSelect={onSelect}
          onOpen={onOpen}
          portal={portal}
          multi={multi}
        />
      )}
      {nodes.length < 150 &&
        edges.map((e, i) => {
          const from = byId.get(e.from),
            to = byId.get(e.to);
          if (!from || !to) return null;
          const a = new Vector3(...from.position),
            b = new Vector3(...to.position),
            delta = b.clone().sub(a),
            side = new Vector3(-delta.z, 0, delta.x)
              .normalize()
              .multiplyScalar(0.55 + (i % 2) * 0.2),
            mid = a.clone().lerp(b, 0.5).add(side);
          const loop = e.from === e.to;
          const points = Array.from({ length: 25 }, (_, i) => {
            const t = i / 24;
            if (loop)
              return a
                .clone()
                .add(
                  new Vector3(
                    Math.sin(t * Math.PI * 2) * 1.8,
                    0,
                    (1 - Math.cos(t * Math.PI * 2)) * 1.8,
                  ),
                );
            return a
              .clone()
              .multiplyScalar((1 - t) ** 2)
              .add(mid.clone().multiplyScalar(2 * (1 - t) * t))
              .add(b.clone().multiplyScalar(t * t));
          });
          const purple = ['wormhole', 'rift'].includes(e.kind);
          return (
            <group key={e.id}>
              <Line
                points={points}
                color={purple ? '#ae7aea' : '#4b9fca'}
                lineWidth={selected === e.id ? 3 : 1.4}
                dashed={e.concealed || e.enabled === false}
                dashSize={0.15}
                gapSize={0.1}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelect(e.id);
                }}
                onDoubleClick={(event) => {
                  event.stopPropagation();
                  onOpen?.(e.id);
                }}
              />
              <mesh
                position={points[19]}
                quaternion={new Quaternion().setFromUnitVectors(
                  new Vector3(0, 1, 0),
                  points[20].clone().sub(points[19]).normalize(),
                )}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelect(e.id);
                }}
              >
                <coneGeometry args={[0.11, 0.35, 8]} />
                <meshBasicMaterial color={purple ? '#ae7aea' : '#4b9fca'} />
              </mesh>
              {nodes.length < 80 && i % 2 === 0 && (
                <Html
                  portal={portal}
                  position={mid.toArray()}
                  center
                  zIndexRange={[2, 0]}
                  style={{ pointerEvents: 'none' }}
                >
                  <span className={`edge-label ${purple ? 'purple' : ''}`}>{e.name}</span>
                </Html>
              )}
            </group>
          );
        })}
      {nodes.length < 150 &&
        nodes.map((n) => (
          <group key={n.id} position={n.position}>
            <mesh position={[0, -0.37, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.28, 0.36, 40]} />
              <meshBasicMaterial color={n.color} transparent opacity={0.65} />
            </mesh>
            <mesh position={[0, -0.4, 0]}>
              <cylinderGeometry args={[0.37, 0.28, 0.08, 24]} />
              <meshStandardMaterial color="#243d4a" metalness={0.7} roughness={0.3} />
            </mesh>
            {nodes.length < 150 || n.id === selected ? (
              <Html portal={portal} center position={[0, 0.25, 0]} zIndexRange={[8, 3]}>
                <NodeCard
                  node={n}
                  selected={selected === n.id || multi.includes(n.id)}
                  onSelect={(additive) => onSelect(n.id, additive)}
                  onOpen={() => onOpen?.(n.id)}
                />
              </Html>
            ) : (
              <mesh onClick={() => onSelect(n.id)}>
                <sphereGeometry args={[0.25, 8, 8]} />
                <meshBasicMaterial color={n.color} />
              </mesh>
            )}
          </group>
        ))}
      {moving && byId.has(selected) && onMove && (
        <group key={`${selected}-${reset}`}>
          <mesh ref={moveTarget} position={byId.get(selected)!.position}>
            <sphereGeometry args={[0.16, 8, 8]} />
            <meshBasicMaterial color="#2fc5c6" />
          </mesh>
          <TransformControls
            object={moveTarget}
            mode="translate"
            translationSnap={snap ? 1 : null}
            onMouseUp={() => {
              if (moveTarget.current)
                onMove(selected, moveTarget.current.position.toArray() as [number, number, number]);
            }}
          />
        </group>
      )}
      <OrbitControls
        target={center}
        makeDefault
        enableDamping={false}
        minDistance={4}
        maxDistance={5000}
        maxPolarAngle={Math.PI * 0.85}
      />
    </Canvas>
  );
}
function FlatMap({
  nodes,
  edges,
  selected,
  onSelect,
  onOpen,
  onMove,
  multi = [],
  focus = [],
}: Props & { focus?: string[] }) {
  const svg = useRef<SVGSVGElement>(null);
  const [zoom, setZoom] = useState(1);
  const focused = focus.length ? nodes.filter((n) => focus.includes(n.id)) : nodes;
  const basis = focused.length ? focused : nodes;
  const minX = basis.length ? Math.min(...basis.map((n) => n.position[0] - 4)) : -9,
    maxX = basis.length ? Math.max(...basis.map((n) => n.position[0] + 4)) : 9,
    minZ = basis.length ? Math.min(...basis.map((n) => n.position[2] - 3)) : -8,
    maxZ = basis.length ? Math.max(...basis.map((n) => n.position[2] + 3)) : 9;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const coords = (n: MapNode) => [
    ((n.position[0] - minX) / (maxX - minX)) * 1000,
    ((n.position[2] - minZ) / (maxZ - minZ)) * 680,
  ];
  return (
    <div className="flat-map">
      <svg
        ref={svg}
        viewBox={`0 0 ${1000 / zoom} ${680 / zoom}`}
        aria-label="2D world graph"
        onWheel={(e) => setZoom((z) => Math.max(0.6, Math.min(2, z - e.deltaY * 0.001)))}
      >
        <defs>
          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
          </marker>
          <pattern id="dots" width="28" height="28" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="0.7" fill="var(--border)" />
          </pattern>
        </defs>
        <rect width="2000" height="1500" fill="url(#dots)" />
        {edges.map((e, i) => {
          const a = byId.get(e.from),
            b = byId.get(e.to);
          if (!a || !b) return null;
          const [x1, y1] = coords(a),
            [x2, y2] = coords(b),
            dx = x2 - x1,
            dy = y2 - y1,
            d = Math.hypot(dx, dy) || 1,
            cx = (x1 + x2) / 2 - (dy / d) * 35,
            cy = (y1 + y2) / 2 + (dx / d) * 35;
          return (
            <g key={e.id}>
              <path
                d={
                  e.from === e.to
                    ? `M ${x1 + 80} ${y1} C ${x1 + 220} ${y1 - 150} ${x1 - 220} ${y1 - 150} ${x1 - 80} ${y1}`
                    : `M ${x1} ${y1} Q ${cx} ${cy} ${x2 - (dx / d) * 95} ${y2 - (dy / d) * 40}`
                }
                stroke={['wormhole', 'rift'].includes(e.kind) ? '#a87cda' : '#589cc4'}
                strokeWidth={selected === e.id ? 4 : 2}
                onClick={() => onSelect(e.id)}
                onDoubleClick={() => onOpen?.(e.id)}
                style={{ cursor: 'pointer' }}
                fill="none"
                markerEnd="url(#arrow)"
                strokeDasharray={e.concealed || e.enabled === false ? '6 5' : undefined}
              />
              {nodes.length < 150 && i % 2 === 0 && (
                <text x={cx} y={cy - 8} className="svg-edge-label" textAnchor="middle">
                  {e.name}
                </text>
              )}
            </g>
          );
        })}
        {nodes.map((n) => {
          const [x, y] = coords(n);
          if (nodes.length >= 150 && n.id !== selected && !multi.includes(n.id))
            return (
              <circle
                key={n.id}
                cx={x}
                cy={y}
                r={4}
                fill={n.color}
                onClick={(e) => onSelect(n.id, e.ctrlKey || e.metaKey)}
                onDoubleClick={() => onOpen?.(n.id)}
              >
                <title>{n.name}</title>
              </circle>
            );
          return (
            <foreignObject
              key={n.id}
              x={x - 98}
              y={y - 32}
              width={196}
              height={78}
              onPointerDown={(e) => {
                if (!onMove || !e.shiftKey) return;
                const start = { x: e.clientX, y: e.clientY },
                  rect = svg.current!.getBoundingClientRect();
                e.currentTarget.setPointerCapture(e.pointerId);
                const target = e.currentTarget;
                const up = (ev: PointerEvent) => {
                  onMove(n.id, [
                    n.position[0] + (((ev.clientX - start.x) / rect.width) * (maxX - minX)) / zoom,
                    n.position[1],
                    n.position[2] + (((ev.clientY - start.y) / rect.height) * (maxZ - minZ)) / zoom,
                  ]);
                  target.removeEventListener('pointerup', up);
                };
                target.addEventListener('pointerup', up, { once: true });
              }}
            >
              <NodeCard
                node={n}
                selected={selected === n.id || multi.includes(n.id)}
                onSelect={(additive) => onSelect(n.id, additive)}
                onOpen={() => onOpen?.(n.id)}
              />
            </foreignObject>
          );
        })}
      </svg>
    </div>
  );
}
export function WorldMap(props: Props) {
  const portal = useRef<HTMLDivElement>(null!);
  const [mode, setMode] = useState(localStorage.getItem('elsewhen-map-mode') ?? '3D'),
    [reset, setReset] = useState(0),
    [list, setList] = useState(false),
    [moving, setMoving] = useState(false),
    [snap, setSnap] = useState(false),
    [focus, setFocus] = useState<string[]>([]),
    [multi, setMulti] = useState<string[]>([]),
    [connect, setConnect] = useState(''),
    [context, setContext] = useState(false);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMoving(false);
        setConnect('');
        setContext(false);
        setReset((r) => r + 1);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  const onSelect: Props['onSelect'] = (id, additive) => {
    if (connect && props.nodes.some((n) => n.id === id)) {
      props.onConnect?.(connect, id);
      setConnect('');
      return;
    }
    setMulti((old) => (additive ? [...new Set([...old, props.selected, id])] : []));
    props.onSelect(id);
  };
  const onMove: Props['onMove'] = props.onMove
    ? (id, position) =>
        props.onMove!(
          id,
          position.map((v) => (snap ? Math.round(v) : v)) as [number, number, number],
        )
    : undefined;
  const shared = { ...props, onSelect, onMove, multi };
  const fallback = <FlatMap key={reset} {...shared} focus={focus} />;
  return (
    <div
      className={`world-map ${props.compact ? 'compact' : ''}`}
      onContextMenu={(event) => {
        if (props.onCreate) {
          event.preventDefault();
          setContext(true);
        }
      }}
    >
      <div className="map-view-controls">
        <div className="segmented">
          {['3D', '2D', 'Top', 'Front', 'Side'].map((v) => (
            <button
              key={v}
              className={mode === v ? 'active' : ''}
              onClick={() => {
                setMode(v);
                localStorage.setItem('elsewhen-map-mode', v);
              }}
            >
              {v}
            </button>
          ))}
        </div>
        <Button
          icon="maximize"
          title="Frame all locations"
          onClick={() => {
            setFocus([]);
            setReset((r) => r + 1);
          }}
        />
        <Button
          icon="eye"
          title="Frame selection"
          disabled={!props.selected}
          onClick={() => {
            setFocus(
              [...multi, props.selected].flatMap((id) => {
                const edge = props.edges.find((e) => e.id === id);
                return edge ? [edge.from, edge.to] : [id];
              }),
            );
            setReset((r) => r + 1);
          }}
        />
        <Button
          icon="undo"
          title="Reset map view"
          onClick={() => {
            setFocus([]);
            setMode('3D');
            setMoving(false);
            setConnect('');
            setReset((r) => r + 1);
          }}
        />
        {props.current && (
          <Button
            icon="pin"
            title="Focus current location"
            onClick={() => {
              setFocus([props.current!]);
              props.onSelect(props.current!);
              setReset((r) => r + 1);
            }}
          />
        )}
        {props.onMove && (
          <>
            <Button
              icon="move"
              title={moving ? 'Finish moving location' : 'Move selected location'}
              disabled={!props.nodes.some((n) => n.id === props.selected)}
              variant={moving ? 'primary' : 'default'}
              onClick={() => setMoving((v) => !v)}
            />
            <label className="map-snap">
              <input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} />
              Snap
            </label>
          </>
        )}
        {props.onConnect && (
          <Button
            icon="connections"
            title="Connect selected location"
            disabled={!props.nodes.some((n) => n.id === props.selected)}
            variant={connect ? 'primary' : 'default'}
            onClick={() => setConnect(props.selected)}
          />
        )}
        <Button
          icon="document"
          title="Accessible location list"
          onClick={() => setList((l) => !l)}
        />
      </div>
      {mode === '2D' ? (
        fallback
      ) : (
        <MapBoundary fallback={fallback}>
          <Suspense fallback={<div className="loading-state">Preparing world map…</div>}>
            <Map3D
              {...shared}
              portal={portal}
              view={mode}
              reset={reset}
              focus={focus}
              moving={moving}
              snap={snap}
            />
          </Suspense>
        </MapBoundary>
      )}
      <div ref={portal} className="map-labels" />
      {context && (
        <div className="map-context">
          <Button
            icon="plus"
            onClick={() => {
              setContext(false);
              props.onCreate?.();
            }}
          >
            Add location
          </Button>
          <Button onClick={() => setContext(false)}>Cancel</Button>
        </div>
      )}
      {list && (
        <div className="map-list">
          {props.nodes.map((n) => (
            <button
              key={n.id}
              onClick={() => props.onSelect(n.id)}
              onDoubleClick={() => props.onOpen?.(n.id)}
            >
              <Icon name={n.icon} />
              {n.name}
            </button>
          ))}
          {props.edges.map((e) => (
            <button
              key={e.id}
              onClick={() => onSelect(e.id)}
              onDoubleClick={() => props.onOpen?.(e.id)}
            >
              <Icon name="connections" />
              {e.name}
            </button>
          ))}
        </div>
      )}
      <div className="map-legend">
        <Icon name="move" size={15} />
        <span>
          {connect
            ? 'Choose a destination · Escape to cancel'
            : moving && mode !== '2D'
              ? 'Drag an axis handle · Escape to finish'
              : mode === '2D'
                ? 'Scroll to zoom · Shift + drag a node to move'
                : 'Drag to orbit · Right-drag to pan · Scroll to zoom'}
        </span>
      </div>
      <span className="map-axis">
        Y<span>╱ X ─ Z</span>
      </span>
    </div>
  );
}
