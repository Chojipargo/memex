"use client";

import { useMemo } from "react";
import { RoundedBox } from "@react-three/drei";
import * as THREE from "three";

type Vec3 = [number, number, number];

type BookProps = {
  position: Vec3;
  rotationY?: number;
  size: Vec3;
  cover: string;
  pages: string;
  spine: string;
};

function Book({
  position,
  rotationY = 0,
  size,
  cover,
  pages,
  spine,
}: BookProps) {
  const [width, height, depth] = size;

  const coverThickness = Math.max(0.018, height * 0.09);
  const coverRadius = Math.min(0.014, coverThickness * 0.5);
  const pageHeight = height - coverThickness * 2;
  const pageWidth = width * 0.975;
  const pageDepth = depth * 0.965;
  const pageOffsetX = width * 0.002;
  const coverY = (pageHeight + coverThickness) / 2;

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* Page block, inset beneath the cover boards */}
      <RoundedBox
        args={[pageWidth, pageHeight, pageDepth]}
        radius={0.01}
        smoothness={3}
        position={[pageOffsetX, 0, 0]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color={pages} roughness={0.93} metalness={0} />
      </RoundedBox>

      {/* Fine page lines on the fore-edge */}
      {[-0.26, -0.09, 0.09, 0.26].map((offset) => (
        <mesh
          key={offset}
          position={[pageOffsetX + pageWidth / 2, offset * pageHeight, 0]}
        >
          <boxGeometry args={[0.0022, 0.003, pageDepth * 0.84]} />
          <meshStandardMaterial color={spine} roughness={0.9} />
        </mesh>
      ))}

      {/* Board covers, slightly larger than the page block */}
      {[coverY, -coverY].map((y) => (
        <RoundedBox
          key={y}
          args={[width, coverThickness, depth]}
          radius={coverRadius}
          smoothness={4}
          position={[0, y, 0]}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial
            color={cover}
            roughness={0.58}
            metalness={0.05}
          />
        </RoundedBox>
      ))}

      {/* Rounded spine */}
      <RoundedBox
        args={[width * 0.062, height * 0.985, depth * 0.995]}
        radius={0.018}
        smoothness={4}
        position={[-width / 2 + width * 0.031, 0, 0]}
        castShadow
      >
        <meshStandardMaterial color={spine} roughness={0.5} metalness={0.1} />
      </RoundedBox>

      {/* Spine bands */}
      {[-0.28, 0.28].map((offset) => (
        <mesh key={offset} position={[-width / 2 + 0.001, offset * height, 0]}>
          <boxGeometry args={[0.004, 0.01, depth * 0.9]} />
          <meshStandardMaterial color={cover} roughness={0.45} metalness={0.2} />
        </mesh>
      ))}
    </group>
  );
}

type StickyNoteProps = {
  position: Vec3;
  rotation?: number;
  size?: number;
  tone?: string;
  fold?: string;
};

function StickyNote({
  position,
  rotation = 0,
  size = 0.7,
  tone = "#c7c1b0",
  fold = "#a29b89",
}: StickyNoteProps) {
  const { geometry, foldGeometry, cut } = useMemo(() => {
    const half = size / 2;
    const corner = size * 0.22;

    const shape = new THREE.Shape();
    shape.moveTo(-half, -half);
    shape.lineTo(half, -half);
    shape.lineTo(half, half - corner);
    shape.lineTo(half - corner, half);
    shape.lineTo(-half, half);
    shape.closePath();

    const body = new THREE.ExtrudeGeometry(shape, {
      depth: 0.006,
      bevelEnabled: false,
      curveSegments: 4,
    });
    body.translate(0, 0, -0.003);

    const folded = new THREE.BufferGeometry();
    folded.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        [0, 0, 0, -corner, 0, 0, 0, -corner, 0],
        3,
      ),
    );
    folded.computeVertexNormals();

    return { geometry: body, foldGeometry: folded, cut: corner };
  }, [size]);

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <group rotation={[-Math.PI / 2, 0, 0]}>
        <mesh geometry={geometry} castShadow receiveShadow>
          <meshStandardMaterial color={tone} roughness={0.9} metalness={0} />
        </mesh>
        <mesh
          geometry={foldGeometry}
          position={[size / 2, size / 2 - cut, 0.008]}
          rotation={[-0.5, 0.35, 0]}
          castShadow
        >
          <meshStandardMaterial
            color={fold}
            roughness={0.85}
            metalness={0}
            side={THREE.DoubleSide}
          />
        </mesh>
      </group>
    </group>
  );
}

function Clipboard() {
  return (
    <group position={[-1.0, 0, -0.55]} rotation={[0, 0.42, 0]} scale={0.86}>
      <group position={[0, 0.67, 0]} rotation={[0.17, 0, -0.1]}>
        <RoundedBox
          args={[0.98, 1.32, 0.06]}
          radius={0.03}
          smoothness={4}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial color="#3a3a3a" roughness={0.55} metalness={0.12} />
        </RoundedBox>

        <mesh position={[0, -0.035, 0.042]} castShadow receiveShadow>
          <boxGeometry args={[0.8, 1.08, 0.012]} />
          <meshStandardMaterial color="#e7e3d8" roughness={0.9} />
        </mesh>

        {[0.18, 0.06, -0.06, -0.18].map((y) => (
          <mesh key={y} position={[0, y - 0.06, 0.05]}>
            <boxGeometry args={[0.56, 0.007, 0.002]} />
            <meshStandardMaterial color="#b9b4a6" roughness={0.9} />
          </mesh>
        ))}

        <mesh position={[0, 0.6, 0.06]} castShadow>
          <boxGeometry args={[0.36, 0.1, 0.075]} />
          <meshStandardMaterial color="#a9a9a9" roughness={0.28} metalness={0.9} />
        </mesh>
        <mesh position={[0, 0.625, 0.1]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.028, 0.028, 0.28, 12]} />
          <meshStandardMaterial color="#8f8f8f" roughness={0.3} metalness={0.9} />
        </mesh>
      </group>
    </group>
  );
}

function Pencil({
  position,
  rotationY = 0,
  scale = 1,
}: {
  position: Vec3;
  rotationY?: number;
  scale?: number;
}) {
  const length = 1.15;

  return (
    <group
      position={position}
      rotation={[0, rotationY, Math.PI / 2]}
      scale={scale}
    >
      <mesh castShadow receiveShadow>
        <cylinderGeometry args={[0.045, 0.045, length, 6]} />
        <meshStandardMaterial color="#383838" roughness={0.5} metalness={0.14} />
      </mesh>

      <mesh position={[0, length / 2 + 0.08, 0]} castShadow>
        <coneGeometry args={[0.045, 0.16, 6]} />
        <meshStandardMaterial color="#d6cdbb" roughness={0.8} />
      </mesh>

      <mesh position={[0, length / 2 + 0.172, 0]}>
        <coneGeometry args={[0.018, 0.055, 6]} />
        <meshStandardMaterial color="#111111" roughness={0.4} metalness={0.3} />
      </mesh>

      <mesh position={[0, -length / 2 - 0.05, 0]}>
        <cylinderGeometry args={[0.047, 0.047, 0.1, 6]} />
        <meshStandardMaterial color="#b9b9b9" roughness={0.25} metalness={0.9} />
      </mesh>

      <mesh position={[0, -length / 2 - 0.12, 0]}>
        <cylinderGeometry args={[0.045, 0.045, 0.08, 6]} />
        <meshStandardMaterial color="#8b8b8b" roughness={0.75} />
      </mesh>
    </group>
  );
}

function Apple({ position }: { position: Vec3 }) {
  const appleGeometry = useMemo(() => {
    // Lathe profile: rounded base, full shoulder, then a dimple at the top.
    const profile = [
      [0.0, -0.252],
      [0.078, -0.247],
      [0.15, -0.222],
      [0.212, -0.162],
      [0.255, -0.075],
      [0.274, 0.015],
      [0.266, 0.108],
      [0.232, 0.183],
      [0.17, 0.232],
      [0.095, 0.253],
      [0.05, 0.244],
      [0.022, 0.226],
      [0.0, 0.219],
    ].map(([x, y]) => new THREE.Vector2(x, y));

    const geometry = new THREE.LatheGeometry(profile, 72);
    const attribute = geometry.attributes.position;

    // Gentle five-lobed silhouette instead of a perfect solid of revolution.
    for (let index = 0; index < attribute.count; index += 1) {
      const x = attribute.getX(index);
      const z = attribute.getZ(index);
      const radius = Math.hypot(x, z);

      if (radius > 0.001) {
        const angle = Math.atan2(z, x);
        const lobe =
          1 + Math.cos(angle * 5) * 0.02 * Math.min(1, radius / 0.18);
        attribute.setX(index, x * lobe);
        attribute.setZ(index, z * lobe);
      }
    }

    geometry.computeVertexNormals();
    return geometry;
  }, []);

  const leafGeometry = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(0, -0.075);
    shape.quadraticCurveTo(0.1, -0.02, 0, 0.085);
    shape.quadraticCurveTo(-0.1, -0.02, 0, -0.075);
    shape.closePath();
    return new THREE.ExtrudeGeometry(shape, {
      depth: 0.008,
      bevelEnabled: true,
      bevelSize: 0.003,
      bevelThickness: 0.002,
      bevelSegments: 2,
      curveSegments: 18,
    });
  }, []);

  const stemGeometry = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.185, 0),
      new THREE.Vector3(0.012, 0.31, 0.008),
      new THREE.Vector3(0.026, 0.405, 0.045),
    ]);
    return new THREE.TubeGeometry(curve, 16, 0.017, 6, false);
  }, []);

  return (
    <group position={position} rotation={[0, 0.5, 0]}>
      <mesh geometry={appleGeometry} scale={[1, 1, 0.97]} castShadow receiveShadow>
        <meshPhysicalMaterial
          color="#8f3232"
          roughness={0.34}
          metalness={0.02}
          clearcoat={1}
          clearcoatRoughness={0.22}
          sheen={0.25}
          sheenColor="#c98a8a"
        />
      </mesh>

      <mesh geometry={stemGeometry} castShadow>
        <meshStandardMaterial color="#5b4632" roughness={0.85} />
      </mesh>

      <mesh
        geometry={leafGeometry}
        position={[0.092, 0.358, 0.034]}
        rotation={[-Math.PI / 2 + 0.56, 0.22, 0.6]}
        castShadow
      >
        <meshStandardMaterial
          color="#5f6b55"
          roughness={0.7}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

export function StationeryStack() {
  return (
    <group rotation={[0, -0.12, 0]} scale={0.78}>
      <Book
        position={[-0.04, 0.11, 0.03]}
        rotationY={0.03}
        size={[2.1, 0.22, 1.45]}
        cover="#5a5a5a"
        pages="#e6e0d1"
        spine="#3d3d3d"
      />
      <Book
        position={[0, 0.32, 0]}
        rotationY={-0.05}
        size={[1.98, 0.2, 1.34]}
        cover="#f5f2eb"
        pages="#fdfaf3"
        spine="#dcd7cb"
      />
      <Book
        position={[-0.02, 0.51, 0.02]}
        rotationY={0.05}
        size={[1.86, 0.18, 1.24]}
        cover="#626262"
        pages="#e2dccd"
        spine="#444444"
      />
      <Book
        position={[0, 0.68, 0]}
        rotationY={-0.02}
        size={[1.72, 0.16, 1.14]}
        cover="#6e6e6e"
        pages="#e6e0d1"
        spine="#4a4a4a"
      />

      <StickyNote
        position={[-0.42, 0.768, -0.16]}
        rotation={0.22}
        size={0.56}
        tone="#d2ccbd"
        fold="#a8a18f"
      />
      <StickyNote
        position={[0.18, 0.777, -0.36]}
        rotation={-0.15}
        size={0.46}
        tone="#bcb6a8"
        fold="#928b7d"
      />
      <StickyNote
        position={[0.0, 0.008, 0.94]}
        rotation={0.35}
        size={0.62}
        tone="#c4beaf"
        fold="#968f80"
      />

      <Clipboard />

      <Pencil position={[0.46, 0.805, 0.22]} rotationY={0.52} scale={0.94} />
      <Pencil position={[0.36, 0.805, 0.46]} rotationY={0.18} scale={0.94} />

      <Apple position={[-0.42, 1.026, -0.16]} />

    </group>
  );
}
