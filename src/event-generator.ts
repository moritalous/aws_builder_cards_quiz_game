import { randomUUID } from "node:crypto";
import {
  DefaultAudioInputConfiguration,
  DefaultAudioOutputConfiguration,
  DefaultSystemPrompt,
  DefaultTextConfiguration,
  ImageAnalysisToolSchema
} from "./consts";
import { SessionData } from "./session-types";

/**
 * EventGenerator class for generating events for Nova Sonic bidirectional streaming
 */
export class EventGenerator {
  /**
   * Set up session start event
   * @param sessionId Session ID
   * @param sessionData Session data
   * @param addEventToQueue Function to add event to session queue
   */
  public static setupSessionStartEvent(
    sessionId: string,
    sessionData: SessionData,
    addEventToQueue: (sessionId: string, event: any) => void
  ): void {
    console.log(`Setting up initial events for session ${sessionId}...`);
    if (!sessionData) return;

    // Session start event
    addEventToQueue(sessionId, {
      event: {
        sessionStart: {
          inferenceConfiguration: sessionData.inferenceConfig,
        },
      },
    });
  }

  /**
   * Set up prompt start event
   * @param sessionId Session ID
   * @param sessionData Session data
   * @param addEventToQueue Function to add event to session queue
   */
  public static setupPromptStartEvent(
    sessionId: string,
    sessionData: SessionData,
    addEventToQueue: (sessionId: string, event: any) => void
  ): void {
    console.log(`Setting up prompt start event for session ${sessionId}...`);
    if (!sessionData) return;
    
    // Prompt start event
    addEventToQueue(sessionId, {
      event: {
        promptStart: {
          promptName: sessionData.promptName,
          textOutputConfiguration: {
            mediaType: "text/plain",
          },
          audioOutputConfiguration: DefaultAudioOutputConfiguration,
          toolUseOutputConfiguration: {
            mediaType: "application/json",
          },
          toolConfiguration: {
            tools: [
              {
                toolSpec: {
                  name: "analyzeImageTool",
                  description:
                    "Analyze the current camera image to identify AWS services shown on BuilderCards. ALWAYS use this tool when the user says phrases like 'I found it', 'found it', 'this is it', 'here it is', 'got it', or any similar phrase indicating they have found a card. This tool will take a photo of the card they are showing and identify which AWS service is on it.",
                  inputSchema: {
                    json: ImageAnalysisToolSchema,
                  },
                },
              },
            ],
          },
        },
      },
    });
    sessionData.isPromptStartSent = true;
  }

  /**
   * Set up system prompt event
   * @param sessionId Session ID
   * @param sessionData Session data
   * @param addEventToQueue Function to add event to session queue
   * @param textConfig Text configuration
   * @param systemPromptContent System prompt content
   */
  public static setupSystemPromptEvent(
    sessionId: string,
    sessionData: SessionData,
    addEventToQueue: (sessionId: string, event: any) => void,
    textConfig: typeof DefaultTextConfiguration = DefaultTextConfiguration,
    systemPromptContent: string = DefaultSystemPrompt,
  ): void {
    console.log(`Setting up systemPrompt events for session ${sessionId}...`);
    if (!sessionData) return;
    
    // Text content start
    const textPromptID = randomUUID();
    addEventToQueue(sessionId, {
      event: {
        contentStart: {
          promptName: sessionData.promptName,
          contentName: textPromptID,
          type: "TEXT",
          interactive: true,
          role: "SYSTEM",
          textInputConfiguration: textConfig,
        },
      },
    });

    // Text input content
    addEventToQueue(sessionId, {
      event: {
        textInput: {
          promptName: sessionData.promptName,
          contentName: textPromptID,
          content: systemPromptContent,
        },
      },
    });

    // Text content end
    addEventToQueue(sessionId, {
      event: {
        contentEnd: {
          promptName: sessionData.promptName,
          contentName: textPromptID,
        },
      },
    });
  }

  /**
   * Set up start audio event
   * @param sessionId Session ID
   * @param sessionData Session data
   * @param addEventToQueue Function to add event to session queue
   * @param audioConfig Audio configuration
   */
  public static setupStartAudioEvent(
    sessionId: string,
    sessionData: SessionData,
    addEventToQueue: (sessionId: string, event: any) => void,
    audioConfig: typeof DefaultAudioInputConfiguration = DefaultAudioInputConfiguration,
  ): void {
    console.log(
      `Setting up startAudioContent event for session ${sessionId}...`,
    );
    if (!sessionData) return;

    console.log(`Using audio content ID: ${sessionData.audioContentId}`);
    // Audio content start
    addEventToQueue(sessionId, {
      event: {
        contentStart: {
          promptName: sessionData.promptName,
          contentName: sessionData.audioContentId,
          type: "AUDIO",
          interactive: true,
          role: "USER",
          audioInputConfiguration: audioConfig,
        },
      },
    });
    sessionData.isAudioContentStartSent = true;
    console.log(`Initial events setup complete for session ${sessionId}`);
  }

  /**
   * Stream audio chunk
   * @param sessionId Session ID
   * @param sessionData Session data
   * @param audioData Audio data
   * @param addEventToQueue Function to add event to session queue
   */
  public static streamAudioChunk(
    sessionId: string,
    sessionData: SessionData,
    audioData: Buffer,
    addEventToQueue: (sessionId: string, event: any) => void,
  ): void {
    if (!sessionData || !sessionData.isActive || !sessionData.audioContentId) {
      throw new Error(`Invalid session ${sessionId} for audio streaming`);
    }
    // Convert audio to base64
    const base64Data = audioData.toString("base64");

    addEventToQueue(sessionId, {
      event: {
        audioInput: {
          promptName: sessionData.promptName,
          contentName: sessionData.audioContentId,
          content: base64Data,
        },
      },
    });
  }

  /**
   * Send tool result
   * @param sessionId Session ID
   * @param sessionData Session data
   * @param toolUseId Tool use ID
   * @param result Tool result
   * @param addEventToQueue Function to add event to session queue
   */
  public static sendToolResult(
    sessionId: string,
    sessionData: SessionData,
    toolUseId: string,
    result: any,
    addEventToQueue: (sessionId: string, event: any) => void,
  ): void {
    console.log("inside tool result");
    if (!sessionData || !sessionData.isActive) return;

    console.log(
      `Sending tool result for session ${sessionId}, tool use ID: ${toolUseId}`,
    );
    const contentId = randomUUID();

    // Tool content start
    addEventToQueue(sessionId, {
      event: {
        contentStart: {
          promptName: sessionData.promptName,
          contentName: contentId,
          interactive: false,
          type: "TOOL",
          role: "TOOL",
          toolResultInputConfiguration: {
            toolUseId: toolUseId,
            type: "TEXT",
            textInputConfiguration: {
              mediaType: "text/plain",
            },
          },
        },
      },
    });

    // Tool content input
    const resultContent =
      typeof result === "string" ? result : JSON.stringify(result);
    addEventToQueue(sessionId, {
      event: {
        toolResult: {
          promptName: sessionData.promptName,
          contentName: contentId,
          content: resultContent,
        },
      },
    });

    // Tool content end
    addEventToQueue(sessionId, {
      event: {
        contentEnd: {
          promptName: sessionData.promptName,
          contentName: contentId,
        },
      },
    });

    console.log(`Tool result sent for session ${sessionId}`);
  }

  /**
   * Send content end
   * @param sessionId Session ID
   * @param sessionData Session data
   * @param addEventToQueue Function to add event to session queue
   */
  public static async sendContentEnd(
    sessionId: string,
    sessionData: SessionData,
    addEventToQueue: (sessionId: string, event: any) => void,
  ): Promise<void> {
    if (!sessionData || !sessionData.isAudioContentStartSent) return;

    await addEventToQueue(sessionId, {
      event: {
        contentEnd: {
          promptName: sessionData.promptName,
          contentName: sessionData.audioContentId,
        },
      },
    });

    // Wait to ensure it's processed
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  /**
   * Send prompt end
   * @param sessionId Session ID
   * @param sessionData Session data
   * @param addEventToQueue Function to add event to session queue
   */
  public static async sendPromptEnd(
    sessionId: string,
    sessionData: SessionData,
    addEventToQueue: (sessionId: string, event: any) => void,
  ): Promise<void> {
    if (!sessionData || !sessionData.isPromptStartSent) return;

    await addEventToQueue(sessionId, {
      event: {
        promptEnd: {
          promptName: sessionData.promptName,
        },
      },
    });

    // Wait to ensure it's processed
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  /**
   * Send session end
   * @param sessionId Session ID
   * @param sessionData Session data
   * @param addEventToQueue Function to add event to session queue
   */
  public static async sendSessionEnd(
    sessionId: string,
    sessionData: SessionData,
    addEventToQueue: (sessionId: string, event: any) => void,
  ): Promise<void> {
    if (!sessionData) return;

    await addEventToQueue(sessionId, {
      event: {
        sessionEnd: {},
      },
    });

    // Wait to ensure it's processed
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}
