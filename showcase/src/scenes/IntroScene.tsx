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

export const IntroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoScale = spring({
    frame,
    fps,
    config: { damping: 14, stiffness: 120 },
  });

  const titleOpacity = interpolate(frame, [18, 36], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const titleY = interpolate(frame, [18, 36], [24, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const subOpacity = interpolate(frame, [32, 50], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const badgeOpacity = interpolate(frame, [48, 64], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const fadeOut = interpolate(frame, [78, 90], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ opacity: fadeOut }}>
      <Background />
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 22,
        }}
      >
        <Img
          src={staticFile("visionlogo.png")}
          style={{
            width: 120,
            height: 120,
            transform: `scale(${logoScale})`,
            filter: `drop-shadow(0 0 24px ${theme.purpleGlow})`,
          }}
        />
        <div
          style={{
            opacity: titleOpacity,
            transform: `translateY(${titleY}px)`,
            fontFamily: theme.fontDisplay,
            fontSize: 72,
            fontWeight: 800,
            letterSpacing: 10,
            color: theme.text,
          }}
        >
          VISION
        </div>
        <div
          style={{
            opacity: subOpacity,
            fontSize: 26,
            color: theme.muted,
            letterSpacing: 1,
          }}
        >
          Destiny 2 network module manager
        </div>
        <div
          style={{
            opacity: badgeOpacity,
            display: "flex",
            gap: 12,
            marginTop: 8,
          }}
        >
          {["v4.0.0", "No NetLimiter", "WinDivert"].map((label) => (
            <span
              key={label}
              style={{
                border: `1px solid ${theme.borderStrong}`,
                color: theme.purple2,
                padding: "6px 14px",
                borderRadius: 20,
                fontSize: 13,
                letterSpacing: 2,
                textTransform: "uppercase",
              }}
            >
              {label}
            </span>
          ))}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
