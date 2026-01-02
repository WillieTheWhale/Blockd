import { SessionStatus } from '@prisma/client';
import { InvalidSessionStateError } from './errors';

/**
 * Session State Machine
 *
 * State Transitions:
 * - scheduled → active (start)
 * - scheduled → cancelled (cancel)
 * - active → ended (end)
 * - active → cancelled (cancel)
 */

export type SessionState = SessionStatus;
export type SessionEvent = 'start' | 'end' | 'cancel';

interface StateTransition {
  from: SessionState;
  to: SessionState;
  event: SessionEvent;
}

// Define all valid state transitions
const VALID_TRANSITIONS: StateTransition[] = [
  { from: 'scheduled', to: 'active', event: 'start' },
  { from: 'scheduled', to: 'cancelled', event: 'cancel' },
  { from: 'active', to: 'ended', event: 'end' },
  { from: 'active', to: 'cancelled', event: 'cancel' },
];

export class SessionStateMachine {
  /**
   * Check if a state transition is valid
   */
  static canTransition(from: SessionState, to: SessionState, event: SessionEvent): boolean {
    return VALID_TRANSITIONS.some(
      (transition) =>
        transition.from === from && transition.to === to && transition.event === event
    );
  }

  /**
   * Validate and execute a state transition
   */
  static transition(
    currentState: SessionState,
    event: SessionEvent
  ): SessionState {
    const validTransition = VALID_TRANSITIONS.find(
      (t) => t.from === currentState && t.event === event
    );

    if (!validTransition) {
      throw new InvalidSessionStateError(currentState, event);
    }

    return validTransition.to;
  }

  /**
   * Get all possible next states from current state
   */
  static getNextStates(currentState: SessionState): SessionState[] {
    return VALID_TRANSITIONS
      .filter((t) => t.from === currentState)
      .map((t) => t.to);
  }

  /**
   * Get all possible events from current state
   */
  static getValidEvents(currentState: SessionState): SessionEvent[] {
    return VALID_TRANSITIONS
      .filter((t) => t.from === currentState)
      .map((t) => t.event);
  }

  /**
   * Check if state is terminal (no further transitions possible)
   */
  static isTerminalState(state: SessionState): boolean {
    return state === 'ended' || state === 'cancelled';
  }

  /**
   * Check if session can be started
   */
  static canStart(currentState: SessionState): boolean {
    return currentState === 'scheduled';
  }

  /**
   * Check if session can be ended
   */
  static canEnd(currentState: SessionState): boolean {
    return currentState === 'active';
  }

  /**
   * Check if session can be cancelled
   */
  static canCancel(currentState: SessionState): boolean {
    return currentState === 'scheduled' || currentState === 'active';
  }

  /**
   * Check if session is active
   */
  static isActive(state: SessionState): boolean {
    return state === 'active';
  }

  /**
   * Check if session is scheduled
   */
  static isScheduled(state: SessionState): boolean {
    return state === 'scheduled';
  }

  /**
   * Validate state transition or throw error
   */
  static validateTransition(
    currentState: SessionState,
    event: SessionEvent
  ): void {
    if (!this.canTransition(currentState, this.transition(currentState, event), event)) {
      throw new InvalidSessionStateError(currentState, event);
    }
  }
}

/**
 * State transition result
 */
export interface StateTransitionResult {
  success: boolean;
  previousState: SessionState;
  newState: SessionState;
  event: SessionEvent;
  timestamp: Date;
  error?: string;
}

/**
 * Execute state transition with result
 */
export function executeStateTransition(
  currentState: SessionState,
  event: SessionEvent
): StateTransitionResult {
  try {
    const newState = SessionStateMachine.transition(currentState, event);

    return {
      success: true,
      previousState: currentState,
      newState,
      event,
      timestamp: new Date(),
    };
  } catch (error) {
    return {
      success: false,
      previousState: currentState,
      newState: currentState,
      event,
      timestamp: new Date(),
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
