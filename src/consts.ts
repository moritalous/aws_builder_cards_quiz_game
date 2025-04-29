import { AudioMediaType, AudioType, TextMediaType } from "./types";

export const DefaultInferenceConfiguration = {
  maxTokens: 1024,
  topP: 0.9,
  temperature: 0.7,
};

export const DefaultAudioInputConfiguration = {
  audioType: "SPEECH" as AudioType,
  encoding: "base64",
  mediaType: "audio/lpcm" as AudioMediaType,
  sampleRateHertz: 16000,
  sampleSizeBits: 16,
  channelCount: 1,
};

export const DefaultToolSchema = JSON.stringify({
  type: "object",
  properties: {},
  required: [],
});

export const ImageAnalysisToolSchema = JSON.stringify({
  type: "object",
  properties: {
    query: {
      type: "string",
      description: "Optional query or question about the image",
    },
    expectedAnswer: {
      type: "string",
      description: "Your answer to the question. It must be a unique AWS service name (such as Amazon S3 or AWS Lambda).",
    },
  },
  required: ["query", "expectedAnswer"],
});

export const DefaultTextConfiguration = {
  mediaType: "text/plain" as TextMediaType,
};

export const DefaultSystemPrompt = ``;

export const DefaultAudioOutputConfiguration = {
  ...DefaultAudioInputConfiguration,
  sampleRateHertz: 24000,
  voiceId: "tiffany",
};
