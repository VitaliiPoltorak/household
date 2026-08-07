import type { EventMeta } from '../kafka/event-envelope';

/**
 * DI token services use to depend on IEventPublisher instead of a concrete
 * transport class. Kept in libs/contracts (not libs/kafka) so consumers do
 * not import the transport implementation just to inject the interface.
 */
export const EVENT_PUBLISHER = Symbol('EVENT_PUBLISHER');

export interface IEventPublisher {
  emit<T extends Record<string, unknown>>(
    eventType: string,
    payload: T,
    meta?: EventMeta,
  ): Promise<void>;
}
