/**
 * App control (odoo19Module §P450): the app asks the control server on start,
 * on resume and every interval; it locks on anything but 'ok', reads the
 * position only once the server asks for it, and survives a short outage
 * within the server's grace time.
 *
 * @format
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { AppState } from 'react-native';
import {
  RETRY_MS,
  useAppControl,
  type AppControl,
} from '../src/control/useAppControl';
import * as device from '../src/control/device';
import NativeMaesDevice from '../src/native/NativeMaesDevice';

jest.mock('../src/control/device', () => ({
  ...jest.requireActual('../src/control/device'),
  hasLocationPermission: jest.fn(() => Promise.resolve(true)),
  requestLocationPermission: jest.fn(() => Promise.resolve('granted')),
}));

jest.useFakeTimers();

type DeviceMock = typeof NativeMaesDevice & {
  getInfo: jest.Mock;
  getLocation: jest.Mock;
  __info: () => object;
  __reset: () => void;
};
const native = NativeMaesDevice as DeviceMock;
const permission = device as unknown as {
  hasLocationPermission: jest.Mock;
  requestLocationPermission: jest.Mock;
};
const fetchMock = globalThis.fetch as unknown as jest.Mock;
const allowedAnswer = (globalThis as unknown as { __allowedAnswer: () => object })
  .__allowedAnswer;
const appStateAdd = AppState.addEventListener as jest.Mock;

type Reply = object | Error;
let replies: Reply[] = [];

/** The server answers these in order (the last one repeats). */
function serve(...next: Reply[]) {
  replies = next;
}

const answer = (extra: object) => ({ ...allowedAnswer(), ...extra });
const bodies = () =>
  fetchMock.mock.calls.map(c => JSON.parse((c[1] as { body: string }).body));

let control: AppControl;
function Probe() {
  control = useAppControl();
  return null;
}

let renderer: ReactTestRenderer.ReactTestRenderer;

async function settle() {
  for (let i = 0; i < 8; i++) {
    await ReactTestRenderer.act(async () => {});
  }
}

async function advance(ms: number) {
  await ReactTestRenderer.act(async () => {
    jest.advanceTimersByTime(ms);
  });
  await settle();
}

async function mount() {
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<Probe />);
  });
  await settle();
}

/** The app goes to the background / comes back (the hook's AppState listener). */
async function appState(next: 'active' | 'background') {
  const calls = appStateAdd.mock.calls;
  const listener = calls[calls.length - 1][1] as (s: string) => void;
  await ReactTestRenderer.act(async () => listener(next));
  await settle();
}

beforeEach(() => {
  native.__reset();
  permission.hasLocationPermission.mockClear();
  permission.requestLocationPermission.mockClear();
  permission.hasLocationPermission.mockImplementation(() =>
    Promise.resolve(true),
  );
  permission.requestLocationPermission.mockImplementation(() =>
    Promise.resolve('granted'),
  );
  appStateAdd.mockClear();
  serve(allowedAnswer());
  fetchMock.mockReset();
  fetchMock.mockImplementation(() => {
    const reply = replies.length > 1 ? replies.shift()! : replies[0];
    return reply instanceof Error
      ? Promise.reject(reply)
      : Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(reply),
        });
  });
});

afterEach(async () => {
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('starts checking, then allowed; no position asked while the server does not want one', async () => {
  let first: AppControl | null = null;
  function FirstRender() {
    const c = useAppControl();
    first = first ?? c;
    control = c;
    return null;
  }
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<FirstRender />);
  });
  await settle();
  expect(first!.phase).toBe('checking');
  expect(control.phase).toBe('allowed');
  expect(control.reason).toBeNull();
  expect(bodies()).toHaveLength(1);
  expect(bodies()[0]).toMatchObject({
    device_id: 'a1b2c3d4e5f60718',
    model: 'HC CM60',
    connection: 'wifi',
    location_status: 'skipped',
    location: null,
  });
  expect(native.getLocation).not.toHaveBeenCalled();
  expect(permission.requestLocationPermission).not.toHaveBeenCalled();
});

test('waiting for approval → locked with the device code', async () => {
  serve(answer({ ok: false, reason: 'pending', device_code: 'F00BAA' }));
  await mount();
  expect(control.phase).toBe('locked');
  expect(control.reason).toBe('pending');
  expect(control.answer?.deviceCode).toBe('F00BAA');
});

test('the first answer asking for a position is followed at once by a check that carries one', async () => {
  serve(
    answer({ ok: false, reason: 'no_location', need_location: true }),
    answer({ need_location: true }),
  );
  await mount();
  expect(bodies()).toHaveLength(2);
  expect(bodies()[0].location).toBeNull();
  expect(bodies()[1]).toMatchObject({
    location_status: 'ok',
    location: {
      latitude: 51.0991627,
      longitude: 3.9723471,
      accuracy_m: 12,
      age_s: 5,
      mock: false,
    },
  });
  expect(permission.requestLocationPermission).toHaveBeenCalledTimes(1);
  expect(control.phase).toBe('allowed');

  // Later checks carry the position straight away, without asking again.
  await advance(60000);
  expect(bodies()).toHaveLength(3);
  expect(bodies()[2].location_status).toBe('ok');
  expect(permission.requestLocationPermission).toHaveBeenCalledTimes(1);
});

test('location permission refused → locked no_location, asked again only from the lock screen', async () => {
  permission.requestLocationPermission.mockImplementation(() =>
    Promise.resolve('denied'),
  );
  permission.hasLocationPermission.mockImplementation(() =>
    Promise.resolve(false),
  );
  serve(answer({ ok: false, reason: 'no_location', need_location: true }));
  await mount();
  expect(control.phase).toBe('locked');
  expect(control.reason).toBe('no_location');
  expect(control.permission).toBe('denied');
  expect(bodies()[1].location_status).toBe('denied');
  expect(native.getLocation).not.toHaveBeenCalled();

  await advance(60000); // the periodic check does not ask again
  expect(permission.requestLocationPermission).toHaveBeenCalledTimes(1);

  permission.requestLocationPermission.mockImplementation(() =>
    Promise.resolve('granted'),
  );
  serve(answer({ need_location: true }));
  await ReactTestRenderer.act(async () => control.recheck());
  await settle();
  expect(permission.requestLocationPermission).toHaveBeenCalledTimes(2);
  expect(control.phase).toBe('allowed');
});

test('blocked by the admin → locks at the next periodic check', async () => {
  await mount();
  expect(control.phase).toBe('allowed');
  serve(answer({ ok: false, reason: 'blocked' }));
  await advance(59000);
  expect(control.phase).toBe('allowed');
  await advance(1000);
  expect(control.phase).toBe('locked');
  expect(control.reason).toBe('blocked');
});

test('the interval comes from the server', async () => {
  serve(answer({ interval_s: 30 }));
  await mount();
  await advance(30000);
  expect(bodies()).toHaveLength(2);
});

test('offline: the last ok holds for the grace time, then the app locks; it reopens once a check succeeds', async () => {
  serve(answer({ grace_s: 60 }));
  await mount();
  serve(new Error('offline'));
  await advance(60000); // the check 60 s after the last ok fails: still within the grace
  expect(control.phase).toBe('allowed');
  await advance(RETRY_MS);
  expect(control.phase).toBe('locked');
  expect(control.reason).toBe('offline');

  serve(answer({ grace_s: 60 }));
  await advance(RETRY_MS);
  expect(control.phase).toBe('allowed');
});

test('no connection at start → locked offline, retried soon', async () => {
  serve(new Error('offline'));
  await mount();
  expect(control.phase).toBe('locked');
  expect(control.reason).toBe('offline');
  serve(allowedAnswer());
  await advance(RETRY_MS);
  expect(control.phase).toBe('allowed');
});

test('a lock for a server reason stays that reason while offline', async () => {
  serve(answer({ ok: false, reason: 'blocked' }));
  await mount();
  serve(new Error('offline'));
  await advance(60000);
  expect(control.reason).toBe('blocked');
});

test('a device that cannot identify itself is locked as unsupported', async () => {
  native.getInfo.mockImplementation(() =>
    Promise.resolve({ ...native.__info(), deviceId: '' }),
  );
  await mount();
  expect(control.phase).toBe('locked');
  expect(control.reason).toBe('unsupported');
  expect(fetchMock).not.toHaveBeenCalled();
});

test('no checks in the background; coming back checks at once', async () => {
  await mount();
  await appState('background');
  await advance(5 * 60000);
  expect(bodies()).toHaveLength(1);
  serve(answer({ ok: false, reason: 'app_disabled' }));
  await appState('active');
  expect(bodies()).toHaveLength(2);
  expect(control.reason).toBe('app_disabled');
});
