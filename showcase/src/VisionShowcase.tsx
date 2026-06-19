import { AbsoluteFill, Sequence } from "remotion";
import { IntroScene } from "./scenes/IntroScene";
import { ModulesScene } from "./scenes/ModulesScene";
import { BibleScene } from "./scenes/BibleScene";
import { OverlayScene } from "./scenes/OverlayScene";
import { FeaturesScene } from "./scenes/FeaturesScene";
import { OutroScene } from "./scenes/OutroScene";

const INTRO = 90;
const SCENE = 270;
const OUTRO = 180;

export const VISION_SHOWCASE_DURATION =
  INTRO + SCENE * 4 + OUTRO;

export const VisionShowcase: React.FC = () => {
  let offset = 0;

  const scenes = [
    { Comp: IntroScene, len: INTRO },
    { Comp: ModulesScene, len: SCENE },
    { Comp: BibleScene, len: SCENE },
    { Comp: OverlayScene, len: SCENE },
    { Comp: FeaturesScene, len: SCENE },
    { Comp: OutroScene, len: OUTRO },
  ];

  return (
    <AbsoluteFill>
      {scenes.map(({ Comp, len }) => {
        const from = offset;
        offset += len;
        return (
          <Sequence key={Comp.name} from={from} durationInFrames={len}>
            <Comp />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
