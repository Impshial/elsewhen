import { it, expect, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import { zipSync, strToU8, unzipSync } from 'fflate';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { foldedHorizon } from '../examples/the-folded-horizon/sample';
import { compile } from '../packages/compiler/src/index';
import {
  exportGame,
  importGame,
  ProjectFiles,
  migrateProject,
  readSave,
  atomicWrite,
} from '../packages/persistence/src/index';
import { Session } from '../apps/desktop/src/main/session';
it('deterministically compiles, strips notes, and roundtrips the archive', () => {
  const p = foldedHorizon();
  p.notes = 'secret note';
  p.actions[0].privateExamples = ['secret test'];
  const a = compile(p);
  expect(a.project.notes).toBe('');
  expect(a.project.actions[0].privateExamples).toEqual([]);
  expect(importGame(exportGame(p)).hash).toBe(a.hash);
  expect(exportGame(p)).toEqual(exportGame(p));
  p.notes = 'changed notes';
  expect(compile(p).hash).toBe(a.hash);
});

it('rejects unsafe archives and altered runtime content', () => {
  expect(() =>
    importGame(zipSync({ '../manifest.json': strToU8('{}'), 'game.json': strToU8('{}') })),
  ).toThrow('Unsafe');
  const entries = unzipSync(exportGame(foldedHorizon()));
  const runtime = JSON.parse(new TextDecoder().decode(entries['game.json']));
  runtime.project.title = 'tampered';
  entries['game.json'] = strToU8(JSON.stringify(runtime));
  expect(() => importGame(zipSync(entries))).toThrow('hash');
});

it('retains the authoritative file and cleans temporary data after a write failure', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'elsewhen-write-failure-')),
    file = path.join(dir, 'project.json');
  await writeFile(file, 'original');
  const rename = vi
    .spyOn(fs, 'rename')
    .mockRejectedValueOnce(new Error('simulated rename failure'));
  try {
    await expect(atomicWrite(file, 'replacement')).rejects.toThrow('simulated');
    expect(await readFile(file, 'utf8')).toBe('original');
    expect(await fs.readdir(dir)).toEqual(['project.json']);
  } finally {
    rename.mockRestore();
    await rm(dir, { recursive: true, force: true });
  }
});

it('preserves recovery separately and refuses Save As over another session lock', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'elsewhen-recovery-')),
    file = path.join(dir, 'project.elsewhen.json'),
    a = new ProjectFiles(path.join(dir, 'recovery')),
    b = new ProjectFiles(path.join(dir, 'other'));
  try {
    const p = foldedHorizon();
    await a.save(p, file);
    const authoritative = await readFile(file, 'utf8');
    p.title = 'Recovered title';
    await a.recovery(p);
    await fs.utimes(a.recoveryPath(p.id), new Date(), new Date(Date.now() + 1000));
    expect((await a.recover(p))?.title).toBe('Recovered title');
    expect(await readFile(file, 'utf8')).toBe(authoritative);
    await expect(b.save(p, file)).rejects.toThrow('PROJECT_LOCKED');
    expect(await readFile(file, 'utf8')).toBe(authoritative);
    await a.save(p);
    expect(await a.recover(p)).toBeNull();
  } finally {
    await a.release();
    await b.release();
    await rm(dir, { recursive: true, force: true });
  }
});
it('rejects incompatible saves and unsupported versions', () => {
  const s = new Session(compile(foldedHorizon()), true),
    save = s.save();
  save.hash = 'changed';
  expect(() => readSave(save, s.game)).toThrow('SAVE_MISMATCH');
  expect(() => migrateProject({ ...foldedHorizon(), schemaVersion: 99 })).toThrow(
    'supports schema 1',
  );
});
it('migrates an older fixture without mutating its source', () => {
  const old = { ...foldedHorizon(), schemaVersion: 0 };
  expect(migrateProject(old).schemaVersion).toBe(1);
  expect(old.schemaVersion).toBe(0);
});
it('saves atomically, makes backups, and detects external changes', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'elsewhen-test-'));
  const files = new ProjectFiles(path.join(dir, 'recovery'));
  try {
    const file = path.join(dir, 'project.elsewhen.json'),
      p = foldedHorizon();
    await files.save(p, file);
    p.title = 'Renamed';
    await files.save(p);
    expect(JSON.parse(await readFile(file, 'utf8')).title).toBe('Renamed');
    await writeFile(file, 'external');
    await expect(files.save(p)).rejects.toThrow('EXTERNAL_CHANGE');
    expect(await readFile(file, 'utf8')).toBe('external');
  } finally {
    await files.release();
    await rm(dir, { recursive: true, force: true });
  }
});
