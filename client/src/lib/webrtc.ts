import type { Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents, SignalPayload } from "../types";

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
export type RemoteStreamHandler = (peerId: string, stream: MediaStream) => void;

// Full-mesh WebRTC provides low-latency peer-to-peer media for small-group
// classroom sessions.
const peers: Record<string, RTCPeerConnection> = {};
let localStream: MediaStream | null = null;

export async function getLocalStream(): Promise<MediaStream> {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  return localStream;
}

// Releases the camera/mic hardware. Must be called on unmount (including a
// React StrictMode dev double-mount) — without it the device stays "in use"
// after leaving a call, which both leaves the camera light on for real users
// and makes a fast remount fail to reacquire the device.
export function stopLocalStream() {
  localStream?.getTracks().forEach((t) => t.stop());
  localStream = null;
}

function createPeerConnection(peerId: string, socket: AppSocket, onRemoteStream: RemoteStreamHandler) {
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });

  localStream?.getTracks().forEach((track) => pc.addTrack(track, localStream!));

  pc.onicecandidate = (e) => {
    if (e.candidate) socket.emit("signal", { to: peerId, data: { candidate: e.candidate } });
  };
  pc.ontrack = (e) => onRemoteStream(peerId, e.streams[0]);

  peers[peerId] = pc;
  return pc;
}

export async function callPeer(peerId: string, socket: AppSocket, onRemoteStream: RemoteStreamHandler) {
  const pc = createPeerConnection(peerId, socket, onRemoteStream);
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  socket.emit("signal", { to: peerId, data: { sdp: pc.localDescription } });
}

export async function handleSignal(payload: SignalPayload, socket: AppSocket, onRemoteStream: RemoteStreamHandler) {
  const from = payload.from!;
  const data = payload.data as { sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };
  let pc = peers[from];
  if (!pc) pc = createPeerConnection(from, socket, onRemoteStream);

  if (data.sdp) {
    await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
    if (data.sdp.type === "offer") {
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("signal", { to: from, data: { sdp: pc.localDescription } });
    }
  } else if (data.candidate) {
    await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
  }
}

export function closePeer(peerId: string) {
  if (peers[peerId]) {
    peers[peerId].close();
    delete peers[peerId];
  }
}

export function closeAllPeers() {
  Object.keys(peers).forEach(closePeer);
}
