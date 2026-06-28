import { SystemEvent } from '../types';

/**
 * Centralized Workflow Engine
 * Subscribes to and broadcasts system events. Replaces isolated state updates.
 * Future integration: Connects to external Webhooks, Zapier, and WordPress actions.
 */
export class WorkflowService {
  private static listeners: Record<string, Function[]> = {};

  static subscribe(eventType: string, callback: Function) {
    if (!this.listeners[eventType]) {
      this.listeners[eventType] = [];
    }
    this.listeners[eventType].push(callback);
  }

  static broadcast(eventType: string, payload: any, source: string = 'system') {
    const event: SystemEvent = {
      id: `evt-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      type: eventType,
      timestamp: new Date().toISOString(),
      payload,
      source,
      status: 'processed'
    };

    console.log(`[Workflow Engine] Broadcast: ${eventType}`, event);

    if (this.listeners[eventType]) {
      this.listeners[eventType].forEach(callback => {
        try {
          callback(event);
        } catch (e) {
          console.error(`[Workflow Engine] Listener failed for ${eventType}`, e);
        }
      });
    }
  }
}
