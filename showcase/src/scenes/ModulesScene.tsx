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

const MODULES = [
  { name: "3074 Download", hotkey: "F1", on: true },
  { name: "3074 Upload", hotkey: "F2", on: false },
  { name: "7500 API", hotkey: "F3", on: true },
  { name: "27k Download", hotkey: "F4", on: false },
  { name: "30k Download", hotkey: "F5", on: false },
  { name: "Anti Kick", hotkey: "F6", on: true },
];

const ModuleCard: React.FC<{
  name: string;
  hotkey: string;
  on: boolean;
  index: number;
}> = ({ name, hotkey, on, index }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({
    frame: frame - 12 - index * 4,
    fps,
    config: { damping: 200 },
  });

  const toggleAt = 90 + index * 8;
  const toggleProgress = interpolate(
    frame,
    [toggleAt, toggleAt + 6],
    [on ? 1 : 0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const isOn = toggleProgress > 0.5;
  const knobLeft = interpolate(toggleProgress, [0, 1], [3, 23]);

  return (
    <div
      style={{
        opacity: enter,
        transform: `translateY(${interpolate(enter, [0, 1], [24, 0])}px)`,
        background: theme.panel,
        border: `1px solid ${isOn ? "rgba(64,222,106,0.35)" : theme.border}`,
        borderRadius: theme.radius,
        padding: "18px 20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        boxShadow: isOn ? `0 0 20px ${theme.greenGlow}` : "none",
      }}
    >
      <div>
        <div style={{ fontWeight: 600, fontSize: 17, color: theme.text }}>
          {name}
        </div>
        <div style={{ fontSize: 12, color: theme.muted, marginTop: 4 }}>
          Hotkey {hotkey}
        </div>
      </div>
      <div
        style={{
          width: 46,
          height: 26,
          borderRadius: 20,
          background: isOn ? theme.green : "rgba(80,70,110,0.5)",
          position: "relative",
          boxShadow: isOn ? `0 0 10px ${theme.greenGlow}` : "none",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 3,
            left: knobLeft,
            width: 20,
            height: 20,
            borderRadius: "50%",
            background: "#fff",
          }}
        />
      </div>
    </div>
  );
};

export const ModulesScene: React.FC = () => {
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
      <Background />
      <AbsoluteFill style={{ padding: "72px 96px" }}>
        <SceneTitle
          eyebrow="Core"
          title="Modules"
          subtitle="Toggle port limits with one click or hotkeys. Freeze, kill connections, and disable all from the header."
        />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 16,
            maxWidth: 1100,
          }}
        >
          {MODULES.map((mod, i) => (
            <ModuleCard key={mod.name} {...mod} index={i} />
          ))}
        </div>
        <div
          style={{
            marginTop: 28,
            display: "flex",
            gap: 12,
            opacity: interpolate(frame, [40, 55], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          {["Freeze Game", "Kill Connections", "Disable All"].map((btn, i) => (
            <div
              key={btn}
              style={{
                padding: "10px 18px",
                borderRadius: 10,
                border: `1px solid ${i === 2 ? "rgba(255,77,109,0.4)" : theme.border}`,
                color: i === 2 ? theme.red : theme.text,
                fontSize: 14,
                background: "rgba(20,15,34,0.8)",
              }}
            >
              {btn}
            </div>
          ))}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
