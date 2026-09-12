import type { CustomGroup } from "../types";
import {
  resolveGroupOrderIdentity,
  type GroupRoleOrderIdentity,
  type PrivateBatchAccessById,
} from "../utils/orderContextIdentity";

export type PrivateBatchDiscoveryTerminalStatus =
  | "DENIED"
  | "ERROR"
  | "SUPERSEDED"
  | "DISPOSED";

export interface PrivateBatchDiscoveryLifecycle {
  readonly authSessionId: number;
  readonly discoveryLifecycleId: number;
  readonly uid: string;
}

export interface PrivateBatchDiscoveryAnchor {
  readonly authSessionId: number;
  readonly discoveryLifecycleId: number | null;
  readonly uid: string | null;
}

export type PrivateBatchDiscoveryResult =
  | Readonly<{
      status: "AUTHORIZED";
      uid: string;
      orderType: GroupRoleOrderIdentity["orderType"];
      batchId: string;
      authSessionId: number;
      discoveryLifecycleId: number;
      accessGeneration: number;
    }>
  | Readonly<{
      status: PrivateBatchDiscoveryTerminalStatus;
      authSessionId: number | null;
      discoveryLifecycleId: number | null;
    }>;

export interface PrivateBatchDiscoveryRequest {
  readonly uid: string;
  readonly orderType: GroupRoleOrderIdentity["orderType"];
  readonly batchId: string;
  readonly discoveryLifecycleId: number;
}

interface PendingDiscoveryLifecycle extends PrivateBatchDiscoveryLifecycle {
  readonly status: "PENDING" | "READY";
  readonly groups: readonly CustomGroup[];
  readonly accessById: PrivateBatchAccessById;
}

interface TerminalDiscoveryLifecycle {
  readonly authSessionId: number | null;
  readonly discoveryLifecycleId: number | null;
  readonly status: PrivateBatchDiscoveryTerminalStatus;
}

interface DiscoveryWaiter {
  readonly request: PrivateBatchDiscoveryRequest;
  resolve(result: PrivateBatchDiscoveryResult): void;
}

const MAX_RETAINED_TERMINAL_LIFECYCLES = 32;

/**
 * Store-lifetime Private Batch authority. The access generation invalidates
 * capabilities; discoveryLifecycleId identifies one exact owner/member/admin
 * listener run. They intentionally solve different races.
 */
export interface PrivateBatchAccessSession {
  getGeneration(): number;
  invalidate(): number;
  beginAuthSession(uid: string | null): PrivateBatchDiscoveryLifecycle | null;
  getDiscoveryAnchor(): PrivateBatchDiscoveryAnchor;
  getCurrentLifecycle(): PrivateBatchDiscoveryLifecycle | null;
  getLifecycleStatus(discoveryLifecycleId: number): "PENDING" | "READY" | PrivateBatchDiscoveryTerminalStatus | null;
  startDiscoveryForCurrentSession(uid: string): PrivateBatchDiscoveryLifecycle | null;
  publishDiscovery(snapshot: {
    discoveryLifecycleId: number;
    uid: string;
    groups: readonly CustomGroup[];
    accessById: PrivateBatchAccessById;
    ready: boolean;
  }): void;
  failDiscovery(discoveryLifecycleId: number): void;
  disposeDiscovery(discoveryLifecycleId: number): void;
  awaitPrivateBatchAccess(
    request: PrivateBatchDiscoveryRequest,
  ): Promise<PrivateBatchDiscoveryResult>;
}

export const createPrivateBatchAccessSession = (
  initialGeneration = 0,
): PrivateBatchAccessSession => {
  let generation = initialGeneration;
  let authSessionId = 0;
  let nextDiscoveryLifecycleId = 0;
  let currentAuthUid: string | null = null;
  let currentLifecycle: PendingDiscoveryLifecycle | null = null;
  const waiters = new Map<number, Set<DiscoveryWaiter>>();
  const terminalLifecycles = new Map<number, TerminalDiscoveryLifecycle>();

  const rememberTerminal = (terminal: TerminalDiscoveryLifecycle) => {
    if (terminal.discoveryLifecycleId === null) return;
    terminalLifecycles.set(terminal.discoveryLifecycleId, terminal);
    while (terminalLifecycles.size > MAX_RETAINED_TERMINAL_LIFECYCLES) {
      const oldest = terminalLifecycles.keys().next().value;
      if (typeof oldest !== "number") break;
      terminalLifecycles.delete(oldest);
    }
  };

  const resolveReadyRequest = (
    lifecycle: PendingDiscoveryLifecycle,
    request: PrivateBatchDiscoveryRequest,
  ): PrivateBatchDiscoveryResult => {
    if (lifecycle.uid !== request.uid) {
      return {
        status: "SUPERSEDED",
        authSessionId: lifecycle.authSessionId,
        discoveryLifecycleId: lifecycle.discoveryLifecycleId,
      };
    }
    const resolved = resolveGroupOrderIdentity({
      identity: { orderType: request.orderType, batchId: request.batchId },
      groups: lifecycle.groups,
      viewerUid: request.uid,
      accessById: lifecycle.accessById,
    });
    if (resolved.status !== "private_authorized") {
      return {
        status: "DENIED",
        authSessionId: lifecycle.authSessionId,
        discoveryLifecycleId: lifecycle.discoveryLifecycleId,
      };
    }
    return {
      status: "AUTHORIZED",
      uid: request.uid,
      orderType: request.orderType,
      batchId: request.batchId,
      authSessionId: lifecycle.authSessionId,
      discoveryLifecycleId: lifecycle.discoveryLifecycleId,
      accessGeneration: generation,
    };
  };

  const settle = (
    lifecycle: PrivateBatchDiscoveryLifecycle,
    status: PrivateBatchDiscoveryTerminalStatus,
  ) => {
    const terminal: TerminalDiscoveryLifecycle = {
      authSessionId: lifecycle.authSessionId,
      discoveryLifecycleId: lifecycle.discoveryLifecycleId,
      status,
    };
    if (currentLifecycle?.discoveryLifecycleId === lifecycle.discoveryLifecycleId) {
      currentLifecycle = null;
    }
    rememberTerminal(terminal);
    const lifecycleWaiters = waiters.get(lifecycle.discoveryLifecycleId);
    waiters.delete(lifecycle.discoveryLifecycleId);
    lifecycleWaiters?.forEach((waiter) => waiter.resolve(terminal));
  };

  const startDiscovery = (uid: string): PrivateBatchDiscoveryLifecycle | null => {
    if (!currentAuthUid || currentAuthUid !== uid) return null;
    if (currentLifecycle) settle(currentLifecycle, "SUPERSEDED");
    generation += 1;
    const lifecycle: PendingDiscoveryLifecycle = {
      authSessionId,
      discoveryLifecycleId: ++nextDiscoveryLifecycleId,
      uid,
      status: "PENDING",
      groups: [],
      accessById: {},
    };
    currentLifecycle = lifecycle;
    return lifecycle;
  };

  return {
    getGeneration: () => generation,
    invalidate: () => {
      generation += 1;
      return generation;
    },
    beginAuthSession: (uid) => {
      if (currentLifecycle) settle(currentLifecycle, "SUPERSEDED");
      generation += 1;
      authSessionId += 1;
      currentAuthUid = uid;
      return uid ? startDiscovery(uid) : null;
    },
    getDiscoveryAnchor: () => ({
      authSessionId,
      discoveryLifecycleId: currentLifecycle?.discoveryLifecycleId ?? null,
      uid: currentAuthUid,
    }),
    getCurrentLifecycle: () =>
      currentLifecycle
        ? {
            authSessionId: currentLifecycle.authSessionId,
            discoveryLifecycleId: currentLifecycle.discoveryLifecycleId,
            uid: currentLifecycle.uid,
          }
        : null,
    getLifecycleStatus: (discoveryLifecycleId) => {
      if (currentLifecycle?.discoveryLifecycleId === discoveryLifecycleId) {
        return currentLifecycle.status;
      }
      return terminalLifecycles.get(discoveryLifecycleId)?.status ?? null;
    },
    startDiscoveryForCurrentSession: startDiscovery,
    publishDiscovery: ({
      discoveryLifecycleId,
      uid,
      groups,
      accessById,
      ready,
    }) => {
      const lifecycle = currentLifecycle;
      if (
        !lifecycle ||
        lifecycle.discoveryLifecycleId !== discoveryLifecycleId ||
        lifecycle.uid !== uid
      ) {
        return;
      }
      const next: PendingDiscoveryLifecycle = {
        ...lifecycle,
        status: ready ? "READY" : "PENDING",
        groups,
        accessById,
      };
      currentLifecycle = next;
      if (!ready) return;
      const lifecycleWaiters = waiters.get(discoveryLifecycleId);
      waiters.delete(discoveryLifecycleId);
      lifecycleWaiters?.forEach((waiter) =>
        waiter.resolve(resolveReadyRequest(next, waiter.request)),
      );
    },
    failDiscovery: (discoveryLifecycleId) => {
      if (currentLifecycle?.discoveryLifecycleId !== discoveryLifecycleId) return;
      generation += 1;
      settle(currentLifecycle, "ERROR");
    },
    disposeDiscovery: (discoveryLifecycleId) => {
      if (currentLifecycle?.discoveryLifecycleId !== discoveryLifecycleId) return;
      generation += 1;
      settle(currentLifecycle, "DISPOSED");
    },
    awaitPrivateBatchAccess: (request) =>
      new Promise((resolvePromise) => {
        const terminal = terminalLifecycles.get(request.discoveryLifecycleId);
        if (terminal) {
          resolvePromise(terminal);
          return;
        }
        const lifecycle = currentLifecycle;
        if (!lifecycle || lifecycle.discoveryLifecycleId !== request.discoveryLifecycleId) {
          resolvePromise({
            status: "SUPERSEDED",
            authSessionId: null,
            discoveryLifecycleId: request.discoveryLifecycleId,
          });
          return;
        }
        if (lifecycle.status === "READY") {
          resolvePromise(resolveReadyRequest(lifecycle, request));
          return;
        }
        const lifecycleWaiters = waiters.get(request.discoveryLifecycleId) ?? new Set();
        lifecycleWaiters.add({ request, resolve: resolvePromise });
        waiters.set(request.discoveryLifecycleId, lifecycleWaiters);
      }),
  };
};
