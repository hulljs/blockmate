from fastapi import FastAPI, File, UploadFile, Form, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from mnemonic import Mnemonic
from rapidfuzz import fuzz # Faster than fuzzywuzzy
import json
import os
import base58
import nacl.signing
import nacl.encoding
import numpy as np
import tempfile
import speech_recognition as sr
import soundfile as sf
import soundfile
import io

# Local imports
try:
    from utils import load_audio, extract_features, verify_speaker
except ImportError:
    from .utils import load_audio, extract_features, verify_speaker

from models import CreateWalletResponse

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_FILE = "db.json"

def get_db():
    if not os.path.exists(DB_FILE):
        return {}
    try:
        with open(DB_FILE, "r") as f:
            return json.load(f)
    except:
        return {}

def save_db(data):
    with open(DB_FILE, "w") as f:
        json.dump(data, f, indent=2)

def verify_solana_signature(pubkey_str: str, message_str: str, signature_str: str) -> bool:
    try:
        pubkey_bytes = base58.b58decode(pubkey_str)
        signature_bytes = base58.b58decode(signature_str)
        message_bytes = message_str.encode("utf-8")
        
        verify_key = nacl.signing.VerifyKey(pubkey_bytes)
        verify_key.verify(message_bytes, signature_bytes)
        return True
    except Exception as e:
        print(f"Signature verification failed: {e}")
        return False

@app.post("/create-wallet", response_model=CreateWalletResponse)
async def create_wallet():
    """Generates a new Solana wallet and stores it locally."""
    mnemo = Mnemonic("english")
    words = mnemo.generate(strength=128)
    seed = mnemo.to_seed(words)
    
    signing_key = nacl.signing.SigningKey(seed[:32])
    verify_key = signing_key.verify_key
    
    pubkey_bytes = verify_key.encode()
    wallet_address = base58.b58encode(pubkey_bytes).decode('utf-8')
    
    privkey_bytes = signing_key.encode()
    full_secret = privkey_bytes + pubkey_bytes 
    secret_key_b58 = base58.b58encode(full_secret).decode('utf-8')
    
    db = get_db()
    db[wallet_address] = {
        "voice_print": None,
        "created_at": "TODO: timestamp",
        "type": "custodial",
        "private_key_b58": secret_key_b58 
    }
    save_db(db)
    
    return {
        "wallet_address": wallet_address,
        "mnemonic": words,
        "private_key": secret_key_b58
    }

@app.post("/enroll")
async def enroll_user(
    wallet_address: str = Form(...),
    signature: str = Form(None),
    message: str = Form(...),
    phrase: str = Form(...),
    audio: UploadFile = File(...)
):
    print(f"Enroll Request: {wallet_address} Phrase: {phrase}")
    
    if len(phrase) < 10:
         raise HTTPException(status_code=400, detail="Phrase too short for security check.")

    db = get_db()
    user_data = db.get(wallet_address)
    
    if not user_data:
        user_data = {"type": "external", "created_at": "now"}
    
    if not signature:
        raise HTTPException(status_code=400, detail="Signature required")
         
    if not verify_solana_signature(wallet_address, message, signature):
        raise HTTPException(status_code=401, detail="Invalid wallet signature")

    audio_bytes = await audio.read()
    
    # 1. VERIFY SPOKEN CONTENT (STT)
    # Require 75% match for enrollment to ensure clean audio
    try:
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp_wav:
             y, sr_load = load_audio(audio_bytes)
             # Force PCM_16 for speech_recognition compatibility
             sf.write(tmp_wav.name, y, sr_load, subtype='PCM_16')
             tmp_wav_path = tmp_wav.name

        r = sr.Recognizer()
        with sr.AudioFile(tmp_wav_path) as source:
            audio_data = r.record(source)
            try:
                text = r.recognize_google(audio_data)
                print(f"DEBUG: Enroll Transcribed: '{text}' Expected: '{phrase}'")
                
                # Check Word Count
                actual_words = text.lower().split()
                expected_words = phrase.lower().split()
                
                if len(actual_words) < len(expected_words) * 0.75:
                     os.remove(tmp_wav_path)
                     raise HTTPException(status_code=400, detail=f"Enrollment rejected. You missed too many words. Heard {len(actual_words)}/{len(expected_words)} words.")

                score = fuzz.ratio(text.lower(), phrase.lower())
                print(f"DEBUG: Enroll Score: {score}")

                if score < 75: 
                    os.remove(tmp_wav_path)
                    raise HTTPException(status_code=400, detail=f"Enrollment rejected. Please speak clearly. (Score: {score})")
            
            except sr.UnknownValueError:
                # pass # Relax for now? No, fail.
                # If we can't understand enrollment, verification will fail later.
                os.remove(tmp_wav_path)
                raise HTTPException(status_code=400, detail="Could not understand audio. Please speak clearly.")
            except Exception as e:
                print(f"STT Error: {e}")
        
        if os.path.exists(tmp_wav_path):
            os.remove(tmp_wav_path)

    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"STT Check Failed (Non-blocking for Enroll): {e}")

    # 2. EXTRACT FEATURES
    try:
        y, sr_load = load_audio(audio_bytes)
        import librosa
        if sr_load != 16000:
             y = librosa.resample(y, orig_sr=sr_load, target_sr=16000)
             sr_load = 16000
             
        features = extract_features(y, sr_load)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Audio processing failed: {str(e)}")

    user_data["voice_print"] = features.tolist()
    db[wallet_address] = user_data
    save_db(db)
    
    return {"status": "success", "message": "Voice print enrolled successfully"}

@app.post("/verify")
async def verify_user(
    wallet_address: str = Form(...),
    signature: str = Form(...), 
    message: str = Form(...),
    phrase: str = Form(...), 
    audio: UploadFile = File(...)
):
    print(f"Verify Request: {wallet_address} Phrase: {phrase}")

    if len(phrase) < 10:
         raise HTTPException(status_code=400, detail="Phrase too short for verification.")

    db = get_db()
    if wallet_address not in db:
        raise HTTPException(status_code=404, detail="User not enrolled")
        
    user_data = db[wallet_address]
    if user_data.get("voice_print") is None:
         raise HTTPException(status_code=400, detail="User has no voice print enrolled")

    if not verify_solana_signature(wallet_address, message, signature):
        raise HTTPException(status_code=401, detail="Invalid wallet signature")

    audio_bytes = await audio.read()

    # 1. VERIFY SPOKEN CONTENT (STT) - CRITICAL STEP
    stt_score = 0
    try:
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp_wav:
             y, sr_load = load_audio(audio_bytes)
             sf.write(tmp_wav.name, y, sr_load, subtype='PCM_16')
             tmp_wav_path = tmp_wav.name

        r = sr.Recognizer()
        with sr.AudioFile(tmp_wav_path) as source:
            audio_data = r.record(source)
            try:
                text = r.recognize_google(audio_data)
                print(f"DEBUG: Verify Transcribed: '{text}' Expected: '{phrase}'")
                
                # Check Word Count
                actual_words = text.lower().split()
                expected_words = phrase.lower().split()
                
                # Strict: Must match at least 75% of word count
                if len(actual_words) < len(expected_words) * 0.75:
                     os.remove(tmp_wav_path)
                     return {
                         "verified": False,
                         "score": 0.0,
                         "message": f"Incomplete phrase. Heard {len(actual_words)}/{len(expected_words)} words."
                     }

                stt_score = fuzz.ratio(text.lower(), phrase.lower())
                print(f"DEBUG: Content Score: {stt_score}")
                
                if stt_score < 99: # Strict Threshold for content match
                     os.remove(tmp_wav_path)
                     return {
                         "verified": False,
                         "score": float(stt_score),
                         "message": f"Incorrect passphrase. (Content Score: {stt_score}/100)"
                     }
                     
            except sr.UnknownValueError:
                 os.remove(tmp_wav_path)
                 return {"verified": False, "score": 0.0, "message": "Could not understand speech."}
            except Exception as e:
                 print(f"STT Service Error: {e}")
                 os.remove(tmp_wav_path)
                 return {"verified": False, "score": 0.0, "message": "Speech recognition service unavailable."}
        
        if os.path.exists(tmp_wav_path):
            os.remove(tmp_wav_path)

    except Exception as e:
        print(f"STT Critical Error: {e}")
        return {"verified": False, "score": 0.0, "message": "Audio processing error during STT."}


    # 2. VERIFY VOICE BIOMETRICS
    try:
        y, sr_load = load_audio(audio_bytes)
        import librosa
        if sr_load != 16000:
             y = librosa.resample(y, orig_sr=sr_load, target_sr=16000)
             sr_load = 16000
             
        new_features = extract_features(y, sr_load)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Audio processing failed: {str(e)}")

    stored_features = np.array(user_data["voice_print"])
    
    if stored_features.shape != new_features.shape:
        print(f"Feature Shape Mismatch: Stored {stored_features.shape}, New {new_features.shape}")
        raise HTTPException(status_code=400, detail="Voice print version mismatch. Please re-enroll.")

    THRESHOLD = 0.90 
    is_match, bio_score = verify_speaker(stored_features, new_features, threshold=THRESHOLD)

    return {
        "verified": bool(is_match),
        "score": bio_score,
        "threshold": THRESHOLD,
        "details": {
            "bio_score": bio_score,
            "content_score": stt_score
        },
        "message": "Voice Verified" if is_match else f"Voice Mismatch (Score: {bio_score:.2f})"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
