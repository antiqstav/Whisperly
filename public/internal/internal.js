createLiveTranscriptionApp({
  chunkDurationMs: 1000,
  backendErrorMessage: "The VoiceNotes transcription backend returned an error.",
  websocketErrorMessage: "Could not connect to the transcription backend on port 8000.",
  connectionClosedMessage: "The VoiceNotes transcription connection closed unexpectedly.",
  fallbackStartErrorMessage:
    "VoiceNotes could not start. Make sure the WebSocket server on port 8000 is running.",
  startErrorLogLabel: "VoiceNotes start error:",
  getCaptureStream: () =>
    navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true,
    }),
  getRecorderStream(captureStream) {
    const audioTracks = captureStream.getAudioTracks();

    if (!audioTracks.length) {
      throw new Error("NO_AUDIO_TRACK");
    }

    return new MediaStream(audioTracks);
  },
  attachCaptureHandlers({captureStream, setStatus, stopSession, isRecordingActive}) {
    const displayTrack = captureStream.getVideoTracks()[0];
    if (displayTrack) {
      displayTrack.addEventListener("ended", () => {
        if (isRecordingActive()) {
          setStatus("Screen share ended. Start VoiceNotes again to continue.");
          stopSession();
        }
      });
    }

    const audioTrack = captureStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.addEventListener("ended", () => {
        if (isRecordingActive()) {
          setStatus("Tab audio stopped. Make sure you choose a tab and enable audio sharing.");
          stopSession();
        }
      });
    }
  },
  getStartErrorMessage(error) {
    if (error.name === "NotAllowedError") {
      return "Screen or tab capture was denied. Please allow it and try again.";
    }

    if (error.message === "NO_AUDIO_TRACK") {
      return "No tab audio was captured. Choose a browser tab and enable audio sharing.";
    }

    return "VoiceNotes could not start. Make sure the WebSocket server on port 8000 is running.";
  },
  onSummaryClick({summaryPanel, summaryText}) {
    summaryPanel.classList.add("show");
    summaryText.textContent = "Summaries for VoiceNotes are not available yet.";
  },
});
