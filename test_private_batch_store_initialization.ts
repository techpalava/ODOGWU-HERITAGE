import assert from "node:assert/strict";
import { DesignStyleAuthorityService } from "./src/services/designStyleAuthorityService";
import { FabricService } from "./src/services/fabricService";
import { StorageService } from "./src/services/storageService";
import {
  setPrivateBatchDiscoveryStartObserverForTests,
  useAppStore,
} from "./src/store/useAppStore";
import type { CustomGroup } from "./src/types";

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

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

const replace = (target: object, key: PropertyKey, value: unknown) => {
  const descriptor = Object.getOwnPropertyDescriptor(target, key);
  if (!descriptor) throw new Error(`Missing test dependency: ${String(key)}`);
  Object.defineProperty(target, key, { ...descriptor, value });
  return () => Object.defineProperty(target, key, descriptor);
};

const privateGroup = {
  batchId: "initialization-private-batch-123456",
  ownerUid: "user-a",
  organizerId: "user-a",
  organizer: "User A",
  batchName: "Do not retain me through initialization",
  occasion: "Test",
  description: "Test",
  country: "NL",
  city: "Eindhoven",
  preferredDeliveryMonth: "August",
  expectedParticipants: 1,
  maxParticipants: 2,
  visibility: "PRIVATE",
  currentMembers: 1,
  closingDate: "2099-01-01",
  deliveryWindow: "Later",
  status: "OPEN",
} as CustomGroup;

type Catalog = Awaited<ReturnType<typeof StorageService.getCatalog>>;
type BusinessSettingsResult = Awaited<
  ReturnType<typeof StorageService.getBusinessSettings>
>;
const catalogGates = Array.from({ length: 5 }, () => deferred<Catalog>());
const businessSettingsGates = Array.from(
  { length: 2 },
  () => deferred<BusinessSettingsResult>(),
);
let catalogCalls = 0;
let businessSettingsCalls = 0;
let ordinaryListenerInstalls = 0;
let privateDiscoveryStarts = 0;
const restore = [
  replace(StorageService, "getCatalog", () =>
    catalogGates[catalogCalls++]!.promise,
  ),
  replace(StorageService, "getBusinessSettings", () =>
    businessSettingsGates[businessSettingsCalls++]!.promise,
  ),
  replace(StorageService, "subscribeToDocument", () => {
    ordinaryListenerInstalls += 1;
    return () => undefined;
  }),
  replace(StorageService, "subscribeToCollection", () => {
    ordinaryListenerInstalls += 1;
    return () => undefined;
  }),
  replace(FabricService, "subscribeToFabrics", () => {
    ordinaryListenerInstalls += 1;
    return () => undefined;
  }),
  replace(DesignStyleAuthorityService, "subscribeToPublished", () => {
    ordinaryListenerInstalls += 1;
    return () => undefined;
  }),
];
const removePrivateDiscoveryObserver = setPrivateBatchDiscoveryStartObserverForTests(
  () => {
    privateDiscoveryStarts += 1;
  },
);

try {
  const before = useAppStore.getState().customGroupPrivateAccessGeneration;
  useAppStore.setState({
    customGroups: [privateGroup],
    customGroupAccessById: { [privateGroup.batchId]: "owner" },
    customGroupPrivateAccessReady: true,
    customGroupPrivateAccessGeneration: before,
  });

  // A starts and stalls. B supersedes it before either catalog promise
  // resolves, so A's later completion must become completely inert.
  const initializationA = useAppStore.getState().initializeData();
  const reset = useAppStore.getState();
  assert.deepEqual(reset.customGroups, []);
  assert.deepEqual(reset.customGroupAccessById, {});
  assert.equal(reset.customGroupPrivateAccessReady, false);
  assert.equal(
    reset.customGroupPrivateAccessGeneration,
    before + 1,
    "initializeData must advance the store-lifetime access generation synchronously.",
  );
  assert.equal(reset.isLoadingData, true);

  const initializationB = useAppStore.getState().initializeData();
  const afterBStarts = useAppStore.getState();
  assert.ok(
    afterBStarts.customGroupPrivateAccessGeneration >
      reset.customGroupPrivateAccessGeneration,
    "Repeated initialization keeps Private Batch access generation monotonic.",
  );

  catalogGates[0]!.resolve([]);
  await flush();
  assert.equal(
    businessSettingsCalls,
    0,
    "Superseded A must not advance to the settings phase.",
  );
  assert.equal(ordinaryListenerInstalls, 0, "A must not install listeners.");
  assert.equal(privateDiscoveryStarts, 0, "A must not start private discovery.");
  assert.equal(
    useAppStore.getState().isLoadingData,
    true,
    "A must not mark newer B initialization complete.",
  );

  catalogGates[1]!.resolve([]);
  await flush();
  assert.equal(businessSettingsCalls, 1, "Only B reaches the settings phase.");
  businessSettingsGates[0]!.resolve(null);
  await initializationB;
  await initializationA;
  assert.ok(ordinaryListenerInstalls > 0, "Current B installs listeners.");
  assert.equal(privateDiscoveryStarts, 1, "Only current B starts private discovery.");
  assert.equal(useAppStore.getState().isLoadingData, false);

  // Exercise a three-call out-of-order completion as well: B then A resolve
  // while C is current; only C can reach subscriptions/completion.
  const listenerBaseline = ordinaryListenerInstalls;
  const discoveryBaseline = privateDiscoveryStarts;
  const initializationA2 = useAppStore.getState().initializeData();
  const initializationB2 = useAppStore.getState().initializeData();
  const initializationC = useAppStore.getState().initializeData();
  catalogGates[3]!.resolve([]);
  await flush();
  assert.equal(
    businessSettingsCalls,
    1,
    "Superseded B must not advance while C remains pending.",
  );
  catalogGates[2]!.resolve([]);
  await flush();
  assert.equal(
    ordinaryListenerInstalls,
    listenerBaseline,
    "Superseded A/B must install no listeners.",
  );
  assert.equal(
    privateDiscoveryStarts,
    discoveryBaseline,
    "Superseded A/B must not restart private discovery.",
  );
  assert.equal(useAppStore.getState().isLoadingData, true);
  catalogGates[4]!.resolve([]);
  await flush();
  assert.equal(businessSettingsCalls, 2, "Only C reaches settings.");
  businessSettingsGates[1]!.resolve(null);
  await Promise.all([initializationA2, initializationB2, initializationC]);
  assert.ok(ordinaryListenerInstalls > listenerBaseline);
  assert.equal(privateDiscoveryStarts, discoveryBaseline + 1);
  assert.equal(useAppStore.getState().isLoadingData, false);
} finally {
  removePrivateDiscoveryObserver();
  restore.reverse().forEach((restoreDependency) => restoreDependency());
}

console.log(
  "PASS: initializeData supersession leaves older startup runs inert through listener and private-discovery installation",
);
