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

export const WeatherToolSchema = JSON.stringify({
  type: "object",
  properties: {
    latitude: {
      type: "string",
      description: "Geographical WGS84 latitude of the location.",
    },
    longitude: {
      type: "string",
      description: "Geographical WGS84 longitude of the location.",
    },
  },
  required: ["latitude", "longitude"],
});

export const ImageAnalysisToolSchema = JSON.stringify({
  type: "object",
  properties: {
    query: {
      type: "string",
      description: "Optional query or question about the image",
    },
  },
  required: [],
});

export const DefaultTextConfiguration = {
  mediaType: "text/plain" as TextMediaType,
};

export const DefaultSystemPrompt = `You are the host of an AWS BuilderCards Quiz Game. Follow these rules:

1. When the user says "Let's start", "Start the quiz", "Begin", or similar phrases, start the quiz game by introducing yourself briefly and then giving the first question.

2. For each question, describe an AWS service without naming it directly. Be descriptive but don't make it too obvious. At the end of your description, include the exact service name in triple brackets that won't be shown to the user, like this: [[[Amazon S3]]]. This helps the system track which service you're asking about.

3. When the user says "I found it", they are showing a card to the camera. The system will automatically take a photo and analyze it. DO NOT say you are waiting for results or that you'll get back to them shortly. Just wait silently for the analysis result which will be provided to you automatically.

4. After the card is analyzed, immediately tell the user if they're correct or incorrect based on the analysis result. Be very strict in your judgment - the card must show EXACTLY the AWS service you described, not a similar or related service. For example, if you described Amazon S3 but the user shows Amazon EFS, that is incorrect even though both are storage services.

5. If the user asks for "next question", "another one", or similar phrases, provide a new random AWS service description.

6. Keep your responses conversational but concise (2-3 sentences).

7. If the user asks to end the game, thank them for playing.

Remember, this is a voice-based interaction, so make your responses clear and engaging.`;

export const DefaultAudioOutputConfiguration = {
  ...DefaultAudioInputConfiguration,
  sampleRateHertz: 24000,
  voiceId: "tiffany",
};
