// MediaPipe Pose landmark indices, named.
// Note: y increases *downward*, so "above the shoulder line" means a smaller y.
export const L = {
  NOSE: 0,
  SHOULDER_L: 11, SHOULDER_R: 12,
  ELBOW_L: 13, ELBOW_R: 14,
  WRIST_L: 15, WRIST_R: 16,
  HIP_L: 23, HIP_R: 24,
};

// The only points M0 tracks. Fewer points, less filtering work, less jitter.
export const TRACKED = [
  L.NOSE, L.SHOULDER_L, L.SHOULDER_R,
  L.ELBOW_L, L.ELBOW_R, L.WRIST_L, L.WRIST_R,
  L.HIP_L, L.HIP_R,
];

// Points that must be confidently visible or we refuse to emit intent.
export const REQUIRED = [L.SHOULDER_L, L.SHOULDER_R, L.WRIST_L, L.WRIST_R];

export const BONES = [
  [L.SHOULDER_L, L.SHOULDER_R],
  [L.SHOULDER_L, L.ELBOW_L], [L.ELBOW_L, L.WRIST_L],
  [L.SHOULDER_R, L.ELBOW_R], [L.ELBOW_R, L.WRIST_R],
  [L.SHOULDER_L, L.HIP_L], [L.SHOULDER_R, L.HIP_R],
  [L.HIP_L, L.HIP_R],
];
