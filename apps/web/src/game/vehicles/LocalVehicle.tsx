"use client";

import {
  BATTERY,
  batterySpeedFactor,
  chargeBattery,
  drainBattery,
  identityPose,
  isAtChargingStation,
  integrateJoints,
  m3ToQuanta,
  quatFromYaw,
  restJoints,
  VEHICLES,
  type Livery,
  type SpawnedEvent,
} from "@dirtyworks/shared";
import { useRapier } from "@react-three/rapier";
import { useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { useSession } from "@/state/sessionStore";
import { playSound } from "../audio/sound";
import { useRuntime, type LocalVehicle as LocalVehicleState } from "../runtime";
import { createVehicleModel } from "./models";
import type { LedState } from "./models/VehicleModel";
import { AntennaSpring, ledFor } from "./RcFeel";
import { forwardSpeed, readPose, type DriveCommand } from "./VehicleBody";
import { createController } from "./controllers";

/** Below this speed (m/s) on a charging pad counts as parked. */
const PARKED_SPEED = 0.6;

/**
 * The player's own vehicle: physics-driven, controlled by the merged input state. Also runs the
 * RC battery (drain, charging pad), the whip antenna and the status LED.
 */
export function LocalVehicle({ spawn, livery }: { spawn: SpawnedEvent; livery: Livery }) {
  const rt = useRuntime();
  const { world, rapier } = useRapier();
  const scene = useThree((s) => s.scene);
  const liveryRef = useRef(livery);
  liveryRef.current = livery;

  useEffect(() => {
    const spec = VEHICLES[spawn.vehicle];
    const capacityQ = m3ToQuanta(spec.tool.capacityM3);
    const pose = identityPose();
    const q = quatFromYaw(spawn.yaw, { x: 0, y: 0, z: 0, w: 1 });
    pose.x = spawn.x;
    pose.y = spawn.y;
    pose.z = spawn.z;
    pose.qx = q.x;
    pose.qy = q.y;
    pose.qz = q.z;
    pose.qw = q.w;

    const model = createVehicleModel(spawn.vehicle, liveryRef.current);
    scene.add(model.root);
    const controller = createController(world, rapier, spec, pose);
    const local: LocalVehicleState = {
      id: spawn.vehicle,
      spec,
      body: controller.body,
      model,
      pose,
      joints: restJoints(spec),
      speed: 0,
      toolActivity: 0,
      battery: rt.batteries[spawn.vehicle] ?? 1,
      charging: false,
    };
    rt.local = local;

    const preStep = (dt: number) => controller.preStep(dt);
    rt.preStep.add(preStep);
    const cmd: DriveCommand = { throttle: 0, steer: 0, handbrake: false, speedFactor: 1 };

    let announcedAt = -Infinity;
    const offBattery = rt.loop.register("player:pre-physics", {
      name: "local-battery",
      update(ctx) {
        const parked = Math.abs(local.speed) < PARKED_SPEED;
        const charging = parked && isAtChargingStation(rt.map, local.pose.x, local.pose.z);
        // Inching around on the pad should not replay the chime every time you stop.
        if (charging && !local.charging && local.battery < 0.98 && ctx.time - announcedAt > 8) {
          announcedAt = ctx.time;
          playSound("charge");
          useSession.getState().pushToast("Charging… stay parked on the pad.", "info");
        }
        local.charging = charging;
        const before = local.battery;
        local.battery = charging
          ? chargeBattery(before, ctx.dt)
          : drainBattery(before, rt.input.state.drive.y, local.toolActivity, ctx.dt);
        if (before >= BATTERY.lowThreshold && local.battery < BATTERY.lowThreshold) {
          playSound("lowBattery");
          useSession
            .getState()
            .pushToast("Battery low: park on a green charging pad to top up.", "info");
        }
        rt.batteries[local.id] = local.battery;
      },
    });

    const offDrive = rt.loop.register("vehicle:pre-physics", {
      name: "local-vehicle-drive",
      update(ctx) {
        const input = rt.input.state;
        cmd.throttle = input.drive.y;
        cmd.steer = input.drive.x;
        cmd.handbrake = input.handbrake;
        cmd.speedFactor = batterySpeedFactor(local.battery);
        controller.command(cmd);
        local.toolActivity = integrateJoints(spec, local.joints, input.tool, ctx.dt);
      },
    });

    const antenna = new AntennaSpring();
    let ledState: LedState | null = null;
    let ledOn = false;

    const offSync = rt.loop.register("vehicle:post-physics", {
      name: "local-vehicle-sync",
      update(ctx) {
        readPose(controller.body, local.pose);
        local.speed = forwardSpeed(local.pose);
        model.root.position.set(local.pose.x, local.pose.y, local.pose.z);
        model.root.quaternion.set(local.pose.qx, local.pose.qy, local.pose.qz, local.pose.qw);
        model.setJoints(local.joints);
        if (capacityQ > 0) model.setLoad(rt.localLoadQ / capacityQ);
        controller.syncVisuals(model, ctx.dt);

        antenna.update(local.pose, ctx.dt);
        model.nodes.antenna?.rotation.set(antenna.tiltX, 0, antenna.tiltZ);
        const led = ledFor(
          local.battery,
          local.toolActivity,
          local.charging && local.battery < 0.999,
          ctx.time,
        );
        if (led.state !== ledState || led.on !== ledOn) {
          ledState = led.state;
          ledOn = led.on;
          model.setLed(led.state, led.on);
        }
      },
    });

    return () => {
      offBattery();
      offDrive();
      offSync();
      rt.preStep.delete(preStep);
      controller.dispose();
      model.dispose();
      if (rt.local === local) rt.local = null;
    };
  }, [rt, world, rapier, scene, spawn]);

  useEffect(() => {
    rt.local?.model.setLivery(livery);
  }, [rt, livery]);

  return null;
}
