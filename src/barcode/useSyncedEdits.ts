import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LineCommand } from '../api/barcode';
import { OdooError } from '../api/odoo';
import type { LineKey } from './picking';

/** Wait this long after the last scan before saving, so quick scans share one save. */
export const SAVE_DEBOUNCE_MS = 600;
/** Retry a save that failed for lack of network after this long. */
export const SAVE_RETRY_MS = 5000;

type Aliases = Record<LineKey, LineKey>;

type Options<D, E, V> = {
  apply: (data: D, events: E[], aliases: Aliases) => V;
  commands: (data: D, view: V) => LineCommand[];
  /** Sends the commands; resolves with Odoo's data after the save. */
  save: (commands: LineCommand[], data: D) => Promise<D>;
  aliasesAfterSave: (saved: V, before: D, after: D) => Aliases;
  /**
   * Data fetched into the session (`mergeData`) while a save was on its way,
   * combined with the save's answer. Default: the answer replaces it.
   */
  combine?: (current: D, after: D) => D;
  /**
   * Odoo refused a save for good (UserError, AccessError, server error): the
   * batch is dropped so later scans can still be saved. Reload and tell the user.
   */
  onRejected?: (error: OdooError) => void;
};

export type SyncedEdits<D, E, V> = {
  data: D | null;
  view: V | null;
  /** Records what the user did; saved to Odoo shortly after. */
  push: (event: E) => void;
  /** Saves everything now; resolves with Odoo's data, rejects with the save's error. */
  flush: () => Promise<D | null>;
  /** The data and view right now (for handlers running between renders). */
  getData: () => D | null;
  getView: () => V | null;
  /** The key a line has now (a new line gets Odoo's id once saved). */
  resolveKey: (key: LineKey) => LineKey;
  /** Starts over from fresh data (drops unsaved events). */
  reset: (data: D | null) => void;
  /** Nothing unsaved and no save on its way: reset() would lose nothing. */
  isIdle: () => boolean;
  /** Adds data fetched meanwhile (keeps unsaved events). */
  mergeData: (merge: (data: D) => D) => void;
  saving: boolean;
  /** Unsaved edits: the last save failed. */
  saveError: OdooError | null;
  pending: number;
};

/**
 * Scans and edits applied locally at once and saved to Odoo in the background,
 * in order, without losing edits made while a save is on its way.
 */
export function useSyncedEdits<D, E, V>(
  options: Options<D, E, V>,
): SyncedEdits<D, E, V> {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const dataRef = useRef<D | null>(null);
  const eventsRef = useRef<E[]>([]);
  const aliasesRef = useRef<Aliases>({});
  const inFlightRef = useRef<Promise<void> | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  /** Bumped by reset(): answers to saves from before it are dropped. */
  const generationRef = useRef(0);

  const [version, setVersion] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<OdooError | null>(null);
  const bump = useCallback(() => {
    if (mountedRef.current) {
      setVersion(v => v + 1);
    }
  }, []);

  // Leaving the screen any way at all: one last try to save what's left.
  const runRef = useRef<() => Promise<void>>(async () => {});
  useEffect(
    () => () => {
      mountedRef.current = false;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      if (eventsRef.current.length) {
        runRef.current().catch(() => {});
      }
    },
    [],
  );

  const saveOnce = useCallback(async (): Promise<void> => {
    const data = dataRef.current;
    const count = eventsRef.current.length;
    if (!data || count === 0) {
      return;
    }
    const { apply, commands, save, aliasesAfterSave, combine } =
      optionsRef.current;
    const generation = generationRef.current;
    const batch = eventsRef.current.slice(0, count);
    const view = apply(data, batch, aliasesRef.current);
    const cmds = commands(data, view);
    if (!cmds.length) {
      eventsRef.current = eventsRef.current.slice(count);
      bump();
      return;
    }
    if (mountedRef.current) {
      setSaving(true);
    }
    try {
      const after = await save(cmds, data);
      if (generationRef.current !== generation) {
        return; // reset() while saving: the new data wins.
      }
      aliasesRef.current = {
        ...aliasesRef.current,
        ...aliasesAfterSave(view, data, after),
      };
      const current = dataRef.current;
      dataRef.current =
        combine && current && current !== data
          ? combine(current, after)
          : after;
      eventsRef.current = eventsRef.current.slice(count);
      if (mountedRef.current) {
        setSaveError(null);
      }
    } catch (e) {
      const err =
        e instanceof OdooError ? e : new OdooError('server', String(e));
      const retryable =
        err.kind === 'network' ||
        err.kind === 'timeout' ||
        err.kind === 'session';
      if (!retryable && generationRef.current === generation) {
        // Re-sending the same batch would fail the same way and block every
        // later scan: drop it.
        eventsRef.current = eventsRef.current.slice(count);
        optionsRef.current.onRejected?.(err);
      }
      if (mountedRef.current) {
        setSaveError(retryable ? err : null);
      }
      throw err;
    } finally {
      if (mountedRef.current) {
        setSaving(false);
      }
      bump();
    }
  }, [bump]);

  const run = useCallback((): Promise<void> => {
    if (inFlightRef.current) {
      return inFlightRef.current.then(
        () => run(),
        () => run(),
      );
    }
    const p = saveOnce().finally(() => {
      inFlightRef.current = null;
    });
    inFlightRef.current = p;
    return p;
  }, [saveOnce]);
  runRef.current = run;

  const schedule = useCallback(
    (ms: number) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        run().catch(e => {
          const kind = e instanceof OdooError ? e.kind : 'server';
          if (
            (kind === 'network' || kind === 'timeout') &&
            mountedRef.current
          ) {
            schedule(SAVE_RETRY_MS);
          }
        });
      }, ms);
    },
    [run],
  );

  const push = useCallback(
    (event: E) => {
      eventsRef.current = [...eventsRef.current, event];
      bump();
      schedule(SAVE_DEBOUNCE_MS);
    },
    [bump, schedule],
  );

  const flush = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    // Events pushed during a save are saved by the next round.
    while (eventsRef.current.length || inFlightRef.current) {
      await run();
    }
    return dataRef.current;
  }, [run]);

  const getData = useCallback(() => dataRef.current, []);
  const getView = useCallback(
    () =>
      dataRef.current
        ? optionsRef.current.apply(
            dataRef.current,
            eventsRef.current,
            aliasesRef.current,
          )
        : null,
    [],
  );
  const resolveKey = useCallback(
    (key: LineKey) => aliasesRef.current[key] ?? key,
    [],
  );

  const reset = useCallback(
    (data: D | null) => {
      generationRef.current++;
      dataRef.current = data;
      eventsRef.current = [];
      aliasesRef.current = {};
      setSaveError(null);
      bump();
    },
    [bump],
  );

  const isIdle = useCallback(
    () =>
      eventsRef.current.length === 0 &&
      !inFlightRef.current &&
      !timerRef.current,
    [],
  );

  const mergeData = useCallback(
    (merge: (data: D) => D) => {
      if (dataRef.current) {
        dataRef.current = merge(dataRef.current);
        bump();
      }
    },
    [bump],
  );

  const data = dataRef.current;
  const view = useMemo(
    () =>
      data
        ? optionsRef.current.apply(data, eventsRef.current, aliasesRef.current)
        : null,
    // `version` changes whenever data, events or aliases do.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, version],
  );

  return {
    data,
    view,
    push,
    flush,
    getData,
    getView,
    resolveKey,
    reset,
    isIdle,
    mergeData,
    saving,
    saveError,
    pending: eventsRef.current.length,
  };
}
