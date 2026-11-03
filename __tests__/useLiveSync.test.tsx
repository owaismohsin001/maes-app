/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { useLiveSync } from '../src/hooks/useLiveSync';

jest.useFakeTimers();

let server: string;
let stamp: jest.Mock;
let onChange: jest.Mock;
let rebase!: (known?: string) => void;

function Harness({ enabled = true }: { enabled?: boolean }) {
  ({ rebase } = useLiveSync({
    enabled,
    intervalMs: 1000,
    idleIntervalMs: 5000,
    stamp: () => stamp(),
    onChange: () => onChange(),
  }));
  return null;
}

let renderer: ReactTestRenderer.ReactTestRenderer;

beforeEach(async () => {
  server = 'a';
  stamp = jest.fn(async () => server);
  onChange = jest.fn(async () => true);
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<Harness />);
  });
});

afterEach(async () => {
  await ReactTestRenderer.act(async () => renderer.unmount());
});

const tick = (ms = 1000) =>
  ReactTestRenderer.act(async () => {
    jest.advanceTimersByTime(ms);
  });

test('nothing changed: only the cheap check runs', async () => {
  await tick();
  await tick();
  expect(stamp).toHaveBeenCalledTimes(2);
  expect(onChange).not.toHaveBeenCalled();
});

test('a change on the server is loaded once', async () => {
  await tick(); // baseline
  server = 'b';
  await tick();
  expect(onChange).toHaveBeenCalledTimes(1);
  await tick();
  expect(onChange).toHaveBeenCalledTimes(1);
});

test('busy user: the change is retried at the next check', async () => {
  await tick();
  server = 'b';
  onChange.mockResolvedValueOnce(false);
  await tick();
  await tick();
  expect(onChange).toHaveBeenCalledTimes(2);
});

test("the app's own save is not mistaken for a change", async () => {
  await tick();
  server = 'b';
  await ReactTestRenderer.act(async () => rebase());
  await tick();
  expect(onChange).not.toHaveBeenCalled();
});

test('a failed rebase keeps the old baseline, so a change is still seen', async () => {
  await tick(); // baseline 'a'
  stamp.mockRejectedValueOnce(new Error('offline'));
  await ReactTestRenderer.act(async () => rebase());
  server = 'b';
  await tick();
  expect(onChange).toHaveBeenCalledTimes(1);
});

test('a known stamp needs no request', async () => {
  await ReactTestRenderer.act(async () => rebase('a'));
  expect(stamp).not.toHaveBeenCalled();
});

test('slows down when nothing changes for a minute', async () => {
  // One timer at a time: each check schedules the next after its answer.
  for (let i = 0; i < 61; i++) {
    await tick();
  }
  const calls = stamp.mock.calls.length;
  await tick(1000);
  expect(stamp.mock.calls.length).toBe(calls);
  await tick(5000);
  expect(stamp.mock.calls.length).toBeGreaterThan(calls);
});

test('disabled: no requests at all', async () => {
  await ReactTestRenderer.act(async () =>
    renderer.update(<Harness enabled={false} />),
  );
  stamp.mockClear();
  await tick(10000);
  expect(stamp).not.toHaveBeenCalled();
});
