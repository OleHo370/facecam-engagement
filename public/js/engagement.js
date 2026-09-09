// Placeholder engagement scorer.
//
// Swap this out once the DAiSEE-trained model is exported to ONNX: replace
// the body of the interval with MediaPipe Face Landmarker feature extraction
// + an ONNX Runtime Web forward pass. Keep the same call signature
// (onScore receives a single 0-1 "disengagement" score) so nothing in
// meeting.js has to change.
function startEngagementStub(onScore, intervalMs = 3000) {
  let t = 0;
  setInterval(() => {
    t += 1;
    // slow drifting fake signal instead of pure noise, so the teacher
    // dashboard behaves plausibly (occasional dips into "bored")
    const score = 0.5 + 0.5 * Math.sin(t / 4) * Math.random();
    onScore(Math.max(0, Math.min(1, score)));
  }, intervalMs);
}
