let isAuthenticated = false;

async function init() {
  // Check auth status
  const statusRes = await fetch('/api/auth/status');
  const statusData = await statusRes.json();
  isAuthenticated = statusData.authenticated;

  // Redirect unauthenticated users to sign in
  if (!isAuthenticated) {
    window.location.href = '/signin/signin.html?redirect=/liveusers/liveusers.html';
    return;
  }

  // Update nav sign in link to show name + sign out
  const navLink = document.getElementById('nav-signin-link');
  const navLabel = document.getElementById('nav-signin-label');
  navLabel.textContent = statusData.user.name;
  navLink.href = '#';
  navLink.addEventListener('click', async e => {
    e.preventDefault();
    await fetch('/api/auth/logout', {method: 'POST'});
    window.location.href = '/signin/signin.html';
  });

  // Load recordings
  await loadRecordings();
}

async function loadRecordings() {
  const loadingEl = document.getElementById('loading-state');
  const emptyEl = document.getElementById('empty-state');
  const tableWrapper = document.getElementById('table-wrapper');
  const tbody = document.getElementById('recordings-tbody');

  try {
    const res = await fetch('/api/recordings');
    const recordings = await res.json();

    loadingEl.hidden = true;

    if (!recordings.length) {
      emptyEl.hidden = false;
      return;
    }

    tableWrapper.hidden = false;

    // Hide audio column header if not authenticated
    if (!isAuthenticated) {
      document.getElementById('audio-col-header').hidden = true;
    }

    tbody.innerHTML = '';
    recordings.forEach(rec => {
      const tr = document.createElement('tr');

      const transcriptCell = buildDownloadCell(
        rec.id,
        'transcript',
        'Download .txt',
        rec.id
      );

      const audioCell = buildDownloadCell(
        rec.id,
        'audio',
        'Download Audio',
        rec.id,
        !rec.has_audio
      );

      tr.innerHTML = `
        <td class="id-cell">#${rec.id}</td>
        <td class="name-cell">${escapeHtml(rec.name)}</td>
        <td class="date-cell">${escapeHtml(rec.date_taken)}</td>
        <td class="time-cell">${escapeHtml(rec.time_taken)}</td>
      `;

      // Transcript cell
      const transcriptTd = document.createElement('td');
      transcriptTd.className = 'transcript-cell';
      transcriptTd.appendChild(transcriptCell);
      tr.appendChild(transcriptTd);

      // Audio cell — only render for signed-in users
      if (isAuthenticated) {
        const audioTd = document.createElement('td');
        audioTd.className = 'audio-cell';
        audioTd.appendChild(audioCell);
        tr.appendChild(audioTd);
      }

      tbody.appendChild(tr);
    });
  } catch (err) {
    loadingEl.textContent = 'Failed to load recordings. Is the server running?';
  }
}

function buildDownloadCell(id, type, label, recId, disabled) {
  if (!isAuthenticated) {
    const span = document.createElement('span');
    span.className = 'lock-icon';
    span.textContent = type === 'transcript' ? '\uD83D\uDD12 Sign in to download' : '';
    span.setAttribute('aria-label', 'Sign in required');
    return span;
  }

  if (disabled) {
    const span = document.createElement('span');
    span.className = 'lock-icon';
    span.textContent = 'No audio';
    return span;
  }

  const a = document.createElement('a');
  a.className = `download-btn ${type === 'audio' ? 'audio-btn' : ''}`;
  a.href = `/api/recordings/${recId}/${type}`;
  a.textContent = label;
  a.setAttribute('download', '');
  a.setAttribute('aria-label', `${label} for recording ${recId}`);

  // Handle 401 redirect gracefully
  a.addEventListener('click', async e => {
    e.preventDefault();
    const res = await fetch(a.href);
    if (res.status === 401) {
      window.location.href = `/signin/signin.html?redirect=/liveusers/liveusers.html`;
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const tmp = document.createElement('a');
    tmp.href = url;
    const cd = res.headers.get('Content-Disposition') || '';
    const match = cd.match(/filename=([^\s;]+)/);
    tmp.download = match ? match[1] : (type === 'audio' ? `recording_${recId}.webm` : `transcript_${recId}.txt`);
    tmp.click();
    URL.revokeObjectURL(url);
  });

  return a;
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

init();
