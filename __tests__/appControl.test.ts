/**
 * The app-control client (odoo19Module §P450): request body, answer parsing
 * (only an explicit ok unlocks), and every way a check can fail.
 *
 * @format
 */
import {
  CONTROL_URL,
  ControlError,
  checkDevice,
  parseAnswer,
  requestBody,
  type CheckRequest,
} from '../src/api/appControl';
import { APP_VERSION, BRAND } from '../src/config';

const REQUEST: CheckRequest = {
  deviceId: 'a1b2c3d4e5f60718',
  model: 'HC CM60',
  osVersion: '11',
  connection: 'wifi',
  locationStatus: 'ok',
  location: {
    latitude: 51.0991627,
    longitude: 3.9723471,
    accuracyM: 12,
    ageS: 5,
    mock: false,
  },
};

const allowed = () => ({
  ok: true,
  reason: 'ok',
  device_code: 'A1B2C3',
  need_location: true,
  location_name: 'HQ Lokeren',
  distance_m: 40,
  interval_s: 60,
  grace_s: 600,
});

const response = (json: unknown, status = 200) =>
  Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(json),
  });

test('the check goes to the brand control server', () => {
  expect(CONTROL_URL).toBe(`${BRAND.controlOrigin}/maes_app/check`);
  expect(BRAND.controlOrigin).toMatch(/^https:\/\/[^/]+$/);
});

test('request body: snake_case, brand and app version added', () => {
  expect(requestBody(REQUEST)).toEqual({
    device_id: 'a1b2c3d4e5f60718',
    brand: BRAND.key,
    model: 'HC CM60',
    os_version: '11',
    app_version: APP_VERSION,
    connection: 'wifi',
    location_status: 'ok',
    location: {
      latitude: 51.0991627,
      longitude: 3.9723471,
      accuracy_m: 12,
      age_s: 5,
      mock: false,
    },
  });
  expect(
    requestBody({ ...REQUEST, locationStatus: 'skipped', location: null })
      .location,
  ).toBeNull();
});

test('an allowed answer', () => {
  expect(parseAnswer(allowed())).toEqual({
    ok: true,
    reason: 'ok',
    deviceCode: 'A1B2C3',
    needLocation: true,
    locationName: 'HQ Lokeren',
    distanceM: 40,
    intervalS: 60,
    graceS: 600,
  });
});

test('only an explicit ok + "ok" unlocks', () => {
  expect(parseAnswer({ ...allowed(), ok: false }).ok).toBe(false);
  expect(parseAnswer({ ...allowed(), ok: false }).reason).toBe('blocked');
  const mixed = parseAnswer({ ...allowed(), reason: 'pending' });
  expect(mixed.ok).toBe(false);
  expect(mixed.reason).toBe('pending');
  const unknown = parseAnswer({ ok: false, reason: 'something_new' });
  expect(unknown).toMatchObject({ ok: false, reason: 'blocked' });
});

test('numbers are clamped, missing fields get defaults', () => {
  const a = parseAnswer({ ok: false, reason: 'pending', interval_s: 1, grace_s: -5 });
  expect(a.intervalS).toBe(15);
  expect(a.graceS).toBe(0);
  expect(a.deviceCode).toBe('');
  expect(a.distanceM).toBeNull();
  expect(a.needLocation).toBe(false);
  expect(parseAnswer({ ok: true, reason: 'ok', interval_s: 99999 }).intervalS).toBe(3600);
  expect(parseAnswer({ ok: true, reason: 'ok', interval_s: 'x' }).intervalS).toBe(60);
});

test('not an answer → format error', () => {
  for (const bad of [null, [], 'ok', { ok: 'yes', reason: 'ok' }, { ok: true }]) {
    expect(() => parseAnswer(bad)).toThrow(ControlError);
  }
});

test('checkDevice posts JSON and parses the answer', async () => {
  const fetchImpl = jest.fn(() => response(allowed()));
  const answer = await checkDevice(REQUEST, { fetchImpl });
  expect(answer.ok).toBe(true);
  const [url, init] = fetchImpl.mock.calls[0] as unknown as [
    string,
    { method: string; headers: Record<string, string>; body: string },
  ];
  expect(url).toBe(CONTROL_URL);
  expect(init.method).toBe('POST');
  expect(init.headers['Content-Type']).toBe('application/json');
  expect(JSON.parse(init.body)).toEqual(requestBody(REQUEST));
});

test('HTTP error, network error, bad JSON → ControlError of the right kind', async () => {
  await expect(
    checkDevice(REQUEST, { fetchImpl: () => response({ error: 'x' }, 404) }),
  ).rejects.toMatchObject({ kind: 'http', status: 404 });
  await expect(
    checkDevice(REQUEST, { fetchImpl: () => Promise.reject(new Error('down')) }),
  ).rejects.toMatchObject({ kind: 'network' });
  await expect(
    checkDevice(REQUEST, {
      fetchImpl: () =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.reject(new SyntaxError('x')),
        }),
    }),
  ).rejects.toMatchObject({ kind: 'format' });
});

test('no answer in time → timeout', async () => {
  jest.useFakeTimers();
  try {
    const fetchImpl = jest.fn(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise<never>((_resolve, reject) => {
          init.signal.addEventListener('abort', () =>
            reject(new Error('aborted')),
          );
        }),
    );
    const pending = checkDevice(REQUEST, { fetchImpl, timeoutMs: 5000 });
    jest.advanceTimersByTime(5000);
    await expect(pending).rejects.toMatchObject({ kind: 'timeout' });
  } finally {
    jest.useRealTimers();
  }
});
