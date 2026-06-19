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

const PRESETS = [
  {
    name: "Perma Flags",
    category: "Mechanics",
    description: "Hold 3074 DL near a flag so it stays placed through the encounter.",
    checked: true,
  },
  {
    name: "GoS Motes",
    category: "Mechanics",
    description: "Limit 3074 DL before dunking to fill relays near instantly.",
    checked: true,
  },
  {
    name: "Atheon Oracles",
    category: "Mechanics",
    description: "3074 UL destroys oracles — untick to pop them all at once.",
    checked: false,
  },
  {
    name: "Loadout Desync (Duality)",
    category: "Damage",
    description: "Cycle loadouts with the built-in macro for massive boss chunks.",
    checked: false,
  },
  {
    name: "Anti Kick",
    category: "Utility",
    description: "27k DL prevents fireteam kicks while ticked.",
    checked: true,
  },
];

const PresetRow: React.FC<{
  name: string;
  category: string;
  description: string;
  checked: boolean;
  index: number;
}> = ({ name, category, description, checked, index }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({
    frame: frame - 10 - index * 5,
    fps,
    config: { damping: 200 },
  });

  const checkAt = 70 + index * 10;
  const isChecked =
    checked ||
    interpolate(frame, [checkAt, checkAt + 8], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }) > 0.5;

  return (
    <div
      style={{
        opacity: enter,
        transform: `translateX(${interpolate(enter, [0, 1], [-20, 0])}px)`,
        display: "flex",
        gap: 16,
        padding: "16px 18px",
        background: theme.panel,
        border: `1px solid ${isChecked ? theme.borderStrong : theme.border}`,
        borderRadius: 12,
        alignItems: "flex-start",
      }}
    >
      <div
        style={{
          width: 22,
          height: 22,
          borderRadius: 6,
          border: `2px solid ${isChecked ? theme.purple : theme.muted}`,
          background: isChecked ? theme.purple : "transparent",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          marginTop: 2,
          boxShadow: isChecked ? `0 0 12px ${theme.purpleGlow}` : "none",
        }}
      >
        {isChecked ? (
          <span style={{ color: "#fff", fontSize: 14, fontWeight: 700 }}>✓</span>
        ) : null}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontWeight: 600, fontSize: 16, color: theme.text }}>
            {name}
          </span>
          <span
            style={{
              fontSize: 11,
              letterSpacing: 1,
              textTransform: "uppercase",
              color: theme.purple2,
              border: `1px solid ${theme.border}`,
              padding: "2px 8px",
              borderRadius: 20,
            }}
          >
            {category}
          </span>
        </div>
        <div
          style={{
            marginTop: 6,
            fontSize: 13,
            color: theme.muted,
            lineHeight: 1.45,
          }}
        >
          {description}
        </div>
      </div>
    </div>
  );
};

export const BibleScene: React.FC = () => {
  const frame = useCurrentFrame();
  const fadeIn = interpolate(frame, [0, 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(frame, [258, 270], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const applyGlow = interpolate(frame, [130, 150, 170], [0, 1, 0.4], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ opacity: fadeIn * fadeOut }}>
      <Background />
      <AbsoluteFill style={{ padding: "72px 96px" }}>
        <SceneTitle
          eyebrow="Guide"
          title="Netlimiter Bible"
          subtitle="Checkbox presets from harryy2533's guide. Select mechanics, read descriptions, and apply filters in one click."
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {PRESETS.map((preset, i) => (
            <PresetRow key={preset.name} {...preset} index={i} />
          ))}
        </div>
        <div
          style={{
            marginTop: 22,
            display: "flex",
            alignItems: "center",
            gap: 16,
          }}
        >
          <div
            style={{
              padding: "12px 28px",
              borderRadius: 10,
              background: theme.purple,
              color: "#fff",
              fontWeight: 600,
              fontSize: 15,
              boxShadow: `0 0 ${24 * applyGlow}px ${theme.purpleGlow}`,
            }}
          >
            Apply Selected Filters
          </div>
          <span style={{ fontSize: 13, color: theme.muted }}>
            Credit: harryy2533 on twt
          </span>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
