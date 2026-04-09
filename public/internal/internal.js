const captions = document.getElementById("captions-text");
const summaryPanel = document.querySelector(".summary");
const summaryText = document.getElementById("summary-text");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const summaryBtn = document.getElementById("summaryBtn");
const statusMessage = document.getElementById("statusMessage");
const fontSizeControl = document.getElementById("fontSize");

let ws = null;
let captureStream = null;
let currentRecorder = null;
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

function stopCapture() {
  if (captureStream) {
    captureStream.getTracks().forEach(track => track.stop());
  }

  captureStream = null;
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
  stopCapture();
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
          data.message || "The VoiceNotes transcription backend returned an error.",
        );
        resetSession();
      }
    };

    nextSocket.onerror = () => {
      if (ws !== nextSocket) {
        setStatus("Could not connect to the transcription backend on port 8000.");
      }
    };

    nextSocket.onclose = () => {
      const closedDuringRecording = isRecordingActive;
      ws = null;

      if (closedDuringRecording) {
        setStatus("The VoiceNotes transcription connection closed unexpectedly.");
        resetSession();
      }
    };

    nextSocket.addEventListener(
      "error",
      () => {
        reject(new Error("WebSocket connection failed"));
      },
      { once: true },
    );
  });
}

function getRecorderOptions() {
  const supportedTypes = [
    "audio/webm;codecs=opus",
    "audio/webm",
  ];

  for (const mimeType of supportedTypes) {
    if (MediaRecorder.isTypeSupported(mimeType)) {
      return { mimeType };
    }
  }

  return undefined;
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
  }, 2000);
}

fontSizeControl.addEventListener("change", event => {
  captions.style.fontSize = event.target.value;
});

summaryBtn.addEventListener("click", () => {
  summaryPanel.classList.add("show");
  summaryText.textContent = "Summaries for VoiceNotes are not available yet.";
});

startBtn.addEventListener("click", async () => {
  clearStatus();
  setButtons(true);
  captions.textContent = "";

  if (currentRecorder && currentRecorder.state !== "inactive") {
    currentRecorder.stop();
  }

  stopCapture();
  closeWebSocket();

  try {
    await connectWebSocket();

    captureStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true,
    });

    const audioTracks = captureStream.getAudioTracks();
    if (!audioTracks.length) {
      throw new Error("NO_AUDIO_TRACK");
    }

    const displayTrack = captureStream.getVideoTracks()[0];
    if (displayTrack) {
      displayTrack.addEventListener("ended", () => {
        if (isRecordingActive) {
          setStatus("Screen share ended. Start VoiceNotes again to continue.");
          resetSession();
        }
      });
    }

    audioTracks[0].addEventListener("ended", () => {
      if (isRecordingActive) {
        setStatus("Tab audio stopped. Make sure you choose a tab and enable audio sharing.");
        resetSession();
      }
    });

    const recorderStream = new MediaStream(audioTracks);
    const recorderOptions = getRecorderOptions();
    currentRecorder = recorderOptions
      ? new MediaRecorder(recorderStream, recorderOptions)
      : new MediaRecorder(recorderStream);

    audioChunks = [];
    isRecordingActive = true;

    currentRecorder.ondataavailable = event => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };

    currentRecorder.onstop = () => {
      if (!isRecordingActive) {
        audioChunks = [];
        return;
      }

      if (audioChunks.length) {
        const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
        audioChunks = [];

        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(audioBlob);
        }
      }

      if (isRecordingActive && captureStream && captureStream.active) {
        currentRecorder.start();
        scheduleStop();
      }
    };

    currentRecorder.start();
    scheduleStop();
  } catch (error) {
    console.error("VoiceNotes start error:", error);
    resetSession();

    if (error.name === "NotAllowedError") {
      setStatus("Screen or tab capture was denied. Please allow it and try again.");
    } else if (error.message === "NO_AUDIO_TRACK") {
      setStatus("No tab audio was captured. Choose a browser tab and enable audio sharing.");
    } else {
      setStatus(
        "VoiceNotes could not start. Make sure the WebSocket server on port 8000 is running.",
      );
    }
  }
});

stopBtn.addEventListener("click", () => {
  clearStatus();
  resetSession();
});
