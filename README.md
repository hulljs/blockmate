# VoiceAuth Sol

A blockchain-based voice biometric authentication system on Solana.

## Prerequisites
- Node.js (v16+)
- Python (v3.9+)
- Solana Wallet (Phantom or Solflare browser extension)

## Setup

### 1. Backend
This handles voice processing and signature verification.

```bash
cd backend
# Create virtual environment if not already active
python3 -m venv venv 
source venv/bin/activate
# Install dependencies
pip install fastapi uvicorn python-multipart pynacl base58 numpy scipy librosa soundfile requests
# Run server
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### 2. Frontend
This is the user interface.

```bash
cd frontend
npm install
npm run dev
```

## Usage
1.  Open `http://localhost:5173`.
2.  Connect your Solana Wallet (Devnet).
3.  **Enrollment**:
    -   Click "Enroll Voice".
    -   Read the displayed random phrase.
    -   Click "Start Recording", read, then "Stop".
    -   Click "Submit Enrollment". Usually requires a wallet signature.
4.  **Verification**:
    -   Click "Verify Access".
    -   Read the new challenge phrase.
    -   Submit.
    -   If your voice matches the enrolled print, access is granted.

## Architecture
-   **Frontend**: React + Vite + Solana Wallet Adapter.
-   **Backend**: FastAPI + Librosa (Audio Analysis) + PyNaCl (Ed25519 Signature Verification).
-   **Storage**: Local `db.json` (MVP).

## Note
This is a Proof of Concept. The voice verification uses simple MFCC feature extraction and cosine similarity. For production, consider using deep learning models (e.g., ECAPA-TDNN) and decentralized storage (IPFS/Arweave) for encrypted voice prints.
