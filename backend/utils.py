import librosa
import numpy as np
import scipy.spatial.distance as dist
import io
import soundfile as sf
import tempfile
import os
import speech_recognition as sr
from rapidfuzz import fuzz

def load_audio(file_bytes):
    """
    Load audio from bytes into a numpy array.
    Robustly handles WAV and WebM/Ogg via temp file fallback for librosa.
    """
    try:
        data, samplerate = sf.read(io.BytesIO(file_bytes))
        if len(data.shape) > 1:
            data = np.mean(data, axis=1)
        data = data.astype(np.float32)
        return data, samplerate
        
    except Exception as e:
        print(f"Direct load failed, trying temp file: {e}")
        with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as tmp:
            tmp.write(file_bytes)
            tmp_path = tmp.name

        try:
            data, samplerate = librosa.load(tmp_path, sr=16000) 
            return data, samplerate
        except Exception as inner_e:
             print(f"Librosa load failed: {inner_e}")
             raise inner_e
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)

def extract_features(data, sr):
    """
    Extract MFCC features from the audio.
    Using MFCCs + Chroma + Spectral Contrast to make it stricter and more robust.
    """
    mfccs = librosa.feature.mfcc(y=data, sr=sr, n_mfcc=20)
    mfcc_mean = np.mean(mfccs, axis=1)
    mfcc_std = np.std(mfccs, axis=1)
    
    chroma = librosa.feature.chroma_stft(y=data, sr=sr)
    chroma_mean = np.mean(chroma, axis=1)
    
    contrast = librosa.feature.spectral_contrast(y=data, sr=sr)
    contrast_mean = np.mean(contrast, axis=1)
    
    features = np.concatenate((mfcc_mean, mfcc_std, chroma_mean, contrast_mean))
    
    return features

def verify_speaker(feature_vector_1, feature_vector_2, threshold=0.85):
    """
    Compare two feature vectors using Cosine Similarity.
    """
    if len(feature_vector_1) != len(feature_vector_2):
        print(f"Feature vector length mismatch: {len(feature_vector_1)} vs {len(feature_vector_2)}")
        return False, 0.0

    distance = dist.cosine(feature_vector_1, feature_vector_2)
    similarity = 1 - distance
    
    print(f"DEBUG: Similarity Score: {similarity}")
    
    is_match = similarity > threshold
    return is_match, float(similarity)

def verify_speech_content(file_bytes, expected_text):
    """
    Transcribe audio and check similarity with expected text.
    Returns (is_match: bool, transcribed_text: str, score: float)
    """
    r = sr.Recognizer()
    
    # We need a file-like object for SR, usually WAV.
    # Convert whatever bytes we have to WAV using soundfile/pydub logic or just write temp wav.
    try:
        # Save temp WAV for SpeechRecognition (it prefers files)
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp_wav:
             # First, robust load from bytes (handles webm/ogg if ffmpeg present)
             y, s_rate = load_audio(file_bytes)
             # Write as strict WAV
             sf.write(tmp_wav.name, y, s_rate)
             tmp_wav_path = tmp_wav.name
             
        with sr.AudioFile(tmp_wav_path) as source:
            audio_data = r.record(source)
            try:
                # Use Google Speech Recognition (Online) - best for PoC without heavy models
                text = r.recognize_google(audio_data)
                print(f"DEBUG: Transcribed Text: '{text}' Expected: '{expected_text}'")
                
                # Compare text using fuzzy matching (allow minor errors)
                score = fuzz.ratio(text.lower(), expected_text.lower())
                is_match = score > 60 # 60% match allows for some misinterpretation
                
                return is_match, text, score
                
            except sr.UnknownValueError:
                print("Google Speech Recognition could not understand audio")
                return False, "", 0.0
            except sr.RequestError as e:
                print(f"Could not request results from Google Speech Recognition service; {e}")
                # Fallback: Assume success if service is down? No, fail safe.
                return False, "Service Error", 0.0
        
    except Exception as e:
        print(f"Speech Verification Error: {e}")
        return False, "Error", 0.0
    finally:
        if 'tmp_wav_path' in locals() and os.path.exists(tmp_wav_path):
            os.remove(tmp_wav_path)
