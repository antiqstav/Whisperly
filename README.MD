# Whisperly

4th at Texas TSA 25-26 for NQE HS Software Development

An all-in-one speech-to-text (STT) transcription platform for people with hearing disabilities.
- Drop N Read: Audio file upload
- VoiceNotes: Browser audio capture
- LiveListen: Live transcription


TO RUN:

Web Server:
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python server/api.py

Backend:
source .venv/bin/activate
uvicorn server.main:app --host 127.0.0.1 --port 8000 --reload
