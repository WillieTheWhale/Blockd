/**
 * WebSocket Event Definitions
 * All client-to-server and server-to-client events
 */

// Client to Server events
export const CLIENT_EVENTS = {
  JOIN: 'join',
  LEAVE: 'leave',
  PING: 'ping',
  SUBMIT_ANSWER: 'answer.submit',
  GAZE_UPDATE: 'gaze.update',
} as const;

// Server to Client events
export const SERVER_EVENTS = {
  // Session lifecycle
  SESSION_CREATED: 'session.created',
  SESSION_STARTED: 'session.started',
  SESSION_ENDED: 'session.ended',
  SESSION_CANCELLED: 'session.cancelled',
  SESSION_UPDATED: 'session.updated',

  // Participants
  PARTICIPANT_JOINED: 'participant.joined',
  PARTICIPANT_LEFT: 'participant.left',
  PARTICIPANT_RECONNECTED: 'participant.reconnected',

  // Questions and answers
  QUESTION_ASKED: 'question.asked',
  ANSWER_SUBMITTED: 'answer.submitted',
  ANSWER_ANALYZED: 'answer.analyzed',

  // Security
  SECURITY_ALERT: 'security.alert',
  SECURITY_WARNING: 'security.warning',

  // Gaze tracking
  GAZE_UPDATE: 'gaze.update',
  GAZE_OFF_SCREEN: 'gaze.off_screen',

  // System
  PONG: 'pong',
  ERROR: 'error',
  AUTHENTICATED: 'authenticated',
  UNAUTHORIZED: 'unauthorized',
} as const;

export type ClientEvent = typeof CLIENT_EVENTS[keyof typeof CLIENT_EVENTS];
export type ServerEvent = typeof SERVER_EVENTS[keyof typeof SERVER_EVENTS];
