import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { installLockedDependencies } from '../dependencies.mjs';

test('customer dependency install uses npm ci even with an existing installation', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'salon-deps-'));
  try {
    writeFileSync(join(dir, 'package-lock.json'), '{}');
    const calls = [];
    const ok = await installLockedDependencies(dir, 'backend', { run: async (args, options) => {
      calls.push({ args, options }); return { status: 0, out: '' };
    } });
    assert.equal(ok, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].args[0], 'ci');
    assert.equal(calls[0].options.cwd, dir);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a failed npm ci never falls back to npm install or reports success', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'salon-deps-'));
  try {
    writeFileSync(join(dir, 'package-lock.json'), '{}');
    const commands = [];
    const errors = [];
    const ok = await installLockedDependencies(dir, 'backend', {
      run: async (args) => { commands.push(args[0]); return { status: 1, out: 'lockfile mismatch' }; },
      error: (message) => errors.push(message),
    });
    assert.equal(ok, false);
    assert.deepEqual(commands, ['ci']);
    assert.ok(errors.some((message) => message.includes('lockfile mismatch')));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('missing lockfile refuses installation before running npm', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'salon-deps-'));
  try {
    let called = false;
    const ok = await installLockedDependencies(dir, 'frontend', {
      run: async () => { called = true; return { status: 0, out: '' }; }, error: () => {},
    });
    assert.equal(ok, false);
    assert.equal(called, false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
