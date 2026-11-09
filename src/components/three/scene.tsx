"use client";

import { Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { PerformanceMonitor } from "@react-three/drei";
import * as THREE from "three";
import { Desk } from "./desk";
import { StationeryStack } from "./stationery-stack";
import { usePrefersReducedMotion } from "./use-prefers-reduced-motion";

function CameraTarget() {
  const camera = useThree((state) => state.camera);

  useLayoutEffect(() => {
    camera.lookAt(-0.58, 0.95, 0);
    camera.updateProjectionMatrix();
  }, [camera]);

  return null;
}

function ParallaxRig({ reducedMotion }: { reducedMotion: boolean }) {
  const rig = useRef<THREE.Group>(null);
  const pointer = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (reducedMotion) {
      pointer.current.x = 0;
      pointer.current.y = 0;
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      pointer.current.x = (event.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = (event.clientY / window.innerHeight) * 2 - 1;
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    return () => window.removeEventListener("pointermove", handlePointerMove);
  }, [reducedMotion]);

  useFrame((state, delta) => {
    if (!rig.current) return;

    const idle = reducedMotion
      ? 0
      : Math.sin(state.clock.elapsedTime * 0.14) * 0.012;
    const targetY = reducedMotion ? 0 : pointer.current.x * 0.16 + idle;
    const targetX = reducedMotion ? 0 : pointer.current.y * 0.055;

    rig.current.rotation.y = THREE.MathUtils.damp(
      rig.current.rotation.y,
      targetY,
      3.2,
      delta,
    );
    rig.current.rotation.x = THREE.MathUtils.damp(
      rig.current.rotation.x,
      targetX,
      3.2,
      delta,
    );
  });

  return (
    <group ref={rig}>
      <Desk />
      <StationeryStack />
    </group>
  );
}

export function Scene() {
  const reducedMotion = usePrefersReducedMotion();
  const [dpr, setDpr] = useState(1.5);

  return (
    <div className="absolute inset-0">
      <Canvas
        dpr={dpr}
        shadows="percentage"
        frameloop={reducedMotion ? "demand" : "always"}
        camera={{ position: [4.4, 3.05, 5.5], fov: 33, near: 0.1, far: 40 }}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: "high-performance",
        }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.38;
        }}
      >
        <PerformanceMonitor onDecline={() => setDpr(1)} />
        <CameraTarget />
        <Suspense fallback={null}>
          <ParallaxRig reducedMotion={reducedMotion} />
        </Suspense>
      </Canvas>
    </div>
  );
}
