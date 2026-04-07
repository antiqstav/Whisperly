from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from .stt import transcribe_audio
import json

app = FastAPI()

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()

    while True:
        try:
            message = await ws.receive()

            if message["type"] == "websocket.disconnect":
                break

            audio_chunk = message.get("bytes")
            if audio_chunk is not None:
                print(f"Received audio chunk: {len(audio_chunk)} bytes")
                text = transcribe_audio(audio_chunk).strip()

                if text:
                    await ws.send_text(json.dumps({
                        "type": "TRANSCRIPT",
                        "text": text
                    }))
                    print(f"Transcribed: {text}")

                continue

            text_message = message.get("text")
            if text_message:
                print(f"Ignoring unsupported text message: {text_message}")
        except WebSocketDisconnect:
            break
        except Exception as e:
            print(f"WebSocket error: {e}")
            await ws.send_text(json.dumps({
                "type": "ERROR",
                "message": "Live transcription failed while processing audio."
            }))
            break
