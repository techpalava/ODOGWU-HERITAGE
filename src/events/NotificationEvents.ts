/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Event architecture for future Email/WhatsApp notification integration
export enum BatchNotificationEvent {
  BATCH_OPENED = 'BATCH_OPENED',
  BATCH_RECRUITING = 'BATCH_RECRUITING',
  ALMOST_FULL = 'ALMOST_FULL',
  PRODUCTION_READY = 'PRODUCTION_READY',
  PRODUCTION_STARTED = 'PRODUCTION_STARTED',
  QUALITY_CONTROL = 'QUALITY_CONTROL',
  PACKED = 'PACKED',
  SHIPMENT_CREATED = 'SHIPMENT_CREATED',
  ARRIVED_NETHERLANDS = 'ARRIVED_NETHERLANDS',
  READY_FOR_PICKUP = 'READY_FOR_PICKUP',
  COLLECTED = 'COLLECTED',
  COMPLETED = 'COMPLETED',
}

export interface BatchNotificationPayload {
  eventId: string;
  batchId: string;
  eventType: BatchNotificationEvent;
  timestamp: string;
  recipients: string[]; // Customer IDs or emails
  metadata?: any;
}

export const NotificationEngine = {
  dispatch: (event: BatchNotificationEvent, payload: Partial<BatchNotificationPayload>) => {
    // TODO: Wire to future WordPress/Firebase Cloud Functions
    console.log(`[Notification Engine] Event Dispatch Prepared: ${event}`, payload);
  }
};
