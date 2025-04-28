import { InvokeModelWithBidirectionalStreamInput } from "@aws-sdk/client-bedrock-runtime";
import { firstValueFrom } from "rxjs";
import { take } from "rxjs/operators";
import { SessionData } from "./session-types";
import { EventDispatcher } from "./event-dispatcher";

/**
 * StreamHandler class for managing bidirectional streams with AWS Bedrock
 */
export class StreamHandler {
  /**
   * Create an async iterable for session streaming
   * @param sessionId Session ID
   * @param sessionData Session data
   * @param isSessionActive Function to check if session is active
   * @returns AsyncIterable for bidirectional streaming
   */
  public static createSessionAsyncIterable(
    sessionId: string,
    sessionData: SessionData,
    isSessionActive: (sessionId: string) => boolean
  ): AsyncIterable<InvokeModelWithBidirectionalStreamInput> {
    if (!isSessionActive(sessionId)) {
      console.log(
        `Cannot create async iterable: Session ${sessionId} not active`
      );
      return {
        [Symbol.asyncIterator]: () => ({
          next: async () => ({ value: undefined, done: true }),
        }),
      };
    }

    if (!sessionData) {
      throw new Error(
        `Cannot create async iterable: Session ${sessionId} not found`
      );
    }

    let eventCount = 0;

    return {
      [Symbol.asyncIterator]: () => {
        console.log(
          `AsyncIterable iterator requested for session ${sessionId}`
        );

        return {
          next: async (): Promise<
            IteratorResult<InvokeModelWithBidirectionalStreamInput>
          > => {
            try {
              // Check if session is still active
              if (!sessionData.isActive || !isSessionActive(sessionId)) {
                console.log(
                  `Iterator closing for session ${sessionId}, done = true`
                );
                return { value: undefined, done: true };
              }
              // Wait for items in the queue or close signal
              if (sessionData.queue.length === 0) {
                try {
                  await Promise.race([
                    firstValueFrom(sessionData.queueSignal.pipe(take(1))),
                    firstValueFrom(sessionData.closeSignal.pipe(take(1))).then(
                      () => {
                        throw new Error("Stream closed");
                      }
                    ),
                  ]);
                } catch (error) {
                  if (error instanceof Error) {
                    if (
                      error.message === "Stream closed" ||
                      !sessionData.isActive
                    ) {
                      // This is an expected condition when closing the session
                      if (isSessionActive(sessionId)) {
                        console.log(
                          `Session ${sessionId} closed during wait`
                        );
                      }
                      return { value: undefined, done: true };
                    }
                  } else {
                    console.error(`Error on event close`, error);
                  }
                }
              }

              // If queue is still empty or session is inactive, we're done
              if (sessionData.queue.length === 0 || !sessionData.isActive) {
                console.log(`Queue empty or session inactive: ${sessionId} `);
                return { value: undefined, done: true };
              }

              // Get next item from the session's queue
              const nextEvent = sessionData.queue.shift();
              eventCount++;

              //console.log(`Sending event #${ eventCount } for session ${ sessionId }: ${ JSON.stringify(nextEvent).substring(0, 100) }...`);

              return {
                value: {
                  chunk: {
                    bytes: new TextEncoder().encode(JSON.stringify(nextEvent)),
                  },
                },
                done: false,
              };
            } catch (error) {
              console.error(`Error in session ${sessionId} iterator: `, error);
              sessionData.isActive = false;
              return { value: undefined, done: true };
            }
          },

          return: async (): Promise<
            IteratorResult<InvokeModelWithBidirectionalStreamInput>
          > => {
            console.log(`Iterator return () called for session ${sessionId}`);
            sessionData.isActive = false;
            return { value: undefined, done: true };
          },

          throw: async (
            error: any
          ): Promise<
            IteratorResult<InvokeModelWithBidirectionalStreamInput>
          > => {
            console.log(
              `Iterator throw () called for session ${sessionId} with error: `,
              error
            );
            sessionData.isActive = false;
            throw error;
          },
        };
      },
    };
  }

  /**
   * Process the response stream from AWS Bedrock
   * @param sessionId Session ID
   * @param sessionData Session data
   * @param response Response from AWS Bedrock
   * @param updateSessionActivity Function to update session activity
   * @param dispatchEvent Function to dispatch events
   * @param sendToolResult Function to send tool results
   * @param processToolUse Function to process tool use
   */
  public static async processResponseStream(
    sessionId: string,
    sessionData: SessionData,
    response: any,
    updateSessionActivity: (sessionId: string) => void,
    dispatchEvent: (sessionId: string, eventType: string, data: any) => void,
    sendToolResult: (sessionId: string, toolUseId: string, result: any) => Promise<void>,
    processToolUse: (toolName: string, toolUseContent: any) => Promise<Object>
  ): Promise<void> {
    if (!sessionData) return;

    try {
      for await (const event of response.body) {
        if (!sessionData.isActive) {
          console.log(
            `Session ${sessionId} is no longer active, stopping response processing`
          );
          break;
        }
        if (event.chunk?.bytes) {
          try {
            updateSessionActivity(sessionId);
            const textResponse = new TextDecoder().decode(event.chunk.bytes);

            try {
              const jsonResponse = JSON.parse(textResponse);
              if (jsonResponse.event?.contentStart) {
                dispatchEvent(
                  sessionId,
                  "contentStart",
                  jsonResponse.event.contentStart
                );
              } else if (jsonResponse.event?.textOutput) {
                dispatchEvent(
                  sessionId,
                  "textOutput",
                  jsonResponse.event.textOutput
                );
              } else if (jsonResponse.event?.audioOutput) {
                dispatchEvent(
                  sessionId,
                  "audioOutput",
                  jsonResponse.event.audioOutput
                );
              } else if (jsonResponse.event?.toolUse) {
                dispatchEvent(
                  sessionId,
                  "toolUse",
                  jsonResponse.event.toolUse
                );

                // Store tool use information for later
                sessionData.toolUseContent = jsonResponse.event.toolUse;
                sessionData.toolUseId = jsonResponse.event.toolUse.toolUseId;
                sessionData.toolName = jsonResponse.event.toolUse.toolName;
              } else if (
                jsonResponse.event?.contentEnd &&
                jsonResponse.event?.contentEnd?.type === "TOOL"
              ) {
                // Process tool use
                console.log(`Processing tool use for session ${sessionId}`);
                dispatchEvent(sessionId, "toolEnd", {
                  toolUseContent: sessionData.toolUseContent,
                  toolUseId: sessionData.toolUseId,
                  toolName: sessionData.toolName,
                });

                console.log("calling tooluse");
                console.log("tool use content : ", sessionData.toolUseContent);
                // function calling
                const toolResult = await processToolUse(
                  sessionData.toolName,
                  sessionData.toolUseContent
                );

                // Send tool result
                await sendToolResult(sessionId, sessionData.toolUseId, toolResult);

                // Also dispatch event about tool result
                dispatchEvent(sessionId, "toolResult", {
                  toolUseId: sessionData.toolUseId,
                  result: toolResult,
                });
              } else if (jsonResponse.event?.contentEnd) {
                dispatchEvent(
                  sessionId,
                  "contentEnd",
                  jsonResponse.event.contentEnd
                );
              } else {
                // Handle other events
                const eventKeys = Object.keys(jsonResponse.event || {});
                console.log(`Event keys for session ${sessionId}: `, eventKeys);
                console.log(`Handling other events`);
                if (eventKeys.length > 0) {
                  dispatchEvent(
                    sessionId,
                    eventKeys[0],
                    jsonResponse.event
                  );
                } else if (Object.keys(jsonResponse).length > 0) {
                  dispatchEvent(sessionId, "unknown", jsonResponse);
                }
              }
            } catch (e) {
              console.log(
                `Raw text response for session ${sessionId}(parse error): `,
                textResponse
              );
            }
          } catch (e) {
            console.error(
              `Error processing response chunk for session ${sessionId}: `,
              e
            );
          }
        } else if (event.modelStreamErrorException) {
          console.error(
            `Model stream error for session ${sessionId}: `,
            event.modelStreamErrorException
          );
          dispatchEvent(sessionId, "error", {
            type: "modelStreamErrorException",
            details: event.modelStreamErrorException,
          });
        } else if (event.internalServerException) {
          console.error(
            `Internal server error for session ${sessionId}: `,
            event.internalServerException
          );
          dispatchEvent(sessionId, "error", {
            type: "internalServerException",
            details: event.internalServerException,
          });
        }
      }

      console.log(
        `Response stream processing complete for session ${sessionId}`
      );
      dispatchEvent(sessionId, "streamComplete", {
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error(
        `Error processing response stream for session ${sessionId}: `,
        error
      );
      dispatchEvent(sessionId, "error", {
        source: "responseStream",
        message: "Error processing response stream",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
