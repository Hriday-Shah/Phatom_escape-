/** Join with no game server (R12-4 / R13-3). */
export const OFFLINE_JOIN_TEXT = 'This room is on another device — ask the host for their online invite link.';

/** Homepage join-field message. Shown on load for an offline ?room= (R13-3), not only after Join. */
export function joinPrompt(fullCode: boolean, hasServer: boolean): string {
  if (!fullCode) return 'Enter a 6-character code to join.';
  if (!hasServer) return OFFLINE_JOIN_TEXT;
  return '';
}
