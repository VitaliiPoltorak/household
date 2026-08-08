import { ServerEvents } from '@household/contracts';
import { resolveMapping } from '../src/kafka/kafka-bridge.service';

describe('resolveMapping (#94)', () => {
  describe('convention-based (auto-bridge)', () => {
    it('maps <domain>.<entity>.created → entity:created', () => {
      expect(resolveMapping('finance.transaction.created')).toEqual({
        entity: 'transaction',
        socketEvent: ServerEvents.ENTITY_CREATED,
      });
    });

    it('maps <domain>.<entity>.updated → entity:updated', () => {
      expect(resolveMapping('finance.transaction.updated')).toEqual({
        entity: 'transaction',
        socketEvent: ServerEvents.ENTITY_UPDATED,
      });
    });

    it('maps <domain>.<entity>.deleted → entity:deleted', () => {
      expect(resolveMapping('shopping.product.deleted')).toEqual({
        entity: 'product',
        socketEvent: ServerEvents.ENTITY_DELETED,
      });
    });

    it('auto-bridges a brand-new event that follows the convention', () => {
      // This is the ROI of the refactor: adding finance.budget.created on the
      // producer side requires zero edits here.
      expect(resolveMapping('finance.budget.created')).toEqual({
        entity: 'budget',
        socketEvent: ServerEvents.ENTITY_CREATED,
      });
    });
  });

  describe('explicit overrides (non-conforming events)', () => {
    it('household.created → household entity, created (2-part event)', () => {
      expect(resolveMapping('household.created')).toEqual({
        entity: 'household',
        socketEvent: ServerEvents.ENTITY_CREATED,
      });
    });

    it('household.member.joined → member entity, created (non-CRUD verb)', () => {
      expect(resolveMapping('household.member.joined')).toEqual({
        entity: 'member',
        socketEvent: ServerEvents.ENTITY_CREATED,
      });
    });

    it('household.member.removed → member entity, deleted', () => {
      expect(resolveMapping('household.member.removed')).toEqual({
        entity: 'member',
        socketEvent: ServerEvents.ENTITY_DELETED,
      });
    });

    it('shopping.list.completed → shoppingList entity, updated', () => {
      expect(resolveMapping('shopping.list.completed')).toEqual({
        entity: 'shoppingList',
        socketEvent: ServerEvents.ENTITY_UPDATED,
      });
    });

    it('shopping.item.purchased → shoppingItem entity, updated', () => {
      expect(resolveMapping('shopping.item.purchased')).toEqual({
        entity: 'shoppingItem',
        socketEvent: ServerEvents.ENTITY_UPDATED,
      });
    });
  });

  describe('unmapped events', () => {
    it('returns null for a 3-part event with an unknown action verb', () => {
      expect(resolveMapping('finance.transaction.exploded')).toBeNull();
    });

    it('returns null for a completely malformed event type', () => {
      expect(resolveMapping('nonsense')).toBeNull();
      expect(resolveMapping('one.two.three.four')).toBeNull();
    });

    it('would auto-map auth.user.created if it reached us — filtering happens at the subscription regex', () => {
      // resolveMapping is pure logic on the event type; auth events fit the
      // convention. The bridge never actually receives them because the
      // subscription regex is scoped to finance|shopping|household topics.
      // Additionally the handler drops events without a householdId.
      expect(resolveMapping('auth.user.created')).toEqual({
        entity: 'user',
        socketEvent: ServerEvents.ENTITY_CREATED,
      });
    });
  });
});
