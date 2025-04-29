import { ChatHistoryManager } from "../lib/util/ChatHistoryManager.js";
import { bargeIn } from "./audio.js";

// Chat history management
let chat = { history: [] };
const chatRef = { current: chat };
let waitingForAssistantResponse = false;
let waitingForUserTranscription = false;
let userThinkingIndicator = null;
let assistantThinkingIndicator = null;
let displayAssistantText = false;
let transcriptionReceived = false;
let role;

// DOM elements reference
let elements = null;

// Create chat history manager
const chatHistoryManager = ChatHistoryManager.getInstance(
  chatRef,
  (newChat) => {
    chat = { ...newChat };
    chatRef.current = chat;
    updateChatUI();
  }
);

// Initialize chat UI
export function initChat(elementsRef) {
  // Store elements reference
  elements = elementsRef;
  
  const { chatContainer, toggleChatButton } = elements;
  
  // Set up event listeners
  toggleChatButton.addEventListener("click", () => toggleChatVisibility(elements));
  
  // Hide chat area by default
  toggleChatVisibility(elements);
}

// Process message data and add to chat history
export function handleTextOutput(data) {
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
export function updateChatUI() {
  if (!elements || !elements.chatContainer) {
    console.error("Chat container not found");
    return;
  }

  const chatContainer = elements.chatContainer;

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
export function showUserThinkingIndicator() {
  hideUserThinkingIndicator();

  if (!elements || !elements.chatContainer) return;
  const chatContainer = elements.chatContainer;

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
export function showAssistantThinkingIndicator() {
  hideAssistantThinkingIndicator();

  if (!elements || !elements.chatContainer) return;
  const chatContainer = elements.chatContainer;

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
export function hideUserThinkingIndicator() {
  waitingForUserTranscription = false;
  if (userThinkingIndicator && userThinkingIndicator.parentNode) {
    userThinkingIndicator.parentNode.removeChild(userThinkingIndicator);
  }
  userThinkingIndicator = null;
}

// Hide the assistant thinking indicator
export function hideAssistantThinkingIndicator() {
  waitingForAssistantResponse = false;
  if (assistantThinkingIndicator && assistantThinkingIndicator.parentNode) {
    assistantThinkingIndicator.parentNode.removeChild(
      assistantThinkingIndicator,
    );
  }
  assistantThinkingIndicator = null;
}

// Handle content start event
export function handleContentStart(data) {
  role = data.role;
  
  if (data.type === "TEXT") {
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
  }
}

// Handle text output event
export function handleTextOutputEvent(data, isStreaming) {
  if (role === "USER") {
    // When user text is received, show thinking indicator for assistant response
    transcriptionReceived = true;

    // Add user message to chat
    handleTextOutput({
      role: data.role,
      content: data.content,
    });

    // Show assistant thinking indicator after user text appears
    showAssistantThinkingIndicator();
  } else if (role === "ASSISTANT") {
    if (displayAssistantText) {
      handleTextOutput({
        role: data.role,
        content: data.content,
      });
    }
  }
}

// Handle content end event
export function handleContentEnd(data, isStreaming) {
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
      bargeIn();
    }
  } else if (data.type === "AUDIO") {
    // When audio content ends, we may need to show user thinking indicator
    if (isStreaming) {
      showUserThinkingIndicator();
    }
  }
}

// Toggle chat visibility
export function toggleChatVisibility(elements) {
  const { chatContainer, videoContainer, mainContainer, toggleChatButton } = elements;

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

// End the current turn in chat history
export function endTurn() {
  chatHistoryManager.endTurn();
}

// Get current role
export function getCurrentRole() {
  return role;
}

// Set current role
export function setCurrentRole(newRole) {
  role = newRole;
}
