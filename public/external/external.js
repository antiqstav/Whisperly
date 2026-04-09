createLiveTranscriptionApp({
  chunkDurationMs: 1500,
  backendErrorMessage: "The live transcription backend returned an error.",
  websocketErrorMessage: "Could not connect to the live transcription backend on port 8000.",
  connectionClosedMessage: "The live transcription connection closed unexpectedly.",
  fallbackStartErrorMessage:
    "LiveListen could not start. Make sure the Flask app and port 8000 WebSocket server are both running.",
  startErrorLogLabel: "LiveListen start error:",
  getCaptureStream: () => navigator.mediaDevices.getUserMedia({audio: true}),
  getStartErrorMessage(error) {
    if (error.name === "NotAllowedError") {
      return "Microphone access was denied. Please allow it and try again.";
    }

    if (error.name === "NotFoundError") {
      return "No microphone was found on this device.";
    }

    return "LiveListen could not start. Make sure the Flask app and port 8000 WebSocket server are both running.";
  },
});
