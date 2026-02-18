# Voice Biometric Technology Specification

## Overview
VoiceAuth Sol uses a dual-layer verification system combining speech-to-text (STT) content verification with biometric voice fingerprinting to ensure secure, replay-resistant authentication.

## 1. Data Collection & Processing
When a user records their voice, the raw audio is captured at high fidelity and immediately processed. We do **not** store the raw audio file permanently.

### Feature Extraction (The "Fingerprint")
We extract a unique mathematical representation of the voice using `librosa` and `numpy`. The "Voice Print" is a feature vector comprising:
- **MFCCs (Mel-Frequency Cepstral Coefficients)**: Captures the shape of the vocal tract.
- **Chroma Features**: Captures tonal and harmonic content (pitch).
- **Spectral Contrast**: Distinguishes speech from background noise.

This results in a multi-dimensional array of floating-point numbers (e.g., `[0.12, -2.4, ...]`) that uniquely identifies the speaker's vocal characteristics.

## 2. Storage & Privacy
- **No Raw Audio**: The user's spoken audio is processed in memory and discarded immediately after verification/enrollment.
- **One-Way Vector**: The stored "voice print" is a mathematical abstraction. It is computationally infeasible to reconstruct the original audio recording from this vector.
- **Local/Encrypted**: Currently stored in `db.json` (for the demo), but in production, this vector is encrypted and stored in a secure database.

## 3. Verification Protocol
The system employs a strict **Two-Factor Voice Authentication** process:

### Layer 1: Content Verification (Anti-Replay)
*   **Challenge**: The user is presented with a random phrase (e.g., "apple banana cherry...").
*   **Transcribing**: The audio is converted to text using Google Speech Recognition.
*   **Comparison**: The transcribed text is compared against the expected phrase using Levenshtein Distance (Fuzzy Matching).
*   **Threshold**: The user must achieve a **95% text match**. This prevents attackers from using pre-recorded audio of the user saying *other* things.

### Layer 2: Biometric Verification (Identity Check)
*   **Comparison**: If Layer 1 passes, the system extracts the feature vector from the new recording.
*   **Cosine Similarity**: We calculate the cosine similarity between the *stored enrollment vector* and the *new verification vector*.
*   **Threshold**: The cryptographic similarity score must exceed **0.90 (90%)**. This ensures that even if an intruder reads the correct phrase, their voice will not match the authorized user's voice print.
