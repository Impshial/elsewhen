import { useEffect, useRef, type ReactNode } from 'react';
import {
  MapPin,
  Box,
  Users,
  Zap,
  Workflow,
  Braces,
  Layers,
  Link,
  Network,
  Orbit,
  Gem,
  DoorOpen,
  BookOpen,
  Telescope,
  Waves,
  Compass,
  Feather,
  Check,
  Plus,
  X,
  ChevronRight,
  ChevronDown,
  Search,
  Play,
  Save,
  Undo2,
  Redo2,
  Download,
  FolderOpen,
  Settings,
  Sun,
  Moon,
  MoreHorizontal,
  ArrowRight,
  Move,
  Maximize,
  RotateCcw,
  Trash2,
  Copy,
  ArrowUp,
  ArrowDown,
  MessageCircle,
  Eye,
  CheckCircle2,
  AlertTriangle,
  Square,
  Send,
  Command,
  PanelLeftClose,
  FileText,
  ExternalLink,
  GripVertical,
  ChevronUp,
  LoaderCircle,
  Keyboard,
  Info,
  Lock,
  Lightbulb,
} from 'lucide-react';
export const icons = {
  pin: MapPin,
  locations: MapPin,
  objects: Box,
  characters: Users,
  actions: Zap,
  rules: Workflow,
  variables: Braces,
  templates: Layers,
  connections: Link,
  map: Network,
  orbit: Orbit,
  gem: Gem,
  door: DoorOpen,
  book: BookOpen,
  telescope: Telescope,
  waves: Waves,
  compass: Compass,
  feather: Feather,
  check: Check,
  plus: Plus,
  x: X,
  right: ChevronRight,
  down: ChevronDown,
  search: Search,
  play: Play,
  save: Save,
  undo: Undo2,
  redo: Redo2,
  download: Download,
  folder: FolderOpen,
  settings: Settings,
  sun: Sun,
  moon: Moon,
  more: MoreHorizontal,
  arrow: ArrowRight,
  move: Move,
  maximize: Maximize,
  reset: RotateCcw,
  trash: Trash2,
  copy: Copy,
  up: ArrowUp,
  arrowDown: ArrowDown,
  dialogue: MessageCircle,
  eye: Eye,
  success: CheckCircle2,
  warning: AlertTriangle,
  stop: Square,
  send: Send,
  command: Command,
  collapse: PanelLeftClose,
  document: FileText,
  external: ExternalLink,
  grip: GripVertical,
  chevronUp: ChevronUp,
  loading: LoaderCircle,
  keyboard: Keyboard,
  info: Info,
  lock: Lock,
  light: Lightbulb,
};
export function Icon({
  name,
  size = 18,
  ...props
}: {
  name: string;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const Component = icons[name as keyof typeof icons] ?? MapPin;
  return <Component size={size} strokeWidth={1.7} aria-hidden="true" {...props} />;
}
export function Button({
  children,
  icon,
  onClick,
  title,
  variant = '',
  disabled = false,
  className = '',
  type = 'button',
}: {
  children?: ReactNode;
  icon?: string;
  onClick?: () => void;
  title?: string;
  variant?: string;
  disabled?: boolean;
  className?: string;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      title={title}
      aria-label={title ?? (typeof children === 'string' ? children : undefined)}
      className={`button ${variant} ${!children ? 'icon-button' : ''} ${className}`}
      onClick={onClick}
      disabled={disabled}
    >
      {icon && <Icon name={icon} />} {children}
    </button>
  );
}
export function Field({
  label,
  children,
  hint,
  className = '',
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <label className={`field ${className}`}>
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function TextField({
  label,
  value,
  onChange,
  multiline = false,
  placeholder = '',
  type = 'text',
  hint,
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  multiline?: boolean;
  placeholder?: string;
  type?: string;
  hint?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      {multiline ? (
        <textarea
          aria-label={label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
      ) : (
        <input
          aria-label={label}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
      )}
    </Field>
  );
}
export function Select({
  label,
  value,
  onChange,
  options,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: (string | { value: string; label: string })[];
  hint?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) =>
          typeof o === 'string' ? (
            <option key={o} value={o}>
              {o}
            </option>
          ) : (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ),
        )}
      </select>
    </Field>
  );
}
export function Toggle({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}) {
  return (
    <label className="check-field">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        {label}
        {hint && <small>{hint}</small>}
      </span>
    </label>
  );
}
export function Badge({ children, tone = '' }: { children: ReactNode; tone?: string }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function Section({
  title,
  icon,
  children,
  action,
}: {
  title: string;
  icon?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="inspector-section">
      <header>
        {icon && <Icon name={icon} />}
        <h3>{title}</h3>
        {action}
      </header>
      <div className="section-body">{children}</div>
    </section>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const first = dialog.current?.querySelector<HTMLElement>('input, select, textarea, button');
    if (!dialog.current?.contains(document.activeElement)) first?.focus();
    return () => previous?.focus();
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        ref={dialog}
        className={`modal ${wide ? 'wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
          if (e.key === 'Tab') {
            const items = Array.from(
              dialog.current?.querySelectorAll<HTMLElement>(
                'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
              ) ?? [],
            );
            const first = items[0],
              last = items.at(-1);
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last?.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <header>
          <h2>{title}</h2>
          <Button icon="x" title="Close dialog" onClick={onClose} />
        </header>
        {children}
      </section>
    </div>
  );
}
export const colorPalette = [
  '#59a9ef',
  '#24c7c8',
  '#b587ef',
  '#db7296',
  '#edbd62',
  '#67c993',
  '#8995a8',
];
export function Colors({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="colors" aria-label="Map color">
      {colorPalette.map((c) => (
        <button
          key={c}
          aria-label={`Color ${c}`}
          title={c}
          className={value === c ? 'selected' : ''}
          style={{ background: c }}
          onClick={() => onChange(c)}
        />
      ))}
    </div>
  );
}
