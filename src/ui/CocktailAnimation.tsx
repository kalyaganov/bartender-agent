import { useEffect, useState } from "react";
import { Box, Text } from "ink";
import { useStore } from "../state/store";

const FRAMES = ["▒░░░", "▒▒░░", "▒▒▒░", "████"];
const STEP_MS = 350;

export function CocktailAnimation() {
  const pouring = useStore((s) => s.pouring);
  const setPouring = useStore((s) => s.setPouring);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!pouring) {
      setStep(0);
      return;
    }
    setStep(0);
    let local = 0;
    let done: ReturnType<typeof setTimeout> | null = null;
    const id = setInterval(() => {
      local += 1;
      if (local >= FRAMES.length - 1) {
        setStep(FRAMES.length - 1);
        clearInterval(id);
        done = setTimeout(() => setPouring(null), STEP_MS * 2);
      } else {
        setStep(local);
      }
    }, STEP_MS);
    return () => { clearInterval(id); if (done) clearTimeout(done); };
  }, [pouring, setPouring]);

  if (!pouring) return null;
  const isLast = step >= FRAMES.length - 1;

  return (
    <Box marginLeft={2}>
      <Text color="blue">
        {isLast ? "◆" : "◇"} наливаю «{pouring}»{"  "}
        <Text bold>{FRAMES[Math.min(step, FRAMES.length - 1)]}</Text>
        {isLast ? "  готово" : ""}
      </Text>
    </Box>
  );
}
