import { AudioPlayer } from "./lib/play/AudioPlayer.js";
import { ChatHistoryManager } from "./lib/util/ChatHistoryManager.js";

// Connect to the server
const socket = io();

// DOM elements
const startButton = document.getElementById("start");
const stopButton = document.getElementById("stop");
const statusElement = document.getElementById("status");
const chatContainer = document.getElementById("chat-container");
const cameraToggleButton = document.getElementById("camera-toggle");
const videoElement = document.getElementById("camera-feed");
const takePhotoButton = document.getElementById("take-photo");
const photoCanvas = document.getElementById("photo-canvas");
const photoPreviewContainer = document.getElementById(
  "photo-preview-container",
);
const photoPreview = document.getElementById("photo-preview");
const savePhotoButton = document.getElementById("save-photo");
const discardPhotoButton = document.getElementById("discard-photo");
const autoCaptureToggleButton = document.getElementById("auto-capture-toggle");
const cameraSelectElement = document.getElementById("camera-select");

// List of camera devices
let availableCameras = [];
// Currently selected camera ID
let currentCameraId = "";

// Auto capture state
let isAutoCaptureEnabled = true;

// Chat history management
let chat = { history: [] };
const chatRef = { current: chat };
const chatHistoryManager = ChatHistoryManager.getInstance(
  chatRef,
  (newChat) => {
    chat = { ...newChat };
    chatRef.current = chat;
    updateChatUI();
  },
);

// Audio processing variables
let audioContext;
let audioStream;
let isStreaming = false;
let processor;
let sourceNode;
let waitingForAssistantResponse = false;
let waitingForUserTranscription = false;
let userThinkingIndicator = null;
let assistantThinkingIndicator = null;
let transcriptionReceived = false;
let displayAssistantText = false;
let role;
const audioPlayer = new AudioPlayer();
let sessionInitialized = false;

// Camera variables
let videoStream = null;
let isCameraActive = false;
let capturedPhoto = null;

let samplingRatio = 1;
const TARGET_SAMPLE_RATE = 16000;
const isFirefox = navigator.userAgent.toLowerCase().includes("firefox");

// Custom system prompt - you can modify this
let SYSTEM_PROMPT = `You are the host of an AWS BuilderCards Quiz Game. Follow these rules:

1. When the user says "Let's start", "Start the quiz", "Begin", or similar phrases, start the quiz game by introducing yourself briefly and then giving the first question.

2. For each question, describe an AWS service without naming it directly. Be descriptive but don't make it too obvious.

3. When the user says "I found it", they are showing a card to the camera. The system will automatically take a photo and analyze it. Wait for the analysis result.

4. After the card is analyzed, tell the user if they're correct or incorrect.

5. If the user asks for "next question", "another one", or similar phrases, provide a new random AWS service description.

6. Keep your responses conversational but concise (2-3 sentences).

7. If the user asks to end the game, thank them for playing.

Remember, this is a voice-based interaction, so make your responses clear and engaging.`;

// Initialize WebSocket audio
async function initAudio() {
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
    startButton.disabled = false;
  } catch (error) {
    console.error("Error accessing microphone:", error);
    statusElement.textContent = "Error: " + error.message;
    statusElement.className = "error";
  }
}

// Initialize camera
// Function to get available camera devices
async function getAvailableCameras() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(
      (device) => device.kind === "videoinput",
    );

    // Clear camera list
    availableCameras = [];
    cameraSelectElement.innerHTML = "";

    if (videoDevices.length === 0) {
      const option = document.createElement("option");
      option.text = "No cameras found";
      option.disabled = true;
      cameraSelectElement.add(option);
      cameraSelectElement.disabled = true;
    } else {
      videoDevices.forEach((device, index) => {
        availableCameras.push({
          id: device.deviceId,
          label: device.label || `Camera ${index + 1}`,
        });

        const option = document.createElement("option");
        option.value = device.deviceId;
        option.text = device.label || `Camera ${index + 1}`;
        cameraSelectElement.add(option);
      });

      // Select first camera by default
      if (availableCameras.length > 0 && !currentCameraId) {
        currentCameraId = availableCameras[0].id;
        cameraSelectElement.value = currentCameraId;
      }

      cameraSelectElement.disabled = !isCameraActive;
    }

    console.log("Available cameras:", availableCameras);
  } catch (error) {
    console.error("Error enumerating devices:", error);
    statusElement.textContent = "Error loading cameras: " + error.message;
    statusElement.className = "error";
  }
}

async function toggleCamera() {
  if (isCameraActive) {
    // Stop the camera
    if (videoStream) {
      videoStream.getTracks().forEach((track) => track.stop());
      videoStream = null;
    }
    videoElement.srcObject = null;
    isCameraActive = false;
    cameraToggleButton.textContent = "Start Camera";
    takePhotoButton.disabled = true;
    cameraSelectElement.disabled = true;
  } else {
    // Start the camera
    try {
      // Get camera devices if not already retrieved
      if (availableCameras.length === 0) {
        await getAvailableCameras();
      }

      // Get selected camera ID
      const selectedCameraId = cameraSelectElement.value || "";
      currentCameraId = selectedCameraId;

      // Set camera constraints
      const constraints = {
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      };

      // Use specific camera if selected
      if (selectedCameraId) {
        constraints.video.deviceId = { exact: selectedCameraId };
      }

      videoStream = await navigator.mediaDevices.getUserMedia(constraints);

      videoElement.srcObject = videoStream;
      isCameraActive = true;
      cameraToggleButton.textContent = "Stop Camera";
      takePhotoButton.disabled = false;
      cameraSelectElement.disabled = false;
    } catch (error) {
      console.error("Error accessing camera:", error);
      statusElement.textContent = "Camera Error: " + error.message;
      statusElement.className = "error";
    }
  }
}

// Handle automatic photo capture request from server
socket.on("takePhotoRequest", () => {
  console.log("Received request to take photo from server");
  if (isCameraActive) {
    // Add flash effect and audio feedback
    const flash = document.createElement("div");
    flash.className = "flash";
    document.getElementById("video-container").appendChild(flash);

    // Take photo automatically
    takePhoto(true); // Pass auto mode flag

    // Remove flash element
    setTimeout(() => {
      if (flash.parentNode) {
        flash.parentNode.removeChild(flash);
      }
    }, 500);
  } else {
    console.log("Cannot take photo: camera is not active");
    // Display message if camera is not enabled
    const message = document.createElement("div");
    message.className = "message system";
    message.textContent = "Please enable the camera to take photos.";
    chatContainer.appendChild(message);
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }
});

// Photo capture and image analysis integration
function takePhoto(autoMode = false) {
  if (!isCameraActive || !videoElement.srcObject) {
    console.error("Camera is not active");
    return;
  }

  // Create a flash effect
  const flash = document.createElement("div");
  flash.className = "flash";
  document.getElementById("video-container").appendChild(flash);

  // Remove the flash element after animation completes
  setTimeout(() => {
    if (flash.parentNode) {
      flash.parentNode.removeChild(flash);
    }
  }, 500);

  // Set canvas dimensions to match the video
  const width = videoElement.videoWidth;
  const height = videoElement.videoHeight;
  photoCanvas.width = width;
  photoCanvas.height = height;

  // Draw the current video frame to the canvas
  const context = photoCanvas.getContext("2d");
  context.drawImage(videoElement, 0, 0, width, height);

  // Convert canvas to image data URL
  capturedPhoto = photoCanvas.toDataURL("image/png");

  // Only show preview if not in auto mode
  if (!autoMode) {
    // Show the preview
    photoPreview.src = capturedPhoto;
    photoPreviewContainer.style.display = "flex";
  } else {
    console.log("Auto mode: skipping preview display");
  }

  // Send photo data to server (for image analysis tool)
  sendPhotoToServer(capturedPhoto);
}

// Function to send photo data to server
function sendPhotoToServer(photoDataUrl) {
  try {
    // Check image size
    const estimatedSize = photoDataUrl.length * 0.75; // Base64 size estimation
    console.log(`Photo size estimate: ${Math.round(estimatedSize / 1024)} KB`);

    // Resize if too large
    if (estimatedSize > 1000000) {
      // If larger than 1MB
      console.log("Photo is large, resizing before sending");
      resizeImage(photoDataUrl, 800, 600, (resizedImage) => {
        // Send resized image
        socket.emit("capturedPhoto", resizedImage);
        console.log("Resized photo sent to server for potential AI analysis");
      });
    } else {
      // Send as is
      socket.emit("capturedPhoto", photoDataUrl);
      console.log("Photo sent to server for potential AI analysis");
    }
  } catch (error) {
    console.error("Error sending photo to server:", error);
  }
}

// Function to resize image
function resizeImage(dataUrl, maxWidth, maxHeight, callback) {
  const img = new Image();
  img.onload = function () {
    let width = img.width;
    let height = img.height;

    // Resize while maintaining aspect ratio
    if (width > height) {
      if (width > maxWidth) {
        height *= maxWidth / width;
        width = maxWidth;
      }
    } else {
      if (height > maxHeight) {
        width *= maxHeight / height;
        height = maxHeight;
      }
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, width, height);

    // Compress with reduced quality
    const resizedDataUrl = canvas.toDataURL("image/jpeg", 0.7);
    callback(resizedDataUrl);
  };
  img.src = dataUrl;
}

// Save the captured photo
function savePhoto() {
  if (!capturedPhoto) return;

  // Create a temporary link to download the image
  const link = document.createElement("a");
  link.href = capturedPhoto;
  link.download = `photo_${new Date().toISOString().replace(/:/g, "-")}.png`;

  // Trigger download
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Hide preview
  photoPreviewContainer.style.display = "none";
  capturedPhoto = null;
}

// Discard the captured photo
function discardPhoto() {
  photoPreviewContainer.style.display = "none";
  capturedPhoto = null;
}

// Initialize the session with Bedrock
async function initializeSession() {
  if (sessionInitialized) return;

  statusElement.textContent = "Initializing session...";

  try {
    // Send events in sequence
    socket.emit("promptStart");
    socket.emit("systemPrompt", SYSTEM_PROMPT);
    socket.emit("audioStart");

    // Mark session as initialized
    sessionInitialized = true;
    statusElement.textContent = "Session initialized successfully";
  } catch (error) {
    console.error("Failed to initialize session:", error);
    statusElement.textContent = "Error initializing session";
    statusElement.className = "error";
  }
}

async function startStreaming() {
  if (isStreaming) return;

  try {
    // First, make sure the session is initialized
    if (!sessionInitialized) {
      await initializeSession();
    }

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
    startButton.disabled = true;
    stopButton.disabled = false;
    statusElement.textContent = "Streaming... Speak now";
    statusElement.className = "recording";

    // Show user thinking indicator when starting to record
    transcriptionReceived = false;
    showUserThinkingIndicator();
  } catch (error) {
    console.error("Error starting recording:", error);
    statusElement.textContent = "Error: " + error.message;
    statusElement.className = "error";
  }
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

function stopStreaming() {
  if (!isStreaming) return;

  isStreaming = false;

  // Clean up audio processing
  if (processor) {
    processor.disconnect();
    sourceNode.disconnect();
  }

  startButton.disabled = false;
  stopButton.disabled = true;
  statusElement.textContent = "Processing...";
  statusElement.className = "processing";

  audioPlayer.stop();
  // Tell server to finalize processing
  socket.emit("stopAudio");

  // End the current turn in chat history
  chatHistoryManager.endTurn();
}

// Base64 to Float32Array conversion
function base64ToFloat32Array(base64String) {
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

// Process message data and add to chat history
function handleTextOutput(data) {
  console.log("Processing text output:", data);
  if (data.content) {
    const messageData = {
      role: data.role,
      message: data.content,
    };
    chatHistoryManager.addTextMessage(messageData);
  }
}

// Update the UI based on the current chat history
function updateChatUI() {
  if (!chatContainer) {
    console.error("Chat container not found");
    return;
  }

  // Clear existing chat messages
  chatContainer.innerHTML = "";

  // Add all messages from history
  chat.history.forEach((item) => {
    if (item.endOfConversation) {
      const endDiv = document.createElement("div");
      endDiv.className = "message system";
      endDiv.textContent = "Conversation ended";
      chatContainer.appendChild(endDiv);
      return;
    }

    if (item.role) {
      const messageDiv = document.createElement("div");
      const roleLowerCase = item.role.toLowerCase();
      messageDiv.className = `message ${roleLowerCase}`;

      const roleLabel = document.createElement("div");
      roleLabel.className = "role-label";
      roleLabel.textContent = item.role;
      messageDiv.appendChild(roleLabel);

      const content = document.createElement("div");
      content.textContent = item.message || "No content";
      messageDiv.appendChild(content);

      chatContainer.appendChild(messageDiv);
    }
  });

  // Re-add thinking indicators if we're still waiting
  if (waitingForUserTranscription) {
    showUserThinkingIndicator();
  }

  if (waitingForAssistantResponse) {
    showAssistantThinkingIndicator();
  }

  // Scroll to bottom
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

// Show the "Listening" indicator for user
function showUserThinkingIndicator() {
  hideUserThinkingIndicator();

  waitingForUserTranscription = true;
  userThinkingIndicator = document.createElement("div");
  userThinkingIndicator.className = "message user thinking";

  const roleLabel = document.createElement("div");
  roleLabel.className = "role-label";
  roleLabel.textContent = "USER";
  userThinkingIndicator.appendChild(roleLabel);

  const listeningText = document.createElement("div");
  listeningText.className = "thinking-text";
  listeningText.textContent = "Listening";
  userThinkingIndicator.appendChild(listeningText);

  const dotContainer = document.createElement("div");
  dotContainer.className = "thinking-dots";

  for (let i = 0; i < 3; i++) {
    const dot = document.createElement("span");
    dot.className = "dot";
    dotContainer.appendChild(dot);
  }

  userThinkingIndicator.appendChild(dotContainer);
  chatContainer.appendChild(userThinkingIndicator);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

// Show the "Thinking" indicator for assistant
function showAssistantThinkingIndicator() {
  hideAssistantThinkingIndicator();

  waitingForAssistantResponse = true;
  assistantThinkingIndicator = document.createElement("div");
  assistantThinkingIndicator.className = "message assistant thinking";

  const roleLabel = document.createElement("div");
  roleLabel.className = "role-label";
  roleLabel.textContent = "ASSISTANT";
  assistantThinkingIndicator.appendChild(roleLabel);

  const thinkingText = document.createElement("div");
  thinkingText.className = "thinking-text";
  thinkingText.textContent = "Thinking";
  assistantThinkingIndicator.appendChild(thinkingText);

  const dotContainer = document.createElement("div");
  dotContainer.className = "thinking-dots";

  for (let i = 0; i < 3; i++) {
    const dot = document.createElement("span");
    dot.className = "dot";
    dotContainer.appendChild(dot);
  }

  assistantThinkingIndicator.appendChild(dotContainer);
  chatContainer.appendChild(assistantThinkingIndicator);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

// Hide the user thinking indicator
function hideUserThinkingIndicator() {
  waitingForUserTranscription = false;
  if (userThinkingIndicator && userThinkingIndicator.parentNode) {
    userThinkingIndicator.parentNode.removeChild(userThinkingIndicator);
  }
  userThinkingIndicator = null;
}

// Hide the assistant thinking indicator
function hideAssistantThinkingIndicator() {
  waitingForAssistantResponse = false;
  if (assistantThinkingIndicator && assistantThinkingIndicator.parentNode) {
    assistantThinkingIndicator.parentNode.removeChild(
      assistantThinkingIndicator,
    );
  }
  assistantThinkingIndicator = null;
}

// EVENT HANDLERS
// --------------

// Handle content start from the server
socket.on("contentStart", (data) => {
  console.log("Content start received:", data);

  if (data.type === "TEXT") {
    // Below update will be enabled when role is moved to the contentStart
    role = data.role;
    if (data.role === "USER") {
      // When user's text content starts, hide user thinking indicator
      hideUserThinkingIndicator();
    } else if (data.role === "ASSISTANT") {
      // When assistant's text content starts, hide assistant thinking indicator
      hideAssistantThinkingIndicator();
      let isSpeculative = false;
      try {
        if (data.additionalModelFields) {
          const additionalFields = JSON.parse(data.additionalModelFields);
          isSpeculative = additionalFields.generationStage === "SPECULATIVE";
          if (isSpeculative) {
            console.log("Received speculative content");
            displayAssistantText = true;
          } else {
            displayAssistantText = false;
          }
        }
      } catch (e) {
        console.error("Error parsing additionalModelFields:", e);
      }
    }
  } else if (data.type === "AUDIO") {
    // When audio content starts, we may need to show user thinking indicator
    if (isStreaming) {
      showUserThinkingIndicator();
    }
  }
});

// Handle text output from the server
socket.on("textOutput", (data) => {
  console.log("Received text output:", data);

  if (role === "USER") {
    // When user text is received, show thinking indicator for assistant response
    transcriptionReceived = true;
    //hideUserThinkingIndicator();

    // Add user message to chat
    handleTextOutput({
      role: data.role,
      content: data.content,
    });

    // Show assistant thinking indicator after user text appears
    showAssistantThinkingIndicator();
  } else if (role === "ASSISTANT") {
    //hideAssistantThinkingIndicator();
    if (displayAssistantText) {
      handleTextOutput({
        role: data.role,
        content: data.content,
      });
    }
  }
});

// Handle audio output
socket.on("audioOutput", (data) => {
  if (data.content) {
    try {
      const audioData = base64ToFloat32Array(data.content);
      audioPlayer.playAudio(audioData);
    } catch (error) {
      console.error("Error processing audio data:", error);
    }
  }
});

// Handle content end events
socket.on("contentEnd", (data) => {
  console.log("Content end received:", data);

  if (data.type === "TEXT") {
    if (role === "USER") {
      // When user's text content ends, make sure assistant thinking is shown
      hideUserThinkingIndicator();
      showAssistantThinkingIndicator();
    } else if (role === "ASSISTANT") {
      // When assistant's text content ends, prepare for user input in next turn
      hideAssistantThinkingIndicator();
    }

    // Handle stop reasons
    if (data.stopReason && data.stopReason.toUpperCase() === "END_TURN") {
      chatHistoryManager.endTurn();
    } else if (
      data.stopReason &&
      data.stopReason.toUpperCase() === "INTERRUPTED"
    ) {
      console.log("Interrupted by user");
      audioPlayer.bargeIn();
    }
  } else if (data.type === "AUDIO") {
    // When audio content ends, we may need to show user thinking indicator
    if (isStreaming) {
      showUserThinkingIndicator();
    }
  }
});

// Stream completion event
socket.on("streamComplete", () => {
  if (isStreaming) {
    stopStreaming();
  }
  statusElement.textContent = "Ready";
  statusElement.className = "ready";
});

// Handle connection status updates
socket.on("connect", () => {
  statusElement.textContent = "Connected to server";
  statusElement.className = "connected";
  sessionInitialized = false;
});

socket.on("disconnect", () => {
  statusElement.textContent = "Disconnected from server";
  statusElement.className = "disconnected";
  startButton.disabled = true;
  stopButton.disabled = true;
  sessionInitialized = false;
  hideUserThinkingIndicator();
  hideAssistantThinkingIndicator();
});

// Handle errors
socket.on("error", (error) => {
  console.error("Server error:", error);
  statusElement.textContent =
    "Error: " + (error.message || JSON.stringify(error).substring(0, 100));
  statusElement.className = "error";
  hideUserThinkingIndicator();
  hideAssistantThinkingIndicator();
});

// Button event listeners
startButton.addEventListener("click", startStreaming);
stopButton.addEventListener("click", stopStreaming);
cameraToggleButton.addEventListener("click", toggleCamera);
takePhotoButton.addEventListener("click", () => takePhoto(false));
savePhotoButton.addEventListener("click", savePhoto);
discardPhotoButton.addEventListener("click", discardPhoto);
autoCaptureToggleButton.addEventListener("click", toggleAutoCapture);
cameraSelectElement.addEventListener("change", switchCamera);

// Get reference to chat toggle button
const toggleChatButton = document.getElementById("toggle-chat");
// Chat display toggle functionality
toggleChatButton.addEventListener("click", toggleChatVisibility);

// Function to switch camera
async function switchCamera() {
  if (!isCameraActive) {
    // Do nothing if camera is not active
    return;
  }

  const selectedCameraId = cameraSelectElement.value;
  if (!selectedCameraId || selectedCameraId === currentCameraId) {
    // Do nothing if selected camera is the same as current camera
    return;
  }

  try {
    // Stop current camera stream
    if (videoStream) {
      videoStream.getTracks().forEach((track) => track.stop());
    }

    // Get new camera stream
    const constraints = {
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        deviceId: { exact: selectedCameraId },
      },
    };

    videoStream = await navigator.mediaDevices.getUserMedia(constraints);
    videoElement.srcObject = videoStream;
    currentCameraId = selectedCameraId;

    statusElement.textContent = "Camera switched";
    setTimeout(() => {
      if (statusElement.textContent === "Camera switched") {
        statusElement.textContent = "Ready";
      }
    }, 2000);
  } catch (error) {
    console.error("Error switching camera:", error);
    statusElement.textContent = "Camera Error: " + error.message;
    statusElement.className = "error";
  }
}

// Toggle auto capture
function toggleAutoCapture() {
  isAutoCaptureEnabled = !isAutoCaptureEnabled;
  autoCaptureToggleButton.textContent = isAutoCaptureEnabled
    ? "Disable Auto Capture"
    : "Enable Auto Capture";

  // Notify server about auto capture state
  socket.emit("setAutoCapture", isAutoCaptureEnabled);

  statusElement.textContent = `Auto capture ${isAutoCaptureEnabled ? "enabled" : "disabled"}`;
  setTimeout(() => {
    if (statusElement.textContent.includes("Auto capture")) {
      statusElement.textContent = "Ready";
    }
  }, 2000);
}

// Initialize the app when the page loads
document.addEventListener("DOMContentLoaded", async () => {
  await initAudio();
  // Get list of camera devices
  await getAvailableCameras();

  // Enable auto capture (default)
  autoCaptureToggleButton.textContent = "Disable Auto Capture";
  socket.emit("setAutoCapture", true);

  // Hide chat area by default
  toggleChatVisibility();
});
// Chat visibility toggle function
function toggleChatVisibility() {
  const chatContainer = document.getElementById("chat-container");
  const videoContainer = document.getElementById("video-container");
  const mainContainer = document.getElementById("main-container");

  if (chatContainer.style.display === "none") {
    // Show chat
    chatContainer.style.display = "flex";
    videoContainer.style.flex = "1";
    mainContainer.style.gap = "20px";
    toggleChatButton.textContent = "Hide Chat";
  } else {
    // Hide chat
    chatContainer.style.display = "none";
    videoContainer.style.flex = "2";
    mainContainer.style.gap = "0";
    toggleChatButton.textContent = "Show Chat";
  }
}
