"use client";

import { useEffect } from "react";
import { useRuntime } from "../runtime";
import { motorSound, servoSound } from "../vehicles/RcFeel";
import { playSound, setLoop, SILENT } from "./sound";

/** The `audio` phase: motor hum and servo whine follow the local vehicle; H honks. */
export function AudioSystem() {
  const rt = useRuntime();
  useEffect(() => {
    const off = rt.loop.register("audio", {
      name: "rc-audio",
      update() {
        const local = rt.local;
        const input = rt.input;
        if (local) {
          setLoop("engine", motorSound(local.speed, local.spec.maxSpeed, input.state.drive.y));
          setLoop("servo", servoSound(local.toolActivity));
        } else {
          setLoop("engine", SILENT);
          setLoop("servo", SILENT);
        }
        if (input.enabled && input.pressed("horn")) playSound("horn");
      },
    });
    return () => {
      off();
      setLoop("engine", SILENT);
      setLoop("servo", SILENT);
    };
  }, [rt]);
  return null;
}
