// Socket.io connection and event handling
let sessionInitialized = false;

// Create socket instance
export const socket = io();

// Initialize socket with event handlers
export function initSocket(elements, callbacks) {
  const { statusElement } = elements;
  const { 
    onAudioOutput, 
    onTextOutput, 
    onContentStart, 
    onContentEnd, 
    onTakePhotoRequest,
    onStreamComplete
  } = callbacks;

  // Handle connection status updates
  socket.on("connect", () => {
    statusElement.textContent = "Connected to server";
    statusElement.className = "connected";
    sessionInitialized = false;
  });

  socket.on("disconnect", () => {
    statusElement.textContent = "Disconnected from server";
    statusElement.className = "disconnected";
    sessionInitialized = false;
  });

  // Handle errors
  socket.on("error", (error) => {
    console.error("Server error:", error);
    statusElement.textContent =
      "Error: " + (error.message || JSON.stringify(error).substring(0, 100));
    statusElement.className = "error";
  });

  // Handle content start from the server
  socket.on("contentStart", (data) => {
    console.log("Content start received:", data);
    if (onContentStart) onContentStart(data);
  });

  // Handle text output from the server
  socket.on("textOutput", (data) => {
    console.log("Received text output:", data);
    if (onTextOutput) onTextOutput(data);
  });

  // Handle audio output
  socket.on("audioOutput", (data) => {
    if (data.content && onAudioOutput) {
      onAudioOutput(data);
    }
  });

  // Handle content end events
  socket.on("contentEnd", (data) => {
    console.log("Content end received:", data);
    if (onContentEnd) onContentEnd(data);
  });

  // Stream completion event
  socket.on("streamComplete", () => {
    if (onStreamComplete) onStreamComplete();
  });

  // Handle automatic photo capture request from server
  socket.on("takePhotoRequest", () => {
    console.log("Received request to take photo from server");
    if (onTakePhotoRequest) onTakePhotoRequest();
  });
}

// Initialize the session with Bedrock
export async function initializeSession(systemPrompt) {
  if (sessionInitialized) return;

  try {
    // Send events in sequence
    socket.emit("promptStart");
    socket.emit("systemPrompt", systemPrompt);
    socket.emit("audioStart");

    // Mark session as initialized
    sessionInitialized = true;
    return true;
  } catch (error) {
    console.error("Failed to initialize session:", error);
    return false;
  }
}

// Set auto capture state
export function setAutoCapture(isEnabled) {
  socket.emit("setAutoCapture", isEnabled);
}

// Send photo data to server
export function sendPhotoToServer(photoDataUrl) {
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
