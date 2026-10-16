import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { ContactShadows, Environment, Html, OrbitControls } from '@react-three/drei';
import type { Group } from 'three';

/**
 * A procedural architectural model of the Lake Palace Suite — floor plan with living room, bedroom,
 * bathroom and terrace — built from primitives so it loads instantly with no external assets.
 */
const WALL = '#efe7d8';
const FLOOR = '#d9c7a7';
const GOLD = '#c8a96a';
const WOOD = '#6b4f3a';
const LINEN = '#f7f3ea';
const WATER = '#5d8fa6';

function Box({ p, s, c, r = 0 }: { p: [number, number, number]; s: [number, number, number]; c: string; r?: number }) {
  return (
    <mesh position={p} rotation={[0, r, 0]} castShadow receiveShadow>
      <boxGeometry args={s} />
      <meshStandardMaterial color={c} roughness={0.8} />
    </mesh>
  );
}

function Label({ p, children }: { p: [number, number, number]; children: string }) {
  return (
    <Html position={p} center distanceFactor={14} zIndexRange={[10, 0]}>
      <span style={{ background: 'rgba(14,14,16,0.82)', color: '#f4ecdc', padding: '4px 10px', fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', whiteSpace: 'nowrap', fontFamily: 'system-ui' }}>{children}</span>
    </Html>
  );
}

function Suite() {
  const g = useRef<Group>(null);
  useFrame((_, dt) => {
    if (g.current && g.current.userData.spin !== false) g.current.rotation.y += dt * 0.05;
  });
  const h = 1.4;
  return (
    <group ref={g} position={[0, -0.6, 0]}>
      {/* floor slab */}
      <Box p={[0, -0.05, 0]} s={[12, 0.1, 9]} c={FLOOR} />
      {/* terrace & water */}
      <Box p={[0, -0.04, 5.6]} s={[12, 0.08, 2.2]} c="#cbb994" />
      <mesh position={[0, -0.12, 9]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[30, 6]} /><meshStandardMaterial color={WATER} roughness={0.2} metalness={0.3} /></mesh>
      {/* outer walls */}
      <Box p={[0, h / 2, -4.5]} s={[12, h, 0.15]} c={WALL} />
      <Box p={[-6, h / 2, 0]} s={[0.15, h, 9]} c={WALL} />
      <Box p={[6, h / 2, 0]} s={[0.15, h, 9]} c={WALL} />
      {/* internal walls */}
      <Box p={[-1.5, h / 2, -1.8]} s={[0.12, h, 5.4]} c={WALL} />
      <Box p={[3.6, h / 2, -2.2]} s={[0.12, h, 4.6]} c={WALL} />
      {/* arched lake windows (gold frames) */}
      {[-4.5, -2.5, 0.5, 2.5, 4.6].map((x) => <Box key={x} p={[x, 0.75, 4.5]} s={[1.1, 1.2, 0.05]} c={GOLD} />)}
      {/* bedroom */}
      <Box p={[-3.8, 0.25, -2.6]} s={[2.4, 0.5, 2.6]} c={LINEN} />
      <Box p={[-3.8, 0.7, -3.95]} s={[2.6, 0.9, 0.15]} c={WOOD} />
      <Box p={[-2.2, 0.3, -3.6]} s={[0.5, 0.6, 0.5]} c={WOOD} />
      <Box p={[-5.4, 0.3, -3.6]} s={[0.5, 0.6, 0.5]} c={WOOD} />
      {/* living room */}
      <Box p={[1, 0.25, -3.6]} s={[3, 0.5, 0.9]} c="#b9a27a" />
      <Box p={[1, 0.2, -2]} s={[1.6, 0.4, 0.9]} c={WOOD} />
      <Box p={[-0.5, 0.25, -2]} s={[0.9, 0.5, 0.9]} c="#b9a27a" />
      <Box p={[2.5, 0.25, -2]} s={[0.9, 0.5, 0.9]} c="#b9a27a" />
      {/* dining */}
      <Box p={[1, 0.38, 1.6]} s={[2.2, 0.08, 1.1]} c={WOOD} />
      {[-0.1, 2.1].map((x) => <Box key={x} p={[x, 0.25, 1.6]} s={[0.4, 0.5, 0.4]} c={GOLD} />)}
      {/* bathroom */}
      <mesh position={[4.8, 0.3, -2.8]} castShadow><capsuleGeometry args={[0.45, 1.1, 8, 16]} /><meshStandardMaterial color="#ffffff" roughness={0.2} /></mesh>
      <Box p={[4.8, 0.45, -0.6]} s={[1.6, 0.9, 0.5]} c="#e9e2d5" />
      {/* terrace loungers */}
      {[-3.5, -1.5].map((x) => <Box key={x} p={[x, 0.18, 5.6]} s={[0.7, 0.2, 1.8]} c={LINEN} />)}
      <Label p={[-3.8, 1.9, -2.6]}>Bedroom</Label>
      <Label p={[1, 1.9, -2.6]}>Living room</Label>
      <Label p={[1, 1.6, 1.6]}>Dining</Label>
      <Label p={[4.8, 1.9, -1.8]}>Bath</Label>
      <Label p={[-2.5, 1.2, 5.8]}>Lake terrace</Label>
    </group>
  );
}

export default function SuiteModel() {
  return (
    <Canvas shadows dpr={[1, 1.75]} camera={{ position: [11, 9, 12], fov: 38 }} gl={{ antialias: true, powerPreference: 'high-performance' }}>
      <color attach="background" args={['#0e0e10']} />
      <ambientLight intensity={0.45} />
      <directionalLight position={[8, 12, 6]} intensity={1.6} castShadow shadow-mapSize={[1024, 1024]} />
      <Suite />
      <ContactShadows position={[0, -0.65, 0]} opacity={0.4} scale={24} blur={2.4} far={6} />
      <Environment preset="sunset" />
      <OrbitControls enablePan={false} minDistance={9} maxDistance={26} maxPolarAngle={Math.PI / 2.2} makeDefault />
    </Canvas>
  );
}
