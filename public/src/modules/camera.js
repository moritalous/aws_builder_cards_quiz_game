import { sendPhotoToServer, setAutoCapture } from './socket.js';

// Camera variables
let videoStream = null;
let isCameraActive = false;
let capturedPhoto = null;
let availableCameras = [];
let currentCameraId = "";
let isAutoCaptureEnabled = true;

// Initialize camera functionality
export function initCamera(elements) {
  const { 
    videoElement, 
    cameraToggleButton, 
    takePhotoButton, 
    photoCanvas,
    photoPreviewContainer,
    photoPreview,
    savePhotoButton,
    discardPhotoButton,
    autoCaptureToggleButton,
    cameraSelectElement,
    statusElement
  } = elements;
  
  // Set up event listeners
  cameraToggleButton.addEventListener("click", () => toggleCamera(elements));
  takePhotoButton.addEventListener("click", () => takePhoto(elements, false));
  savePhotoButton.addEventListener("click", () => savePhoto(elements));
  discardPhotoButton.addEventListener("click", () => discardPhoto(elements));
  autoCaptureToggleButton.addEventListener("click", () => toggleAutoCapture(elements));
  cameraSelectElement.addEventListener("change", () => switchCamera(elements));
  
  // Initialize camera list
  getAvailableCameras(elements);
  
  // Set default auto capture state
  autoCaptureToggleButton.textContent = "Disable Auto Capture";
  setAutoCapture(true);
}

// Get available camera devices
export async function getAvailableCameras(elements) {
  const { cameraSelectElement, statusElement } = elements;
  
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

// Toggle camera on/off
export async function toggleCamera(elements) {
  const { 
    videoElement, 
    cameraToggleButton, 
    takePhotoButton, 
    cameraSelectElement,
    statusElement 
  } = elements;
  
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
        await getAvailableCameras(elements);
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

// Take a photo from the camera
export function takePhoto(elements, autoMode = false) {
  const { 
    videoElement, 
    photoCanvas, 
    photoPreview, 
    photoPreviewContainer 
  } = elements;
  
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

// Save the captured photo
export function savePhoto(elements) {
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
  elements.photoPreviewContainer.style.display = "none";
  capturedPhoto = null;
}

// Discard the captured photo
export function discardPhoto(elements) {
  elements.photoPreviewContainer.style.display = "none";
  capturedPhoto = null;
}

// Switch to a different camera
export async function switchCamera(elements) {
  const { 
    videoElement, 
    cameraSelectElement, 
    statusElement 
  } = elements;
  
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
export function toggleAutoCapture(elements) {
  const { autoCaptureToggleButton, statusElement } = elements;
  
  isAutoCaptureEnabled = !isAutoCaptureEnabled;
  autoCaptureToggleButton.textContent = isAutoCaptureEnabled
    ? "Disable Auto Capture"
    : "Enable Auto Capture";

  // Notify server about auto capture state
  setAutoCapture(isAutoCaptureEnabled);

  statusElement.textContent = `Auto capture ${isAutoCaptureEnabled ? "enabled" : "disabled"}`;
  setTimeout(() => {
    if (statusElement.textContent.includes("Auto capture")) {
      statusElement.textContent = "Ready";
    }
  }, 2000);
}

// Handle automatic photo capture request
export function handleAutoPhotoCapture(elements) {
  if (isCameraActive) {
    // Add flash effect and audio feedback
    const flash = document.createElement("div");
    flash.className = "flash";
    document.getElementById("video-container").appendChild(flash);

    // Take photo automatically
    takePhoto(elements, true); // Pass auto mode flag

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
    elements.chatContainer.appendChild(message);
    elements.chatContainer.scrollTop = elements.chatContainer.scrollHeight;
  }
}

// Check if camera is active
export function isCameraOn() {
  return isCameraActive;
}
