from fastapi import FastAPI, WebSocket
from .stt import transcribe_audio
from .summary import summarize_text
import json
import os
from datetime import datetime
from pathlib import Path

app = FastAPI()
audio_buffer = b""
transcript_buffer = ""

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    global audio_buffer, transcript_buffer

    while True:
        try:
            try:
                audio_chunk = await ws.receive_bytes()
                audio_buffer += audio_chunk
                print(f"Received audio chunk: {len(audio_chunk)} bytes, buffer size: {len(audio_buffer)}")
                
                if len(audio_buffer) >= 200_000:
                    print("Processing audio buffer...")
                    text = transcribe_audio(audio_buffer)
                    audio_buffer = b""
                    transcript_buffer += " " + text
                    await ws.send_text(json.dumps({
                        "type": "TRANSCRIPT",
                        "text": text
                    }))
                    print(f"Transcribed: {text}")
                    
            except:
                try:
                    text_message = await ws.receive_text()
                    data = json.loads(text_message)
                    
                    if data.get("type") == "SUMMARY_REQUEST":
                        if transcript_buffer.strip():
                            summary = summarize_text(transcript_buffer)
                            await ws.send_text(json.dumps({
                                "type": "SUMMARY_RESULT",
                                "summary": summary
                            }))
                        else:
                            await ws.send_text(json.dumps({
                                "type": "SUMMARY_RESULT", 
                                "summary": "No transcript available to summarize."
                            }))
                except Exception as inner_e:
                    print(f"Error processing text message: {inner_e}")
                    print(inner_e)
                    print(type(inner_e))
                    break
                        
        except Exception as e:
            print(f"WebSocket error: {e}")
            break