import {
  BedrockRuntimeClient,
  BedrockRuntimeClientConfig,
  InvokeModelWithBidirectionalStreamCommand,
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
  DefaultSystemPrompt,
  DefaultTextConfiguration,
} from "../config/consts";
import { EventDispatcher } from "../stream/event-dispatcher";
import { EventGenerator } from "../stream/event-generator";
import { ImageAnalyzer } from "../tools/image-analyzer";
import { SessionData } from "../types/session-types";
import { StreamHandler } from "../stream/stream-handler";
import { StreamSession } from "../stream/stream-session";
import { ToolProcessor } from "../tools/tool-processor";
import { InferenceConfig } from "../types/types";

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
      region: config.clientConfig.region || "us-east-1",
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
        (sid) => this.isSessionActive(sid),
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
        (toolName, toolUseContent) =>
          this.processToolUse(toolName, toolUseContent),
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

    EventDispatcher.dispatchEventForSession(
      session,
      sessionId,
      eventType,
      data,
    );
  }

  // Dispatch an event to registered handlers
  private dispatchEvent(sessionId: string, eventType: string, data: any): void {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    EventDispatcher.dispatchEventForSession(
      session,
      sessionId,
      eventType,
      data,
    );
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
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    EventGenerator.setupSessionStartEvent(sessionId, session, (sid, event) =>
      this.addEventToSessionQueue(sid, event),
    );
  }

  public setupPromptStartEvent(sessionId: string): void {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    EventGenerator.setupPromptStartEvent(sessionId, session, (sid, event) =>
      this.addEventToSessionQueue(sid, event),
    );
  }

  public setupSystemPromptEvent(
    sessionId: string,
    textConfig: typeof DefaultTextConfiguration = DefaultTextConfiguration,
    systemPromptContent: string = DefaultSystemPrompt,
  ): void {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    EventGenerator.setupSystemPromptEvent(
      sessionId,
      session,
      (sid, event) => this.addEventToSessionQueue(sid, event),
      textConfig,
      systemPromptContent,
    );
  }

  public setupStartAudioEvent(
    sessionId: string,
    audioConfig: typeof DefaultAudioInputConfiguration = DefaultAudioInputConfiguration,
  ): void {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    EventGenerator.setupStartAudioEvent(
      sessionId,
      session,
      (sid, event) => this.addEventToSessionQueue(sid, event),
      audioConfig,
    );
  }

  // Stream an audio chunk for a session
  public async streamAudioChunk(
    sessionId: string,
    audioData: Buffer,
  ): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found for audio streaming`);
    }

    EventGenerator.streamAudioChunk(
      sessionId,
      session,
      audioData,
      (sid, event) => this.addEventToSessionQueue(sid, event),
    );
  }

  // Send tool result back to the model
  private async sendToolResult(
    sessionId: string,
    toolUseId: string,
    result: any,
  ): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    EventGenerator.sendToolResult(
      sessionId,
      session,
      toolUseId,
      result,
      (sid, event) => this.addEventToSessionQueue(sid, event),
    );
  }

  public async sendContentEnd(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    await EventGenerator.sendContentEnd(sessionId, session, (sid, event) =>
      this.addEventToSessionQueue(sid, event),
    );
  }

  public async sendPromptEnd(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    await EventGenerator.sendPromptEnd(sessionId, session, (sid, event) =>
      this.addEventToSessionQueue(sid, event),
    );
  }

  public async sendSessionEnd(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    await EventGenerator.sendSessionEnd(sessionId, session, (sid, event) =>
      this.addEventToSessionQueue(sid, event),
    );

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
