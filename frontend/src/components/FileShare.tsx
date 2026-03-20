import React, { useState, useEffect, useRef } from 'react';
import { FilePlus, Check, Download, AlertCircle, X, FolderPlus } from 'lucide-react';
import JSZip from 'jszip';

interface FileShareProps {
  socket: any;
  roomId: string; // Used in some future room-specific logic
  role: 'sender' | 'receiver' | null;
  isConnected: boolean;
  userCount: number;
}

interface FileMetadata {
  name: string;
  size: number;
  type: string;
  lastModified: number;
}

const CHUNK_SIZE = 16384; // 16KB chunks

export default function FileShare({ socket, role, isConnected, userCount }: FileShareProps) {
  const [peer, setPeer] = useState<any>(null);
  const [isPeerConnected, setIsPeerConnected] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [incomingFile, setIncomingFile] = useState<{ metadata: FileMetadata; chunks: any[]; receivedSize: number } | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const peerInitiatorRef = useRef<boolean | null>(null);

  useEffect(() => {
    if (userCount === 2 && isConnected) {
      const isInitiator = role === 'sender';
      if (!peer || peerInitiatorRef.current !== isInitiator) {
        if (peer) {
          peer.destroy();
        }
        initiatePeer(isInitiator);
        peerInitiatorRef.current = isInitiator;
      }
    }

    if (userCount < 2 && peer) {
      peer.destroy();
      setPeer(null);
      setIsPeerConnected(false);
      peerInitiatorRef.current = null;
    }

    return () => {
      // Don't destroy on every re-render, only on unmount or explicit role change
    };
  }, [userCount, isConnected, role]);

  const initiatePeer = (initiator: boolean) => {
    try {
      const SimplePeerConstructor = (window as any).SimplePeer;
      if (!SimplePeerConstructor) {
        console.error('SimplePeer not found on window');
        setError('P2P library failed to load. Please refresh.');
        return;
      }

      const newPeer = new SimplePeerConstructor({
        initiator,
        trickle: false,
        config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }
      });

      newPeer.on('signal', (data: any) => {
        socket.emit('signal', data);
      });

      newPeer.on('connect', () => {
        setIsPeerConnected(true);
        setStatus('Ready to Sync');
      });

      newPeer.on('data', (data: any) => {
        handleIncomingData(data);
      });

      newPeer.on('error', (err: any) => {
        console.error('Peer error:', err);
        setError('Secure link disrupted. Attempting reconnect...');
        setIsPeerConnected(false);
      });

      newPeer.on('close', () => {
        setIsPeerConnected(false);
        setPeer(null);
      });

      setPeer(newPeer);
    } catch (err) {
      console.error('Failed to initiate peer:', err);
      setError('Browser restricted P2P data transfer.');
    }
  };

  useEffect(() => {
    const handleSignal = (data: any) => {
      if (peer) {
        peer.signal(data);
      }
    };

    socket.on('signal', handleSignal);
    return () => {
      socket.off('signal', handleSignal);
    };
  }, [peer, socket]);

  const handleIncomingData = (data: Uint8Array) => {
    try {
      // Check if it's a metadata JSON
      const decoded = new TextDecoder().decode(data);
      if (decoded.startsWith('{"type":"metadata"')) {
        const message = JSON.parse(decoded);
        setIncomingFile({
          metadata: message.payload,
          chunks: [],
          receivedSize: 0
        });
        setTransferring(true);
        setStatus(`Receiving ${message.payload.name}`);
        setProgress(0);
        return;
      }
    } catch (e) {
      // Not JSON, continue to chunk processing
    }

    // It's binary chunk data
    setIncomingFile(prev => {
      if (!prev) return null;
      const newChunks = [...prev.chunks, data];
      const newSize = prev.receivedSize + data.length;
      const currentProgress = Math.round((newSize / prev.metadata.size) * 100);
      setProgress(currentProgress);

      if (newSize >= prev.metadata.size) {
        finalizeDownload(prev.metadata, newChunks);
        return null;
      }
      return { ...prev, chunks: newChunks, receivedSize: newSize };
    });
  };

  const finalizeDownload = (metadata: FileMetadata, chunks: any[]) => {
    const blob = new Blob(chunks, { type: metadata.type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = metadata.name;
    a.click();
    URL.revokeObjectURL(url);
    
    setTransferring(false);
    setStatus('Download Complete');
    setProgress(100);
    setTimeout(() => {
      setProgress(0);
      setStatus('Ready to Receive');
    }, 3000);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    setError(null);
    setTransferring(true);

    const fileList = Array.from(files);
    const isFolder = fileList.length > 1 || (e.target as any).webkitdirectory;

    if (isFolder) {
      setStatus('Packing Folder...');
      const zip = new JSZip();
      let totalSize = 0;
      
      for (const file of fileList) {
        totalSize += file.size;
        const path = (file as any).webkitRelativePath || file.name;
        zip.file(path, file);
      }

      if (totalSize > 100 * 1024 * 1024) {
        setError('Total size exceeds 100MB limit.');
        setTransferring(false);
        return;
      }

      const content = await zip.generateAsync({ type: 'blob' }, (metadata) => {
        setProgress(Math.round(metadata.percent));
      });
      
      const zipFile = new File([content], "easy-share-folder.zip", { type: 'application/zip' });
      sendFile(zipFile);
    } else {
      const file = fileList[0];
      if (file.size > 100 * 1024 * 1024) {
        setError('File size exceeds 100MB limit.');
        setTransferring(false);
        return;
      }
      sendFile(file);
    }
  };

  const sendFile = async (file: File) => {
    if (!peer || !isPeerConnected) {
      setError('Wait for secure link to establish.');
      setTransferring(false);
      return;
    }

    setTransferring(true);
    setStatus(`Sending ${file.name}`);
    setError(null);

    // Send metadata
    const metadata = {
      type: 'metadata',
      payload: {
        name: file.name,
        size: file.size,
        type: file.type,
        lastModified: file.lastModified
      }
    };
    peer.send(JSON.stringify(metadata));

    // Send chunks
    const reader = file.stream().getReader();
    let sentSize = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        for (let i = 0; i < value.length; i += CHUNK_SIZE) {
          const chunk = value.slice(i, i + CHUNK_SIZE);
          peer.send(chunk);
          sentSize += chunk.length;
          setProgress(Math.round((sentSize / file.size) * 100));
        }
      }
      
      setTransferring(false);
      setStatus('Transfer Finished');
      setProgress(100);
      setTimeout(() => {
        setProgress(0);
        setStatus('Ready to Sync');
      }, 3000);
    } catch (err) {
      console.error('Send error:', err);
      setError('Failed to send file. Connection reset.');
      setTransferring(false);
    }
  };

  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-6 space-y-6 relative overflow-hidden">
      {error && (
        <div className="absolute top-4 left-6 right-6 bg-red-500/10 border border-red-500/20 p-4 rounded-2xl flex items-center gap-3 text-red-500 text-sm animate-in fade-in slide-in-from-top-2 z-20">
          <AlertCircle size={18} />
          <span className="flex-1 font-bold">{error}</span>
          <button onClick={() => setError(null)}><X size={18} /></button>
        </div>
      )}

      {role === 'sender' ? (
        <div className="w-full space-y-6 animate-in fade-in zoom-in duration-500">
          <div 
            onClick={() => !transferring && fileInputRef.current?.click()}
            className={`group relative w-full h-64 border-2 border-dashed rounded-[2.5rem] flex flex-col items-center justify-center transition-all cursor-pointer ${
              transferring 
                ? 'border-blue-500 bg-blue-50/50' 
                : 'border-slate-200 hover:border-blue-400 hover:bg-blue-50/30'
            }`}
          >
            <input 
              type="file" 
              className="hidden" 
              ref={fileInputRef} 
              onChange={handleFileChange}
            />
            
            {transferring ? (
              <div className="space-y-4 flex flex-col items-center">
                <div className="relative w-24 h-24">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                    <circle 
                      cx="50" cy="50" r="45" 
                      fill="none" stroke="#e2e8f0" strokeWidth="8" 
                    />
                    <circle 
                      cx="50" cy="50" r="45" 
                      fill="none" stroke="#3b82f6" strokeWidth="8" 
                      strokeDasharray="282.7"
                      strokeDashoffset={282.7 - (282.7 * progress) / 100}
                      strokeLinecap="round"
                      className="transition-all duration-300"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center font-black text-blue-500">
                    {progress}%
                  </div>
                </div>
                <div className="text-center">
                   <p className="text-blue-500 font-black uppercase tracking-widest text-xs mb-1">{status}</p>
                   <p className="text-slate-400 text-[10px] font-bold uppercase">Processing...</p>
                </div>
              </div>
            ) : (
              <>
                <div className="w-20 h-20 bg-blue-100 text-blue-500 rounded-3xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <FilePlus size={36} />
                </div>
                <div className="text-center space-y-2">
                  <h4 className="text-xl font-black text-slate-800 uppercase tracking-tight">Drop your file</h4>
                  <p className="text-slate-400 text-sm font-medium">Click to browse or drag & drop (Max 100MB)</p>
                </div>
              </>
            )}
          </div>

          <div className="flex gap-4">
             <button 
              onClick={() => !transferring && folderInputRef.current?.click()}
              disabled={transferring}
              className="flex-1 py-4 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all active:scale-95"
             >
                <FolderPlus size={18} />
                Share Folder
                <input 
                  type="file" 
                  className="hidden" 
                  ref={folderInputRef} 
                  onChange={handleFileChange}
                  {...({ webkitdirectory: "", directory: "" } as any)}
                />
             </button>
          </div>
        </div>
      ) : (
        <div className="w-full h-[400px] bg-slate-50 border-2 border-dashed border-slate-200 rounded-[2.5rem] flex flex-col items-center justify-center text-center p-10 relative overflow-hidden animate-in fade-in zoom-in duration-500">
          {transferring ? (
            <div className="space-y-6 flex flex-col items-center z-10">
               <div className="relative w-32 h-32">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                  <circle 
                    cx="50" cy="50" r="45" 
                    fill="none" stroke="#e2e8f0" strokeWidth="8" 
                  />
                  <circle 
                    cx="50" cy="50" r="45" 
                    fill="none" stroke="#22c55e" strokeWidth="8" 
                    strokeDasharray="282.7"
                    strokeDashoffset={282.7 - (282.7 * progress) / 100}
                    strokeLinecap="round"
                    className="transition-all duration-300"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center font-black text-green-600 text-2xl">
                  {progress}%
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-green-600 font-black uppercase tracking-widest text-sm">
                  {incomingFile ? `Receiving ${incomingFile.metadata.name}` : status}
                </p>
                <p className="text-slate-400 text-xs font-bold uppercase">Keep this tab open</p>
              </div>
            </div>
          ) : progress === 100 ? (
            <div className="space-y-6 z-10">
              <div className="w-24 h-24 bg-green-100 text-green-500 rounded-[2rem] flex items-center justify-center mx-auto animate-bounce">
                <Check size={48} strokeWidth={3} />
              </div>
              <div className="space-y-2">
                <h4 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Transfer Complete!</h4>
                <p className="text-slate-500 font-medium">Your file has been saved to downloads.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-6 z-10">
              <div className="w-24 h-24 bg-slate-100 text-slate-300 rounded-[2rem] flex items-center justify-center mx-auto">
                <Download size={48} className={isPeerConnected ? 'animate-bounce text-blue-400' : ''} />
              </div>
              <div className="space-y-2">
                <h4 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Ready to Receive</h4>
                <p className="text-slate-400 font-medium whitespace-pre-wrap">
                  {isPeerConnected 
                    ? "Establish secure connection.\nWaiting for sender to push files..." 
                    : userCount < 2 
                      ? "Empty Room.\nWaiting for another device to join..." 
                      : "Handshaking...\nEstablishing secure P2P link..."}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-4 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mt-2">
         <div className={`w-2 h-2 rounded-full ${isPeerConnected ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-slate-300 animate-pulse'}`} />
         {isPeerConnected ? 'Secured P2P Tunnel Active' : 'Establishing Secure Link'}
      </div>
    </div>
  );
}
