/**
 * The fabrics listener records ready vs error without dropping a previous
 * snapshot, and Try again replaces that listener.
 */
import assert from "node:assert/strict";
import { FabricService } from "./src/services/fabricService";
import { useAppStore } from "./src/store/useAppStore";
import type { Fabric } from "./src/types";

const replace = (target: object, key: PropertyKey, value: unknown) => {
  const descriptor = Object.getOwnPropertyDescriptor(target, key);
  if (!descriptor) throw new Error(`Missing test dependency: ${String(key)}`);
  Object.defineProperty(target, key, { ...descriptor, value });
  return () => Object.defineProperty(target, key, descriptor);
};

type Listener = {
  id: number;
  onData: (fabrics: Fabric[]) => void;
  onError?: (error: unknown) => void;
};

const listeners: Listener[] = [];
const unsubscribed: number[] = [];
let nextId = 0;

const restore = replace(
  FabricService,
  "subscribeToFabrics",
  (
    onData: (fabrics: Fabric[]) => void,
    onError?: (error: unknown) => void,
  ) => {
    const id = ++nextId;
    listeners.push({ id, onData, onError });
    return () => {
      unsubscribed.push(id);
    };
  },
);

try {
  assert.equal(useAppStore.getState().fabricsLoadState, "loading");
  useAppStore.getState().retryFabricsSubscription();
  assert.equal(listeners.length, 1);
  const first = listeners[0]!;
  first.onError?.(new Error("permission-denied"));
  assert.equal(useAppStore.getState().fabricsLoadState, "error");
  assert.deepEqual(useAppStore.getState().fabrics, []);

  const fabric = {
    code: "ODG-LISTENER",
    name: "Listener Weave",
    description: "",
    color: "Green",
    colorHex: "#123456",
    category: "Test",
    price: 10,
    priceMultiplier: 1,
    stockStatus: "IN_STOCK",
  } as Fabric;
  first.onData([fabric]);
  assert.equal(useAppStore.getState().fabricsLoadState, "ready");
  assert.equal(useAppStore.getState().fabrics[0]?.code, "ODG-LISTENER");

  useAppStore.getState().retryFabricsSubscription();
  assert.deepEqual(unsubscribed, [first.id]);
  assert.equal(listeners.length, 2);
  assert.equal(useAppStore.getState().fabricsLoadState, "loading");
  assert.equal(
    useAppStore.getState().fabrics[0]?.code,
    "ODG-LISTENER",
    "Retry keeps the last catalogue until the next snapshot",
  );
  listeners[1]!.onError?.(new Error("still-offline"));
  assert.equal(useAppStore.getState().fabricsLoadState, "error");
  assert.equal(useAppStore.getState().fabrics.length, 1);

  listeners[1]!.onData([]);
  assert.equal(useAppStore.getState().fabricsLoadState, "ready");
  assert.deepEqual(useAppStore.getState().fabrics, []);
} finally {
  restore();
}

console.log("PASS: fabric catalogue listener ready, error, and retry");
