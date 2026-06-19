import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Background } from "../components/Background";
import { theme } from "../theme";

export const OutroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scale = spring({
    frame,
    fps,
    config: { damping: 16, stiffness: 100 },
  });

  const lineWidth = interpolate(frame, [20, 50], [0, 280], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const ctaOpacity = interpolate(frame, [40, 60], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill>
      <Background pulse />
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 20,
        }}
      >
        <Img
          src={staticFile("visionlogo.png")}
          style={{
            width: 88,
            height: 88,
            transform: `scale(${scale})`,
            filter: `drop-shadow(0 0 20px ${theme.purpleGlow})`,
          }}
        />
        <div
          style={{
            fontFamily: theme.fontDisplay,
            fontSize: 48,
            fontWeight: 800,
            letterSpacing: 8,
            color: theme.text,
          }}
        >
          VISION CLIENT
        </div>
        <div
          style={{
            width: lineWidth,
            height: 2,
            background: `linear-gradient(90deg, transparent, ${theme.purple}, transparent)`,
          }}
        />
        <div style={{ fontSize: 18, color: theme.muted }}>v4.0.0 · Woof</div>
        <div
          style={{
            opacity: ctaOpacity,
            marginTop: 12,
            padding: "12px 28px",
            borderRadius: 10,
            border: `1px solid ${theme.borderStrong}`,
            color: theme.purple2,
            fontSize: 16,
            letterSpacing: 1,
          }}
        >
          Join the discord
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
