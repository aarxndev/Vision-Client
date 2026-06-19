import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { theme } from "../theme";

type Props = {
  pulse?: boolean;
  dim?: number;
};

export const Background: React.FC<Props> = ({ pulse = true, dim = 0.45 }) => {
  const frame = useCurrentFrame();
  const glow = pulse
    ? interpolate(Math.sin(frame / 18), [-1, 1], [0.14, 0.22])
    : 0.18;

  return (
    <AbsoluteFill
      style={{
        background: theme.bg,
        fontFamily: theme.fontUi,
      }}
    >
      <AbsoluteFill
        style={{
          background: `radial-gradient(1100px 600px at 80% -10%, rgba(156,43,255,${glow}), transparent 60%)`,
        }}
      />
      <AbsoluteFill
        style={{
          background: `radial-gradient(900px 500px at -10% 110%, rgba(90,30,200,${glow * 0.9}), transparent 55%)`,
        }}
      />
      <AbsoluteFill
        style={{
          background: `linear-gradient(rgba(6,4,11,${dim}), rgba(6,4,11,${dim}))`,
        }}
      />
    </AbsoluteFill>
  );
};
