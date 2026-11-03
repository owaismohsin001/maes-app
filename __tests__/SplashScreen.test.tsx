/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import SplashScreen, {
  SPLASH_DURATION_MS,
  SPLASH_MAX_WAIT_MS,
} from '../src/screens/SplashScreen';

jest.useFakeTimers();

/** Advances fake time in small steps, letting React re-render in between like real time. */
async function advance(ms: number) {
  for (let t = 0; t < ms; t += 100) {
    await ReactTestRenderer.act(() => {
      jest.advanceTimersByTime(Math.min(100, ms - t));
    });
  }
}

test('calls onFinish once the animation has played out', async () => {
  const onFinish = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<SplashScreen onFinish={onFinish} />);
  });
  expect(onFinish).not.toHaveBeenCalled();

  await advance(SPLASH_DURATION_MS + 1000);
  expect(onFinish).toHaveBeenCalledTimes(1);

  await ReactTestRenderer.act(() => {
    renderer.unmount();
  });
});

test('does not call onFinish when unmounted early', async () => {
  const onFinish = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<SplashScreen onFinish={onFinish} />);
  });
  await ReactTestRenderer.act(() => {
    jest.advanceTimersByTime(500);
    renderer.unmount();
  });
  await advance(SPLASH_DURATION_MS + 1000);

  expect(onFinish).not.toHaveBeenCalled();
});

test('waits for `ready`, however long that takes after the minimum time', async () => {
  const onFinish = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <SplashScreen ready={false} onFinish={onFinish} />,
    );
  });
  await advance(SPLASH_DURATION_MS + 5000);
  expect(onFinish).not.toHaveBeenCalled();

  await ReactTestRenderer.act(() => {
    renderer.update(<SplashScreen ready onFinish={onFinish} />);
  });
  await advance(1000);
  expect(onFinish).toHaveBeenCalledTimes(1);

  await ReactTestRenderer.act(() => renderer.unmount());
});

test('ready early still shows the splash for its minimum time', async () => {
  const onFinish = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <SplashScreen ready onFinish={onFinish} />,
    );
  });
  await advance(SPLASH_DURATION_MS - 500);
  expect(onFinish).not.toHaveBeenCalled();

  await ReactTestRenderer.act(() => renderer.unmount());
});

test('gives up waiting after the maximum time', async () => {
  const onFinish = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <SplashScreen ready={false} onFinish={onFinish} />,
    );
  });
  await advance(SPLASH_MAX_WAIT_MS + 1000);
  expect(onFinish).toHaveBeenCalledTimes(1);

  await ReactTestRenderer.act(() => renderer.unmount());
});
