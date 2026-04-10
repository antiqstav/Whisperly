// ===== LIVE LISTEN STATE =====

const captions = document.getElementById("captions-text");
const summaryText = document.getElementById("summary-text");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const saveBtn = document.getElementById("saveBtn");
const statusMessage = document.getElementById("statusMessage");
const saveMessage = document.getElementById("saveMessage");
const fontSizeControl = document.getElementById("fontSize");

let ws = null;
let currentRecorder = null;
let currentStream = null;
let audioChunks = [];
let allAudioChunks = [];  // accumulates full session audio for saving
let fullTranscript = "";  // accumulates full transcript text
let isRecordingActive = false;
let stopTimeoutId = null;

function setStatus(message) {
  statusMessage.textContent = message;
  statusMessage.hidden = !message;
}

function clearStatus() {
  setStatus("");
}

function setSaveMessage(message, isError) {
  saveMessage.textContent = message;
  saveMessage.hidden = !message;
  saveMessage.style.backgroundColor = isError
    ? "rgba(229, 62, 62, 0.15)"
    : "rgba(56, 161, 105, 0.15)";
  saveMessage.style.borderColor = isError ? "#e53e3e" : "#38a169";
  saveMessage.style.color = isError ? "#fc8181" : "#68d391";
}

function setButtons(isListening) {
  startBtn.style.display = isListening ? "none" : "inline";
  stopBtn.style.display = isListening ? "inline" : "none";
  if (isListening) {
    saveBtn.style.display = "none";
    saveMessage.hidden = true;
  }
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

  // Show save button if there's content to save
  if (fullTranscript.trim()) {
    saveBtn.style.display = "inline";
  }
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
        fullTranscript += " " + data.text;
      } else if (data.type === "ERROR") {
        setStatus(
          data.message || "The live transcription backend returned an error."
        );
        resetSession();
      }
    };

    nextSocket.onerror = () => {
      if (ws !== nextSocket) {
        setStatus(
          "Could not connect to the live transcription backend on port 8000."
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
      {once: true}
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

startBtn.addEventListener("click", async () => {
  clearStatus();
  setButtons(true);
  captions.textContent = "";
  saveBtn.style.display = "none";
  saveMessage.hidden = true;

  // Reset accumulators for new session
  allAudioChunks = [];
  fullTranscript = "";

  if (currentRecorder && currentRecorder.state !== "inactive") {
    currentRecorder.stop();
  }

  stopTracks();
  closeWebSocket();

  try {
    await connectWebSocket();
    currentStream = await navigator.mediaDevices.getUserMedia({audio: true});
    currentRecorder = new MediaRecorder(currentStream, {
      mimeType: "audio/webm;codecs=opus"
    });

    audioChunks = [];
    isRecordingActive = true;

    currentRecorder.ondataavailable = event => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
        allAudioChunks.push(event.data);  // keep copy for saving
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
        "LiveListen could not start. Make sure the Flask app and port 8000 WebSocket server are both running."
      );
    }
  }
});

stopBtn.addEventListener("click", () => {
  clearStatus();
  resetSession();
});

// ===== SAVE RECORDING =====

saveBtn.addEventListener("click", async () => {
  if (!fullTranscript.trim()) return;

  saveBtn.disabled = true;
  saveBtn.textContent = "Saving...";
  setSaveMessage("", false);

  try {
    const formData = new FormData();
    formData.append("transcript", fullTranscript.trim());

    if (allAudioChunks.length > 0) {
      const audioBlob = new Blob(allAudioChunks, {type: "audio/webm"});
      formData.append("audio", audioBlob, "recording.webm");
    }

    const res = await fetch("/api/recordings", {
      method: "POST",
      body: formData
    });
    const data = await res.json();

    if (res.ok) {
      setSaveMessage("Recording saved to database.", false);
      saveBtn.style.display = "none";
      await loadDbTable();
    } else {
      setSaveMessage(data.error || "Failed to save recording.", true);
    }
  } catch {
    setSaveMessage("Could not connect to the server.", true);
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "Save Recording";
  }
});

// ===== AUTH WIDGET =====

let currentUser = null;

async function initAuth() {
  const res = await fetch("/api/auth/status");
  const data = await res.json();

  if (data.authenticated) {
    currentUser = data.user;
    showSignedIn(data.user);
  }

  // Update nav
  const navLabel = document.getElementById("nav-signin-label");
  const navLink = document.getElementById("nav-signin-link");
  if (data.authenticated) {
    navLabel.textContent = data.user.name;
    navLink.href = "#";
    navLink.addEventListener("click", async e => {
      e.preventDefault();
      await fetch("/api/auth/logout", {method: "POST"});
      window.location.reload();
    });
  }
}

function showSignedIn(user) {
  document.getElementById("auth-forms-section").hidden = true;
  const signedInEl = document.getElementById("auth-signed-in");
  signedInEl.hidden = false;
  document.getElementById("signed-in-name").textContent = user.name;
  document.getElementById("signed-in-email").textContent = user.email;
}

function showAuthForms() {
  document.getElementById("auth-forms-section").hidden = false;
  document.getElementById("auth-signed-in").hidden = true;
}

// Widget tab switching
document.getElementById("w-signin-tab").addEventListener("click", () => {
  document.getElementById("w-signin-tab").classList.add("active");
  document.getElementById("w-register-tab").classList.remove("active");
  document.getElementById("w-signin-panel").classList.remove("hidden");
  document.getElementById("w-register-panel").classList.add("hidden");
  document.getElementById("w-auth-error").hidden = true;
});

document.getElementById("w-register-tab").addEventListener("click", () => {
  document.getElementById("w-register-tab").classList.add("active");
  document.getElementById("w-signin-tab").classList.remove("active");
  document.getElementById("w-register-panel").classList.remove("hidden");
  document.getElementById("w-signin-panel").classList.add("hidden");
  document.getElementById("w-auth-error").hidden = true;
});

function showWidgetError(msg) {
  const el = document.getElementById("w-auth-error");
  el.textContent = msg;
  el.hidden = false;
}

// Widget sign in form
document.getElementById("w-signin-form").addEventListener("submit", async e => {
  e.preventDefault();
  document.getElementById("w-auth-error").hidden = true;
  const email = document.getElementById("w-signin-email").value.trim();
  const password = document.getElementById("w-signin-password").value;
  const btn = document.getElementById("w-signin-btn");

  if (!email || !password) {
    showWidgetError("Email and password are required.");
    return;
  }

  btn.disabled = true;
  btn.textContent = "Signing in...";

  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({email, password})
    });
    const data = await res.json();

    if (!res.ok) {
      showWidgetError(data.error || "Sign in failed.");
    } else {
      currentUser = data.user;
      showSignedIn(data.user);
      const navLabel = document.getElementById("nav-signin-label");
      navLabel.textContent = data.user.name;
      await loadDbTable();
    }
  } catch {
    showWidgetError("Could not connect to the server.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Sign In";
  }
});

// Widget register form
document.getElementById("w-register-form").addEventListener("submit", async e => {
  e.preventDefault();
  document.getElementById("w-auth-error").hidden = true;
  const name = document.getElementById("w-register-name").value.trim();
  const email = document.getElementById("w-register-email").value.trim();
  const password = document.getElementById("w-register-password").value;
  const btn = document.getElementById("w-register-btn");

  if (!email || !password) {
    showWidgetError("Email and password are required.");
    return;
  }
  if (password.length < 6) {
    showWidgetError("Password must be at least 6 characters.");
    return;
  }

  btn.disabled = true;
  btn.textContent = "Creating...";

  try {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({name, email, password})
    });
    const data = await res.json();

    if (!res.ok) {
      showWidgetError(data.error || "Registration failed.");
    } else {
      currentUser = data.user;
      showSignedIn(data.user);
      const navLabel = document.getElementById("nav-signin-label");
      navLabel.textContent = data.user.name;
      await loadDbTable();
    }
  } catch {
    showWidgetError("Could not connect to the server.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Create Account";
  }
});

// Sign out button
document.getElementById("signout-btn").addEventListener("click", async () => {
  await fetch("/api/auth/logout", {method: "POST"});
  currentUser = null;
  showAuthForms();
  document.getElementById("nav-signin-label").textContent = "Sign In";
  await loadDbTable();
});

// ===== DATABASE TABLE =====

async function loadDbTable() {
  const loadingEl = document.getElementById("db-loading");
  const emptyEl = document.getElementById("db-empty");
  const tableWrapper = document.getElementById("db-table-wrapper");
  const tbody = document.getElementById("db-tbody");

  loadingEl.hidden = false;
  emptyEl.hidden = true;
  tableWrapper.hidden = true;

  try {
    const res = await fetch("/api/recordings");
    const recordings = await res.json();

    loadingEl.hidden = true;

    if (!recordings.length) {
      emptyEl.hidden = false;
      return;
    }

    tableWrapper.hidden = false;
    tbody.innerHTML = "";

    recordings.forEach(rec => {
      const tr = document.createElement("tr");

      // Transcript cell
      let transcriptCell;
      if (currentUser) {
        const a = document.createElement("a");
        a.className = "db-dl-btn";
        a.href = `/api/recordings/${rec.id}/transcript`;
        a.textContent = "Download .txt";
        a.setAttribute("download", "");
        a.addEventListener("click", async ev => {
          ev.preventDefault();
          const dlRes = await fetch(a.href);
          if (dlRes.status === 401) {
            showWidgetError("Session expired. Please sign in again.");
            return;
          }
          const blob = await dlRes.blob();
          const url = URL.createObjectURL(blob);
          const tmp = document.createElement("a");
          tmp.href = url;
          tmp.download = `transcript_${rec.id}.txt`;
          tmp.click();
          URL.revokeObjectURL(url);
        });
        transcriptCell = a;
      } else {
        const span = document.createElement("span");
        span.className = "db-lock";
        span.textContent = "\uD83D\uDD12 Sign in";
        transcriptCell = span;
      }

      tr.innerHTML = `
        <td class="db-id">#${rec.id}</td>
        <td class="db-name">${escapeHtml(rec.name)}</td>
        <td class="db-date">${escapeHtml(rec.date_taken)}</td>
        <td class="db-time">${escapeHtml(rec.time_taken)}</td>
      `;

      const transcriptTd = document.createElement("td");
      transcriptTd.appendChild(transcriptCell);
      tr.appendChild(transcriptTd);

      tbody.appendChild(tr);
    });
  } catch {
    loadingEl.textContent = "Failed to load. Is the server running?";
  }
}

function escapeHtml(str) {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

document.getElementById("refresh-btn").addEventListener("click", loadDbTable);

// ===== INIT =====

initAuth().then(loadDbTable);
