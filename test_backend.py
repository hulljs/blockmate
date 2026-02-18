import requests
import nacl.signing
import base58
import numpy as np
import soundfile as sf
import io

API_URL = "http://localhost:8000"

def generate_keypair():
    verify_key = nacl.signing.SigningKey.generate()
    return verify_key

def create_dummy_audio(duration=2.0, sr=16000):
    t = np.linspace(0, duration, int(sr*duration))
    y = 0.5 * np.sin(2 * np.pi * 440 * t) # 440Hz sine wave
    buffer = io.BytesIO()
    sf.write(buffer, y, sr, format='WAV')
    buffer.seek(0)
    return buffer

def test_flow():
    # 1. Setup Identity
    signing_key = generate_keypair()
    verify_key = signing_key.verify_key
    wallet_address = base58.b58encode(verify_key.encode()).decode()
    print(f"Testing with Wallet: {wallet_address}")

    # 2. Enroll
    print("\n--- Testing Enrollment ---")
    message = "VoiceAuth Enroll"
    signature = signing_key.sign(message.encode("utf-8")).signature
    signature_b58 = base58.b58encode(signature).decode()
    
    audio = create_dummy_audio()
    files = {'audio': ('enroll.wav', audio, 'audio/wav')}
    data = {
        'wallet_address': wallet_address,
        'message': message,
        'signature': signature_b58,
        'phrase': 'this is a dummy phrase that wont match stt because audio is sine wave'
    }
    
    try:
        res = requests.post(f"{API_URL}/enroll", data=data, files=files)
        print(f"Enroll Response: {res.status_code} {res.text}")
    except Exception as e:
        print(f"Enroll failed: {e}")

    # 3. Verify (Success case - Mocking STT success requires actual speech audio)
    # Since we can't easily generate speech audio, we expect verification to FAIL on STT check
    # if using sine wave.
    print("\n--- Testing Verification (Sine Wave - Should Fail STT) ---")
    message_v = "VoiceAuth Verify"
    signature_v = signing_key.sign(message_v.encode("utf-8")).signature
    signature_v_b58 = base58.b58encode(signature_v).decode()
    
    audio_v = create_dummy_audio() # Same tone
    files_v = {'audio': ('verify.wav', audio_v, 'audio/wav')}
    data_v = {
        'wallet_address': wallet_address,
        'message': message_v,
        'signature': signature_v_b58,
        'phrase': 'some passphrase'
    }
    
    try:
        res = requests.post(f"{API_URL}/verify", data=data_v, files=files_v)
        res_json = res.json()
        print(f"Verify Response: {res.status_code} {res_json}")
        # Expected: verified=False because STT fails on sine wave
    except Exception as e:
        print(f"Verify failed: {e}")

if __name__ == "__main__":
    test_flow()
