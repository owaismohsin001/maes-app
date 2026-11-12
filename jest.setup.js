/* eslint-env jest */
/**
 * Shared Jest setup: mocks for native modules that don't exist in Node.
 * Referenced from jest.config.js (`setupFiles`). Add new native mocks here,
 * not in individual tests.
 *
 * @format
 */

jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);

// react-native-webview: a plain View carrying the props, with the imperative
// methods as jest.fn()s. Tests reach them through `WebView.lastHandle`.
jest.mock('react-native-webview', () => {
  const React = require('react');
  const { View } = require('react-native');

  const WebView = React.forwardRef(function MockWebView(props, ref) {
    const handle = React.useRef({
      goBack: jest.fn(),
      goForward: jest.fn(),
      reload: jest.fn(),
      stopLoading: jest.fn(),
      injectJavaScript: jest.fn(),
      postMessage: jest.fn(),
      clearHistory: jest.fn(),
      requestFocus: jest.fn(),
    }).current;
    React.useImperativeHandle(ref, () => handle, [handle]);
    WebView.lastHandle = handle;
    return React.createElement(View, { ...props, testID: 'webview' });
  });

  return { __esModule: true, default: WebView, WebView };
});

// react-native-svg: every element becomes a plain View carrying its props.
jest.mock('react-native-svg', () => {
  const React = require('react');
  const { View } = require('react-native');
  const element = name => {
    const Element = props =>
      React.createElement(View, { ...props, testID: props.testID ?? name });
    Element.displayName = name;
    return Element;
  };
  const Svg = element('Svg');
  return {
    __esModule: true,
    default: Svg,
    Svg,
    G: element('G'),
    Path: element('Path'),
    Circle: element('Circle'),
    Rect: element('Rect'),
    Line: element('Line'),
    Polyline: element('Polyline'),
  };
});

// The handheld scanner's TurboModule (src/native/NativeMaesScanner): resolves
// as a ready scanner by default. Tests fire native events with
// `NativeMaesScanner.__emit('onScanEvent', { type, code })` and reset with
// `__reset()`.
jest.mock('./src/native/NativeMaesScanner', () => {
  const listeners = { onScanEvent: new Set(), onScanKey: new Set() };
  const status = state => ({
    state,
    error: '',
    scanning: false,
    sdkVersion: '',
    scannerVersion: '',
    decodeVersion: '',
    scanKeyCode: 290,
    helperInstalled: false,
    cameraCount: 1,
  });
  const subscribe = name => listener => {
    listeners[name].add(listener);
    return { remove: () => listeners[name].delete(listener) };
  };
  const scanner = {
    getStatus: jest.fn(() => Promise.resolve(status('idle'))),
    prepare: jest.fn(() => Promise.resolve(status('ready'))),
    startScan: jest.fn(),
    stopScan: jest.fn(),
    feedback: jest.fn(),
    typeText: jest.fn(() => Promise.resolve(true)),
    learnScanKey: jest.fn(() => Promise.resolve(290)),
    cancelLearnScanKey: jest.fn(),
    onScanEvent: subscribe('onScanEvent'),
    onScanKey: subscribe('onScanKey'),
    __status: status,
    __emit: (name, value) => listeners[name].forEach(l => l(value)),
    __reset: () => {
      scanner.getStatus.mockImplementation(() =>
        Promise.resolve(status('idle')),
      );
      scanner.prepare.mockImplementation(() =>
        Promise.resolve(status('ready')),
      );
      scanner.typeText.mockImplementation(() => Promise.resolve(true));
      [
        scanner.getStatus,
        scanner.prepare,
        scanner.startScan,
        scanner.stopScan,
        scanner.feedback,
        scanner.typeText,
        scanner.learnScanKey,
        scanner.cancelLearnScanKey,
      ].forEach(fn => fn.mockClear());
    },
  };
  return { __esModule: true, default: scanner };
});

// The device-identity / location TurboModule (src/native/NativeMaesDevice):
// an allowed handheld on Wi-Fi with a fresh, precise position by default.
// Tests change `getInfo` / `getLocation` per test and reset with `__reset()`.
jest.mock('./src/native/NativeMaesDevice', () => {
  const info = () => ({
    deviceId: 'a1b2c3d4e5f60718',
    model: 'HC CM60',
    osVersion: '11',
    connection: 'wifi',
  });
  const location = () => ({
    status: 'ok',
    latitude: 51.0991627,
    longitude: 3.9723471,
    accuracy: 12,
    ageMs: 5000,
    mock: false,
  });
  const device = {
    getInfo: jest.fn(() => Promise.resolve(info())),
    getLocation: jest.fn(() => Promise.resolve(location())),
    __info: info,
    __location: location,
    __reset: () => {
      device.getInfo.mockReset();
      device.getInfo.mockImplementation(() => Promise.resolve(info()));
      device.getLocation.mockReset();
      device.getLocation.mockImplementation(() => Promise.resolve(location()));
    },
  };
  return { __esModule: true, default: device };
});

// The app-control check (src/api/appControl): the server allows the device
// by default. Tests replace `global.fetch` per test (see appControl tests).
global.__allowedAnswer = () => ({
  ok: true,
  reason: 'ok',
  device_code: 'A1B2C3',
  need_location: false,
  location_name: 'HQ Lokeren',
  distance_m: null,
  interval_s: 60,
  grace_s: 600,
});
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(global.__allowedAnswer()),
  }),
);
