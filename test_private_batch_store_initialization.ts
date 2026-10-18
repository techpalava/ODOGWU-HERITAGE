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
  { length: 5 },
  () => deferred<BusinessSettingsResult>(),
);
let catalogCalls = 0;
let businessSettingsCalls = 0;
let ordinaryListenerInstalls = 0;
let privateDiscoveryStarts = 0;
let activeOrdinaryListeners = 0;
const installListener = () => {
  ordinaryListenerInstalls += 1;
  activeOrdinaryListeners += 1;
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    activeOrdinaryListeners -= 1;
  };
};
const catalogOf = (id: string) => [{ id }] as unknown as Catalog;
const restore = [
  replace(StorageService, "getCatalog", () =>
    catalogGates[catalogCalls++]!.promise,
  ),
  replace(StorageService, "getBusinessSettings", () =>
    businessSettingsGates[businessSettingsCalls++]!.promise,
  ),
  replace(StorageService, "subscribeToDocument", () => installListener()),
  replace(StorageService, "subscribeToCollection", () => installListener()),
  replace(FabricService, "subscribeToFabrics", () => installListener()),
  replace(DesignStyleAuthorityService, "subscribeToPublished", () =>
    installListener(),
  ),
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

  // Since 5732403 each run starts its catalog/settings reads and listeners
  // synchronously, in parallel. Supersession is enforced by the next run
  // tearing those listeners down and by every later step checking that its
  // run is still current, so a stale run's results never land.
  assert.equal(catalogCalls, 2, "A and B each start one catalog read.");
  assert.equal(businessSettingsCalls, 2, "A and B each start one settings read.");
  const listenersPerRun = activeOrdinaryListeners;
  assert.ok(listenersPerRun > 0, "Current B has its listeners installed.");
  assert.equal(
    ordinaryListenerInstalls,
    listenersPerRun * 2,
    "A's listeners were installed and then torn down by B.",
  );
  assert.equal(privateDiscoveryStarts, 2);

  catalogGates[0]!.resolve(catalogOf("catalog-A"));
  businessSettingsGates[0]!.resolve(null);
  await flush();
  assert.equal(
    useAppStore.getState().isLoadingData,
    true,
    "Superseded A must not mark newer B initialization complete.",
  );
  assert.notDeepEqual(
    useAppStore.getState().customDetailCatalog,
    catalogOf("catalog-A"),
    "Superseded A must not publish its catalog.",
  );
  assert.equal(activeOrdinaryListeners, listenersPerRun, "A must not reinstall listeners.");

  catalogGates[1]!.resolve(catalogOf("catalog-B"));
  businessSettingsGates[1]!.resolve(null);
  await initializationB;
  await initializationA;
  assert.equal(useAppStore.getState().isLoadingData, false);
  assert.deepEqual(useAppStore.getState().customDetailCatalog, catalogOf("catalog-B"));
  assert.equal(activeOrdinaryListeners, listenersPerRun, "Only B's listeners stay active.");
  assert.equal(
    useAppStore.getState().customGroupAccessById[privateGroup.batchId],
    undefined,
    "No earlier private access survives reinitialization.",
  );

  // Three-call out-of-order completion: B then A resolve while C is current;
  // only C can publish completion, and only C's listeners stay active.
  const initializationA2 = useAppStore.getState().initializeData();
  const initializationB2 = useAppStore.getState().initializeData();
  const initializationC = useAppStore.getState().initializeData();
  assert.equal(catalogCalls, 5);
  assert.equal(businessSettingsCalls, 5);
  assert.equal(activeOrdinaryListeners, listenersPerRun);
  catalogGates[3]!.resolve(catalogOf("catalog-B2"));
  businessSettingsGates[3]!.resolve(null);
  catalogGates[2]!.resolve(catalogOf("catalog-A2"));
  businessSettingsGates[2]!.resolve(null);
  await flush();
  assert.equal(useAppStore.getState().isLoadingData, true);
  assert.deepEqual(
    useAppStore.getState().customDetailCatalog,
    catalogOf("catalog-B"),
    "Superseded A2/B2 must not publish their catalogs.",
  );
  catalogGates[4]!.resolve(catalogOf("catalog-C"));
  businessSettingsGates[4]!.resolve(null);
  await Promise.all([initializationA2, initializationB2, initializationC]);
  assert.equal(useAppStore.getState().isLoadingData, false);
  assert.deepEqual(useAppStore.getState().customDetailCatalog, catalogOf("catalog-C"));
  assert.equal(activeOrdinaryListeners, listenersPerRun);
} finally {
  removePrivateDiscoveryObserver();
  restore.reverse().forEach((restoreDependency) => restoreDependency());
}

console.log(
  "PASS: initializeData supersession keeps older startup runs from publishing results or keeping listeners",
);
