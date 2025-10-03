// Minimal WHEP negotiation, adapted to your working HTML prototype.
// POST offer SDP to: `${base}/${name}/whep` and set remote answer.
// This mirrors the flow from your multi-stream-grid.html.
export async function negotiate(base, name, sdp) {
    // TEMPORARILY DISABLED - Comment out network request to avoid connection errors
    console.log(`[DISABLED] Would negotiate with ${base}/${name}/whep`);
    throw new Error("WebRTC negotiation temporarily disabled");
    
    // const url = `${base}/${encodeURIComponent(name)}/whep`;
    // const r = await fetch(url, {
    //   method: "POST",
    //   headers: { "Content-Type": "application/sdp", "Accept": "application/sdp" },
    //   body: sdp
    // });
    // if (!r.ok) throw new Error(`${r.status} ${await r.text().catch(()=>r.statusText)}`);
    // return r.text();
  }
  
  export async function playWebRTC(base, name) {
    const pc = new RTCPeerConnection();
    pc.addTransceiver("video", { direction: "recvonly" });
    pc.addTransceiver("audio", { direction: "recvonly" });
  
    const stream = new MediaStream();
    pc.ontrack = (e) => stream.addTrack(e.track);
  
    const waitICE = () => new Promise((res) => {
      if (pc.iceGatheringState === "complete") return res();
      pc.addEventListener("icegatheringstatechange", () => {
        if (pc.iceGatheringState === "complete") res();
      });
    });
  
    await pc.setLocalDescription(await pc.createOffer());
    await waitICE();
    const answer = await negotiate(base, name, pc.localDescription.sdp);
    await pc.setRemoteDescription({ type: "answer", sdp: answer });
  
    return { pc, stream };
  }
  