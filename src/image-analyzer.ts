import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { Provider } from "@smithy/types";
import { Buffer } from "node:buffer";

/**
 * Image Analyzer module for AWS BuilderCards Quiz Game
 * 
 * This module handles all image analysis related functionality including:
 * - Image capture requests
 * - AWS Bedrock multimodal AI integration
 * - BuilderCard recognition
 */

export interface ImageAnalyzerConfig {
  credentials: any;
  region: string | Provider<string>;
  eventEmitter?: any;
}

export class ImageAnalyzer {
  private latestCapturedImage: string | null = null;
  private autoCapture: boolean = true;
  private eventEmitter: any = null;
  private bedrockRuntimeClient: BedrockRuntimeClient;

  constructor(config: ImageAnalyzerConfig) {
    this.bedrockRuntimeClient = new BedrockRuntimeClient({
      region: config.region || "us-east-1",
      credentials: config.credentials,
    });
    
    if (config.eventEmitter) {
      this.eventEmitter = config.eventEmitter;
    }
  }

  /**
   * Set the latest captured image
   * @param imageBase64 Base64 encoded image data
   */
  public setLatestCapturedImage(imageBase64: string): void {
    this.latestCapturedImage = imageBase64;
    console.log("Latest captured image updated");
  }

  /**
   * Get the latest captured image
   * @returns Base64 encoded image data or null if no image is available
   */
  public getLatestCapturedImage(): string | null {
    return this.latestCapturedImage;
  }

  /**
   * Toggle auto capture setting
   * @param enable Whether to enable auto capture
   */
  public toggleAutoCapture(enable: boolean): void {
    this.autoCapture = enable;
    console.log(`Auto capture ${enable ? "enabled" : "disabled"}`);
  }

  /**
   * Check if auto capture is enabled
   * @returns True if auto capture is enabled, false otherwise
   */
  public isAutoCaptureEnabled(): boolean {
    return this.autoCapture;
  }

  /**
   * Set event emitter for communication with server
   * @param emitter Event emitter instance
   */
  public setEventEmitter(emitter: any): void {
    this.eventEmitter = emitter;
  }

  /**
   * Request photo capture via server
   */
  public requestPhotoCapture(): void {
    if (this.eventEmitter) {
      this.eventEmitter.emit("requestPhotoCapture");
      console.log("Photo capture requested");
    } else {
      console.warn("No event emitter set, cannot request photo capture");
    }
  }

  /**
   * Analyze image with AWS Bedrock multimodal AI
   * @param toolUseContent Tool use content from Nova Sonic
   * @returns Analysis result object
   */
  public async analyzeImage(toolUseContent: any): Promise<Object> {
    try {
      // Get query from user (optional)
      let query = "Describe what you see in this image in detail.";
      let expectedAnswer = "unknown service";
      try {
        if (toolUseContent && toolUseContent.content) {
          const content =
            typeof toolUseContent.content === "string"
              ? JSON.parse(toolUseContent.content)
              : toolUseContent.content;

          if (content.query) {
            query = content.query;
          }
          if (content.expectedAnswer) {
            expectedAnswer = content.expectedAnswer;
          }
        }
      } catch (e) {
        console.error("Error parsing query from tool content:", e);
      }

      console.log(`Analyzing image with query: ${query}`);
      console.log(`expectedAnswer: ${expectedAnswer}`);

      // Request photo capture if auto capture is enabled
      if (this.autoCapture) {
        console.log("Auto capture is enabled, requesting new photo capture");
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
        answersToQuestionsYouPosed: expectedAnswer
      });

      return {
        result: result,
        collect_answer: expectedAnswer
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

  /**
   * Call AWS Bedrock multimodal AI for image analysis
   * @param imageBase64 Base64 encoded image data
   * @param query Query to ask about the image
   * @returns Analysis result as string
   */
  private async callMultimodalAI(
    imageBase64: string,
    query: string,
  ): Promise<string> {
    try {
      // Convert image from base64 to binary
      const imageData = imageBase64.split(",")[1]; // Remove "data:image/png;base64," part

      let systemPrompt =
        "You are analyzing AWS BuilderCards for a quiz game. Identify which AWS service is shown on the card. Only respond with the exact AWS service name as shown on the card, including the 'AWS' or 'Amazon' prefix. Be very precise and strict in your identification. If it's not an AWS BuilderCard, say 'Not an AWS BuilderCard'.";

      // Convert Base64 string to binary data
      const binaryData = Buffer.from(imageData, "base64");

      const response = await this.bedrockRuntimeClient.send(
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
    } catch (error) {
      console.error("Error calling multimodal AI:", error);
      throw new Error(
        "Failed to process image with AI: " +
        (error instanceof Error ? error.message : String(error)),
      );
    }
  }
}
