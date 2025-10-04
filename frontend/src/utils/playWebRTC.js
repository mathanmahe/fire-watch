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
  const pc = new RTCPeerConnection();
  pc.addTransceiver("video", { direction: "recvonly" });
  pc.addTransceiver("audio", { direction: "recvonly" });

  const stream = new MediaStream();

  // Better track handling
  pc.ontrack = (event) => {
    console.log("Received track:", event.track.kind, event.streams);
    stream.addTrack(event.track);

    // Also add to the streams that came with the track
    event.streams[0].getTracks().forEach((track) => {
      if (!stream.getTracks().some((t) => t.id === track.id)) {
        stream.addTrack(track);
      }
    });
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

    // Wait a bit for tracks to be established
    await new Promise((resolve) => setTimeout(resolve, 500));

    return { pc, stream };
  } catch (error) {
    pc.close();
    throw error;
  }
}
