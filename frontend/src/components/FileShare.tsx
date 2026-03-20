import React, { useState, useEffect, useRef } from 'react';
import { FilePlus, Download, AlertCircle, X, FolderPlus, RefreshCw } from 'lucide-react';
import JSZip from 'jszip';

interface FileShareProps {
  socket: any;
  roomId: string;
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

const WEBRTC_CHUNK_SIZE = 64 * 1024; // 64KB
const FALLBACK_TIMEOUT = 8000; // 8 seconds

export default function FileShare({ socket, role, isConnected, userCount }: FileShareProps) {
  const [connectionState, setConnectionState] = useState<RTCPeerConnectionState>('new');
  const [transferring, setTransferring] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isFallback, setIsFallback] = useState(false);
  const [pendingDownload, setPendingDownload] = useState<{ blob: Blob; metadata: FileMetadata } | null>(null);
  const [incomingFile, setIncomingFile] = useState<{ metadata: FileMetadata; chunks: any[]; receivedSize: number } | null>(null);
  const [iceServers, setIceServers] = useState<any[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const fallbackTimerRef = useRef<any>(null);

  const cleanupPeer = () => {
    if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
    if (channelRef.current) {
      channelRef.current.close();
      channelRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
  };

  useEffect(() => {
    if (userCount === 2 && isConnected && iceServers.length > 0) {
      initiateConnection();
    } else if (userCount < 2) {
      cleanupPeer();
      setConnectionState('new');
      setIsFallback(false);
    }

    return () => {
      // Don't cleanup on every render, only on unmount or userCount change
    };
  }, [userCount, isConnected, iceServers]);

  const initiateConnection = async () => {
    cleanupPeer();
    setError(null);
    setIsFallback(false);
    
    const configuration: RTCConfiguration = {
      iceServers: iceServers.length > 0 ? iceServers : [
        { urls: 'stun:stun.l.google.com:19302' }
      ],
      iceTransportPolicy: 'all',
      iceCandidatePoolSize: 10
    };

    console.log('Initializing PeerConnection with config:', configuration);
    const pc = new RTCPeerConnection(configuration);
    pcRef.current = pc;

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('ice-candidate', event.candidate);
      }
    };

    pc.onconnectionstatechange = () => {
      console.log('WebRTC State:', pc.connectionState);
      setConnectionState(pc.connectionState);
      
      if (pc.connectionState === 'connected') {
        if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
        setStatus('Ready to Sync (P2P)');
        setIsFallback(false);
      } else if (pc.connectionState === 'failed') {
        startFallback();
      }
    };

    if (role === 'sender') {
      const channel = pc.createDataChannel('fileTransfer', { ordered: true });
      setupDataChannel(channel);
      
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('offer', offer);
    } else {
      pc.ondatachannel = (event) => {
        setupDataChannel(event.channel);
      };
    }

    // Start fallback timer
    fallbackTimerRef.current = setTimeout(() => {
      if (pc.connectionState !== 'connected') {
        console.warn('WebRTC connection timed out, switching to fallback.');
        startFallback();
      }
    }, FALLBACK_TIMEOUT);
  };

  const startFallback = () => {
    setIsFallback(true);
    setStatus('Ready to Sync (Cloud Fallback)');
    setError('Using fallback secure tunnel (Restricted NAT detected)');
    if (pcRef.current && pcRef.current.connectionState !== 'connected') {
       // We keep PC alive just in case it late-connects, but mark fallback as priority
    }
  };

  const setupDataChannel = (channel: RTCDataChannel) => {
    channelRef.current = channel;
    channel.binaryType = 'arraybuffer';

    channel.onopen = () => {
      console.log('Data channel opened');
      setStatus('Secure Link Established');
    };

    channel.onmessage = (event) => {
      handleIncomingData(event.data);
    };

    channel.onclose = () => {
      console.log('Data channel closed');
    };
  };

  useEffect(() => {
    const handleOffer = async (offer: RTCSessionDescriptionInit) => {
      if (!pcRef.current && role === 'receiver') {
        // Wait for iceServers if not ready
        return; 
      }
      if (pcRef.current && role === 'receiver') {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pcRef.current.createAnswer();
        await pcRef.current.setLocalDescription(answer);
        socket.emit('answer', answer);
      }
    };

    const handleAnswer = async (answer: RTCSessionDescriptionInit) => {
      if (pcRef.current && role === 'sender') {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(answer));
      }
    };

    const handleCandidate = async (candidate: RTCIceCandidateInit) => {
      if (pcRef.current) {
        try {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.error('Error adding ice candidate', e);
        }
      }
    };

    const handleFileChunk = (data: any) => {
      // Process chunks from socket unconditionally to avoid race conditions 
      // where sender has already determined fallback is needed but receiver hasn't yet.
      console.log('Received file data via Socket');
      handleIncomingData(data);
    };

    const handleIceServers = (servers: any[]) => {
      setIceServers(servers);
    };

    socket.on('offer', handleOffer);
    socket.on('answer', handleAnswer);
    socket.on('ice-candidate', handleCandidate);
    socket.on('file-chunk', handleFileChunk);
    socket.on('ice-servers', handleIceServers);

    return () => {
      socket.off('offer', handleOffer);
      socket.off('answer', handleAnswer);
      socket.off('ice-candidate', handleCandidate);
      socket.off('file-chunk', handleFileChunk);
      socket.off('ice-servers', handleIceServers);
    };
  }, [role, isFallback]);

  const handleIncomingData = (data: any) => {
    // 1. Check for metadata (can be string or ArrayBuffer carrying JSON)
    let isMetadata = false;
    let metadataObj: any = null;

    try {
      if (typeof data === 'string' && data.startsWith('{"type":"metadata"')) {
        isMetadata = true;
        metadataObj = JSON.parse(data);
      } else if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
        const decoded = new TextDecoder().decode(data instanceof ArrayBuffer ? data.slice(0, 100) : (data as any).slice(0, 100));
        if (decoded.startsWith('{"type":"metadata"')) {
          isMetadata = true;
          metadataObj = JSON.parse(new TextDecoder().decode(data));
        }
      }
    } catch (e) {
      // Not metadata, proceed to chunk handling
    }

    if (isMetadata) {
      setIncomingFile({
        metadata: metadataObj.payload,
        chunks: [],
        receivedSize: 0
      });
      setTransferring(true);
      setStatus(`Receiving ${metadataObj.payload.name}`);
      setProgress(0);
      return;
    }

    // 2. Handle binary chunk
    setIncomingFile(prev => {
      if (!prev) {
        console.warn('Received chunk without metadata, ignoring.');
        return null;
      }
      
      // Ensure we have a binary type (Uint8Array is safest for Blob)
      const chunk = data instanceof Uint8Array ? data : 
                    data instanceof ArrayBuffer ? new Uint8Array(data) :
                    ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) :
                    typeof data === 'string' ? new TextEncoder().encode(data) : data;

      const newChunks = [...prev.chunks, chunk];
      const newSize = prev.receivedSize + chunk.byteLength;
      const currentProgress = Math.min(100, Math.round((newSize / prev.metadata.size) * 100));
      
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
    setPendingDownload({ blob, metadata });
    setTransferring(false);
    setStatus('Ready to Save');
    setProgress(100);
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

      const content = await zip.generateAsync({ type: 'blob' }, (metadata) => {
        setProgress(Math.round(metadata.percent));
      });
      
      const zipFile = new File([content], "easy-share-folder.zip", { type: 'application/zip' });
      sendFile(zipFile);
    } else {
      sendFile(fileList[0]);
    }
  };

  const sendFile = async (file: File) => {
    const useFallback = isFallback || !channelRef.current || channelRef.current.readyState !== 'open';
    
    setTransferring(true);
    setStatus(`Sending ${file.name}${useFallback ? ' (Fallback)' : ''}`);
    setError(null);

    const metadata = JSON.stringify({
      type: 'metadata',
      payload: {
        name: file.name,
        size: file.size,
        type: file.type,
        lastModified: file.lastModified
      }
    });

    if (useFallback) {
      socket.emit('file-chunk', metadata);
    } else {
      channelRef.current?.send(metadata);
    }

    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    let offset = 0;

    const sendChunk = () => {
      while (offset < uint8Array.byteLength) {
        const chunk = uint8Array.slice(offset, offset + WEBRTC_CHUNK_SIZE);
        
        if (useFallback) {
          socket.emit('file-chunk', chunk);
        } else {
          // Check buffered amount for WebRTC
          if (channelRef.current && channelRef.current.bufferedAmount > 4 * 1024 * 1024) { // 4MB buffer limit
             channelRef.current.onbufferedamountlow = () => {
               channelRef.current!.onbufferedamountlow = null;
               sendChunk();
             };
             return;
          }
          channelRef.current?.send(chunk);
        }

        offset += chunk.byteLength;
        setProgress(Math.round((offset / uint8Array.byteLength) * 100));
        
        // Use timeout to prevent UI/Socket freeze
        if (offset % (WEBRTC_CHUNK_SIZE * 8) === 0) {
           setTimeout(sendChunk, offset % (WEBRTC_CHUNK_SIZE * 64) === 0 ? 50 : 0);
           return;
        }
      }
      
      setTransferring(false);
      setStatus('Transfer Finished');
      setProgress(100);
      setTimeout(() => {
        setProgress(0);
        setStatus(useFallback ? 'Ready to Sync (Cloud)' : 'Ready to Sync (P2P)');
      }, 3000);
    };

    sendChunk();
  };

  const handleDownload = () => {
    if (!pendingDownload) return;
    const url = URL.createObjectURL(pendingDownload.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = pendingDownload.metadata.name;
    a.click();
    URL.revokeObjectURL(url);
    setPendingDownload(null);
    setStatus('Download Complete');
    setTimeout(() => setStatus(isFallback ? 'Ready to Sync (Cloud)' : 'Ready to Sync (P2P)'), 3000);
  };

  return (
    <div className="w-full h-full flex flex-col p-8 md:p-10 space-y-6 relative overflow-hidden">
      {error && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 w-[90%] flex flex-col items-center gap-2">
          <div className="bg-red-50 border border-red-100 px-4 py-2.5 rounded-2xl flex items-center gap-3 shadow-sm animate-in slide-in-from-top-4 duration-300">
            <AlertCircle size={16} className="text-red-500" />
            <p className="text-red-600 text-[10px] font-black uppercase tracking-widest">{error}</p>
            <button onClick={() => setError(null)} className="hover:bg-red-100 p-1 rounded-full"><X size={14} className="text-red-400" /></button>
          </div>
        </div>
      )}

      {/* Role Header for File Sync */}
      <div className="flex items-center justify-between w-full mb-2">
         <div className="flex items-center gap-3">
            <div className={`px-4 py-2 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 shadow-sm ${role === 'sender' ? 'bg-blue-500 text-white' : 'bg-purple-500 text-white'}`}>
               <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
               You are {role}
            </div>
         </div>
         {role === 'receiver' && (
           <button 
             onClick={() => isConnected && socket.emit('switch-role')}
             className="flex items-center gap-2 px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-2xl transition-all border border-slate-200 shadow-sm active:scale-95 group"
           >
              <RefreshCw size={14} className="group-hover:rotate-180 transition-transform duration-500" />
              <span className="text-[10px] font-black uppercase tracking-wider">Send from here</span>
           </button>
         )}
      </div>

      <div className="flex-1 flex flex-col items-center justify-center w-full relative">
        {role === 'sender' ? (
        <div className="w-full space-y-6 animate-in fade-in zoom-in duration-500">
          <div 
            onClick={() => !transferring && fileInputRef.current?.click()}
            className={`group relative w-full h-64 border-2 border-dashed rounded-[2.5rem] flex flex-col items-center justify-center transition-all cursor-pointer ${
              transferring ? 'border-blue-500 bg-blue-50/50' : 'border-slate-200 hover:border-blue-400 hover:bg-blue-50/30'
            }`}
          >
            <input type="file" className="hidden" ref={fileInputRef} onChange={handleFileChange} />
            {transferring ? (
               <div className="space-y-4 flex flex-col items-center">
                  <div className="text-4xl font-black text-blue-500">{progress}%</div>
                  <div className="text-center">
                    <p className="text-blue-500 font-black uppercase tracking-widest text-xs">{status}</p>
                  </div>
               </div>
            ) : (
              <>
                <div className="w-20 h-20 bg-blue-100 text-blue-500 rounded-3xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <FilePlus size={36} />
                </div>
                <div className="text-center space-y-2">
                  <h4 className="text-xl font-black text-slate-800 uppercase tracking-tight">Drop your file</h4>
                  <p className="text-slate-400 text-sm font-medium">Click to browse (Max 100MB)</p>
                </div>
              </>
            )}
          </div>
          <div className="flex flex-col gap-3">
            <button 
              onClick={() => !transferring && folderInputRef.current?.click()}
              disabled={transferring}
              className="w-full py-4 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all"
            >
              <FolderPlus size={18} /> Share Folder
              <input type="file" className="hidden" ref={folderInputRef} onChange={handleFileChange} {...({ webkitdirectory: "", directory: "" } as any)} />
            </button>
            {!isFallback && !transferring && (
              <button 
                onClick={() => startFallback()}
                className="w-full py-2 text-amber-600 hover:text-amber-700 font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2"
              >
                <RefreshCw size={12} /> Force Cloud Sync
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="w-full h-[400px] bg-slate-50 border-2 border-dashed border-slate-200 rounded-[2.5rem] flex flex-col items-center justify-center text-center p-10 relative overflow-hidden animate-in fade-in zoom-in duration-500">
          {transferring ? (
            <div className="space-y-6 flex flex-col items-center">
               <div className="text-5xl font-black text-green-600">{progress}%</div>
               <p className="text-green-600 font-black uppercase tracking-widest text-sm">
                 {incomingFile ? `Receiving ${incomingFile.metadata.name}` : status}
               </p>
            </div>
          ) : pendingDownload ? (
            <div className="space-y-6 z-10 w-full max-w-sm">
              <div className="w-24 h-24 bg-blue-50 text-blue-500 rounded-[2.5rem] flex items-center justify-center mx-auto border border-blue-100"><FilePlus size={48} /></div>
              <h4 className="text-2xl font-black text-slate-800 uppercase tracking-tighter truncate px-4">{pendingDownload.metadata.name}</h4>
              <button onClick={handleDownload} className="w-full py-5 bg-blue-500 hover:bg-blue-600 text-white rounded-[1.5rem] font-black uppercase tracking-widest text-xs flex items-center justify-center gap-3"><Download size={20} /> Accept & Download</button>
              <button onClick={() => setPendingDownload(null)} className="w-full py-3 text-slate-400 hover:text-red-500 font-black uppercase tracking-widest text-[10px]">Decline</button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="w-24 h-24 bg-slate-100 text-slate-300 rounded-[2rem] flex items-center justify-center mx-auto">
                <Download size={48} className={connectionState === 'connected' ? 'animate-bounce text-blue-400' : ''} />
              </div>
              <h4 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Ready to Receive</h4>
              <p className="text-slate-400 font-medium whitespace-pre-wrap">
                {connectionState === 'connected' ? "Establish secure connection.\nWaiting for sender..." : "Handshaking..."}
              </p>
            </div>
          )}
        </div>
      )}
      </div>

      <div className="flex items-center justify-center gap-4 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 pt-2 pb-2">
         <div className={`w-2 h-2 rounded-full ${connectionState === 'connected' ? 'bg-green-500' : isFallback ? 'bg-amber-500' : 'bg-slate-300 animate-pulse'}`} />
         {connectionState === 'connected' ? 'Secured P2P Active' : isFallback ? 'Cloud Fallback Ready' : `WebRTC: ${connectionState}`}
         {connectionState !== 'connected' && !isFallback && <RefreshCw size={10} className="animate-spin" />}
      </div>
    </div>
  );
}
