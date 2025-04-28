import {
  BedrockRuntimeClient,
  BedrockRuntimeClientConfig,
  InvokeModelWithBidirectionalStreamCommand
} from "@aws-sdk/client-bedrock-runtime";
import {
  NodeHttp2Handler,
  NodeHttp2HandlerOptions,
} from "@smithy/node-http-handler";
import { Provider } from "@smithy/types";
import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { Subject } from "rxjs";
import {
  DefaultAudioInputConfiguration,
  DefaultAudioOutputConfiguration,
  DefaultSystemPrompt,
  DefaultTextConfiguration,
  ImageAnalysisToolSchema
} from "./consts";
import { EventDispatcher } from "./event-dispatcher";
import { ImageAnalyzer } from "./image-analyzer";
import { SessionData } from "./session-types";
import { StreamHandler } from "./stream-handler";
import { StreamSession } from "./stream-session";
import { ToolProcessor } from "./tool-processor";
import { InferenceConfig } from "./types";

export interface NovaSonicBidirectionalStreamClientConfig {
  requestHandlerConfig?:
  | NodeHttp2HandlerOptions
  | Provider<NodeHttp2HandlerOptions | void>;
  clientConfig: Partial<BedrockRuntimeClientConfig>;
  inferenceConfig?: InferenceConfig;
}

export class NovaSonicBidirectionalStreamClient {
  private bedrockRuntimeClient: BedrockRuntimeClient;
  private inferenceConfig: InferenceConfig;
  private activeSessions: Map<string, SessionData> = new Map();
  private sessionLastActivity: Map<string, number> = new Map();
  private sessionCleanupInProgress = new Set<string>();
  
  // Image analyzer instance
  private imageAnalyzer: ImageAnalyzer;
  // Tool processor
  private toolProcessor: ToolProcessor;

  constructor(config: NovaSonicBidirectionalStreamClientConfig) {
    const nodeHttp2Handler = new NodeHttp2Handler({
      requestTimeout: 300000,
      sessionTimeout: 300000,
      disableConcurrentStreams: false,
      maxConcurrentStreams: 20,
      ...config.requestHandlerConfig,
    });

    if (!config.clientConfig.credentials) {
      throw new Error("No credentials provided");
    }

    this.bedrockRuntimeClient = new BedrockRuntimeClient({
      ...config.clientConfig,
      credentials: config.clientConfig.credentials,
      region: config.clientConfig.region || "us-east-1",
      requestHandler: nodeHttp2Handler,
    });

    this.inferenceConfig = config.inferenceConfig ?? {
      maxTokens: 1024,
      topP: 0.9,
      temperature: 0.7,
    };

    // Initialize the image analyzer
    this.imageAnalyzer = new ImageAnalyzer({
      credentials: config.clientConfig.credentials,
      region: config.clientConfig.region || "us-east-1"
    });
    
    // Initialize the tool processor
    this.toolProcessor = new ToolProcessor(this.imageAnalyzer);
  }

  public isSessionActive(sessionId: string): boolean {
    const session = this.activeSessions.get(sessionId);
    return !!session && session.isActive;
  }

  public getActiveSessions(): string[] {
    return Array.from(this.activeSessions.keys());
  }

  public getLastActivityTime(sessionId: string): number {
    return this.sessionLastActivity.get(sessionId) || 0;
  }

  private updateSessionActivity(sessionId: string): void {
    this.sessionLastActivity.set(sessionId, Date.now());
  }

  public isCleanupInProgress(sessionId: string): boolean {
    return this.sessionCleanupInProgress.has(sessionId);
  }

  // Create a new streaming session
  public createStreamSession(
    sessionId: string = randomUUID(),
    config?: NovaSonicBidirectionalStreamClientConfig,
  ): StreamSession {
    if (this.activeSessions.has(sessionId)) {
      throw new Error(`Stream session with ID ${sessionId} already exists`);
    }

    const session: SessionData = {
      queue: [],
      queueSignal: new Subject<void>(),
      closeSignal: new Subject<void>(),
      responseSubject: new Subject<any>(),
      toolUseContent: null,
      toolUseId: "",
      toolName: "",
      responseHandlers: new Map(),
      promptName: randomUUID(),
      inferenceConfig: config?.inferenceConfig ?? this.inferenceConfig,
      isActive: true,
      isPromptStartSent: false,
      isAudioContentStartSent: false,
      audioContentId: randomUUID(),
    };

    this.activeSessions.set(sessionId, session);

    return new StreamSession(sessionId, this);
  }

  // Method to set image (callable from outside)
  public setLatestCapturedImage(imageBase64: string): void {
    this.imageAnalyzer.setLatestCapturedImage(imageBase64);
  }

  // Method to get image
  public getLatestCapturedImage(): string | null {
    return this.imageAnalyzer.getLatestCapturedImage();
  }

  // Method to toggle auto capture setting
  public toggleAutoCapture(enable: boolean): void {
    this.imageAnalyzer.toggleAutoCapture(enable);
  }

  // Method to get auto capture state
  public isAutoCaptureEnabled(): boolean {
    return this.imageAnalyzer.isAutoCaptureEnabled();
  }

  private async processToolUse(
    toolName: string,
    toolUseContent: any,
  ): Promise<Object> {
    return this.toolProcessor.processToolUse(toolName, toolUseContent);
  }

  public setEventEmitter(emitter: any): void {
    // Pass the event emitter to the image analyzer
    this.imageAnalyzer.setEventEmitter(emitter);
  }

  // Stream audio for a specific session
  public async initiateSession(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Stream session ${sessionId} not found`);
    }

    try {
      // Set up initial events for this session
      this.setupSessionStartEvent(sessionId);

      // Create the bidirectional stream with session-specific async iterator
      const asyncIterable = StreamHandler.createSessionAsyncIterable(
        sessionId,
        session,
        (sid) => this.isSessionActive(sid)
      );

      console.log(`Starting bidirectional stream for session ${sessionId}...`);

      const response = await this.bedrockRuntimeClient.send(
        new InvokeModelWithBidirectionalStreamCommand({
          modelId: "amazon.nova-sonic-v1:0",
          body: asyncIterable,
        }),
      );

      console.log(
        `Stream established for session ${sessionId}, processing responses...`,
      );

      // Process responses for this session
      await StreamHandler.processResponseStream(
        sessionId,
        session,
        response,
        (sid) => this.updateSessionActivity(sid),
        (sid, eventType, data) => this.dispatchEvent(sid, eventType, data),
        (sid, toolUseId, result) => this.sendToolResult(sid, toolUseId, result),
        (toolName, toolUseContent) => this.processToolUse(toolName, toolUseContent)
      );
    } catch (error) {
      console.error(`Error in session ${sessionId}: `, error);
      this.dispatchEventForSession(sessionId, "error", {
        source: "bidirectionalStream",
        error,
      });

      // Make sure to clean up if there's an error
      if (session.isActive) {
        this.closeSession(sessionId);
      }
    }
  }

  // Dispatch events to handlers for a specific session
  private dispatchEventForSession(
    sessionId: string,
    eventType: string,
    data: any,
  ): void {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    EventDispatcher.dispatchEventForSession(session, sessionId, eventType, data);
  }

  // Dispatch an event to registered handlers
  private dispatchEvent(sessionId: string, eventType: string, data: any): void {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    EventDispatcher.dispatchEventForSession(session, sessionId, eventType, data);
  }

  // Add an event to a session's queue
  private addEventToSessionQueue(sessionId: string, event: any): void {
    const session = this.activeSessions.get(sessionId);
    if (!session || !session.isActive) return;

    this.updateSessionActivity(sessionId);
    session.queue.push(event);
    session.queueSignal.next();
  }

  // Set up initial events for a session
  private setupSessionStartEvent(sessionId: string): void {
    console.log(`Setting up initial events for session ${sessionId}...`);
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    // Session start event
    this.addEventToSessionQueue(sessionId, {
      event: {
        sessionStart: {
          inferenceConfiguration: session.inferenceConfig,
        },
      },
    });
  }
  public setupPromptStartEvent(sessionId: string): void {
    console.log(`Setting up prompt start event for session ${sessionId}...`);
    const session = this.activeSessions.get(sessionId);
    if (!session) return;
    // Prompt start event
    this.addEventToSessionQueue(sessionId, {
      event: {
        promptStart: {
          promptName: session.promptName,
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
    session.isPromptStartSent = true;
  }

  public setupSystemPromptEvent(
    sessionId: string,
    textConfig: typeof DefaultTextConfiguration = DefaultTextConfiguration,
    systemPromptContent: string = DefaultSystemPrompt,
  ): void {
    console.log(`Setting up systemPrompt events for session ${sessionId}...`);
    const session = this.activeSessions.get(sessionId);
    if (!session) return;
    // Text content start
    const textPromptID = randomUUID();
    this.addEventToSessionQueue(sessionId, {
      event: {
        contentStart: {
          promptName: session.promptName,
          contentName: textPromptID,
          type: "TEXT",
          interactive: true,
          role: "SYSTEM",
          textInputConfiguration: textConfig,
        },
      },
    });

    // Text input content
    this.addEventToSessionQueue(sessionId, {
      event: {
        textInput: {
          promptName: session.promptName,
          contentName: textPromptID,
          content: systemPromptContent,
        },
      },
    });

    // Text content end
    this.addEventToSessionQueue(sessionId, {
      event: {
        contentEnd: {
          promptName: session.promptName,
          contentName: textPromptID,
        },
      },
    });
  }

  public setupStartAudioEvent(
    sessionId: string,
    audioConfig: typeof DefaultAudioInputConfiguration = DefaultAudioInputConfiguration,
  ): void {
    console.log(
      `Setting up startAudioContent event for session ${sessionId}...`,
    );
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    console.log(`Using audio content ID: ${session.audioContentId}`);
    // Audio content start
    this.addEventToSessionQueue(sessionId, {
      event: {
        contentStart: {
          promptName: session.promptName,
          contentName: session.audioContentId,
          type: "AUDIO",
          interactive: true,
          role: "USER",
          audioInputConfiguration: audioConfig,
        },
      },
    });
    session.isAudioContentStartSent = true;
    console.log(`Initial events setup complete for session ${sessionId}`);
  }

  // Stream an audio chunk for a session
  public async streamAudioChunk(
    sessionId: string,
    audioData: Buffer,
  ): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session || !session.isActive || !session.audioContentId) {
      throw new Error(`Invalid session ${sessionId} for audio streaming`);
    }
    // Convert audio to base64
    const base64Data = audioData.toString("base64");

    this.addEventToSessionQueue(sessionId, {
      event: {
        audioInput: {
          promptName: session.promptName,
          contentName: session.audioContentId,
          content: base64Data,
        },
      },
    });
  }

  // Send tool result back to the model
  private async sendToolResult(
    sessionId: string,
    toolUseId: string,
    result: any,
  ): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    console.log("inside tool result");
    if (!session || !session.isActive) return;

    console.log(
      `Sending tool result for session ${sessionId}, tool use ID: ${toolUseId}`,
    );
    const contentId = randomUUID();

    // Tool content start
    this.addEventToSessionQueue(sessionId, {
      event: {
        contentStart: {
          promptName: session.promptName,
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
    this.addEventToSessionQueue(sessionId, {
      event: {
        toolResult: {
          promptName: session.promptName,
          contentName: contentId,
          content: resultContent,
        },
      },
    });

    // Tool content end
    this.addEventToSessionQueue(sessionId, {
      event: {
        contentEnd: {
          promptName: session.promptName,
          contentName: contentId,
        },
      },
    });

    console.log(`Tool result sent for session ${sessionId}`);
  }

  public async sendContentEnd(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session || !session.isAudioContentStartSent) return;

    await this.addEventToSessionQueue(sessionId, {
      event: {
        contentEnd: {
          promptName: session.promptName,
          contentName: session.audioContentId,
        },
      },
    });

    // Wait to ensure it's processed
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  public async sendPromptEnd(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session || !session.isPromptStartSent) return;

    await this.addEventToSessionQueue(sessionId, {
      event: {
        promptEnd: {
          promptName: session.promptName,
        },
      },
    });

    // Wait to ensure it's processed
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  public async sendSessionEnd(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    await this.addEventToSessionQueue(sessionId, {
      event: {
        sessionEnd: {},
      },
    });

    // Wait to ensure it's processed
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Now it's safe to clean up
    session.isActive = false;
    session.closeSignal.next();
    session.closeSignal.complete();
    this.activeSessions.delete(sessionId);
    this.sessionLastActivity.delete(sessionId);
    console.log(`Session ${sessionId} closed and removed from active sessions`);
  }

  // Register an event handler for a session
  public registerEventHandler(
    sessionId: string,
    eventType: string,
    handler: (data: any) => void,
  ): void {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    session.responseHandlers.set(eventType, handler);
  }

  public async closeSession(sessionId: string): Promise<void> {
    if (this.sessionCleanupInProgress.has(sessionId)) {
      console.log(
        `Cleanup already in progress for session ${sessionId}, skipping`,
      );
      return;
    }
    this.sessionCleanupInProgress.add(sessionId);
    try {
      console.log(`Starting close process for session ${sessionId}`);
      await this.sendContentEnd(sessionId);
      await this.sendPromptEnd(sessionId);
      await this.sendSessionEnd(sessionId);
      console.log(`Session ${sessionId} cleanup complete`);
    } catch (error) {
      console.error(
        `Error during closing sequence for session ${sessionId}:`,
        error,
      );

      // Ensure cleanup happens even if there's an error
      const session = this.activeSessions.get(sessionId);
      if (session) {
        session.isActive = false;
        this.activeSessions.delete(sessionId);
        this.sessionLastActivity.delete(sessionId);
      }
    } finally {
      // Always clean up the tracking set
      this.sessionCleanupInProgress.delete(sessionId);
    }
  }

  // Same for forceCloseSession:
  public forceCloseSession(sessionId: string): void {
    if (
      this.sessionCleanupInProgress.has(sessionId) ||
      !this.activeSessions.has(sessionId)
    ) {
      console.log(
        `Session ${sessionId} already being cleaned up or not active`,
      );
      return;
    }

    this.sessionCleanupInProgress.add(sessionId);
    try {
      const session = this.activeSessions.get(sessionId);
      if (!session) return;

      console.log(`Force closing session ${sessionId}`);

      // Immediately mark as inactive and clean up resources
      session.isActive = false;
      session.closeSignal.next();
      session.closeSignal.complete();
      this.activeSessions.delete(sessionId);
      this.sessionLastActivity.delete(sessionId);

      console.log(`Session ${sessionId} force closed`);
    } finally {
      this.sessionCleanupInProgress.delete(sessionId);
    }
  }

  // Current AWS service being asked about
  private currentQuestionService: string | null = null;

  // Method to set the AWS service being asked about
  public setCurrentQuestionService(serviceName: string): void {
    this.currentQuestionService = serviceName;
    console.log(`Current question service set to: ${serviceName}`);
  }

  // Method to get the AWS service being asked about
  public getCurrentQuestionService(): string | null {
    return this.currentQuestionService;
  }
}
