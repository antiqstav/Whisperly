from flask import Flask, request, jsonify, send_from_directory, session, Response
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
import whisper
import os
import sqlite3
from datetime import datetime
from functools import wraps

app = Flask(__name__)
app.secret_key = 'whisperly-secret-key-change-in-production'
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'

CORS(app, resources={r"/*": {"origins": "*"}})

@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    return response

model = whisper.load_model("base")
UPLOAD_FOLDER = "temp"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# === DATABASE SETUP ===

DB_PATH = os.path.join(os.path.dirname(__file__), 'whisperly.db')
RECORDINGS_FOLDER = os.path.join(os.path.dirname(__file__), 'recordings')
os.makedirs(RECORDINGS_FOLDER, exist_ok=True)

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    conn.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            name TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    conn.execute('''
        CREATE TABLE IF NOT EXISTS recordings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            name TEXT NOT NULL DEFAULT 'Guest',
            date_taken DATE NOT NULL,
            time_taken TIME NOT NULL,
            audio_filename TEXT,
            transcript TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    ''')
    conn.commit()
    conn.close()

init_db()

def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({'error': 'Authentication required'}), 401
        return f(*args, **kwargs)
    return decorated

# === STATIC PAGES ===

@app.route('/')
def serve_index():
    return send_from_directory('../public/index', 'index.html')

@app.route('/upload/')
@app.route('/upload/upload.html')
def serve_upload():
    return send_from_directory('../public/upload', 'upload.html')

@app.route('/internal/')
@app.route('/internal/internal.html')
def serve_internal():
    return send_from_directory('../public/internal', 'internal.html')

@app.route('/external/')
@app.route('/external/external.html')
def serve_external():
    return send_from_directory('../public/external', 'external.html')

@app.route('/signin/')
@app.route('/signin/signin.html')
def serve_signin():
    return send_from_directory('../public/signin', 'signin.html')

@app.route('/liveusers/')
@app.route('/liveusers/liveusers.html')
def serve_liveusers():
    return send_from_directory('../public/liveusers', 'liveusers.html')

@app.route('/<path:filepath>')
def serve_static(filepath):
    return send_from_directory('../public', filepath)

# === AUTH ENDPOINTS ===

@app.route('/api/auth/register', methods=['POST', 'OPTIONS'])
def register():
    if request.method == 'OPTIONS':
        return '', 200
    data = request.get_json()
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')
    name = data.get('name', '').strip()

    if not email or not password:
        return jsonify({'error': 'Email and password are required'}), 400
    if len(password) < 6:
        return jsonify({'error': 'Password must be at least 6 characters'}), 400

    conn = get_db()
    try:
        pw_hash = generate_password_hash(password)
        conn.execute(
            'INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)',
            (email, pw_hash, name or email.split('@')[0])
        )
        conn.commit()
        user = conn.execute('SELECT * FROM users WHERE email = ?', (email,)).fetchone()
        session['user_id'] = user['id']
        session['user_email'] = user['email']
        session['user_name'] = user['name']
        return jsonify({'user': {'id': user['id'], 'email': user['email'], 'name': user['name']}})
    except sqlite3.IntegrityError:
        return jsonify({'error': 'Email already registered'}), 409
    finally:
        conn.close()

@app.route('/api/auth/login', methods=['POST', 'OPTIONS'])
def login():
    if request.method == 'OPTIONS':
        return '', 200
    data = request.get_json()
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')

    if not email or not password:
        return jsonify({'error': 'Email and password are required'}), 400

    conn = get_db()
    user = conn.execute('SELECT * FROM users WHERE email = ?', (email,)).fetchone()
    conn.close()

    if not user or not check_password_hash(user['password_hash'], password):
        return jsonify({'error': 'Invalid email or password'}), 401

    session['user_id'] = user['id']
    session['user_email'] = user['email']
    session['user_name'] = user['name']
    return jsonify({'user': {'id': user['id'], 'email': user['email'], 'name': user['name']}})

@app.route('/api/auth/logout', methods=['POST', 'OPTIONS'])
def logout():
    if request.method == 'OPTIONS':
        return '', 200
    session.clear()
    return jsonify({'message': 'Logged out'})

@app.route('/api/auth/status', methods=['GET'])
def auth_status():
    if 'user_id' in session:
        return jsonify({'authenticated': True, 'user': {
            'id': session['user_id'],
            'email': session['user_email'],
            'name': session['user_name']
        }})
    return jsonify({'authenticated': False})

# === RECORDINGS ENDPOINTS ===

@app.route('/api/recordings', methods=['GET'])
def list_recordings():
    conn = get_db()
    rows = conn.execute(
        'SELECT id, name, date_taken, time_taken, transcript, audio_filename FROM recordings ORDER BY created_at DESC'
    ).fetchall()
    conn.close()
    return jsonify([{
        'id': r['id'],
        'name': r['name'],
        'date_taken': r['date_taken'],
        'time_taken': r['time_taken'],
        'transcript': r['transcript'],
        'has_audio': bool(r['audio_filename'])
    } for r in rows])

@app.route('/api/recordings', methods=['POST', 'OPTIONS'])
def create_recording():
    if request.method == 'OPTIONS':
        return '', 200
    name = session.get('user_name', 'Guest')
    user_id = session.get('user_id')
    now = datetime.now()
    date_taken = now.strftime('%Y-%m-%d')
    time_taken = now.strftime('%H:%M:%S')
    transcript = request.form.get('transcript', '')
    audio_filename = None

    if 'audio' in request.files:
        f = request.files['audio']
        if f and f.filename:
            ts = now.strftime('%Y%m%d_%H%M%S')
            audio_filename = f'rec_{ts}_{user_id or "guest"}.webm'
            f.save(os.path.join(RECORDINGS_FOLDER, audio_filename))

    conn = get_db()
    cur = conn.execute(
        'INSERT INTO recordings (user_id, name, date_taken, time_taken, audio_filename, transcript) VALUES (?,?,?,?,?,?)',
        (user_id, name, date_taken, time_taken, audio_filename, transcript)
    )
    conn.commit()
    rid = cur.lastrowid
    conn.close()
    return jsonify({'id': rid, 'message': 'Saved'})

@app.route('/api/recordings/<int:rid>/audio', methods=['GET'])
@login_required
def download_audio(rid):
    conn = get_db()
    rec = conn.execute('SELECT * FROM recordings WHERE id = ?', (rid,)).fetchone()
    conn.close()
    if not rec or not rec['audio_filename']:
        return jsonify({'error': 'Audio not found'}), 404
    return send_from_directory(RECORDINGS_FOLDER, rec['audio_filename'], as_attachment=True)

@app.route('/api/recordings/<int:rid>/transcript', methods=['GET'])
@login_required
def download_transcript(rid):
    conn = get_db()
    rec = conn.execute('SELECT * FROM recordings WHERE id = ?', (rid,)).fetchone()
    conn.close()
    if not rec:
        return jsonify({'error': 'Not found'}), 404
    return Response(
        rec['transcript'] or '',
        mimetype='text/plain',
        headers={'Content-Disposition': f'attachment; filename=transcript_{rid}.txt'}
    )

# === TRANSCRIPTION ===

@app.route('/api/transcribe', methods=['POST', 'OPTIONS', 'GET'])
def transcribe():
    if request.method == 'OPTIONS':
        return '', 200
    audio = request.files['file']
    path = os.path.join(UPLOAD_FOLDER, audio.filename)
    audio.save(path)
    result = model.transcribe(path)
    os.remove(path)
    print(result['text'])
    return jsonify({'text': result['text']})

@app.route('/api/test', methods=['GET'])
def test():
    return 'API is running. Use POST with an audio file to transcribe.'

if __name__ == '__main__':
    app.run(debug=True, use_reloader=True, host='127.0.0.1', port=5000)
