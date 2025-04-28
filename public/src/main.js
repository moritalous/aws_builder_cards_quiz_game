import { base64ToFloat32Array, initAudio, isAudioStreaming, playAudio, startStreaming, stopStreaming } from "./modules/audio.js";
import { handleAutoPhotoCapture, initCamera } from "./modules/camera.js";
import { handleContentEnd, handleContentStart, handleTextOutputEvent, initChat, showUserThinkingIndicator, updateChatUI } from "./modules/chat.js";
import { SYSTEM_PROMPT } from "./modules/config.js";
import { initSocket, initializeSession } from "./modules/socket.js";

// DOM elements
const elements = {
  // Main elements
  startButton: document.getElementById("start"),
  stopButton: document.getElementById("stop"),
  statusElement: document.getElementById("status"),
  mainContainer: document.getElementById("main-container"),

  // Chat elements
  chatContainer: document.getElementById("chat-container"),
  toggleChatButton: document.getElementById("toggle-chat"),

  // Camera elements
  videoContainer: document.getElementById("video-container"),
  cameraToggleButton: document.getElementById("camera-toggle"),
  videoElement: document.getElementById("camera-feed"),
  takePhotoButton: document.getElementById("take-photo"),
  photoCanvas: document.getElementById("photo-canvas"),
  photoPreviewContainer: document.getElementById("photo-preview-container"),
  photoPreview: document.getElementById("photo-preview"),
  savePhotoButton: document.getElementById("save-photo"),
  discardPhotoButton: document.getElementById("discard-photo"),
  autoCaptureToggleButton: document.getElementById("auto-capture-toggle"),
  cameraSelectElement: document.getElementById("camera-select")
};

// Session state
let sessionInitialized = false;

// Initialize the application
async function initializeApp() {
  // Initialize audio
  const audioInitialized = await initAudio(elements.statusElement);
  if (audioInitialized) {
    elements.startButton.disabled = false;
  }

  // Initialize camera
  initCamera(elements);

  // Initialize chat
  initChat(elements);

  // Initialize socket with callbacks
  initSocket(elements, {
    onAudioOutput: handleAudioOutput,
    onTextOutput: handleTextOutput,
    onContentStart: handleContentStartEvent,
    onContentEnd: handleContentEndEvent,
    onTakePhotoRequest: handleTakePhotoRequest,
    onStreamComplete: handleStreamComplete
  });

  // Set up event listeners
  setupEventListeners();
}

// Set up event listeners
function setupEventListeners() {
  elements.startButton.addEventListener("click", handleStartButtonClick);
  elements.stopButton.addEventListener("click", handleStopButtonClick);
}

// Handle start button click
async function handleStartButtonClick() {
  // First, make sure the session is initialized
  if (!sessionInitialized) {
    elements.statusElement.textContent = "Initializing session...";
    sessionInitialized = await initializeSession(SYSTEM_PROMPT);
    if (!sessionInitialized) {
      elements.statusElement.textContent = "Error initializing session";
      elements.statusElement.className = "error";
      return;
    }
  }

  // Start streaming audio
  const streamingStarted = await startStreaming(elements.statusElement);
  if (streamingStarted) {
    elements.startButton.disabled = true;
    elements.stopButton.disabled = false;

    // Show user thinking indicator when starting to record
    showUserThinkingIndicator();
  }
}

// Handle stop button click
function handleStopButtonClick() {
  stopStreaming(elements.statusElement);
  elements.startButton.disabled = false;
  elements.stopButton.disabled = true;
  updateChatUI();
}

// Handle audio output from server
function handleAudioOutput(data) {
  if (data.content) {
    try {
      const audioData = base64ToFloat32Array(data.content);
      playAudio(audioData);
    } catch (error) {
      console.error("Error processing audio data:", error);
    }
  }
}

// Handle text output from server
function handleTextOutput(data) {
  handleTextOutputEvent(data, isAudioStreaming());
}

// Handle content start event
function handleContentStartEvent(data) {
  handleContentStart(data);

  if (data.type === "AUDIO" && isAudioStreaming()) {
    showUserThinkingIndicator();
  }
}

// Handle content end event
function handleContentEndEvent(data) {
  handleContentEnd(data, isAudioStreaming());
}

// Handle take photo request
function handleTakePhotoRequest() {
  handleAutoPhotoCapture(elements);
}

// Handle stream complete event
function handleStreamComplete() {
  if (isAudioStreaming()) {
    stopStreaming(elements.statusElement);
  }
  elements.statusElement.textContent = "Ready";
  elements.statusElement.className = "ready";
}

// Initialize the app when the page loads
document.addEventListener("DOMContentLoaded", initializeApp);
