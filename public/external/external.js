const captions = document.getElementById("captions-text");
const summaryText = document.getElementById("summary-text");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const statusMessage = document.getElementById("statusMessage");
const fontSizeControl = document.getElementById("fontSize");

let ws = null;
let currentRecorder = null;
let currentStream = null;
let audioChunks = [];
let isRecordingActive = false;
let stopTimeoutId = null;

function setStatus(message) {
  statusMessage.textContent = message;
  statusMessage.hidden = !message;
}

function clearStatus() {
  setStatus("");
}

function setButtons(isListening) {
  startBtn.style.display = isListening ? "none" : "inline";
  stopBtn.style.display = isListening ? "inline" : "none";
}

function closeWebSocket() {
  if (ws && ws.readyState <= WebSocket.OPEN) {
    ws.close();
  }

  ws = null;
}

function stopTracks() {
  if (currentStream) {
    currentStream.getTracks().forEach(track => track.stop());
  }

  currentStream = null;
}

function resetSession() {
  isRecordingActive = false;

  if (stopTimeoutId) {
    clearTimeout(stopTimeoutId);
    stopTimeoutId = null;
  }

  if (currentRecorder && currentRecorder.state !== "inactive") {
    currentRecorder.stop();
  }

  currentRecorder = null;
  stopTracks();
  closeWebSocket();
  setButtons(false);
}

function connectWebSocket() {
  return new Promise((resolve, reject) => {
    const wsProtocol = window.location.protocol === "https:" ? "wss" : "ws";
    const wsHost = window.location.hostname || "127.0.0.1";
    const nextSocket = new WebSocket(`${wsProtocol}://${wsHost}:8000/ws`);

    nextSocket.onopen = () => {
      ws = nextSocket;
      resolve(nextSocket);
    };

    nextSocket.onmessage = event => {
      const data = JSON.parse(event.data);

      if (data.type === "TRANSCRIPT") {
        captions.textContent = `${captions.textContent} ${data.text}`.trim();
      } else if (data.type === "ERROR") {
        setStatus(
          data.message || "The live transcription backend returned an error.",
        );
        resetSession();
      }
    };

    nextSocket.onerror = () => {
      if (ws !== nextSocket) {
        setStatus(
          "Could not connect to the live transcription backend on port 8000.",
        );
      }
    };

    nextSocket.onclose = () => {
      const closedDuringRecording = isRecordingActive;
      ws = null;

      if (closedDuringRecording) {
        setStatus("The live transcription connection closed unexpectedly.");
        resetSession();
      }
    };

    nextSocket.addEventListener(
      "error",
      () => {
        reject(new Error("WebSocket connection failed"));
      },
      {once: true},
    );
  });
}

function scheduleStop() {
  if (stopTimeoutId) {
    clearTimeout(stopTimeoutId);
  }

  stopTimeoutId = setTimeout(() => {
    if (
      currentRecorder &&
      currentRecorder.state === "recording" &&
      isRecordingActive
    ) {
      currentRecorder.stop();
    }
  }, 3000);
}

fontSizeControl.addEventListener("change", event => {
  captions.style.fontSize = event.target.value;
});

// summaryText.textContent = "Summaries for LiveListen are coming soon!";

startBtn.addEventListener("click", async () => {
  clearStatus();
  setButtons(true);
  captions.textContent = "";

  if (currentRecorder && currentRecorder.state !== "inactive") {
    currentRecorder.stop();
  }

  stopTracks();
  closeWebSocket();

  try {
    await connectWebSocket();
    currentStream = await navigator.mediaDevices.getUserMedia({audio: true});
    currentRecorder = new MediaRecorder(currentStream, {
      mimeType: "audio/webm;codecs=opus",
    });

    audioChunks = [];
    isRecordingActive = true;

    currentRecorder.ondataavailable = event => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };

    currentRecorder.onstop = async () => {
      if (!isRecordingActive) {
        audioChunks = [];
        return;
      }

      if (audioChunks.length) {
        const audioBlob = new Blob(audioChunks, {type: "audio/webm"});
        audioChunks = [];

        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(audioBlob);
        }
      }

      if (isRecordingActive && currentStream && currentStream.active) {
        currentRecorder.start();
        scheduleStop();
      }
    };

    currentRecorder.start();
    scheduleStop();
  } catch (error) {
    console.error("LiveListen start error:", error);
    resetSession();

    if (error.name === "NotAllowedError") {
      setStatus("Microphone access was denied. Please allow it and try again.");
    } else if (error.name === "NotFoundError") {
      setStatus("No microphone was found on this device.");
    } else {
      setStatus(
        "LiveListen could not start. Make sure the Flask app and port 8000 WebSocket server are both running.",
      );
    }
  }
});

stopBtn.addEventListener("click", () => {
  clearStatus();
  resetSession();
});
