"use client";

import {
  batterySpeedFactor,
  identityPose,
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
import { useRuntime, type LocalVehicle as LocalVehicleState } from "../runtime";
import { createVehicleModel } from "./models";
import { forwardSpeed, readPose, type DriveCommand } from "./VehicleBody";
import { createController } from "./controllers";

/** The player's own vehicle: physics-driven, controlled by the merged input state. */
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
      battery: rt.local?.battery ?? 1,
    };
    rt.local = local;

    const preStep = (dt: number) => controller.preStep(dt);
    rt.preStep.add(preStep);
    const cmd: DriveCommand = { throttle: 0, steer: 0, handbrake: false, speedFactor: 1 };

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
      },
    });

    return () => {
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
