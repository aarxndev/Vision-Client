import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "../theme";

type Props = {
  eyebrow: string;
  title: string;
  subtitle: string;
  delay?: number;
};

export const SceneTitle: React.FC<Props> = ({
  eyebrow,
  title,
  subtitle,
  delay = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const progress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 200 },
  });

  return (
    <div style={{ marginBottom: 36 }}>
      <div
        style={{
          opacity: interpolate(progress, [0, 1], [0, 1]),
          transform: `translateY(${interpolate(progress, [0, 1], [16, 0])}px)`,
          fontSize: 12,
          letterSpacing: 4,
          textTransform: "uppercase",
          color: theme.purple2,
          marginBottom: 10,
        }}
      >
        {eyebrow}
      </div>
      <div
        style={{
          opacity: interpolate(progress, [0, 1], [0, 1]),
          transform: `translateY(${interpolate(progress, [0, 1], [20, 0])}px)`,
          fontFamily: theme.fontDisplay,
          fontSize: 52,
          fontWeight: 800,
          letterSpacing: -1,
          color: theme.text,
          marginBottom: 12,
        }}
      >
        {title}
      </div>
      <div
        style={{
          opacity: interpolate(progress, [0, 1], [0, 1]),
          transform: `translateY(${interpolate(progress, [0, 1], [12, 0])}px)`,
          fontSize: 20,
          color: theme.muted,
          maxWidth: 640,
          lineHeight: 1.5,
        }}
      >
        {subtitle}
      </div>
    </div>
  );
};
