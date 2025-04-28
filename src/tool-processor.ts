import { ImageAnalyzer } from "./image-analyzer";

/**
 * Tool processor for handling tool use requests from Nova Sonic
 */
export class ToolProcessor {
  constructor(private imageAnalyzer: ImageAnalyzer) { }

  /**
   * Process tool use request
   * @param toolName Name of the tool to use
   * @param toolUseContent Content for the tool
   * @returns Result of the tool use
   */
  public async processToolUse(
    toolName: string,
    toolUseContent: any,
  ): Promise<Object> {
    const tool = toolName.toLowerCase();

    switch (tool) {
      case "analyzeimagetool":
        console.log(`image analysis tool`);
        return this.imageAnalyzer.analyzeImage(toolUseContent);
      default:
        console.log(`Tool ${tool} not supported`);
        throw new Error(`Tool ${tool} not supported`);
    }
  }
}
