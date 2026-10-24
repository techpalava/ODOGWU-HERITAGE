import assert from "node:assert/strict";
import { DEFAULT_BUSINESS_SETTINGS } from "./src/data/mockData";
import { DesignStyleAuthorityService } from "./src/services/designStyleAuthorityService";
import { FabricService } from "./src/services/fabricService";
import { StorageService } from "./src/services/storageService";
import {
  setBusinessSettingsLoadFallbackMsForTests,
  setPrivateBatchDiscoveryStartObserverForTests,
  BUSINESS_SETTINGS_LOAD_FALLBACK_MS,
  useAppStore,
} from "./src/store/useAppStore";
import type { BusinessSettings } from "./src/types";

if (typeof globalThis.localStorage === "undefined") {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      get length() {
        return values.size;
      },
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      key: (index: number) => [...values.keys()][index] ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    } satisfies Storage,
  });
}

type Deferred<T> = { promise: Promise<T>; resolve(value: T): void };
const deferred = <T,>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
};

const replace = (target: object, key: PropertyKey, value: unknown) => {
  const descriptor = Object.getOwnPropertyDescriptor(target, key);
  if (!descriptor) throw new Error(`Missing test dependency: ${String(key)}`);
  Object.defineProperty(target, key, { ...descriptor, value });
  return () => Object.defineProperty(target, key, descriptor);
};

const noopUnsubscribe = () => () => undefined;
let catalogGate = deferred<Awaited<ReturnType<typeof StorageService.getCatalog>>>();
let settingsGate = deferred<Awaited<ReturnType<typeof StorageService.getBusinessSettings>>>();
let settingsListener: {
  next: (settings: BusinessSettings | null) => void;
  error: () => void;
} | null = null;

const restore = [
  replace(StorageService, "getCatalog", () => catalogGate.promise),
  replace(StorageService, "getBusinessSettings", () => settingsGate.promise),
  replace(StorageService, "subscribeToDocument", (...args: unknown[]) => {
    settingsListener = {
      next: args[2] as (settings: BusinessSettings | null) => void,
      error: () => (args[3] as (() => void) | undefined)?.(),
    };
    return () => {
      settingsListener = null;
    };
  }),
  replace(StorageService, "subscribeToCollection", noopUnsubscribe),
  replace(StorageService, "subscribeToCustomerReviews", noopUnsubscribe),
  replace(FabricService, "subscribeToFabrics", noopUnsubscribe),
  replace(DesignStyleAuthorityService, "subscribeToPublished", noopUnsubscribe),
];
const removeObserver = setPrivateBatchDiscoveryStartObserverForTests(() => undefined);
const previousFallbackMs = BUSINESS_SETTINGS_LOAD_FALLBACK_MS;

const liveSettings = {
  ...DEFAULT_BUSINESS_SETTINGS,
  applicationSettings: {
    ...DEFAULT_BUSINESS_SETTINGS.applicationSettings,
    defaultCountry: "Ghana",
  },
  batchSettings: {
    ...DEFAULT_BUSINESS_SETTINGS.batchSettings,
    minParticipantsRequired: 15,
    maxGarmentsPerBatch: 80,
  },
} satisfies BusinessSettings;

try {
  setBusinessSettingsLoadFallbackMsForTests(60_000);
  useAppStore.setState({
    hasLoadedBusinessSettings: false,
    businessSettings: DEFAULT_BUSINESS_SETTINGS,
  });
  catalogGate = deferred();
  settingsGate = deferred();
  const errored = useAppStore.getState().initializeData();
  assert.equal(useAppStore.getState().hasLoadedBusinessSettings, false);
  assert.ok(settingsListener, "Settings listener is installed before the read settles.");
  settingsListener.error();
  assert.equal(
    useAppStore.getState().hasLoadedBusinessSettings,
    true,
    "A settings subscription error counts as loaded so the form is not stuck.",
  );
  assert.equal(
    useAppStore.getState().businessSettings.applicationSettings.defaultCountry,
    "Netherlands",
  );
  catalogGate.resolve([]);
  settingsGate.resolve(null);
  await errored;
  assert.equal(
    useAppStore.getState().businessSettings.batchSettings.minParticipantsRequired,
    10,
    "A failed one-shot read keeps the defaults already settled by the error.",
  );

  setBusinessSettingsLoadFallbackMsForTests(40);
  useAppStore.setState({
    hasLoadedBusinessSettings: false,
    businessSettings: DEFAULT_BUSINESS_SETTINGS,
  });
  catalogGate = deferred();
  settingsGate = deferred();
  const hung = useAppStore.getState().initializeData();
  assert.equal(useAppStore.getState().hasLoadedBusinessSettings, false);
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal(
    useAppStore.getState().hasLoadedBusinessSettings,
    true,
    "A hung settings read must settle on the built-in defaults.",
  );
  assert.equal(
    useAppStore.getState().businessSettings.applicationSettings.defaultCountry,
    "Netherlands",
  );
  assert.equal(useAppStore.getState().businessSettings.batchSettings.minParticipantsRequired, 10);
  assert.ok(settingsListener);
  settingsListener.next(liveSettings);
  assert.equal(useAppStore.getState().businessSettings.applicationSettings.defaultCountry, "Ghana");
  assert.equal(useAppStore.getState().businessSettings.batchSettings.minParticipantsRequired, 15);
  assert.equal(useAppStore.getState().businessSettings.batchSettings.maxGarmentsPerBatch, 80);
  catalogGate.resolve([]);
  settingsGate.resolve(null);
  await hung;
  assert.equal(
    useAppStore.getState().businessSettings.applicationSettings.defaultCountry,
    "Ghana",
    "An empty one-shot read must not wipe a snapshot that arrived after the fallback.",
  );
  assert.equal(useAppStore.getState().businessSettings.batchSettings.maxGarmentsPerBatch, 80);
} finally {
  setBusinessSettingsLoadFallbackMsForTests(previousFallbackMs);
  removeObserver();
  restore.reverse().forEach((restoreDependency) => restoreDependency());
}

console.log(
  "PASS: business settings load settles on error or timeout and still accepts a late snapshot",
);
