import "./index.css";
import { Composition } from "remotion";
import {
  VISION_SHOWCASE_DURATION,
  VisionShowcase,
} from "./VisionShowcase";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="VisionShowcase"
        component={VisionShowcase}
        durationInFrames={VISION_SHOWCASE_DURATION}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
