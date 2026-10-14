"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import type { BufferGeometry } from "three";
import { identityJourney } from "./hero-motion";

/** Decorative, locally rendered scene; no external assets or runtime data. */
export default function HeroScene() {
  const host = useRef<HTMLDivElement>(null);
  const paused = useRef(false);
  const refresh = useRef<() => void>(() => {});
  const [isPaused, setPaused] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const container = host.current;
    if (!container) return;
    let cancelled = false;
    let dispose: (() => void) | undefined;
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    paused.current = preference.matches;
    setPaused(preference.matches);
    const onPreference = () => {
      paused.current = preference.matches;
      setPaused(preference.matches);
      refresh.current();
    };
    preference.addEventListener("change", onPreference);
    void Promise.all([
      import("three"),
      import("three/addons/geometries/RoundedBoxGeometry.js"),
      import("three/addons/environments/RoomEnvironment.js"),
    ])
      .then(([T, { RoundedBoxGeometry }, { RoomEnvironment }]) => {
        if (cancelled) return;
        let renderer: InstanceType<typeof T.WebGLRenderer>;
        try {
          renderer = new T.WebGLRenderer({
            antialias: true,
            alpha: true,
            powerPreference: "low-power",
          });
        } catch {
          return;
        }
        renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = T.PCFShadowMap;
        renderer.toneMapping = T.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.35;
        container.appendChild(renderer.domElement);
        const scene = new T.Scene();
        scene.fog = new T.Fog("#0d192b", 13, 29);
        const camera = new T.PerspectiveCamera(34, 1, 0.1, 60);
        const pmrem = new T.PMREMGenerator(renderer);
        const room = new RoomEnvironment();
        const environment = pmrem.fromScene(room, 0.04);
        scene.environment = environment.texture;
        room.dispose();
        pmrem.dispose();
        const copper = new T.MeshStandardMaterial({
          color: "#d77944",
          metalness: 0.85,
          roughness: 0.25,
        });
        const shell = new T.MeshStandardMaterial({
          color: "#263b56",
          metalness: 0.7,
          roughness: 0.26,
        });
        const dark = new T.MeshStandardMaterial({
          color: "#07121f",
          metalness: 0.65,
          roughness: 0.17,
        });
        const glow = new T.MeshStandardMaterial({
          color: "#ffad78",
          emissive: "#e87839",
          emissiveIntensity: 1.5,
          metalness: 0.3,
          roughness: 0.25,
        });
        const eye = new T.MeshStandardMaterial({
          color: "#b2e0e8",
          emissive: "#80c7d4",
          emissiveIntensity: 0.65,
        });
        const geometries: BufferGeometry[] = [];
        const mesh = (
          geometry: BufferGeometry,
          material: InstanceType<typeof T.Material>,
          parent: InstanceType<typeof T.Object3D>,
          x = 0,
          y = 0,
          z = 0,
        ) => {
          geometries.push(geometry);
          const m = new T.Mesh(geometry, material);
          m.position.set(x, y, z);
          m.castShadow = true;
          m.receiveShadow = true;
          parent.add(m);
          return m;
        };
        const box = (w: number, h: number, d: number, radius = 0.1) =>
          new RoundedBoxGeometry(w, h, d, 4, radius);
        scene.add(new T.HemisphereLight("#d2e3ff", "#172030", 2.1));
        const key = new T.DirectionalLight("#ffe3cd", 4.5);
        key.position.set(-3, 8, 5);
        key.castShadow = true;
        key.shadow.mapSize.set(1024, 1024);
        key.shadow.camera.left = -7;
        key.shadow.camera.right = 7;
        key.shadow.camera.top = 7;
        key.shadow.camera.bottom = -7;
        key.shadow.normalBias = 0.04;
        scene.add(key);
        const rim = new T.DirectionalLight("#93c5e8", 3.5);
        rim.position.set(4, 4, -3);
        scene.add(rim);
        const floorMaterial = new T.MeshStandardMaterial({
          color: "#030916",
          metalness: 0.35,
          roughness: 0.5,
        });
        const floor = mesh(
          new T.PlaneGeometry(200, 200),
          floorMaterial,
          scene,
          0,
          -1.5,
          0,
        );
        floor.rotation.x = -Math.PI / 2;
        floor.castShadow = false;
        const core = new T.Group();
        scene.add(core);
        core.position.set(0, 0, -0.5);
        mesh(box(2.3, 2.4, 2.3, 0.16), shell, core);
        mesh(box(2.43, 0.26, 2.43, 0.1), copper, core, 0, 1.12, 0);
        mesh(box(2.43, 0.12, 2.43, 0.05), dark, core, 0, -1.04, 0);
        mesh(box(1.5, 1.55, 0.08, 0.06), dark, core, 0, 0, 1.18);
        // An inlaid Fisemarco mark rather than an unrelated chatbot waveform.
        mesh(box(1.04, 0.14, 0.06, 0.02), glow, core, 0, 0.52, 1.24);
        mesh(box(0.14, 1.08, 0.06, 0.02), glow, core, -0.45, 0.05, 1.24);
        mesh(box(0.14, 1.08, 0.06, 0.02), glow, core, 0.45, 0.05, 1.24);
        mesh(box(0.9, 0.12, 0.06, 0.02), glow, core, 0, 0.14, 1.24);
        mesh(box(0.14, 0.43, 0.06, 0.02), glow, core, 0, -0.3, 1.24);
        const port = mesh(
          new T.CylinderGeometry(0.58, 0.58, 0.06, 48),
          dark,
          core,
          1.18,
          0,
          0,
        );
        port.rotation.z = Math.PI / 2;
        const ring = mesh(
          new T.TorusGeometry(0.49, 0.045, 12, 64),
          copper,
          core,
          1.23,
          0,
          0,
        );
        ring.rotation.y = Math.PI / 2;
        for (let i = 0; i < 7; i++) {
          const bar = mesh(
            box(0.11, 0.045, 0.4 + Math.sin((i * Math.PI) / 6) * 0.65, 0.02),
            glow,
            core,
            (i - 3) * 0.23,
            1.275,
            0,
          );
          bar.rotation.y = 0;
        }
        // Opposing intake and issuance ports make the direction explicit.
        const intake = mesh(
          new T.CylinderGeometry(0.65, 0.65, 0.07, 48),
          dark,
          core,
          -1.18,
          0,
          0,
        );
        intake.rotation.z = Math.PI / 2;
        const intakeRing = mesh(
          new T.TorusGeometry(0.6, 0.045, 12, 64),
          copper,
          core,
          -1.23,
          0,
          0,
        );
        intakeRing.rotation.y = Math.PI / 2;
        const badgeCanvas = document.createElement("canvas");
        badgeCanvas.width = 320;
        badgeCanvas.height = 192;
        const badgeContext = badgeCanvas.getContext("2d");
        if (badgeContext) {
          badgeContext.fillStyle = "#ffad78";
          badgeContext.fillRect(0, 0, 320, 192);
          badgeContext.fillStyle = "#102138";
          badgeContext.font = "bold 48px sans-serif";
          badgeContext.fillText("IDENTITY", 24, 72);
          badgeContext.font = "24px sans-serif";
          badgeContext.fillText("FISEMARCO", 24, 113);
          badgeContext.lineWidth = 7;
          badgeContext.beginPath();
          badgeContext.moveTo(248, 141);
          badgeContext.lineTo(263, 155);
          badgeContext.lineTo(292, 125);
          badgeContext.strokeStyle = "#102138";
          badgeContext.stroke();
          badgeContext.fillRect(24, 144, 170, 5);
          badgeContext.fillRect(24, 160, 113, 5);
        }
        const badgeTexture = new T.CanvasTexture(badgeCanvas);
        badgeTexture.colorSpace = T.SRGBColorSpace;
        const badgeMaterial = new T.SpriteMaterial({
          map: badgeTexture,
          transparent: true,
        });
        const bots: {
          group: InstanceType<typeof T.Group>;
          badge: InstanceType<typeof T.Sprite>;
          phase: number;
        }[] = [];
        const robot = (
          x: number,
          y: number,
          z: number,
          scale: number,
          phase: number,
        ) => {
          const group = new T.Group();
          scene.add(group);
          group.position.set(x, y, z);
          group.scale.setScalar(scale);
          mesh(new T.SphereGeometry(0.64, 40, 28), shell, group);
          const visor = mesh(
            new T.SphereGeometry(
              0.651,
              40,
              20,
              0,
              Math.PI * 2,
              Math.PI * 0.38,
              Math.PI * 0.28,
            ),
            dark,
            group,
          );
          visor.rotation.y = 0.2;
          const seam = mesh(
            new T.TorusGeometry(0.635, 0.013, 8, 64),
            copper,
            group,
          );
          seam.rotation.x = Math.PI / 2;
          const crown = mesh(
            new T.TorusGeometry(0.24, 0.042, 12, 48),
            copper,
            group,
            0,
            0.592,
            0,
          );
          crown.rotation.x = Math.PI / 2;
          for (const ex of [-0.18, 0.18])
            mesh(box(0.14, 0.065, 0.035, 0.025), eye, group, ex, 0.04, 0.63);
          const base = mesh(
            new T.CylinderGeometry(0.2, 0.3, 0.1, 32),
            copper,
            group,
            0,
            -0.6,
            0,
          );
          base.castShadow = false;
          const badge = new T.Sprite(badgeMaterial);
          badge.position.set(0, 1.12, 0);
          badge.scale.set(1.15, 0.69, 1);
          group.add(badge);
          bots.push({ group, badge, phase });
        };
        robot(-3, 0, -0.5, 0.72, 0);
        robot(0, 0, -0.5, 0.72, 4);
        robot(2.2, 0, -0.5, 0.72, 8);
        let frame = 0,
          visible = true,
          time = 0,
          previous = 0,
          lastRender = 0;
        const kick = () => {
          if (!frame) frame = requestAnimationFrame(render);
        };
        refresh.current = kick;
        const resize = () => {
          const { width, height } = container.getBoundingClientRect();
          if (!width || !height) return;
          renderer.setSize(width, height, false);
          camera.aspect = width / height;
          camera.position.set(7, 5.1, 9);
          camera.lookAt(width > 900 ? -1.7 : 0, 0, -0.2);
          camera.updateProjectionMatrix();
          kick();
        };
        const observer = new ResizeObserver(resize);
        observer.observe(container);
        const intersection = new IntersectionObserver((entries) => {
          visible = entries[0].isIntersecting;
          if (visible) kick();
        });
        intersection.observe(container);
        const render = (now: number) => {
          frame = 0;
          if (!visible || document.hidden) return;
          const delta = previous ? Math.min((now - previous) / 1000, 0.05) : 0;
          previous = now;
          if (!paused.current) time += delta;
          if (!paused.current) frame = requestAnimationFrame(render);
          if (now - lastRender < 33 && !paused.current) return;
          lastRender = now;
          core.rotation.y = 0;
          let processing = false;
          for (const bot of bots) {
            const journey = identityJourney(time, bot.phase);
            bot.group.position.set(journey.x, journey.y, -0.5);
            bot.group.scale.setScalar(journey.scale);
            bot.group.visible = journey.visible;
            bot.group.rotation.y = 0.55;
            bot.badge.visible = journey.registered;
            bot.badge.scale.set(
              1.5 * journey.badgeScale,
              0.9 * journey.badgeScale,
              1,
            );
            processing ||= journey.processing;
          }
          glow.emissiveIntensity = processing
            ? 1.6 + Math.sin(time * 5) * 0.5
            : 1.2;
          renderer.render(scene, camera);
        };
        const onVisibility = () => {
          if (!document.hidden) kick();
        };
        document.addEventListener("visibilitychange", onVisibility);
        resize();
        kick();
        setReady(true);
        dispose = () => {
          refresh.current = () => {};
          document.removeEventListener("visibilitychange", onVisibility);
          cancelAnimationFrame(frame);
          observer.disconnect();
          intersection.disconnect();
          geometries.forEach((g) => g.dispose());
          [copper, shell, dark, glow, eye, floorMaterial].forEach((m) =>
            m.dispose(),
          );
          badgeMaterial.dispose();
          badgeTexture.dispose();
          environment.dispose();
          renderer.dispose();
          renderer.domElement.remove();
        };
      })
      .catch(() => {
        /* The static brand sculpture remains if WebGL is unavailable. */
      });
    return () => {
      cancelled = true;
      preference.removeEventListener("change", onPreference);
      dispose?.();
    };
  }, []);
  return (
    <div className="hero-world" data-ready={ready}>
      <div className="hero-world-fallback" aria-hidden="true">
        <div className="hero-world-monolith">
          <span>F</span>
        </div>
      </div>
      <div ref={host} className="hero-world-canvas" aria-hidden="true" />
      <div className="hero-world-shade" aria-hidden="true" />
      <p className="hero-world-flow">
        Enter as an agent. Leave with an identity.
        <small>Illustrative registration flow</small>
      </p>
      {ready && (
        <button
          className="hero-world-pause"
          aria-label={isPaused ? "Play hero animation" : "Pause hero animation"}
          onClick={() => {
            paused.current = !paused.current;
            setPaused(paused.current);
            refresh.current();
          }}
        >
          {isPaused ? <Play size={14} /> : <Pause size={14} />}
          <span>{isPaused ? "Play motion" : "Pause motion"}</span>
        </button>
      )}
    </div>
  );
}
