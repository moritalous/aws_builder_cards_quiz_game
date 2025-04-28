import { AudioPlayer } from "../lib/play/AudioPlayer.js";
import { TARGET_SAMPLE_RATE, isFirefox } from './config.js';
import { socket } from './socket.js';

// Audio processing variables
let audioContext;
let audioStream;
let isStreaming = false;
let processor;
let sourceNode;
let samplingRatio = 1;
const audioPlayer = new AudioPlayer();

// Initialize audio context and request microphone access
export async function initAudio(statusElement) {
  try {
    statusElement.textContent = "Requesting microphone access...";
    statusElement.className = "connecting";

    // Request microphone access
    audioStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    if (isFirefox) {
      //firefox doesn't allow audio context have differnt sample rate than what the user media device offers
      audioContext = new AudioContext();
    } else {
      audioContext = new AudioContext({
        sampleRate: TARGET_SAMPLE_RATE,
      });
    }

    //samplingRatio - is only relevant for firefox, for Chromium based browsers, it's always 1
    samplingRatio = audioContext.sampleRate / TARGET_SAMPLE_RATE;
    console.log(
      `Debug AudioContext- sampleRate: ${audioContext.sampleRate} samplingRatio: ${samplingRatio}`,
    );

    await audioPlayer.start();

    statusElement.textContent = "Microphone ready. Click Start to begin.";
    statusElement.className = "ready";
    return true;
  } catch (error) {
    console.error("Error accessing microphone:", error);
    statusElement.textContent = "Error: " + error.message;
    statusElement.className = "error";
    return false;
  }
}

// Start streaming audio to the server
export async function startStreaming(statusElement) {
  if (isStreaming) return;

  try {
    // Create audio processor
    sourceNode = audioContext.createMediaStreamSource(audioStream);

    // Use ScriptProcessorNode for audio processing
    if (audioContext.createScriptProcessor) {
      processor = audioContext.createScriptProcessor(512, 1, 1);

      processor.onaudioprocess = (e) => {
        if (!isStreaming) return;

        const inputData = e.inputBuffer.getChannelData(0);
        const numSamples = Math.round(inputData.length / samplingRatio);
        const pcmData = isFirefox
          ? new Int16Array(numSamples)
          : new Int16Array(inputData.length);

        // Convert to 16-bit PCM
        if (isFirefox) {
          for (let i = 0; i < inputData.length; i++) {
            //NOTE: for firefox the samplingRatio is not 1,
            // so it will downsample by skipping some input samples
            // A better approach is to compute the mean of the samplingRatio samples.
            // or pass through a low-pass filter first
            // But skipping is a preferable low-latency operation
            pcmData[i] =
              Math.max(-1, Math.min(1, inputData[i * samplingRatio])) * 0x7fff;
          }
        } else {
          for (let i = 0; i < inputData.length; i++) {
            pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7fff;
          }
        }

        // Convert to base64 (browser-safe way)
        const base64Data = arrayBufferToBase64(pcmData.buffer);

        // Send to server
        socket.emit("audioInput", base64Data);
      };

      sourceNode.connect(processor);
      processor.connect(audioContext.destination);
    }

    isStreaming = true;
    statusElement.textContent = "Streaming... Speak now";
    statusElement.className = "recording";
    
    return true;
  } catch (error) {
    console.error("Error starting recording:", error);
    statusElement.textContent = "Error: " + error.message;
    statusElement.className = "error";
    return false;
  }
}

// Stop streaming audio
export function stopStreaming(statusElement) {
  if (!isStreaming) return;

  isStreaming = false;

  // Clean up audio processing
  if (processor) {
    processor.disconnect();
    sourceNode.disconnect();
  }

  statusElement.textContent = "Processing...";
  statusElement.className = "processing";

  audioPlayer.stop();
  // Tell server to finalize processing
  socket.emit("stopAudio");
}

// Convert ArrayBuffer to base64 string
function arrayBufferToBase64(buffer) {
  const binary = [];
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary.push(String.fromCharCode(bytes[i]));
  }
  return btoa(binary.join(""));
}

// Base64 to Float32Array conversion for audio playback
export function base64ToFloat32Array(base64String) {
  try {
    const binaryString = window.atob(base64String);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const int16Array = new Int16Array(bytes.buffer);
    const float32Array = new Float32Array(int16Array.length);
    for (let i = 0; i < int16Array.length; i++) {
      float32Array[i] = int16Array[i] / 32768.0;
    }

    return float32Array;
  } catch (error) {
    console.error("Error in base64ToFloat32Array:", error);
    throw error;
  }
}

// Play audio data
export function playAudio(audioData) {
  audioPlayer.playAudio(audioData);
}

// Handle barge-in (interruption)
export function bargeIn() {
  audioPlayer.bargeIn();
}

// Check if audio is currently streaming
export function isAudioStreaming() {
  return isStreaming;
}

// Get audio player instance
export function getAudioPlayer() {
  return audioPlayer;
}
