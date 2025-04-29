/**
 * Event dispatcher for handling session events
 */
export class EventDispatcher {
  /**
   * Dispatch events to handlers for a specific session
   * @param sessionData Session data containing response handlers
   * @param sessionId Session ID
   * @param eventType Event type
   * @param data Event data
   */
  public static dispatchEventForSession(
    sessionData: { responseHandlers: Map<string, (data: any) => void> },
    sessionId: string,
    eventType: string,
    data: any,
  ): void {
    if (!sessionData) return;

    const handler = sessionData.responseHandlers.get(eventType);
    if (handler) {
      try {
        handler(data);
      } catch (e) {
        console.error(
          `Error in ${eventType} handler for session ${sessionId}: `,
          e,
        );
      }
    }

    // Also dispatch to "any" handlers
    const anyHandler = sessionData.responseHandlers.get("any");
    if (anyHandler) {
      try {
        anyHandler({ type: eventType, data });
      } catch (e) {
        console.error(`Error in 'any' handler for session ${sessionId}: `, e);
      }
    }
  }
}
