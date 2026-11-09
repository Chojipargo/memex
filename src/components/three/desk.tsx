"use client";

import {
  ContactShadows,
  Environment,
  Lightformer,
  RoundedBox,
} from "@react-three/drei";

export function Desk() {
  return (
    <>
      <fog attach="fog" args={["#0a0a0a", 7.5, 17]} />

      <ambientLight intensity={0.8} />
      <hemisphereLight args={["#606060", "#080808", 0.9]} />

      <directionalLight
        position={[4.5, 7, 4]}
        intensity={3.4}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-bias={-0.0004}
        shadow-normalBias={0.022}
      >
        <orthographicCamera
          attach="shadow-camera"
          args={[-5, 5, 5, -5, 0.1, 25]}
        />
      </directionalLight>

      <spotLight
        position={[-5, 3.6, -3.5]}
        angle={0.65}
        penumbra={0.95}
        intensity={22}
        color="#e6e6e6"
      />

      <pointLight
        position={[-2.4, 1.4, 2.6]}
        intensity={6}
        distance={8}
        color="#ffffff"
      />

      <spotLight
        position={[3.5, 2.6, -4.2]}
        angle={0.7}
        penumbra={1}
        intensity={60}
        color="#e2e2e2"
      />

      {/* Offline-safe studio reflections instead of a remote HDR preset. */}
      <Environment resolution={128} frames={1}>
        <Lightformer
          form="rect"
          intensity={2.6}
          position={[0, 5, -7]}
          scale={[12, 7, 1]}
        />
        <Lightformer
          form="rect"
          intensity={1.4}
          position={[-6, 2.5, 2]}
          rotation-y={Math.PI / 2}
          scale={[9, 4, 1]}
        />
        <Lightformer
          form="rect"
          intensity={1.1}
          position={[6, 2, 1]}
          rotation-y={-Math.PI / 2}
          scale={[9, 4, 1]}
        />
        <Lightformer form="ring" intensity={2} position={[3, 6, 4]} scale={2.4} />
      </Environment>

      <RoundedBox
        args={[60, 0.6, 44]}
        radius={0.12}
        smoothness={4}
        position={[0, -0.3, -14]}
        receiveShadow
      >
        <meshStandardMaterial color="#1a1a1a" roughness={0.72} metalness={0.08} />
      </RoundedBox>

      <ContactShadows
        position={[0.2, 0.002, 0]}
        opacity={0.68}
        scale={11}
        blur={2.8}
        far={4}
        resolution={512}
        color="#000000"
      />
    </>
  );
}
