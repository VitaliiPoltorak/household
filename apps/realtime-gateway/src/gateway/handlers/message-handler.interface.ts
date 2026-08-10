import { Socket } from 'socket.io';

/**
 * Marker interface for realtime message handlers (#93). Each concrete handler
 * owns ONE @SubscribeMessage event and receives the socket plus a typed
 * payload. The gateway keeps the decorator (so Nest's socket.io binding is
 * untouched) and delegates the body — handlers are then injectable, unit-
 * testable in isolation, and adding a new message = new handler class rather
 * than another method on a growing gateway.
 */
export interface MessageHandler<TPayload> {
  handle(client: Socket, payload: TPayload): Promise<void>;
}
