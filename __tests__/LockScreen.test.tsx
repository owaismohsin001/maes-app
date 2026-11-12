/**
 * The lock screen over Odoo (app control, odoo19Module §P450): the reason in
 * words, the device code for the admin, the right buttons, back closes the app.
 *
 * @format
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { BackHandler, Linking, Text } from 'react-native';
import type { CheckAnswer } from '../src/api/appControl';
import type { AppControl } from '../src/control/useAppControl';
import { t } from '../src/i18n';
import LockScreen, { formatDistance, lockBody } from '../src/screens/LockScreen';

const ANSWER: CheckAnswer = {
  ok: false,
  reason: 'pending',
  deviceCode: 'A1B2C3',
  needLocation: true,
  locationName: 'HQ Lokeren',
  distanceM: null,
  intervalS: 60,
  graceS: 600,
};

const control = (extra: Partial<AppControl>): AppControl => ({
  phase: 'locked',
  reason: 'pending',
  answer: ANSWER,
  permission: null,
  locationStatus: null,
  busy: false,
  recheck: jest.fn(),
  ...extra,
});

let renderer: ReactTestRenderer.ReactTestRenderer;

async function mount(c: AppControl) {
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<LockScreen control={c} />);
  });
}

afterEach(async () => {
  await ReactTestRenderer.act(async () => renderer.unmount());
  jest.restoreAllMocks();
});

const texts = () =>
  renderer.root.findAllByType(Text).map(n => {
    const c = n.props.children;
    return Array.isArray(c) ? c.join('') : String(c);
  });
/** The buttons shown, by label, in screen order. */
const buttons = () =>
  ['lock-allow-location', 'lock-open-settings', 'lock-retry']
    .map(id => renderer.root.findAllByProps({ testID: id })[0])
    .filter(Boolean)
    .map(node => node.findAllByType(Text)[0].props.children as string);
const press = async (label: string) => {
  const node = ['lock-allow-location', 'lock-open-settings', 'lock-retry']
    .map(id => renderer.root.findAllByProps({ testID: id })[0])
    .filter(Boolean)
    .find(n => n.findAllByType(Text)[0].props.children === label)!;
  await ReactTestRenderer.act(async () => node.props.onPress());
};

test('waiting for approval: title, body and the device code', async () => {
  await mount(control({}));
  expect(texts()).toEqual(
    expect.arrayContaining([
      t('control.pending.title'),
      t('control.pending.body'),
      t('control.deviceCode').replace('%s', 'A1B2C3'),
    ]),
  );
  expect(buttons()).toEqual([t('common.retry')]);
});

test.each([
  ['blocked', 'control.blocked.title'],
  ['app_disabled', 'control.disabled.title'],
  ['mock_location', 'control.mock.title'],
  ['unknown_brand', 'control.unknown.title'],
  ['offline', 'control.offline.title'],
  ['unsupported', 'control.unsupported.title'],
] as const)('%s has its own title', async (reason, key) => {
  await mount(control({ reason }));
  expect(texts()).toContain(t(key));
});

test('outside the allowed place: the place and the distance', async () => {
  const c = control({
    reason: 'outside_location',
    answer: { ...ANSWER, reason: 'outside_location', distanceM: 2345 },
  });
  expect(lockBody(c)).toBe(
    `${t('control.outside.body').replace('%s', 'HQ Lokeren')}\n${t(
      'control.outside.distance',
    ).replace('%s', formatDistance(2345))}`,
  );
  const noName = control({
    reason: 'outside_location',
    answer: { ...ANSWER, locationName: '', distanceM: null },
  });
  expect(lockBody(noName)).toBe(
    t('control.outside.body').replace('%s', t('control.outside.place')),
  );
});

test('distances', () => {
  expect(formatDistance(140.4)).toBe('140 m');
  expect(formatDistance(2345)).toMatch(/^2[.,]3 km$/);
  expect(formatDistance(23456)).toBe('23 km');
});

test('no location, permission refused: "Allow location" asks again', async () => {
  const c = control({ reason: 'no_location', permission: 'denied' });
  await mount(c);
  expect(texts()).toContain(t('control.noLocation.permissionBody'));
  expect(buttons()).toEqual([t('control.allowLocation'), t('common.retry')]);
  await press(t('control.allowLocation'));
  expect(c.recheck).toHaveBeenCalledTimes(1);
});

test('no location, permission blocked for good: open the app settings', async () => {
  const open = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
  await mount(control({ reason: 'no_location', permission: 'blocked' }));
  expect(buttons()).toEqual([t('scanner.openSettings'), t('common.retry')]);
  await press(t('scanner.openSettings'));
  expect(open).toHaveBeenCalled();
});

test('no location with permission: the plain advice, settings when location is off', async () => {
  await mount(
    control({ reason: 'no_location', permission: 'granted', locationStatus: 'off' }),
  );
  expect(texts()).toContain(t('control.noLocation.body'));
  expect(buttons()).toEqual([t('scanner.openSettings'), t('common.retry')]);
});

test('while a check runs the retry button waits', async () => {
  await mount(control({ busy: true }));
  expect(buttons()).toEqual([t('control.checkingShort')]);
});

test('checking: spinner and text only', async () => {
  await mount(control({ phase: 'checking', reason: null, answer: null }));
  expect(texts()).toEqual([t('control.checking')]);
});

test('Android back closes the app instead of walking the hidden Odoo pages', async () => {
  const add = jest.spyOn(BackHandler, 'addEventListener');
  const exit = jest.spyOn(BackHandler, 'exitApp').mockImplementation(() => {});
  await mount(control({}));
  const listener = add.mock.calls[add.mock.calls.length - 1][1];
  expect((listener as unknown as () => boolean)()).toBe(true);
  expect(exit).toHaveBeenCalled();
});
