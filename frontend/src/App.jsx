import React, { useMemo, useState, useRef, useEffect } from 'react';
import { ConnectionProvider, WalletProvider, useWallet } from '@solana/wallet-adapter-react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import { WalletModalProvider, WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { clusterApiUrl, Keypair } from '@solana/web3.js';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, Shield, CheckCircle, AlertTriangle, Fingerprint, RefreshCw, LogIn, PlusCircle, Copy, HelpCircle, X } from 'lucide-react';
import { generateMnemonic } from 'bip39';
import axios from 'axios';
import bs58 from 'bs58';

import '@solana/wallet-adapter-react-ui/styles.css';

// --- Constants ---
const API_URL = 'http://localhost:8000'; // Update if needed

// Help Modal Component
const HelpModal = ({ onClose }) => (
  <div style={{
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.85)', zIndex: 1000,
    display: 'flex', justifyContent: 'center', alignItems: 'center',
    padding: '2rem'
  }}>
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="card"
      style={{
        maxWidth: '800px', width: '90%', maxHeight: '90vh', overflowY: 'auto',
        background: '#1a1a1a', border: '1px solid var(--primary-color)',
        padding: '2rem', position: 'relative'
      }}
    >
      <button
        onClick={onClose}
        style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'transparent', padding: '0.5rem' }}
      >
        <X size={24} />
      </button>

      <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '1rem' }}>
        <Fingerprint color="var(--primary-color)" /> Voice Biometric Technology
      </h2>

      <div style={{ textAlign: 'left', lineHeight: '1.6', opacity: 0.9 }}>
        <h3 style={{ color: 'var(--primary-color)' }}>1. How the Fingerprint Works</h3>
        <p>
          VoiceAuth uses advanced signal processing to extract unique vocal characteristics from your speech.
          We analyze your voice's <strong>timbre</strong> (MFCCs), <strong>pitch</strong> (Chroma), and <strong>texture</strong> (Spectral Contrast)
          to generate a mathematical "Voice Print". This print is a multi-dimensional vector that acts like a fingerprint for your voice.
        </p>

        <h3 style={{ color: 'var(--primary-color)' }}>2. What is Collected?</h3>
        <ul style={{ paddingLeft: '1.5rem', marginBottom: '1rem' }}>
          <li><strong>Audio Features:</strong> We extract numerical coefficients representing your vocal tract shape.</li>
          <li><strong>No Raw Audio:</strong> The actual audio recording is processed in memory and immediately discarded. It is never permanently stored.</li>
        </ul>

        <h3 style={{ color: 'var(--primary-color)' }}>3. Storage & Privacy</h3>
        <p>
          The system stores only the <strong>mathematical feature vector</strong> (e.g., an array of numbers like <code>[0.12, -0.45, ...]</code>).
          This vector cannot be reversed to recreate your original voice recording, ensuring your biometric data remains secure even if the database is compromised.
        </p>

        <h3 style={{ color: 'var(--primary-color)' }}>4. Verification Process (Dual-Layer Security)</h3>
        <div style={{ background: 'rgba(255,255,255,0.05)', padding: '1rem', borderRadius: '8px', marginTop: '1rem' }}>
          <p><strong>Layer 1: Content Verification (Anti-Replay)</strong></p>
          <p style={{ fontSize: '0.9rem', opacity: 0.8 }}>
            We use Speech-to-Text to ensure you are saying the exact randomized phrase shown on screen.
            This prevents attackers from using pre-recorded audio of you saying other things.
            You must achieve a <strong>95% text match</strong>.
          </p>
          <div style={{ height: '1px', background: 'rgba(255,255,255,0.1)', margin: '0.5rem 0' }} />
          <p><strong>Layer 2: Biometric verification</strong></p>
          <p style={{ fontSize: '0.9rem', opacity: 0.8 }}>
            If the text matches, we compare your new voice print against your enrolled print using <strong>Cosine Similarity</strong>.
            The system requires a similarity score of <strong>&gt; 90%</strong> to grant access.
          </p>
        </div>
      </div>
    </motion.div>
  </div>
);

// Simple Audio Visualizer Component
const AudioVisualizer = ({ stream }) => {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const analyserRef = useRef(null);
  const dataArrayRef = useRef(null);

  useEffect(() => {
    if (!stream || !canvasRef.current) return;

    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();

    analyser.fftSize = 64;
    source.connect(analyser);

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    analyserRef.current = analyser;
    dataArrayRef.current = dataArray;

    const canvas = canvasRef.current;
    const canvasCtx = canvas.getContext("2d");
    const WIDTH = canvas.width;
    const HEIGHT = canvas.height;

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      canvasCtx.clearRect(0, 0, WIDTH, HEIGHT);

      const barWidth = (WIDTH / bufferLength) * 2.5;
      let barHeight;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        barHeight = (dataArray[i] / 255) * HEIGHT;

        // Gradient color: Primary (Blue) to Secondary (Purple)
        const r = 50 + (100 * (i / bufferLength));
        const g = 100 + (50 * (i / bufferLength));
        const b = 255;

        canvasCtx.fillStyle = `rgb(${r},${g},${b})`;
        canvasCtx.fillRect(x, HEIGHT - barHeight, barWidth - 1, barHeight);

        x += barWidth;
      }
    };

    draw();

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (audioContext && audioContext.state !== 'closed') audioContext.close();
    };
  }, [stream]);

  return (
    <div style={{ width: '100%', height: '100px', background: 'rgba(0,0,0,0.3)', borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)', marginBottom: '1.5rem' }}>
      <canvas ref={canvasRef} width={600} height={100} style={{ width: '100%', height: '100%' }} />
    </div>
  );
};

function AppContent() {
  const { publicKey: adapterPublicKey, signMessage: adapterSignMessage } = useWallet();
  const [activeTab, setActiveTab] = useState('verify'); // 'enroll' or 'verify'
  const [status, setStatus] = useState(null); // 'idle', 'recording', 'processing', 'success', 'error'
  const [logs, setLogs] = useState([]);
  const [phrase, setPhrase] = useState('');
  const [score, setScore] = useState(null);
  const [audioBlob, setAudioBlob] = useState(null);
  const [stream, setStream] = useState(null); // Add stream state for visualizer
  const [showHelp, setShowHelp] = useState(false); // Help Modal State

  // Custom Wallet State (for users without adapter)
  const [generatedWallet, setGeneratedWallet] = useState(null);

  const activePublicKey = generatedWallet ? generatedWallet.publicKey : adapterPublicKey;

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  // Generate phrase on tab switch or init
  useEffect(() => {
    if (!phrase) generateNewPhrase();
  }, [activeTab]);

  const addLog = (msg) => setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);

  const generateNewPhrase = () => {
    const mnemonic = generateMnemonic();
    // Use first 12 words or a subset for shorter recording
    const words = mnemonic.split(' ').slice(0, 12).join(' ');
    setPhrase(words);
    addLog('Generated new security phrase.');
  };

  const createNewWallet = async () => {
    try {
      addLog("Requesting new wallet from backend...");
      const res = await axios.post(`${API_URL}/create-wallet`);
      if (res.data && res.data.private_key) {
        const secretKey = bs58.decode(res.data.private_key);
        const keypair = Keypair.fromSecretKey(secretKey);

        setGeneratedWallet({
          publicKey: keypair.publicKey,
          secretKey: keypair.secretKey,
          address: res.data.wallet_address,
          mnemonic: res.data.mnemonic
        });
        addLog(`Wallet Created: ${res.data.wallet_address.slice(0, 8)}...`);
        setActiveTab('enroll'); // Move to enrollment
      }
    } catch (err) {
      console.error(err);
      addLog(`Error creating wallet: ${err.message}`);
    }
  };

  const startRecording = async () => {
    try {
      setStatus('recording');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setStream(stream); // Set stream for visualizer

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/wav' }); // or audio/webm
        setAudioBlob(blob);

        // Stop all tracks to release mic
        stream.getTracks().forEach(track => track.stop());
        setStream(null);

        addLog('Recording finished. Ready to submit.');
        setStatus('idle');
      };

      mediaRecorder.start();
      addLog('Recording started...');
    } catch (err) {
      console.error(err);
      setStatus('error');
      addLog(`Error accessing microphone: ${err.message}`);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  };

  const handleSubmit = async () => {
    if (!activePublicKey || !audioBlob) {
      addLog('Error: Wallet or audio missing.');
      return;
    }

    try {
      setStatus('processing');
      addLog('Signing payload...');

      const message = activeTab === 'enroll' ? "VoiceAuth Enroll" : "VoiceAuth Verify";
      const messageBytes = new TextEncoder().encode(message);

      // Sign the message
      let signature;
      if (generatedWallet) {
        const nacl = await import('tweetnacl');
        signature = nacl.sign.detached(messageBytes, generatedWallet.secretKey);
      } else {
        signature = await adapterSignMessage(messageBytes);
      }

      const signatureBase58 = bs58.encode(signature);

      addLog('Signature generated. Uploading voice print...');

      const formData = new FormData();
      formData.append('wallet_address', activePublicKey.toBase58());
      formData.append('signature', signatureBase58);
      formData.append('message', message);
      formData.append('phrase', phrase); // Send the spoken phrase for STT check
      formData.append('audio', audioBlob, 'voice.wav');

      const response = await axios.post(`${API_URL}${activeTab === 'enroll' ? '/enroll' : '/verify'}`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      if (response.data) {
        if (activeTab === 'verify') {
          setScore(response.data.score);
          if (response.data.verified) {
            setStatus('success');
            addLog(`Verification SUCCESS! Score: ${response.data.score.toFixed(4)}`);
          } else {
            setStatus('error');
            // Show detailed generic message AND specific reason
            addLog(`Verification FAILED. ${response.data.message || ''}`);
            if (response.data.details) {
              addLog(`Content Score: ${response.data.details.content_score}/100, Bio Score: ${response.data.details.bio_score.toFixed(2)}`);
            }
          }
        } else {
          setStatus('success');
          addLog('Enrollment Successful! Voice print stored.');
        }
      }
    } catch (err) {
      console.error(err);
      setStatus('error');
      addLog(`Server Error: ${err.response?.data?.detail || err.message}`);
    }
  };

  return (
    <div className="container">
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <Fingerprint size={48} color="var(--primary-color)" />
          <div>
            <h1 style={{ margin: 0, fontSize: '2rem', textAlign: 'left' }}>VoiceAuth Sol</h1>
            <p style={{ margin: 0, opacity: 0.7 }}>Biometric MFA for Solana</p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <button
            onClick={() => setShowHelp(true)}
            title="Technology Details"
            style={{ background: 'transparent', padding: '0.5rem', border: '1px solid rgba(255,255,255,0.2)' }}
          >
            <HelpCircle size={20} />
          </button>

          {!generatedWallet && <WalletMultiButton />}
          {generatedWallet && (
            <div style={{ padding: '0.5rem', border: '1px solid var(--primary-color)', borderRadius: '8px' }}>
              <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>App Wallet Active</span>
              <div style={{ fontWeight: 'bold' }}>{generatedWallet.address.slice(0, 4)}...{generatedWallet.address.slice(-4)}</div>
            </div>
          )}
        </div>
      </header>

      <AnimatePresence>
        {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
      </AnimatePresence>

      {!activePublicKey ? (
        <div style={{ textAlign: 'center', padding: '4rem' }}>
          <Shield size={64} style={{ marginBottom: '1rem', opacity: 0.5 }} />
          <h2>Connect Wallet to Begin</h2>
          <p>Connect your existing Solana wallet or create a new one instantly.</p>

          <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'center', gap: '1rem' }}>
            <WalletMultiButton />
            <button onClick={createNewWallet} style={{ background: 'var(--secondary-color)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <PlusCircle size={20} /> Create New Wallet
            </button>
          </div>
        </div>
      ) : (
        <main>
          {generatedWallet && (
            <div className="card" style={{ marginBottom: '2rem', borderColor: 'var(--secondary-color)' }}>
              <h3 style={{ marginTop: 0 }}>New Wallet Created!</h3>
              <p style={{ opacity: 0.8, fontSize: '0.9rem' }}>Save these details immediately. Steps to secure this wallet:</p>
              <div style={{ background: 'rgba(0,0,0,0.5)', padding: '1rem', borderRadius: '8px', wordBreak: 'break-all' }}>
                <div style={{ marginBottom: '0.5rem' }}>
                  <strong>Address:</strong> {generatedWallet.address}
                </div>
                <div style={{ marginBottom: '0.5rem' }}>
                  <strong>Seed Phrase:</strong>
                  <div style={{ color: 'var(--accent-color)', fontFamily: 'monospace' }}>{generatedWallet.mnemonic}</div>
                </div>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
            <button
              onClick={() => setActiveTab('enroll')}
              style={{
                background: activeTab === 'enroll' ? undefined : 'rgba(255,255,255,0.1)',
                opacity: activeTab === 'enroll' ? 1 : 0.7
              }}
            >
              1. Enroll Voice
            </button>
            <button
              onClick={() => setActiveTab('verify')}
              style={{
                background: activeTab === 'verify' ? undefined : 'rgba(255,255,255,0.1)',
                opacity: activeTab === 'verify' ? 1 : 0.7
              }}
            >
              2. Verify Access
            </button>
          </div>

          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="card"
          >
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {activeTab === 'enroll' ? <Mic /> : <LogIn />}
              {activeTab === 'enroll' ? 'Voice Enrollment' : 'MFA Verification'}
            </h2>

            <p style={{ opacity: 0.8, marginBottom: '1.5rem' }}>
              Please read the following {activeTab === 'enroll' ? 'phrase to create your voice print' : 'phrase to verify your identity'}:
            </p>

            <div style={{
              background: 'rgba(0,0,0,0.3)',
              padding: '1.5rem',
              borderRadius: '8px',
              fontFamily: 'monospace',
              fontSize: '1.2rem',
              marginBottom: '1.5rem',
              border: '1px solid var(--primary-color)',
              position: 'relative'
            }}>
              {phrase}
              <button
                onClick={generateNewPhrase}
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '10px',
                  background: 'transparent',
                  padding: '5px'
                }}
              >
                <RefreshCw size={16} />
              </button>
            </div>

            {/* VISUALIZER - Show ONLY when recording */}
            {status === 'recording' && stream && (
              <AudioVisualizer stream={stream} />
            )}

            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              {status === 'recording' ? (
                <button
                  onClick={stopRecording}
                  style={{ background: 'var(--error-color)', animation: 'pulse 1.5s infinite' }}
                >
                  Stop Recording
                </button>
              ) : (
                <button onClick={startRecording}>
                  Start Recording
                </button>
              )}

              {audioBlob && status !== 'recording' && (
                <button onClick={handleSubmit} disabled={status === 'processing'}>
                  {status === 'processing' ? 'Processing...' : (activeTab === 'enroll' ? 'Submit Enrollment' : 'Verify Identity')}
                </button>
              )}
            </div>
          </motion.div>

          {status === 'success' && (
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="card"
              style={{ borderColor: 'var(--accent-color)', background: 'rgba(63, 185, 80, 0.1)' }}
            >
              <h3 style={{ color: 'var(--accent-color)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <CheckCircle /> {activeTab === 'enroll' ? 'Enrollment Complete' : 'Access Granted'}
              </h3>
              <p>Your voice has been successfully {activeTab === 'enroll' ? 'registered' : 'verified'} on the network.</p>
            </motion.div>
          )}

          {status === 'error' && (
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="card"
              style={{ borderColor: 'var(--error-color)', background: 'rgba(248, 81, 73, 0.1)' }}
            >
              <h3 style={{ color: 'var(--error-color)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <AlertTriangle /> Verification Failed
              </h3>
              <p>Voice verification or authentication failed.</p>
            </motion.div>
          )}

          <div className="status-log">
            {logs.map((log, i) => <div key={i}>{log}</div>)}
          </div>
        </main>
      )}
    </div>
  );
}

export default function App() {
  const network = WalletAdapterNetwork.Devnet;
  const endpoint = useMemo(() => clusterApiUrl(network), [network]);
  const wallets = useMemo(() => [new PhantomWalletAdapter(), new SolflareWalletAdapter()], [network]);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <AppContent />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
