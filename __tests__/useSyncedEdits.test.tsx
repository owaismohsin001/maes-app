/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { OdooError } from '../src/api/odoo';
import {
  SAVE_DEBOUNCE_MS,
  SyncedEdits,
  useSyncedEdits,
} from '../src/barcode/useSyncedEdits';

jest.useFakeTimers();

// A tiny model: data is a total, events add to it, one command per save.
type Data = { total: number };
type Event = { add: number };
type View = { total: number };

let edits!: SyncedEdits<Data, Event, View>;
let save: jest.Mock;
let rejected: jest.Mock;

function Harness() {
  edits = useSyncedEdits<Data, Event, View>({
    apply: (d, events) => ({
      total: events.reduce((n, e) => n + e.add, d.total),
    }),
    commands: (d, v) =>
      v.total !== d.total ? [[1, 1, { total: v.total }]] : [],
    save: (cmds, d) => save(cmds, d),
    aliasesAfterSave: () => ({}),
    onRejected: e => rejected(e),
  });
  return null;
}

let renderer: ReactTestRenderer.ReactTestRenderer;

beforeEach(async () => {
  save = jest.fn(async cmds => ({ total: cmds[0][2].total }));
  rejected = jest.fn();
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<Harness />);
  });
  await ReactTestRenderer.act(async () => edits.reset({ total: 0 }));
});

afterEach(async () => {
  await ReactTestRenderer.act(async () => renderer.unmount());
});

const settle = () =>
  ReactTestRenderer.act(async () => {
    jest.advanceTimersByTime(SAVE_DEBOUNCE_MS);
  });

test('quick scans share one save; the view is up to date at once', async () => {
  await ReactTestRenderer.act(async () => {
    edits.push({ add: 1 });
    edits.push({ add: 1 });
  });
  expect(edits.getView()).toEqual({ total: 2 });
  await settle();
  expect(save).toHaveBeenCalledTimes(1);
  expect(edits.getData()).toEqual({ total: 2 });
  expect(edits.pending).toBe(0);
});

test('a scan made while a save is on its way is saved next, not lost', async () => {
  let finish!: (d: Data) => void;
  save.mockImplementationOnce(() => new Promise(r => (finish = r)));
  await ReactTestRenderer.act(async () => edits.push({ add: 1 }));
  await settle(); // first save starts and waits
  await ReactTestRenderer.act(async () => edits.push({ add: 5 }));
  expect(edits.getView()).toEqual({ total: 6 });

  await ReactTestRenderer.act(async () => finish({ total: 1 }));
  await ReactTestRenderer.act(async () => {
    await edits.flush();
  });
  expect(save).toHaveBeenLastCalledWith([[1, 1, { total: 6 }]], { total: 1 });
  expect(edits.getData()).toEqual({ total: 6 });
});

test('a save Odoo refuses is dropped, so later scans still save', async () => {
  save.mockImplementationOnce(async () => {
    throw new OdooError('user', 'Synthetic refusal');
  });
  await ReactTestRenderer.act(async () => edits.push({ add: 1 }));
  await settle();
  expect(rejected).toHaveBeenCalledTimes(1);
  expect(edits.pending).toBe(0);

  await ReactTestRenderer.act(async () => edits.push({ add: 2 }));
  await settle();
  expect(save).toHaveBeenLastCalledWith([[1, 1, { total: 2 }]], { total: 0 });
});

test('no connection keeps the scans and flush reports it', async () => {
  save.mockImplementation(async () => {
    throw new OdooError('network', 'offline');
  });
  await ReactTestRenderer.act(async () => edits.push({ add: 1 }));
  let error: unknown;
  await ReactTestRenderer.act(async () => {
    error = await edits.flush().catch(e => e);
  });
  expect((error as OdooError).kind).toBe('network');
  expect(edits.pending).toBe(1);
  expect(rejected).not.toHaveBeenCalled();
});
