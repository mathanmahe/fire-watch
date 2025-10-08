// Minimal WHEP negotiation, adapted to your working HTML prototype.
// POST offer SDP to: `${base}/${name}/whep` and set remote answer.
// This mirrors the flow from your multi-stream-grid.html.
export async function negotiate(base, name, sdp) {
  const url = `${base}/${encodeURIComponent(name)}/whep`;
  console.log(`WebRTC negotiating with ${url}`);

  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/sdp", Accept: "application/sdp" },
    body: sdp,
  });
  if (!r.ok) {
    const errorText = await r.text().catch(() => r.statusText);
    console.error(`WebRTC negotiation failed: ${r.status} ${errorText}`);
    throw new Error(`${r.status} ${errorText}`);
  }
  return r.text();
}

export async function playWebRTC(base, name) {
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });
  pc.addTransceiver("video", { direction: "recvonly" });
  pc.addTransceiver("audio", { direction: "recvonly" });

  let remoteStream = null;

  // Connection state monitoring
  pc.onconnectionstatechange = () => {
    console.log(`[${name}] Connection state:`, pc.connectionState);
    if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
      console.error(`[${name}] WebRTC connection ${pc.connectionState}`);
    }
  };

  pc.oniceconnectionstatechange = () => {
    console.log(`[${name}] ICE connection state:`, pc.iceConnectionState);
    if (pc.iceConnectionState === "failed") {
      console.error(`[${name}] ICE connection failed`);
    }
  };

  // Better track handling - use the stream from MediaMTX
  pc.ontrack = (event) => {
    console.log(`[${name}] Received track:`, event.track.kind, event.track.readyState);
    event.track.onended = () => console.log(`[${name}] Track ended:`, event.track.kind);

    // Log track state changes
    event.track.onmute = () => console.log(`[${name}] Track muted:`, event.track.kind);
    event.track.onunmute = () => console.log(`[${name}] Track unmuted:`, event.track.kind);

    // Use the MediaStream that comes from the server
    if (!remoteStream && event.streams && event.streams[0]) {
      remoteStream = event.streams[0];
      console.log(`[${name}] Using remote stream from event, tracks:`, remoteStream.getTracks().length);
    }
  };

  const waitICE = () =>
    new Promise((res, rej) => {
      const timeout = setTimeout(() => {
        rej(new Error("ICE gathering timeout"));
      }, 10000); // 10 second timeout

      if (pc.iceGatheringState === "complete") {
        clearTimeout(timeout);
        return res();
      }

      pc.addEventListener("icegatheringstatechange", () => {
        if (pc.iceGatheringState === "complete") {
          clearTimeout(timeout);
          res();
        }
      });
    });

  try {
    await pc.setLocalDescription(await pc.createOffer());
    await waitICE();

    if (!pc.localDescription) {
      throw new Error("Failed to create local description");
    }

    const answer = await negotiate(base, name, pc.localDescription.sdp);
    await pc.setRemoteDescription({ type: "answer", sdp: answer });

    // Wait for remoteStream to be set by ontrack handler
    console.log(`[${name}] Waiting for remote stream...`);

    await new Promise((resolve) => {
      const checkStream = () => {
        if (remoteStream && remoteStream.getTracks().length > 0) {
          console.log(`[${name}] Remote stream ready with ${remoteStream.getTracks().length} tracks`);
          resolve();
        } else {
          setTimeout(checkStream, 100);
        }
      };
      checkStream();

      // Timeout after 5 seconds
      setTimeout(() => {
        if (!remoteStream) {
          console.error(`[${name}] No remote stream received!`);
        }
        resolve();
      }, 5000);
    });

    if (!remoteStream) {
      throw new Error("Failed to receive remote stream from server");
    }

    console.log(`[${name}] Final stream tracks:`, remoteStream.getTracks().map(t => `${t.kind} (${t.id}) - ${t.readyState}`));
    return { pc, stream: remoteStream };
  } catch (error) {
    pc.close();
    throw error;
  }
}
