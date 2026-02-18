from pydantic import BaseModel
from typing import Optional

class VerifyRequest(BaseModel):
    wallet_address: str
    signature: str          # Base58 encoded signature of a message (e.g. "VoiceAuth Verify")
    message: str            # The message signed (e.g. "VoiceAuth Verify")

class EnrollRequest(BaseModel):
    wallet_address: str
    signature: str          # Proof of ownership
    message: str            # "VoiceAuth Enroll"

class CreateWalletResponse(BaseModel):
    wallet_address: str
    mnemonic: str
    private_key: str        # For PoC, returning private key to user to keep (not safe for prod)

