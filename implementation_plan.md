# Implementation Plan: Voice-Based Blockchain Authentication (VoiceAuth Sol)

## Overview
This application demonstrates a Proof-of-Concept (PoC) for using voice biometrics as a Multi-Factor Authentication (MFA) mechanism for blockchain wallets on Solana. The user's voice print is linked to their wallet address (SOL balance), ensuring that access requires both the private key (wallet signature) and the physical voice of the owner.

## Architecture

### Frontend (Client)
- **Framework**: React (Vite) for robust state management and component lifecycle.
- **Styling**: Vanilla CSS with a focus on modern, dark-mode aesthetics (glassmorphism, neon accents).
- **Functionality**:
    - Connect Wallet (Phantom/Solflare via `@solana/wallet-adapter-react`).
    - Audio Recording: Uses the browser's `MediaRecorder` API to capture voice input.
    - Random Sentence Generation: Uses `bip39` word lists to generate phrases.
    - API Interaction: Sends signed messages and audio blobs to the backend.

### Backend (Server)
- **Framework**: Python (FastAPI) for high-performance API endpoints.
- **Audio Processing**:
    - Uses `librosa` and `scipy` to extract Mel-Frequency Cepstral Coefficients (MFCCs).
    - Compares audio samples using Dynamic Time Warping (DTW) or Cosine Similarity to verify speaker identity.
    - Stores "Voice Prints" (feature vectors) locally (JSON/SQLite).
- **Blockchain Verification**:
    - Verifies Solana wallet signatures using `nacl` (Python binding) or similar cryptographic libraries to ensure the request originates from the wallet owner.

## User Flow

1.  **Enrollment (Initial Setup)**:
    - User connects their Solana wallet.
    - App generates a random 12-word phrase (simulating a seed phrase).
    - User records themselves reading the phrase.
    - App sends the wallet address and audio to the backend.
    - Backend processes the audio, extracts features (the "Voice Print"), and stores it associated with the wallet address.

2.  **Authentication (MFA)**:
    - User connects their wallet to log in.
    - App challenges the user to speak a specific phrase (e.g., a subset of the original words or a new random sentence).
    - User records the phrase.
    - User signs a message with their wallet proving ownership.
    - App sends the audio + signature + wallet address to the backend.
    - Backend:
        - Verifies the signature.
        - Processes the new audio.
        - Compares the new voice features against the stored Voice Print.
        - If the match score is above a threshold, access is granted.

## Technical Stack
-   **Frontend**: `vite`, `react`, `@solana/web3.js`, `@solana/wallet-adapter-react`
-   **Backend**: `fastapi`, `uvicorn`, `numpy`, `librosa`, `scipy`, `pynacl` (for ed25519 signature verification)

## Setup Steps
1.  Initialize the frontend project with Vite.
2.  Set up the Python backend environment.
3.  Implement basic UI for wallet connection.
4.  Implement audio recording and playback components.
5.  Implement the enrollment endpoint (Audio Analysis).
6.  Implement the verification endpoint (Audio Comparison + Signature Verification).
7.  Integrate and style the application.
