import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Background } from "../components/Background";
import { SceneTitle } from "../components/SceneTitle";
import { theme } from "../theme";

const CHIPS = [
  { name: "3074 Download", meta: "ACTIVE" },
  { name: "7500 API", meta: "ACTIVE" },
  { name: "Anti Kick", meta: "ACTIVE" },
];

const OverlayChip: React.FC<{
  name: string;
  meta: string;
  index: number;
  exitFrame: number;
}> = ({ name, meta, index, exitFrame }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const enterAt = 30 + index * 18;
  const slideIn = spring({
    frame: frame - enterAt,
    fps,
    config: { damping: 18, stiffness: 140 },
  });

  const slideOut = interpolate(frame, [exitFrame, exitFrame + 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const x = interpolate(slideIn, [0, 1], [-32, 0]) - slideOut * 36;
  const opacity =
    interpolate(slideIn, [0, 1], [0, 1]) * (1 - slideOut);

  return (
    <div
      style={{
        opacity,
        transform: `translateX(${x}px)`,
        display: "flex",
        alignItems: "center",
        gap: 9,
        background: "rgba(8, 6, 14, 0.88)",
        borderRadius: 9,
        padding: "10px 14px",
        border: "1px solid rgba(64, 222, 106, 0.45)",
        borderLeft: "3px solid #40de6a",
        boxShadow: `0 4px 12px rgba(0,0,0,0.45), inset 0 0 14px rgba(64,222,106,0.22)`,
        minWidth: 220,
      }}
    >
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: theme.green,
          boxShadow: `0 0 6px ${theme.greenGlow}`,
        }}
      />
      <div>
        <div style={{ fontWeight: 600, fontSize: 13, color: "#f1eefb" }}>
          {name}
        </div>
        <div
          style={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: 0.4,
            color: "#6fe89a",
          }}
        >
          {meta}
        </div>
      </div>
    </div>
  );
};

export const OverlayScene: React.FC = () => {
  const frame = useCurrentFrame();
  const fadeIn = interpolate(frame, [0, 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(frame, [258, 270], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ opacity: fadeIn * fadeOut }}>
      <Background dim={0.6} />
      <AbsoluteFill style={{ padding: "72px 96px" }}>
        <SceneTitle
          eyebrow="In-game"
          title="Live Overlay"
          subtitle="Only active modules appear. Chips slide in when enabled and slide out when disabled — no clutter."
        />
      </AbsoluteFill>

      {}
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(160deg, #1a1428 0%, #0a0812 40%, #12101c 100%)",
          opacity: 0.7,
        }}
      />
      <AbsoluteFill
        style={{
          top: 48,
          left: 48,
          width: "auto",
          height: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {CHIPS.map((chip, i) => (
          <OverlayChip
            key={chip.name}
            {...chip}
            index={i}
            exitFrame={i === 2 ? 200 : 9999}
          />
        ))}
      </AbsoluteFill>

      <div
        style={{
          position: "absolute",
          bottom: 72,
          right: 96,
          fontSize: 14,
          color: theme.muted,
          opacity: interpolate(frame, [100, 120], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Click-through · Always on top
      </div>
    </AbsoluteFill>
  );
};
