import {
  BedrockRuntimeClient,
  BedrockRuntimeClientConfig,
  ConverseCommand,
  InvokeModelWithBidirectionalStreamCommand,
  InvokeModelWithBidirectionalStreamInput
} from "@aws-sdk/client-bedrock-runtime";
import {
  NodeHttp2Handler,
  NodeHttp2HandlerOptions,
} from "@smithy/node-http-handler";
import { Provider } from "@smithy/types";
import axios from "axios";
import https from "https";
import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { firstValueFrom, Subject } from "rxjs";
import { take } from "rxjs/operators";
import {
  DefaultAudioInputConfiguration,
  DefaultAudioOutputConfiguration,
  DefaultSystemPrompt,
  DefaultTextConfiguration,
  ImageAnalysisToolSchema
} from "./consts";
import { InferenceConfig } from "./types";

export interface NovaSonicBidirectionalStreamClientConfig {
  requestHandlerConfig?:
  | NodeHttp2HandlerOptions
  | Provider<NodeHttp2HandlerOptions | void>;
  clientConfig: Partial<BedrockRuntimeClientConfig>;
  inferenceConfig?: InferenceConfig;
}

export class StreamSession {
  private audioBufferQueue: Buffer[] = [];
  private maxQueueSize = 200; // Maximum number of audio chunks to queue
  private isProcessingAudio = false;
  private isActive = true;

  constructor(
    private sessionId: string,
    private client: NovaSonicBidirectionalStreamClient,
  ) { }

  // Register event handlers for this specific session
  public onEvent(
    eventType: string,
    handler: (data: any) => void,
  ): StreamSession {
    this.client.registerEventHandler(this.sessionId, eventType, handler);
    return this; // For chaining
  }

  public async setupPromptStart(): Promise<void> {
    this.client.setupPromptStartEvent(this.sessionId);
  }

  public async setupSystemPrompt(
    textConfig: typeof DefaultTextConfiguration = DefaultTextConfiguration,
    systemPromptContent: string = DefaultSystemPrompt,
  ): Promise<void> {
    this.client.setupSystemPromptEvent(
      this.sessionId,
      textConfig,
      systemPromptContent,
    );
  }

  public async setupStartAudio(
    audioConfig: typeof DefaultAudioInputConfiguration = DefaultAudioInputConfiguration,
  ): Promise<void> {
    this.client.setupStartAudioEvent(this.sessionId, audioConfig);
  }

  // Stream audio for this session
  public async streamAudio(audioData: Buffer): Promise<void> {
    // Check queue size to avoid memory issues
    if (this.audioBufferQueue.length >= this.maxQueueSize) {
      // Queue is full, drop oldest chunk
      this.audioBufferQueue.shift();
      console.log("Audio queue full, dropping oldest chunk");
    }

    // Queue the audio chunk for streaming
    this.audioBufferQueue.push(audioData);
    this.processAudioQueue();
  }

  // Process audio queue for continuous streaming
  private async processAudioQueue() {
    if (
      this.isProcessingAudio ||
      this.audioBufferQueue.length === 0 ||
      !this.isActive
    )
      return;

    this.isProcessingAudio = true;
    try {
      // Process all chunks in the queue, up to a reasonable limit
      let processedChunks = 0;
      const maxChunksPerBatch = 5; // Process max 5 chunks at a time to avoid overload

      while (
        this.audioBufferQueue.length > 0 &&
        processedChunks < maxChunksPerBatch &&
        this.isActive
      ) {
        const audioChunk = this.audioBufferQueue.shift();
        if (audioChunk) {
          await this.client.streamAudioChunk(this.sessionId, audioChunk);
          processedChunks++;
        }
      }
    } finally {
      this.isProcessingAudio = false;

      // If there are still items in the queue, schedule the next processing using setTimeout
      if (this.audioBufferQueue.length > 0 && this.isActive) {
        setTimeout(() => this.processAudioQueue(), 0);
      }
    }
  }
  // Get session ID
  public getSessionId(): string {
    return this.sessionId;
  }

  public async endAudioContent(): Promise<void> {
    if (!this.isActive) return;
    await this.client.sendContentEnd(this.sessionId);
  }

  public async endPrompt(): Promise<void> {
    if (!this.isActive) return;
    await this.client.sendPromptEnd(this.sessionId);
  }

  public async close(): Promise<void> {
    if (!this.isActive) return;

    this.isActive = false;
    this.audioBufferQueue = []; // Clear any pending audio

    await this.client.sendSessionEnd(this.sessionId);
    console.log(`Session ${this.sessionId} close completed`);
  }
}

// Session data type
interface SessionData {
  queue: Array<any>;
  queueSignal: Subject<void>;
  closeSignal: Subject<void>;
  responseSubject: Subject<any>;
  toolUseContent: any;
  toolUseId: string;
  toolName: string;
  responseHandlers: Map<string, (data: any) => void>;
  promptName: string;
  inferenceConfig: InferenceConfig;
  isActive: boolean;
  isPromptStartSent: boolean;
  isAudioContentStartSent: boolean;
  audioContentId: string;
}

export class NovaSonicBidirectionalStreamClient {
  private bedrockRuntimeClient: BedrockRuntimeClient;
  private inferenceConfig: InferenceConfig;
  private activeSessions: Map<string, SessionData> = new Map();
  private sessionLastActivity: Map<string, number> = new Map();
  private sessionCleanupInProgress = new Set<string>();

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

  // Variables for image analysis
  private latestCapturedImage: string | null = null;
  private autoCapture: boolean = true; // Flag to enable auto capture

  // Method to set image (callable from outside)
  public setLatestCapturedImage(imageBase64: string): void {
    this.latestCapturedImage = imageBase64;
    console.log("Latest captured image updated");
  }

  // Method to get image
  public getLatestCapturedImage(): string | null {
    return this.latestCapturedImage;
  }

  // Method to toggle auto capture setting
  public toggleAutoCapture(enable: boolean): void {
    this.autoCapture = enable;
    console.log(`Auto capture ${enable ? "enabled" : "disabled"}`);
  }

  // Method to get auto capture state
  public isAutoCaptureEnabled(): boolean {
    return this.autoCapture;
  }

  private async processToolUse(
    toolName: string,
    toolUseContent: any,
  ): Promise<Object> {
    const tool = toolName.toLowerCase();

    switch (tool) {
      // case "getdateandtimetool":
      //   const date = new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" });
      //   const pstDate = new Date(date);
      //   return {
      //     date: pstDate.toISOString().split('T')[0],
      //     year: pstDate.getFullYear(),
      //     month: pstDate.getMonth() + 1,
      //     day: pstDate.getDate(),
      //     dayOfWeek: pstDate.toLocaleString('en-US', { weekday: 'long' }).toUpperCase(),
      //     timezone: "PST",
      //     formattedTime: pstDate.toLocaleTimeString('en-US', {
      //       hour12: true,
      //       hour: '2-digit',
      //       minute: '2-digit'
      //     })
      //   };
      // case "getweathertool":
      //   console.log(`weather tool`)
      //   const parsedContent = await this.parseToolUseContentForWeather(toolUseContent);
      //   console.log("parsed content")
      //   if (!parsedContent) {
      //     throw new Error('parsedContent is undefined');
      //   }
      //   return this.fetchWeatherData(parsedContent?.latitude, parsedContent?.longitude);
      case "analyzeimagetool":
        console.log(`image analysis tool`);
        return this.analyzeImage(toolUseContent);
      default:
        console.log(`Tool ${tool} not supported`);
        throw new Error(`Tool ${tool} not supported`);
    }
  }

  // Image analysis tool implementation
  private async analyzeImage(toolUseContent: any): Promise<Object> {
    try {
      // Get query from user (optional)
      let query = "Describe what you see in this image in detail.";
      let answer = "unknown service";
      try {
        if (toolUseContent && toolUseContent.content) {
          const content =
            typeof toolUseContent.content === "string"
              ? JSON.parse(toolUseContent.content)
              : toolUseContent.content;

          if (content.query) {
            query = content.query;
          }
          if (content.answer) {
            answer = content.answer;
          }
        }
      } catch (e) {
        console.error("Error parsing query from tool content:", e);
      }

      console.log(`Analyzing image with query: ${query}`);

      // Request photo capture if auto capture is enabled
      if (this.autoCapture) {
        console.log("Auto capture is enabled, requesting new photo capture");
        // Request photo capture via server
        this.requestPhotoCapture();

        // Wait for photo to be taken (max 3 seconds)
        let waitTime = 0;
        const maxWaitTime = 3000; // 3 seconds
        const interval = 100; // Check every 100ms

        while (!this.latestCapturedImage && waitTime < maxWaitTime) {
          await new Promise((resolve) => setTimeout(resolve, interval));
          waitTime += interval;
        }
      }

      // Return error if no image available
      if (!this.latestCapturedImage) {
        return {
          error: "No image available. Please take a photo first.",
          result:
            "I don't see any image to analyze. Could you take a photo first?",
        };
      }

      // Call external multimodal AI
      const result = await this.callMultimodalAI(
        this.latestCapturedImage,
        query,
      );
      console.log({
        imageAnalysisResults: result,
        answersToQuestionsYouPosed: answer
      })

      return {
        // success: true,
        result: result,
        collect_answer: answer
      };
    } catch (error) {
      console.error("Error in image analysis:", error);
      return {
        error: error instanceof Error ? error.message : String(error),
        result:
          "Sorry, I couldn't analyze the image. There was a technical problem.",
      };
    }
  }

  // Function to request photo capture
  private requestPhotoCapture(): void {
    // Emit event to request photo capture via server
    // Actual implementation is on the server side
    this.emitEvent("requestPhotoCapture");
  }

  // Helper method to emit events
  private emitEvent(eventName: string, data: any = {}): void {
    // The server using this class instance listens for this event
    // and forwards it to clients via Socket.IO
    if (this.eventEmitter) {
      this.eventEmitter.emit(eventName, data);
    }
  }

  // Event emitter setup
  private eventEmitter: any = null;

  public setEventEmitter(emitter: any): void {
    this.eventEmitter = emitter;
  }

  // Function to call multimodal AI
  private async callMultimodalAI(
    imageBase64: string,
    query: string,
  ): Promise<string> {
    try {
      const bedrockRuntime = new BedrockRuntimeClient({
        region: "us-east-1",
        credentials: this.bedrockRuntimeClient.config.credentials,
      });

      // Convert image from base64 to binary
      const imageData = imageBase64.split(",")[1]; // Remove "data:image/png;base64," part

      // Get current question service
      const currentService = this.getCurrentQuestionService();
      let systemPrompt =
        "You are analyzing AWS BuilderCards for a quiz game. Identify which AWS service is shown on the card. Only respond with the exact AWS service name as shown on the card, including the 'AWS' or 'Amazon' prefix. Be very precise and strict in your identification. If it's not an AWS BuilderCard, say 'Not an AWS BuilderCard'.";

      // Add additional context to system prompt if question service is set
      if (currentService) {
        systemPrompt += ` The user is currently being asked about ${currentService}, but make sure you identify exactly what's on the card, not what you think should be on the card.`;
      }

      // Convert Base64 string to binary data
      const binaryData = Buffer.from(imageData, "base64");

      const response = await bedrockRuntime.send(
        new ConverseCommand({
          modelId: "us.amazon.nova-lite-v1:0",
          system: [{ text: systemPrompt }],
          messages: [
            {
              role: "user",
              content: [
                {
                  text: "What AWS service is shown on this card? Only respond with the exact AWS service name.",
                },
                {
                  image: { format: "png", source: { bytes: binaryData } },
                },
              ],
            },
          ],
          inferenceConfig: { maxTokens: 1024 },
        }),
      );

      // Check response structure and log
      console.log("Response structure:", JSON.stringify(response, null, 2));

      // Get text from correct path
      if (response.output?.message?.content) {
        const content = response.output.message.content;
        return content[0].text || "";
      } else {
        // Fallback: return full response as JSON if structure is different
        console.log(
          "Could not find text in expected structure, returning full response",
        );
        return `Response structure unexpected: ${JSON.stringify(response.output?.message?.content)}`;
      }

      // // Simple implementation (instead of actual AI call)
      // console.log("Simulating multimodal AI call with image and query:", query);

      // // Add delay to simulate AI processing time
      // await new Promise(resolve => setTimeout(resolve, 2000));

      // Return different responses based on query
      // if (query.toLowerCase().includes("person") || query.toLowerCase().includes("people")) {
      //   return "I can see a person in the image. They appear to be indoors, possibly in a home or office setting. The lighting is good, allowing for clear visibility. The person seems to be facing the camera directly.";
      // } else if (query.toLowerCase().includes("object") || query.toLowerCase().includes("what")) {
      //   return "The image shows what appears to be an indoor setting. There are various objects visible, possibly including furniture, electronics, or personal items. The scene is well-lit, suggesting it's either daytime or there's good artificial lighting.";
      // } else if (query.toLowerCase().includes("color") || query.toLowerCase().includes("colours")) {
      //   return "The dominant colors in the image appear to be neutral tones, possibly whites, grays, and beiges, which are common in indoor settings. There might be some accent colors from objects or decorations in the scene.";
      // } else {
      //   return "I can see an image that appears to be taken indoors. The lighting conditions are good, allowing for clear visibility. This seems to be a personal space, possibly a home or office environment. There are various objects visible in the frame, though without more specific questions, I'm keeping my description general to respect privacy.";
      // }
    } catch (error) {
      console.error("Error calling multimodal AI:", error);
      throw new Error(
        "Failed to process image with AI: " +
        (error instanceof Error ? error.message : String(error)),
      );
    }
  }

  private async parseToolUseContentForWeather(
    toolUseContent: any,
  ): Promise<{ latitude: number; longitude: number } | null> {
    try {
      // Check if the content field exists and is a string
      if (toolUseContent && typeof toolUseContent.content === "string") {
        // Parse the JSON string into an object
        const parsedContent = JSON.parse(toolUseContent.content);
        console.log(`parsedContent ${parsedContent}`);
        // Return the parsed content
        return {
          latitude: parsedContent.latitude,
          longitude: parsedContent.longitude,
        };
      }
      return null;
    } catch (error) {
      console.error("Failed to parse tool use content:", error);
      return null;
    }
  }

  private async fetchWeatherData(
    latitude: number,
    longitude: number,
  ): Promise<Record<string, any>> {
    const ipv4Agent = new https.Agent({ family: 4 });
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true`;

    try {
      const response = await axios.get(url, {
        httpsAgent: ipv4Agent,
        timeout: 5000,
        headers: {
          "User-Agent": "MyApp/1.0",
          Accept: "application/json",
        },
      });
      const weatherData = response.data;
      console.log("weatherData:", weatherData);

      return {
        weather_data: weatherData,
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error(`Error fetching weather data: ${error.message}`, error);
      } else {
        console.error(
          `Unexpected error: ${error instanceof Error ? error.message : String(error)} `,
          error,
        );
      }
      throw error;
    }
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
      const asyncIterable = this.createSessionAsyncIterable(sessionId);

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
      await this.processResponseStream(sessionId, response);
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

    const handler = session.responseHandlers.get(eventType);
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
    const anyHandler = session.responseHandlers.get("any");
    if (anyHandler) {
      try {
        anyHandler({ type: eventType, data });
      } catch (e) {
        console.error(`Error in 'any' handler for session ${sessionId}: `, e);
      }
    }
  }

  private createSessionAsyncIterable(
    sessionId: string,
  ): AsyncIterable<InvokeModelWithBidirectionalStreamInput> {
    if (!this.isSessionActive(sessionId)) {
      console.log(
        `Cannot create async iterable: Session ${sessionId} not active`,
      );
      return {
        [Symbol.asyncIterator]: () => ({
          next: async () => ({ value: undefined, done: true }),
        }),
      };
    }

    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(
        `Cannot create async iterable: Session ${sessionId} not found`,
      );
    }

    let eventCount = 0;

    return {
      [Symbol.asyncIterator]: () => {
        console.log(
          `AsyncIterable iterator requested for session ${sessionId}`,
        );

        return {
          next: async (): Promise<
            IteratorResult<InvokeModelWithBidirectionalStreamInput>
          > => {
            try {
              // Check if session is still active
              if (!session.isActive || !this.activeSessions.has(sessionId)) {
                console.log(
                  `Iterator closing for session ${sessionId}, done = true`,
                );
                return { value: undefined, done: true };
              }
              // Wait for items in the queue or close signal
              if (session.queue.length === 0) {
                try {
                  await Promise.race([
                    firstValueFrom(session.queueSignal.pipe(take(1))),
                    firstValueFrom(session.closeSignal.pipe(take(1))).then(
                      () => {
                        throw new Error("Stream closed");
                      },
                    ),
                  ]);
                } catch (error) {
                  if (error instanceof Error) {
                    if (
                      error.message === "Stream closed" ||
                      !session.isActive
                    ) {
                      // This is an expected condition when closing the session
                      if (this.activeSessions.has(sessionId)) {
                        console.log(
                          `Session \${ sessionId } closed during wait`,
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
              if (session.queue.length === 0 || !session.isActive) {
                console.log(`Queue empty or session inactive: ${sessionId} `);
                return { value: undefined, done: true };
              }

              // Get next item from the session's queue
              const nextEvent = session.queue.shift();
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
              session.isActive = false;
              return { value: undefined, done: true };
            }
          },

          return: async (): Promise<
            IteratorResult<InvokeModelWithBidirectionalStreamInput>
          > => {
            console.log(`Iterator return () called for session ${sessionId}`);
            session.isActive = false;
            return { value: undefined, done: true };
          },

          throw: async (
            error: any,
          ): Promise<
            IteratorResult<InvokeModelWithBidirectionalStreamInput>
          > => {
            console.log(
              `Iterator throw () called for session ${sessionId} with error: `,
              error,
            );
            session.isActive = false;
            throw error;
          },
        };
      },
    };
  }

  // Process the response stream from AWS Bedrock
  private async processResponseStream(
    sessionId: string,
    response: any,
  ): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    try {
      for await (const event of response.body) {
        if (!session.isActive) {
          console.log(
            `Session ${sessionId} is no longer active, stopping response processing`,
          );
          break;
        }
        if (event.chunk?.bytes) {
          try {
            this.updateSessionActivity(sessionId);
            const textResponse = new TextDecoder().decode(event.chunk.bytes);

            try {
              const jsonResponse = JSON.parse(textResponse);
              if (jsonResponse.event?.contentStart) {
                this.dispatchEvent(
                  sessionId,
                  "contentStart",
                  jsonResponse.event.contentStart,
                );
              } else if (jsonResponse.event?.textOutput) {
                this.dispatchEvent(
                  sessionId,
                  "textOutput",
                  jsonResponse.event.textOutput,
                );
              } else if (jsonResponse.event?.audioOutput) {
                this.dispatchEvent(
                  sessionId,
                  "audioOutput",
                  jsonResponse.event.audioOutput,
                );
              } else if (jsonResponse.event?.toolUse) {
                this.dispatchEvent(
                  sessionId,
                  "toolUse",
                  jsonResponse.event.toolUse,
                );

                // Store tool use information for later
                session.toolUseContent = jsonResponse.event.toolUse;
                session.toolUseId = jsonResponse.event.toolUse.toolUseId;
                session.toolName = jsonResponse.event.toolUse.toolName;
              } else if (
                jsonResponse.event?.contentEnd &&
                jsonResponse.event?.contentEnd?.type === "TOOL"
              ) {
                // Process tool use
                console.log(`Processing tool use for session ${sessionId}`);
                this.dispatchEvent(sessionId, "toolEnd", {
                  toolUseContent: session.toolUseContent,
                  toolUseId: session.toolUseId,
                  toolName: session.toolName,
                });

                console.log("calling tooluse");
                console.log("tool use content : ", session.toolUseContent);
                // function calling
                const toolResult = await this.processToolUse(
                  session.toolName,
                  session.toolUseContent,
                );

                // Send tool result
                this.sendToolResult(sessionId, session.toolUseId, toolResult);

                // Also dispatch event about tool result
                this.dispatchEvent(sessionId, "toolResult", {
                  toolUseId: session.toolUseId,
                  result: toolResult,
                });
              } else if (jsonResponse.event?.contentEnd) {
                this.dispatchEvent(
                  sessionId,
                  "contentEnd",
                  jsonResponse.event.contentEnd,
                );
              } else {
                // Handle other events
                const eventKeys = Object.keys(jsonResponse.event || {});
                console.log(`Event keys for session ${sessionId}: `, eventKeys);
                console.log(`Handling other events`);
                if (eventKeys.length > 0) {
                  this.dispatchEvent(
                    sessionId,
                    eventKeys[0],
                    jsonResponse.event,
                  );
                } else if (Object.keys(jsonResponse).length > 0) {
                  this.dispatchEvent(sessionId, "unknown", jsonResponse);
                }
              }
            } catch (e) {
              console.log(
                `Raw text response for session ${sessionId}(parse error): `,
                textResponse,
              );
            }
          } catch (e) {
            console.error(
              `Error processing response chunk for session ${sessionId}: `,
              e,
            );
          }
        } else if (event.modelStreamErrorException) {
          console.error(
            `Model stream error for session ${sessionId}: `,
            event.modelStreamErrorException,
          );
          this.dispatchEvent(sessionId, "error", {
            type: "modelStreamErrorException",
            details: event.modelStreamErrorException,
          });
        } else if (event.internalServerException) {
          console.error(
            `Internal server error for session ${sessionId}: `,
            event.internalServerException,
          );
          this.dispatchEvent(sessionId, "error", {
            type: "internalServerException",
            details: event.internalServerException,
          });
        }
      }

      console.log(
        `Response stream processing complete for session ${sessionId}`,
      );
      this.dispatchEvent(sessionId, "streamComplete", {
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error(
        `Error processing response stream for session ${sessionId}: `,
        error,
      );
      this.dispatchEvent(sessionId, "error", {
        source: "responseStream",
        message: "Error processing response stream",
        details: error instanceof Error ? error.message : String(error),
      });
    }
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
              // {
              //   toolSpec: {
              //     name: "getDateAndTimeTool",
              //     description: "Get information about the current date and time.",
              //     inputSchema: {
              //       json: DefaultToolSchema
              //     }
              //   }
              // },
              // {
              //   toolSpec: {
              //     name: "getWeatherTool",
              //     description: "Get the current weather for a given location, based on its WGS84 coordinates.",
              //     inputSchema: {
              //       json: WeatherToolSchema
              //     }
              //   }
              // },
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

  // Dispatch an event to registered handlers
  private dispatchEvent(sessionId: string, eventType: string, data: any): void {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    const handler = session.responseHandlers.get(eventType);
    if (handler) {
      try {
        handler(data);
      } catch (e) {
        console.error(
          `Error in ${eventType} handler for session ${sessionId}:`,
          e,
        );
      }
    }

    // Also dispatch to "any" handlers
    const anyHandler = session.responseHandlers.get("any");
    if (anyHandler) {
      try {
        anyHandler({ type: eventType, data });
      } catch (e) {
        console.error(`Error in 'any' handler for session ${sessionId}:`, e);
      }
    }
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
