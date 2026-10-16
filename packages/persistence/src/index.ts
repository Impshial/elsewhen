import { promises as fs } from 'node:fs';
import path from 'node:path';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { z } from 'zod';
import {
  projectSchema,
  stableStringify,
  type Project,
  type GameState,
  type TranscriptEntry,
  scalar,
  placementSchema,
  actionCatalog,
} from '../../domain/src/index';
import { compile, contentHash, type CompiledGame } from '../../compiler/src/index';
import { assertState } from '../../engine/src/index';
import {
  discourseSchema,
  clarificationSchema,
  type Discourse,
  type Clarification,
  type ParsedCommand,
} from '../../domain/src/conversation';
export const MAX_FILE = 25 * 1024 * 1024;
import { migrateProject } from '../../domain/src/migration';
export { migrateProject } from '../../domain/src/migration';
export async function readLimited(file: string): Promise<Buffer> {
  const stat = await fs.stat(file);
  if (stat.size > MAX_FILE) throw new Error('File exceeds the 25 MB limit.');
  return fs.readFile(file);
}
export async function atomicWrite(file: string, data: string | Uint8Array): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${crypto.randomUUID()}.tmp`;
  try {
    const handle = await fs.open(tmp, 'wx');
    try {
      await handle.writeFile(data);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.rename(tmp, file);
  } catch (e) {
    await fs.rm(tmp, { force: true }).catch(() => {});
    throw e;
  }
}
export class ProjectFiles {
  current: string | null = null;
  fingerprint: string | null = null;
  readOnly = false;
  private lockPath: string | null = null;
  private upgradedSource: string | null = null;
  constructor(readonly recoveryDir: string) {}
  async inspect(file: string) {
    const bytes = await readLimited(file),
      raw = JSON.parse(bytes.toString('utf8')),
      project = migrateProject(raw);
    return {
      project,
      hash: contentHash(bytes.toString('utf8')),
      upgraded: raw.schemaVersion !== 2,
    };
  }
  async open(file: string, mode: 'normal' | 'readonly' | 'takeover' = 'normal') {
    const { project, hash, upgraded } = await this.inspect(file);
    this.upgradedSource = upgraded ? file : null;
    await this.release();
    this.current = file;
    this.fingerprint = hash;
    this.readOnly = mode === 'readonly';
    if (!this.readOnly) {
      const lock = `${file}.lock`;
      try {
        await fs.writeFile(
          lock,
          JSON.stringify({ pid: process.pid, opened: new Date().toISOString() }),
          { flag: mode === 'takeover' ? 'w' : 'wx' },
        );
        this.lockPath = lock;
      } catch (e) {
        this.current = null;
        throw new Error(`PROJECT_LOCKED: ${(e as Error).message}`, { cause: e });
      }
    }
    return project;
  }
  async save(p: Project, file = this.current) {
    if (!file) throw new Error('Choose a project filename first.');
    if (file === this.upgradedSource)
      throw new Error('This project was upgraded. Use Save As to preserve the original version.');
    if (this.readOnly && file === this.current)
      throw new Error('This project is read-only. Use Save As.');
    if (file === this.current && this.fingerprint) {
      const current = await readLimited(file).catch(() => null);
      if (!current || contentHash(current.toString('utf8')) !== this.fingerprint)
        throw new Error(
          'EXTERNAL_CHANGE: The source file changed outside ElseWhen. Use Save As to preserve both versions.',
        );
    }
    const data = stableStringify(projectSchema.parse(p)) + '\n';
    const newLock = file !== this.current ? `${file}.lock` : null;
    if (newLock) {
      await fs.mkdir(path.dirname(file), { recursive: true });
      try {
        await fs.writeFile(newLock, JSON.stringify({ pid: process.pid }), { flag: 'wx' });
      } catch {
        throw new Error(
          'PROJECT_LOCKED: This destination is open in another session. Choose a different filename.',
        );
      }
    }
    try {
      const old = await readLimited(file).catch(() => null);
      if (old) {
        const dir = path.join(path.dirname(file), '.elsewhen', 'backups');
        await fs.mkdir(dir, { recursive: true });
        await atomicWrite(path.join(dir, `${Date.now()}-${crypto.randomUUID()}.json`), old);
        const backups = (await fs.readdir(dir)).filter((f) => f.endsWith('.json')).sort();
        for (const name of backups.slice(0, -10)) await fs.unlink(path.join(dir, name));
      }
      await atomicWrite(file, data);
    } catch (error) {
      if (newLock) await fs.rm(newLock, { force: true }).catch(() => {});
      throw error;
    }
    if (newLock) {
      await this.release();
      this.current = file;
      this.readOnly = false;
      this.lockPath = newLock;
    }
    this.fingerprint = contentHash(data);
    await this.clearRecovery(p.id);
    return file;
  }
  recoveryPath(id: string) {
    return path.join(this.recoveryDir, contentHash(id) + '.json');
  }
  async recover(p: Project) {
    const file = this.recoveryPath(p.id);
    try {
      const raw = JSON.parse((await readLimited(file)).toString());
      if (raw.project.id !== p.id) return null;
      if (this.current && (await fs.stat(file)).mtimeMs <= (await fs.stat(this.current)).mtimeMs)
        return null;
      return migrateProject(raw.project);
    } catch {
      return null;
    }
  }
  async recovery(p: Project) {
    await atomicWrite(
      this.recoveryPath(p.id),
      stableStringify({
        format: 'elsewhen-recovery',
        schemaVersion: 2,
        source: this.current,
        project: p,
      }),
    );
  }
  async drafts(): Promise<{ id: string; title: string }[]> {
    const names = await fs.readdir(this.recoveryDir).catch(() => []);
    const drafts: { id: string; title: string }[] = [];
    for (const name of names.filter((n) => n.endsWith('.json')).slice(-100)) {
      try {
        const raw = JSON.parse((await readLimited(path.join(this.recoveryDir, name))).toString());
        if (raw.format !== 'elsewhen-recovery' || raw.source !== null) continue;
        const project = migrateProject(raw.project);
        drafts.push({ id: project.id, title: project.title });
      } catch {
        /* Ignore damaged recovery snapshots; authoritative projects are unaffected. */
      }
    }
    return drafts.slice(-10);
  }
  async clearRecovery(id: string) {
    await fs.rm(this.recoveryPath(id), { force: true });
  }
  async release() {
    if (this.lockPath) {
      try {
        const data = JSON.parse(await fs.readFile(this.lockPath, 'utf8'));
        if (data.pid === process.pid) await fs.unlink(this.lockPath);
      } catch {
        /* Best effort: never remove another process's lock. */
      }
    }
    this.lockPath = null;
  }
}
export function exportGame(p: Project): Uint8Array {
  const game = compile(p),
    manifest = {
      format: 'elsegame',
      schemaVersion: 2,
      runtimeVersion: 2,
      gameId: p.id,
      version: p.version,
      title: p.title,
      contentHash: game.hash,
    };
  const mtime = new Date('2000-01-01T00:00:00Z');
  return zipSync(
    {
      'manifest.json': [strToU8(stableStringify(manifest)), { mtime }],
      'game.json': [strToU8(stableStringify(game)), { mtime }],
    },
    { level: 6 },
  );
}
function inspectZip(bytes: Uint8Array) {
  if (bytes.length > MAX_FILE) throw new Error('Game package exceeds 25 MB.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--)
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  if (eocd < 0) throw new Error('Invalid ZIP archive.');
  const count = view.getUint16(eocd + 10, true);
  if (count !== 2)
    throw new Error('A game package must contain exactly manifest.json and game.json.');
  let offset = view.getUint32(eocd + 16, true),
    expanded = 0;
  const names = new Set<string>();
  for (let i = 0; i < count; i++) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== 0x02014b50)
      throw new Error('Invalid ZIP directory.');
    const size = view.getUint32(offset + 24, true),
      len = view.getUint16(offset + 28, true),
      extra = view.getUint16(offset + 30, true),
      comment = view.getUint16(offset + 32, true),
      attrs = view.getUint32(offset + 38, true);
    const name = strFromU8(bytes.subarray(offset + 46, offset + 46 + len));
    if (
      !['manifest.json', 'game.json'].includes(name) ||
      names.has(name) ||
      ((attrs >>> 16) & 0xf000) === 0xa000
    )
      throw new Error('Unsafe or duplicate package entry.');
    names.add(name);
    expanded += size;
    if (expanded > MAX_FILE) throw new Error('Expanded package exceeds 25 MB.');
    offset += 46 + len + extra + comment;
  }
}
export function importGame(bytes: Uint8Array): CompiledGame {
  inspectZip(bytes);
  let expanded = 0;
  const seen = new Set<string>();
  const entries = unzipSync(bytes, {
    filter: (e) => {
      expanded += e.originalSize;
      if (
        !['manifest.json', 'game.json'].includes(e.name) ||
        seen.has(e.name) ||
        expanded > MAX_FILE
      )
        throw new Error('Unsafe archive contents.');
      seen.add(e.name);
      return true;
    },
  });
  const manifest = z
    .object({
      format: z.literal('elsegame'),
      schemaVersion: z.literal(2),
      runtimeVersion: z.literal(2),
      gameId: z.string(),
      version: z.string(),
      title: z.string(),
      contentHash: z.string(),
    })
    .strict()
    .parse(JSON.parse(strFromU8(entries['manifest.json'])));
  const raw = JSON.parse(strFromU8(entries['game.json']));
  if (raw.format !== 'elsewhen-runtime' || raw.schemaVersion !== 2 || raw.runtimeVersion !== 2)
    throw new Error('Unsupported runtime package.');
  const game = compile(projectSchema.parse(raw.project));
  if (
    game.hash !== manifest.contentHash ||
    raw.hash !== game.hash ||
    game.project.id !== manifest.gameId
  )
    throw new Error('Game content hash or identity does not match the manifest.');
  return game;
}
const observation = z
  .object({
    id: z.string(),
    name: z.string(),
    aliases: z.array(z.string()),
    kind: z.enum(['object', 'character', 'location', 'connection', 'topic']),
    description: z.string(),
    capabilities: z.array(z.string()),
    nouns: z.array(z.string()).optional(),
    adjectives: z.array(z.string()).optional(),
    plurals: z.array(z.string()).optional(),
    pronouns: z.array(z.string()).optional(),
    direction: z.string().optional(),
    destination: z.string().optional(),
    doorId: z.string().optional(),
  })
  .strict();
const stateSchema = z
  .object({
    location: z.string(),
    previousLocation: z.string(),
    placements: z.record(z.string(), placementSchema),
    objects: z.record(
      z.string(),
      z
        .object({
          open: z.boolean(),
          locked: z.boolean(),
          active: z.boolean(),
          worn: z.boolean(),
          concealed: z.boolean(),
          properties: z.record(z.string(), scalar),
        })
        .strict(),
    ),
    characters: z.record(z.string(), z.string()),
    characterProperties: z.record(z.string(), z.record(z.string(), scalar)),
    playerPlacement: placementSchema,
    consumed: z.array(z.string()),
    eventSequence: z.number().int().nonnegative(),
    variables: z.record(z.string(), scalar),
    connections: z.record(
      z.string(),
      z.object({ enabled: z.boolean(), concealed: z.boolean() }).strict(),
    ),
    known: z.array(z.string()),
    forgottenTopics: z.array(z.string()).default([]),
    visited: z.array(z.string()),
    observations: z.record(z.string(), observation),
    fired: z.array(z.string()),
    events: z.array(
      z
        .object({
          id: z.string(),
          instanceId: z.string(),
          sequence: z.number().int(),
          due: z.number().int(),
          bindings: z.record(z.string(), scalar),
        })
        .strict(),
    ),
    turn: z.number().int().nonnegative(),
    rng: z.number().int(),
    ending: z.string().nullable(),
  })
  .strict();
export type SaveData = {
  format: 'elsesave';
  schemaVersion: 2;
  gameId: string;
  hash: string;
  state: GameState;
  transcript: TranscriptEntry[];
  discourse: Discourse;
  pending: Clarification | null;
  remainder: string[];
};
export function readSave(raw: unknown, game: CompiledGame): SaveData {
  if (!raw || typeof raw !== 'object' || (raw as { schemaVersion?: number }).schemaVersion !== 2)
    throw new Error(
      'Unsupported save version. Use the original app for version 1 saves, or restart this game.',
    );
  const save = z
    .object({
      format: z.literal('elsesave'),
      schemaVersion: z.literal(2),
      gameId: z.string(),
      hash: z.string(),
      state: stateSchema,
      transcript: z
        .array(
          z.object({ kind: z.enum(['command', 'narration', 'status']), text: z.string() }).strict(),
        )
        .max(100000),
      discourse: discourseSchema,
      pending: clarificationSchema.nullable(),
      remainder: z.array(z.string().max(8000)).max(32),
    })
    .strict()
    .parse(raw);
  if (save.gameId !== game.project.id || save.hash !== game.hash)
    throw new Error(
      'SAVE_MISMATCH: This save requires the exact game revision it was created with. Open the matching .elsegame package or restart.',
    );
  assertState(game.project, save.state);
  const entityIds = new Set(
    [
      ...game.project.locations,
      ...game.project.objects,
      ...game.project.characters,
      ...game.project.connections,
      ...game.project.characters.flatMap((c) => c.topics),
    ].map((e) => e.id),
  );
  const actionIds = new Set(game.grammar.map((g) => g.actionId));
  const requireIds = (ids: string[], allowed: Set<string>) => {
    if (ids.some((id) => !allowed.has(id)))
      throw new Error('The save contains a reference outside this game.');
  };
  const objects = new Set(game.project.objects.map((e) => e.id)),
    characters = new Set(game.project.characters.map((e) => e.id)),
    locations = new Set(game.project.locations.map((e) => e.id)),
    connections = new Set(game.project.connections.map((e) => e.id)),
    topics = new Set(game.project.characters.flatMap((e) => e.topics.map((t) => t.id)));
  requireIds(Object.keys(save.state.objects), objects);
  requireIds(Object.keys(save.state.characters), characters);
  requireIds(Object.keys(save.state.characterProperties), characters);
  requireIds(Object.keys(save.state.placements), new Set([...objects, ...characters]));
  requireIds(Object.keys(save.state.connections), connections);
  requireIds(Object.keys(save.state.variables), new Set(game.project.variables.map((e) => e.id)));
  requireIds(save.state.consumed, objects);
  requireIds(save.state.visited, locations);
  requireIds(save.state.forgottenTopics, topics);
  requireIds(save.state.fired, new Set(game.project.rules.map((e) => e.id)));
  if (save.state.previousLocation) requireIds([save.state.previousLocation], locations);
  if (save.state.ending)
    requireIds([save.state.ending], new Set(game.project.endings.map((e) => e.id)));
  for (const [id, observation] of Object.entries(save.state.observations)) {
    if (id !== observation.id) throw new Error('The saved observation identity is invalid.');
    requireIds(
      [id],
      {
        object: objects,
        character: characters,
        location: locations,
        connection: connections,
        topic: topics,
      }[observation.kind],
    );
    if (observation.destination) requireIds([observation.destination], locations);
    if (observation.doorId) requireIds([observation.doorId], objects);
  }
  const instances = new Set<string>();
  for (const event of save.state.events) {
    if (
      instances.has(event.instanceId) ||
      event.sequence < 1 ||
      event.sequence > save.state.eventSequence ||
      event.due < 0
    )
      throw new Error('The saved event ordering is invalid.');
    instances.add(event.instanceId);
  }
  const actions = actionCatalog(game.project);
  const validateBindings = (actionId: string, bindings: ParsedCommand['bindings']) => {
    const action = actions.find((a) => a.id === actionId);
    if (!action) throw new Error('The save references an unavailable action.');
    for (const [key, value] of Object.entries(bindings)) {
      const role = action.parameters.find((p) => p.id === key.split(':')[0]);
      if (!role) throw new Error('The saved action has an unavailable role.');
      if (['entity', 'connection', 'topic'].includes(role.kind)) {
        const ids = Array.isArray(value) ? value : [value];
        if (ids.some((id) => typeof id !== 'string'))
          throw new Error('The saved action reference is invalid.');
        requireIds(
          ids as string[],
          role.kind === 'connection'
            ? connections
            : role.kind === 'topic'
              ? topics
              : role.entityKind === 'object'
                ? objects
                : role.entityKind === 'character'
                  ? characters
                  : entityIds,
        );
      } else if (typeof value !== (role.kind === 'text' ? 'string' : role.kind))
        throw new Error('The saved action value has the wrong type.');
    }
  };
  if (save.discourse.repeat)
    validateBindings(save.discourse.repeat.action.actionId, save.discourse.repeat.action.args);
  for (const id of [
    ...save.state.known,
    ...save.state.visited,
    ...Object.keys(save.state.observations),
    ...save.discourse.plural,
    ...[
      save.discourse.object,
      save.discourse.character,
      save.discourse.recipient,
      save.discourse.topic,
    ].filter((s): s is string => s !== null),
  ])
    if (!entityIds.has(id)) throw new Error('The save contains a reference outside this game.');
  if (save.pending) {
    const validateCommand = (command: ParsedCommand) => {
      const action = actions.find((a) => a.id === command.actionId);
      const synthetic = command.actionId === 'go' && command.formId === 'direction';
      if (!action?.forms.some((form) => form.id === command.formId) && !synthetic)
        throw new Error('The saved question references an unavailable grammar form.');
      if (Object.keys(command.phrases).some((key) => !action?.parameters.some((p) => p.id === key)))
        throw new Error('The saved question references an unavailable phrase role.');
      validateBindings(command.actionId, command.bindings);
    };
    validateCommand(save.pending.command);
    if (save.pending.kind === 'interpretation')
      for (const command of save.pending.alternatives) validateCommand(command);
    if (!actionIds.has(save.pending.command.actionId))
      throw new Error('The saved question references an unavailable action.');
    if (save.pending.kind !== 'interpretation')
      for (const c of save.pending.candidates)
        if (!entityIds.has(c.id) || !save.state.known.includes(c.id))
          throw new Error('The saved question contains an unavailable candidate.');
  }
  return save;
}
