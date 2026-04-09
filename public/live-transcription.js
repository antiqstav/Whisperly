function createLiveTranscriptionApp(options) {
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
    if (!statusMessage) {
      return;
    }

    statusMessage.textContent = message;
    statusMessage.hidden = !message;
  }

  function clearStatus() {
    setStatus("");
  }

  function setButtons(listening) {
    startBtn.style.display = listening ? "none" : "inline";
    stopBtn.style.display = listening ? "inline" : "none";
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

  function finalizeSession() {
    if (stopTimeoutId) {
      clearTimeout(stopTimeoutId);
      stopTimeoutId = null;
    }

    stopCapture();
    closeWebSocket();
    currentRecorder = null;
    isRecordingActive = false;
    setButtons(false);
    clearClientStorage();
  }

  function stopSession() {
    if (currentRecorder && currentRecorder.state !== "inactive") {
      isRecordingActive = false;

      if (stopTimeoutId) {
        clearTimeout(stopTimeoutId);
        stopTimeoutId = null;
      }

      currentRecorder.stop();
      return;
    }

    finalizeSession();
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
            data.message || options.backendErrorMessage,
          );
          stopSession();
        }
      };

      nextSocket.onerror = () => {
        if (ws !== nextSocket) {
          setStatus(options.websocketErrorMessage);
        }
      };

      nextSocket.onclose = () => {
        const closedDuringRecording = isRecordingActive;
        ws = null;

        if (closedDuringRecording) {
          setStatus(options.connectionClosedMessage);
          stopSession();
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

  function getRecorderOptions() {
    const supportedTypes = ["audio/webm;codecs=opus", "audio/webm"];

    for (const mimeType of supportedTypes) {
      if (MediaRecorder.isTypeSupported(mimeType)) {
        return {mimeType};
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
    }, options.chunkDurationMs);
  }

  function resolveStartErrorMessage(error) {
    if (typeof options.getStartErrorMessage === "function") {
      return options.getStartErrorMessage(error);
    }

    return options.fallbackStartErrorMessage;
  }

  fontSizeControl.addEventListener("change", event => {
    captions.style.fontSize = event.target.value;
  });

  if (summaryBtn && typeof options.onSummaryClick === "function") {
    summaryBtn.addEventListener("click", () => {
      options.onSummaryClick({summaryPanel, summaryText});
    });
  }

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

      captureStream = await options.getCaptureStream();

      if (typeof options.attachCaptureHandlers === "function") {
        options.attachCaptureHandlers({
          captureStream,
          setStatus,
          stopSession,
          isRecordingActive: () => isRecordingActive,
        });
      }

      const recorderStream = options.getRecorderStream
        ? options.getRecorderStream(captureStream)
        : captureStream;
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
          finalizeSession();
          return;
        }

        if (audioChunks.length) {
          const audioBlob = new Blob(audioChunks, {type: "audio/webm"});
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
      console.error(options.startErrorLogLabel, error);
      finalizeSession();
      setStatus(resolveStartErrorMessage(error));
    }
  });

  stopBtn.addEventListener("click", () => {
    clearStatus();
    stopSession();
  });
}
