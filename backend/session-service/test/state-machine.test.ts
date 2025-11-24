import { SessionStateMachine } from '../lib/state-machine';
import { SessionStatus } from '@prisma/client';
import { InvalidSessionStateError } from '../lib/errors';

describe('SessionStateMachine', () => {
  describe('canTransition', () => {
    it('should allow scheduled -> active transition', () => {
      expect(SessionStateMachine.canTransition('scheduled', 'active', 'start')).toBe(true);
    });

    it('should allow scheduled -> cancelled transition', () => {
      expect(SessionStateMachine.canTransition('scheduled', 'cancelled', 'cancel')).toBe(true);
    });

    it('should allow active -> ended transition', () => {
      expect(SessionStateMachine.canTransition('active', 'ended', 'end')).toBe(true);
    });

    it('should not allow ended -> active transition', () => {
      expect(SessionStateMachine.canTransition('ended', 'active', 'start')).toBe(false);
    });
  });

  describe('transition', () => {
    it('should transition from scheduled to active on start', () => {
      const newState = SessionStateMachine.transition('scheduled', 'start');
      expect(newState).toBe('active');
    });

    it('should transition from active to ended on end', () => {
      const newState = SessionStateMachine.transition('active', 'end');
      expect(newState).toBe('ended');
    });

    it('should throw error for invalid transition', () => {
      expect(() => {
        SessionStateMachine.transition('ended', 'start');
      }).toThrow(InvalidSessionStateError);
    });
  });

  describe('getNextStates', () => {
    it('should return correct next states for scheduled', () => {
      const nextStates = SessionStateMachine.getNextStates('scheduled');
      expect(nextStates).toContain('active');
      expect(nextStates).toContain('cancelled');
    });

    it('should return correct next states for active', () => {
      const nextStates = SessionStateMachine.getNextStates('active');
      expect(nextStates).toContain('ended');
      expect(nextStates).toContain('cancelled');
    });

    it('should return empty array for terminal states', () => {
      expect(SessionStateMachine.getNextStates('ended')).toEqual([]);
      expect(SessionStateMachine.getNextStates('cancelled')).toEqual([]);
    });
  });

  describe('isTerminalState', () => {
    it('should identify terminal states', () => {
      expect(SessionStateMachine.isTerminalState('ended')).toBe(true);
      expect(SessionStateMachine.isTerminalState('cancelled')).toBe(true);
    });

    it('should identify non-terminal states', () => {
      expect(SessionStateMachine.isTerminalState('scheduled')).toBe(false);
      expect(SessionStateMachine.isTerminalState('active')).toBe(false);
    });
  });

  describe('canStart', () => {
    it('should allow start from scheduled state', () => {
      expect(SessionStateMachine.canStart('scheduled')).toBe(true);
    });

    it('should not allow start from other states', () => {
      expect(SessionStateMachine.canStart('active')).toBe(false);
      expect(SessionStateMachine.canStart('ended')).toBe(false);
    });
  });

  describe('canEnd', () => {
    it('should allow end from active state', () => {
      expect(SessionStateMachine.canEnd('active')).toBe(true);
    });

    it('should not allow end from other states', () => {
      expect(SessionStateMachine.canEnd('scheduled')).toBe(false);
      expect(SessionStateMachine.canEnd('ended')).toBe(false);
    });
  });

  describe('canCancel', () => {
    it('should allow cancel from scheduled and active states', () => {
      expect(SessionStateMachine.canCancel('scheduled')).toBe(true);
      expect(SessionStateMachine.canCancel('active')).toBe(true);
    });

    it('should not allow cancel from terminal states', () => {
      expect(SessionStateMachine.canCancel('ended')).toBe(false);
      expect(SessionStateMachine.canCancel('cancelled')).toBe(false);
    });
  });
});
