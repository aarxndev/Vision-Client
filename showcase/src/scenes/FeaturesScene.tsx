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
import { SceneTitle } from "../components/SceneTitle";
import { theme } from "../theme";

const FEATURES = [
  {
    title: "Built-in Macros",
    body: "Duality loadout cycling and more — no AutoHotkey required.",
    icon: "⌨",
  },
  {
    title: "Discord Rich Presence",
    body: "Show active modules and your custom profile picture in Discord.",
    icon: "💬",
  },
  {
    title: "Custom Avatar",
    body: "Click your sidebar avatar to pick a local image for the app and RPC.",
    icon: "🖼",
  },
  {
    title: "WinDivert Engine",
    body: "Standalone filtering — no NetLimiter install needed.",
    icon: "⚡",
  },
];

const FeatureTile: React.FC<{
  title: string;
  body: string;
  icon: string;
  index: number;
}> = ({ title, body, icon, index }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({
    frame: frame - 14 - index * 8,
    fps,
    config: { damping: 200 },
  });

  return (
    <div
      style={{
        opacity: enter,
        transform: `scale(${interpolate(enter, [0, 1], [0.92, 1])})`,
        background: theme.panel,
        border: `1px solid ${theme.border}`,
        borderRadius: theme.radius,
        padding: "24px 22px",
        flex: 1,
      }}
    >
      <div style={{ fontSize: 28, marginBottom: 12 }}>{icon}</div>
      <div style={{ fontWeight: 700, fontSize: 18, color: theme.text }}>
        {title}
      </div>
      <div
        style={{
          marginTop: 8,
          fontSize: 14,
          color: theme.muted,
          lineHeight: 1.5,
        }}
      >
        {body}
      </div>
    </div>
  );
};

export const FeaturesScene: React.FC = () => {
  const frame = useCurrentFrame();
  const fadeIn = interpolate(frame, [0, 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(frame, [258, 270], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const rpcOpacity = interpolate(frame, [80, 100], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ opacity: fadeIn * fadeOut }}>
      <Background />
      <AbsoluteFill style={{ padding: "72px 96px" }}>
        <SceneTitle
          eyebrow="Extras"
          title="Everything Built In"
          subtitle="Macros, Discord integration, and a native filter engine — all in one Electron app."
        />
        <div style={{ display: "flex", gap: 16 }}>
          {FEATURES.map((f, i) => (
            <FeatureTile key={f.title} {...f} index={i} />
          ))}
        </div>

        <div
          style={{
            marginTop: 32,
            display: "flex",
            alignItems: "center",
            gap: 20,
            opacity: rpcOpacity,
          }}
        >
          <div
            style={{
              background: "rgba(20,15,34,0.9)",
              border: `1px solid ${theme.border}`,
              borderRadius: 12,
              padding: "14px 18px",
              display: "flex",
              alignItems: "center",
              gap: 14,
              minWidth: 320,
            }}
          >
            <Img
              src={staticFile("visionpfp.png")}
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                border: `2px solid ${theme.purple}`,
              }}
            />
            <div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>Vision Client</div>
              <div style={{ fontSize: 12, color: theme.green, marginTop: 2 }}>
                3074 DL · 7500 · Anti Kick
              </div>
              <div style={{ fontSize: 11, color: theme.muted, marginTop: 2 }}>
                Playing Destiny 2
              </div>
            </div>
          </div>
          <div style={{ fontSize: 14, color: theme.muted }}>
            Toggle Discord RPC in Settings
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
