import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldStopStream } from './streamStopHelpers.js';

test('stops when an abort signal is already aborted', () => {
  const controller = new AbortController();
  controller.abort();

  assert.equal(shouldStopStream(controller.signal, false), true);
});

test('stops when the stop request flag is set', () => {
  const controller = new AbortController();

  assert.equal(shouldStopStream(controller.signal, true), true);
});

test('does not stop while the stream is active', () => {
  const controller = new AbortController();

  assert.equal(shouldStopStream(controller.signal, false), false);
});
