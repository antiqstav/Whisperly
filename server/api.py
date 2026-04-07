from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import whisper
import os

app = Flask(__name__)

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

# Serve the main index page
@app.route("/")
def serve_index():
    return send_from_directory("../public/index", "index.html")

# Serve upload page
@app.route("/upload/")
@app.route("/upload/upload.html")
def serve_upload():
    return send_from_directory("../public/upload", "upload.html")

# Serve internal page
@app.route("/internal/")
@app.route("/internal/internal.html")
def serve_internal():
    return send_from_directory("../public/internal", "internal.html")

# Serve external page
@app.route("/external/")
@app.route("/external/external.html")
def serve_external():
    return send_from_directory("../public/external", "external.html")

# Serve static files (CSS, JS, etc.)
@app.route("/<path:filepath>")
def serve_static(filepath):
    # Try to find the file in the public directory structure
    if filepath.startswith("upload/"):
        return send_from_directory("../public", filepath)
    elif filepath.startswith("internal/"):
        return send_from_directory("../public", filepath)
    elif filepath.startswith("external/"):
        return send_from_directory("../public", filepath)
    elif filepath.startswith("index/"):
        return send_from_directory("../public", filepath)
    else:
        # For files in root like index.css
        return send_from_directory("../public", filepath)

@app.route("/api/transcribe", methods=["POST", "OPTIONS", "GET"])
def transcribe():
    if request.method == "OPTIONS":
        return "", 200
    audio = request.files["file"]
    path = os.path.join(UPLOAD_FOLDER, audio.filename)
    audio.save(path)
    result = model.transcribe(path)
    os.remove(path)
    print(result["text"])
    return jsonify({"text": result["text"]})

@app.route("/api/test", methods=["GET"])
def test():
    return "API is running. Use POST with an audio file to transcribe."

if __name__ == "__main__":
    app.run(debug=True, use_reloader=True, host="127.0.0.1", port=5000)
