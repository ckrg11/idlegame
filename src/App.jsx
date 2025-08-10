import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BarChart2, Crown, Zap, Star, TrendingUp, RotateCw, Trophy, Flame, Info, ChevronRight, RefreshCw } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer } from "recharts";

/**
 * Idle Biscuit PRO — massive producer FX + WebAudio
 * - Level‑scaling AURAS per building (big, glowing, animated)
 * - Particle emitters kept; combined with auras for punch
 * - WebAudio beeps: light ping on click, hefty thump on purchase (scaled)
 */

// ----------------------------- Utils -----------------------------
const fmt = (n) => {
  if (!isFinite(n)) return "∞";
  if (n === 0) return "0";
  const abs = Math.abs(n);
  const units = ["", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc"];
  let u = 0; let v = abs;
  while (v >= 1000 && u < units.length - 1) { v /= 1000; u++; }
  const s = (n < 0 ? -v : v).toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2);
  return `${s}${units[u]}`;
};
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const range = (n) => Array.from({ length: Math.max(0, Math.floor(n)) }, (_, i) => i);
const tier = (count) => (count >= 100 ? 4 : count >= 50 ? 3 : count >= 25 ? 2 : count >= 10 ? 1 : count >= 1 ? 0 : -1);
// Every 10 levels, producers gain a special strength boost
const milestoneBonus = (count) => 1 + Math.floor(count / 10) * 0.5;

// Visual colours per producer
const BUILDING_COLORS = {
  cursor: "#60a5fa",
  grandma: "#f472b6",
  farm: "#34d399",
  factory: "#f59e0b",
  lab: "#a78bfa",
};

// ----------------------------- Game Data -----------------------------
const BASE_BUILDINGS = [
  { id: "cursor", name: "Cursor", baseCost: 15, baseCps: 0.1, emoji: "🖱️", desc: "Klickt ab und zu für dich." },
  { id: "grandma", name: "Oma", baseCost: 100, baseCps: 1, emoji: "🧓", desc: "Backt Cookies mit Liebe." },
  { id: "farm", name: "Farm", baseCost: 1100, baseCps: 8, emoji: "🌾", desc: "Baut Cookie‑Getreide an." },
  { id: "factory", name: "Fabrik", baseCost: 12000, baseCps: 47, emoji: "🏭", desc: "Industrielles Backen." },
  { id: "lab", name: "Labor", baseCost: 130000, baseCps: 260, emoji: "🧪", desc: "Erforscht bessere Rezepte (generiert Research)." },
];

const COST_SCALE = 1.15;

const BASE_UPGRADES = [
  { id: "click1", name: "Dicker Teig", cost: 100, type: "click", mult: 2, desc: "+100% Cookies pro Klick." },
  { id: "click2", name: "Ofenhandschuhe", cost: 1000, type: "click", mult: 2, desc: "+100% Cookies pro Klick." },
  { id: "global1", name: "Bio‑Zutaten", cost: 5000, type: "global", mult: 1.2, desc: "+20% alle Produktionen." },
  { id: "global2", name: "Turbo‑Öfen", cost: 50000, type: "global", mult: 1.5, desc: "+50% alle Produktionen." },
  { id: "cursor1", name: "Präzisions‑Cursors", cost: 2000, type: "building", target: "cursor", mult: 2, desc: "+100% Cursor‑Output." },
  { id: "grandma1", name: "Kaffee für Omas", cost: 5000, type: "building", target: "grandma", mult: 2, desc: "+100% Oma‑Output." },
  { id: "farm1", name: "Düngemittel", cost: 30000, type: "building", target: "farm", mult: 2, desc: "+100% Farm‑Output." },
  { id: "factory1", name: "Förderbänder", cost: 200000, type: "building", target: "factory", mult: 2, desc: "+100% Fabrik‑Output." },
  { id: "lab1", name: "Mikrowellen‑Chemie", cost: 800000, type: "building", target: "lab", mult: 2, desc: "+100% Labor‑Output." },
];

const RESEARCH_NODES = [
  { id: "r1", name: "Effiziente Logistik", cost: 50, effect: { type: "globalMult", value: 1.1 }, req: [], desc: "+10% Produktions‑Multiplikator." },
  { id: "r2", name: "Click‑Ergonomie", cost: 100, effect: { type: "clickMult", value: 1.5 }, req: ["r1"], desc: "+50% Klick‑Wert." },
  { id: "r3", name: "Automatisierung", cost: 200, effect: { type: "buildingMult", target: "factory", value: 1.5 }, req: ["r1"], desc: "+50% Fabrik." },
  { id: "r4", name: "Laborprotokolle", cost: 250, effect: { type: "labResearchBoost", value: 1.5 }, req: ["r1"], desc: "+50% Research‑Erzeugung aus Laboren." },
  { id: "r5", name: "Feinmechanik", cost: 300, effect: { type: "buildingMult", target: "cursor", value: 2 }, req: ["r2"], desc: "x2 Cursor." },
];

const ACHIEVEMENTS = [
  { id: "a100", name: "100 Klicks", check: (s) => s.stats.clicks >= 100 },
  { id: "a1k", name: "1.000 Cookies gebacken", check: (s) => s.stats.totalCookies >= 1000 },
  { id: "a10k", name: "10.000 Cookies gebacken", check: (s) => s.stats.totalCookies >= 10000 },
  { id: "aFirstAuto", name: "Erster Produzent", check: (s) => Object.values(s.buildings).some((b) => b.count > 0) },
  { id: "aBuff", name: "Erster Buff", check: (s) => s.stats.buffsTriggered > 0 },
  { id: "aPrestige", name: "Erste Ascension", check: (s) => s.stardust > 0 },
];

const prestigeFromCookies = (lifetime) => Math.floor(Math.sqrt(lifetime / 1e6));

// ----------------------------- FX: Emitters + Auras -----------------------------
function Emitter({ count, emoji, area, size = 1, drift = 30, speed = 4, opacity = 0.9 }) {
  const items = useMemo(() => range(count).map((i) => ({
    id: `${emoji}-${i}-${Math.random().toString(36).slice(2)}`,
    x: Math.random(),
    y: Math.random(),
    delay: Math.random() * 2,
    dur: 2 + Math.random() * speed,
    rot: (Math.random() - 0.5) * 40,
  })), [count, emoji, speed]);

  const posFor = (p) => {
    switch (area) {
      case 'center': return { left: `${40 + p.x * 20}%`, top: `${40 + p.y * 20}%` };
      case 'left': return { left: `${5 + p.x * 20}%`, top: `${40 + p.y * 50}%` };
      case 'right': return { left: `${75 + p.x * 20}%`, top: `${30 + p.y * 50}%` };
      case 'bottom': return { left: `${20 + p.x * 60}%`, top: `${75 + p.y * 20}%` };
      case 'top': return { left: `${20 + p.x * 60}%`, top: `${-10 + p.y * 15}%` };
      case 'topRight': return { left: `${70 + p.x * 25}%`, top: `${-5 + p.y * 15}%` };
      default: return { left: `${p.x * 100}%`, top: `${p.y * 100}%` };
    }
  };

  return (
    <>
      {items.map((p) => (
        <motion.div
          key={p.id}
          className="absolute select-none"
          style={{ ...posFor(p), fontSize: `${size}rem`, opacity }}
          initial={{ y: 0, scale: 0.6, rotate: 0 }}
          animate={{ y: -drift, scale: 1, rotate: p.rot, opacity: 0 }}
          transition={{ delay: p.delay, duration: p.dur, repeat: Infinity, repeatType: 'loop' }}
        >{emoji}</motion.div>
      ))}
    </>
  );
}

function Aura({ color, intensity = 1, radius = 55, speed = 10, center = "50% 55%" }) {
  // Big glowing blob behind the cookie; uses layered radial gradients + slow spin
  return (
    <motion.div
      className="absolute -inset-12 rounded-full"
      style={{
        background: `radial-gradient(circle at ${center}, ${color}33, transparent ${radius}%)`,
        filter: `blur(${8 + intensity * 6}px)`,
      }}
      animate={{ rotate: [0, 12, -8, 0], opacity: [0.25, 0.45, 0.35, 0.25] }}
      transition={{ duration: Math.max(6 - intensity, 2) + speed * 0.1, repeat: Infinity }}
    />
  );
}

function EffectLayer({ buildings }) {
  const tCursor = tier(buildings.cursor.count);
  const tGrandma = tier(buildings.grandma.count);
  const tFarm = tier(buildings.farm.count);
  const tFactory = tier(buildings.factory.count);
  const tLab = tier(buildings.lab.count);

  return (
    <div className="pointer-events-none absolute -inset-12 z-0 overflow-visible">
      {/* AURAS scale with tier */}
      {tCursor >= 0 && <Aura color="#60a5fa" intensity={tCursor+1} radius={45 + tCursor*4} speed={8 - tCursor} center="42% 58%" />}
      {tGrandma >= 0 && <Aura color="#f472b6" intensity={tGrandma+1} radius={42 + tGrandma*5} speed={8 - tGrandma} center="22% 50%" />}
      {tFarm >= 0 && <Aura color="#34d399" intensity={tFarm+1} radius={48 + tFarm*5} speed={8 - tFarm} center="50% 82%" />}
      {tFactory >= 0 && <Aura color="#f59e0b" intensity={tFactory+1} radius={46 + tFactory*5} speed={7 - tFactory} center="80% 15%" />}
      {tLab >= 0 && <Aura color="#a78bfa" intensity={tLab+1} radius={46 + tLab*5} speed={7 - tLab} center="80% 50%" />}

      {/* ORIGINAL EMITTERS */}
      {tCursor >= 0 && (
        <Emitter count={6 + tCursor * 6} emoji="✨" area="center" size={0.9 + tCursor * 0.1} drift={35 + tCursor * 10} speed={3 + tCursor} opacity={0.8} />
      )}
      {tGrandma >= 0 && (
        <Emitter count={4 + tGrandma * 5} emoji="💗" area="left" size={1 + tGrandma * 0.12} drift={40 + tGrandma * 10} speed={3 + tGrandma} opacity={0.85} />
      )}
      {tFarm >= 0 && (
        <Emitter count={5 + tFarm * 6} emoji="🌱" area="bottom" size={0.9 + tFarm * 0.15} drift={50 + tFarm * 10} speed={3 + tFarm} opacity={0.9} />
      )}
      {tFactory >= 0 && (
        <Emitter count={3 + tFactory * 4} emoji="💨" area="topRight" size={1 + tFactory * 0.1} drift={60 + tFactory * 12} speed={4 + tFactory} opacity={0.7} />
      )}
      {tLab >= 0 && (
        <Emitter count={4 + tLab * 5} emoji="🫧" area="right" size={1 + tLab * 0.12} drift={55 + tLab * 12} speed={3 + tLab} opacity={0.85} />
      )}
    </div>
  );
}

// ----------------------------- Main Component -----------------------------
export default function App() {
  const [cookies, setCookies] = useState(0);
  const [totalCookies, setTotalCookies] = useState(0);
  const [perClickBase, setPerClickBase] = useState(1);
  const [perClickMult, setPerClickMult] = useState(1);
  const [globalMult, setGlobalMult] = useState(1);
  const [buildingMult, setBuildingMult] = useState({});
  const [buildings, setBuildings] = useState(() => Object.fromEntries(BASE_BUILDINGS.map(b => [b.id, { ...b, count: 0 }])));
  const [ownedUpgrades, setOwnedUpgrades] = useState([]);
  const [research, setResearch] = useState(0);
  const [ownedResearch, setOwnedResearch] = useState([]);
  const [stardust, setStardust] = useState(0);
  const [buff, setBuff] = useState(null);
  const [showHint, setShowHint] = useState(true);
  const [stats, setStats] = useState({ clicks: 0, buffsTriggered: 0, peakCps: 0, startTime: Date.now(), lifetimeCookies: 0 });
  const [cpsHistory, setCpsHistory] = useState([]);
  const [golden, setGolden] = useState(null);
  const [toast, setToast] = useState(null);
  const [cookiePulse, setCookiePulse] = useState(null);

  // ---- WebAudio (single AudioContext) ----
  const audioRef = useRef(null);
  function getAudioCtx() {
    if (!audioRef.current) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      audioRef.current = new Ctx();
    }
    return audioRef.current;
  }
  function playSound(freq = 300, volume = 0.08, duration = 0.12) {
    try {
      const ctx = getAudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.value = volume;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      // short decay
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume * 0.01), ctx.currentTime + duration);
      osc.stop(ctx.currentTime + duration + 0.01);
    } catch {}
  }

  const stardustMult = useMemo(() => 1 + stardust * 0.01, [stardust]);
  const achievementMult = useMemo(() => 1 + unlockedAchievements().length * 0.01, []); // read at render

  const cpsBase = useMemo(() => {
    let sum = 0;
    for (const id of Object.keys(buildings)) {
      const b = buildings[id];
      const per = b.baseCps * (buildingMult[id] || 1) * milestoneBonus(b.count);
      sum += b.count * per;
    }
    return sum;
  }, [buildings, buildingMult]);

  const cps = useMemo(() => {
    const buffMult = buff && buff.type === "frenzy" ? buff.mult : 1;
    const g = globalMult * stardustMult * achievementMult * buffMult;
    return cpsBase * g;
  }, [cpsBase, globalMult, stardustMult, achievementMult, buff]);

  const clickValue = useMemo(() => {
    const mult = perClickMult * globalMult * stardustMult * achievementMult * (buff && buff.type === "clickFrenzy" ? buff.mult : 1);
    return perClickBase * mult;
  }, [perClickBase, perClickMult, globalMult, stardustMult, achievementMult, buff]);

  function unlockedAchievements() {
    const state = { stats: { clicks: stats.clicks, totalCookies, buffsTriggered: stats.buffsTriggered }, stardust, buildings };
    return ACHIEVEMENTS.filter(a => a.check(state));
  }

  // Passive loop
  useEffect(() => {
    const tick = setInterval(() => {
      setCookies((c) => c + cps / 10);
      setTotalCookies((t) => t + cps / 10);
      setStats((s) => ({ ...s, lifetimeCookies: (s.lifetimeCookies || 0) + cps / 10, peakCps: Math.max(s.peakCps, cps) }));
      const labCount = buildings.lab.count;
      if (labCount > 0) {
        const boost = (buildingMult["lab"] || 1) * (ownedResearch.includes("r4") ? 1.5 : 1);
        setResearch((r) => r + (0.05 * labCount * globalMult * stardustMult * boost) / 10);
      }
      if (!golden && Math.random() < 0.02) {
        const x = Math.random() * 80 + 10;
        const y = Math.random() * 70 + 10;
        setGolden({ x, y, despawn: Date.now() + 3500 + Math.random() * 1500 });
      } else if (golden && Date.now() > golden.despawn) {
        setGolden(null);
      }
      if (buff && Date.now() > buff.until) setBuff(null);
    }, 100);

    const second = setInterval(() => {
      setCpsHistory((h) => {
        const nh = [...h, { t: new Date().toLocaleTimeString(), cps: cps }];
        return nh.slice(-60);
      });
    }, 1000);

    return () => { clearInterval(tick); clearInterval(second); };
  }, [cps, buildings, globalMult, stardustMult, buildingMult, ownedResearch, golden, buff]);

  // Load
  useEffect(() => {
    const saved = localStorage.getItem("idle-biscuit-save");
    if (saved) {
      try {
        const s = JSON.parse(saved);
        setCookies(s.cookies || 0);
        setTotalCookies(s.totalCookies || 0);
        setPerClickBase(s.perClickBase || 1);
        setPerClickMult(s.perClickMult || 1);
        setGlobalMult(s.globalMult || 1);
        setBuildingMult(s.buildingMult || {});
        setBuildings(s.buildings || Object.fromEntries(BASE_BUILDINGS.map(b => [b.id, { ...b, count: 0 }])));
        setOwnedUpgrades(s.ownedUpgrades || []);
        setResearch(s.research || 0);
        setOwnedResearch(s.ownedResearch || []);
        setStardust(s.stardust || 0);
        setStats(s.stats || stats);
        const last = s.lastSave || Date.now();
        const dt = clamp((Date.now() - last) / 1000, 0, 8 * 3600);
        const gain = (s.cpsSnapshot || 0) * dt;
        if (gain > 1) {
          setCookies((c) => c + gain);
          setTotalCookies((t) => t + gain);
          setToast({ title: "Offline‑Ertrag", text: `Du hast ${fmt(gain)} Cookies verdient.` });
        }
      } catch {}
    }
  }, []);

  // Save
  useEffect(() => {
    const payload = { cookies, totalCookies, perClickBase, perClickMult, globalMult, buildingMult, buildings, ownedUpgrades, research, ownedResearch, stardust, stats, lastSave: Date.now(), cpsSnapshot: cps };
    localStorage.setItem("idle-biscuit-save", JSON.stringify(payload));
  }, [cookies, totalCookies, perClickBase, perClickMult, globalMult, buildingMult, buildings, ownedUpgrades, research, ownedResearch, stardust, stats, cps]);

  const clickCookie = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    spawnFloat(`+${fmt(clickValue)}`, x, y);
    setCookies((c) => c + clickValue);
    setTotalCookies((t) => t + clickValue);
    setStats((s) => ({ ...s, clicks: s.clicks + 1 }));
    setShowHint(false);
    playSound(280, 0.05, 0.08); // light ping
  };

  const floatersRef = useRef([]);
  const [, force] = useState(0);
  function spawnFloat(text, x, y, color = "#fff") {
    const id = Math.random().toString(36).slice(2);
    const item = { id, text, x, y, color, created: Date.now() };
    floatersRef.current.push(item);
    force((n) => n + 1);
    setTimeout(() => {
      floatersRef.current = floatersRef.current.filter((f) => f.id !== id);
      force((n) => n + 1);
    }, 1200);
  }

  const buyBuilding = (id) => {
    const b = buildings[id];
    const cost = Math.floor(b.baseCost * Math.pow(COST_SCALE, b.count));
    if (cookies >= cost) {
      const newCount = b.count + 1;
      setCookies(cookies - cost);
      setBuildings({ ...buildings, [id]: { ...b, count: newCount } });
      spawnFloat(`${b.emoji} +1`, 30 + Math.random()*60, 30 + Math.random()*40, "#ffd56b");
      if (newCount % 10 === 0) {
        setToast({ title: "Sonderbonus!", text: `${b.name} produziert jetzt x${milestoneBonus(newCount).toFixed(1)}.` });
      }
      setCookiePulse({ color: BUILDING_COLORS[id] || "#fff", t: Date.now() });
      setTimeout(() => setCookiePulse(null), 650);
      // beefy thump that scales a bit with count
      const freq = 140 + Math.min(100, newCount * 2);
      const vol = Math.min(0.25, 0.08 + newCount * 0.004);
      const dur = Math.min(0.25, 0.12 + newCount * 0.003);
      playSound(freq, vol, dur);
    }
  };

  const canBuyUpgrade = (u) => !ownedUpgrades.includes(u.id) && cookies >= u.cost;
  const buyUpgrade = (u) => {
    if (!canBuyUpgrade(u)) return;
    setCookies(cookies - u.cost);
    setOwnedUpgrades([...ownedUpgrades, u.id]);
    if (u.type === "click") setPerClickMult((m) => m * u.mult);
    if (u.type === "global") setGlobalMult((m) => m * u.mult);
    if (u.type === "building") setBuildingMult((bm) => ({ ...bm, [u.target]: (bm[u.target] || 1) * u.mult }));
  };

  const buyResearch = (node) => {
    if (ownedResearch.includes(node.id) || research < node.cost) return;
    setResearch(research - node.cost);
    setOwnedResearch([...ownedResearch, node.id]);
    applyResearchEffect(node.effect);
  };

  function applyResearchEffect(effect) {
    if (effect.type === "globalMult") setGlobalMult((m) => m * effect.value);
    if (effect.type === "clickMult") setPerClickMult((m) => m * effect.value);
    if (effect.type === "buildingMult") setBuildingMult((bm) => ({ ...bm, [effect.target]: (bm[effect.target] || 1) * effect.value }));
  }

  const doAscend = () => {
    const gain = prestigeFromCookies(totalCookies);
    if (gain <= 0) return;
    setStardust((s) => s + gain);
    setCookies(0); setTotalCookies(0);
    setPerClickBase(1); setPerClickMult(1);
    setGlobalMult(1); setBuildingMult({});
    setBuildings(Object.fromEntries(BASE_BUILDINGS.map(b => [b.id, { ...b, count: 0 }])));
    setOwnedUpgrades([]);
    setResearch(0); setOwnedResearch([]);
    setStats((s) => ({ ...s, clicks: 0, buffsTriggered: 0, peakCps: 0, lifetimeCookies: 0 }));
    setToast({ title: "Aufgestiegen!", text: `Du bekommst ${gain} Stardust (+${gain}% dauerhaft).` });
  };

  const triggerGolden = () => {
    setGolden(null);
    setStats((s) => ({ ...s, buffsTriggered: s.buffsTriggered + 1 }));
    const roll = Math.random();
    if (roll < 0.4) {
      setBuff({ type: "frenzy", mult: 7, until: Date.now() + 30000 });
      setToast({ title: "Frenzy!", text: "30s Produktion x7" });
    } else if (roll < 0.7) {
      setBuff({ type: "clickFrenzy", mult: 50, until: Date.now() + 15000 });
      setToast({ title: "Click Frenzy!", text: "15s Klick‑Wert x50" });
    } else {
      const gain = Math.max(10, cps * 15);
      setCookies((c) => c + gain);
      setTotalCookies((t) => t + gain);
      setToast({ title: "Lucky!", text: `Sofort ${fmt(gain)} Cookies.` });
    }
  };

  const exportSave = () => {
    const raw = localStorage.getItem("idle-biscuit-save") || "{}";
    navigator.clipboard.writeText(raw);
    setToast({ title: "Exportiert", text: "Spielstand in die Zwischenablage kopiert." });
  };
  const importSave = async () => {
    const raw = prompt("Füge hier deinen Spielstand ein (JSON):");
    if (!raw) return;
    try {
      const s = JSON.parse(raw);
      localStorage.setItem("idle-biscuit-save", JSON.stringify(s));
      window.location.reload();
    } catch (e) {
      setToast({ title: "Fehler", text: "Ungültiges JSON." });
    }
  };
  const hardReset = () => {
    if (!confirm("Wirklich alles löschen?")) return;
    localStorage.removeItem("idle-biscuit-save");
    window.location.reload();
  };

  const cookieGlow = clamp((globalMult * stardustMult - 1) * 30, 0, 60);
  const bgGlow = clamp(stardust * 2, 0, 40);

  const cookieAnim = buff ? {
    rotate: buff.type === 'frenzy' ? [0, 2, -2, 0] : 0,
    scale: buff.type === 'clickFrenzy' ? [1, 1.04, 1] : 1,
  } : {};
  const cookieAnimTransition = buff ? { repeat: Infinity, duration: buff.type === 'frenzy' ? 1.1 : 0.6 } : { duration: 0.2 };

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-amber-900 via-stone-900 to-zinc-900 text-zinc-100">
      <header className="sticky top-0 z-40 backdrop-blur bg-black/20 border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4">
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2">
            <Flame className="w-6 h-6 text-amber-400" />
            <h1 className="font-bold text-lg">Idle Biscuit Pro</h1>
          </motion.div>
          <div className="ml-auto flex items-center gap-4 text-sm">
            <div className="px-3 py-1 bg-white/10 rounded-xl">Cookies: <span className="font-semibold">{fmt(cookies)}</span></div>
            <div className="px-3 py-1 bg-white/10 rounded-xl">CPS: <span className="font-semibold">{fmt(cps)}</span></div>
            <div className="px-3 py-1 bg-white/10 rounded-xl flex items-center gap-1"><Star className="w-4 h-4 text-amber-300"/> Stardust: <span className="font-semibold">{fmt(stardust)}</span></div>
            <button onClick={exportSave} className="px-3 py-1 rounded-xl bg-emerald-600/80 hover:bg-emerald-600">Export</button>
            <button onClick={importSave} className="px-3 py-1 rounded-xl bg-sky-600/80 hover:bg-sky-600">Import</button>
            <button onClick={hardReset} className="px-3 py-1 rounded-xl bg-rose-600/80 hover:bg-rose-600">Reset</button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
        <section className="md:col-span-1">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="relative">
            <div className="absolute -inset-8 blur-3xl rounded-full" style={{ background: `radial-gradient(circle at 50% 50%, rgba(255,200,130,${0.25+bgGlow/100}), rgba(0,0,0,0))` }} />
            <EffectLayer buildings={buildings} />

            <motion.button
              onClick={clickCookie}
              whileTap={{ scale: 0.95 }}
              animate={{ boxShadow: `0 0 ${cookieGlow}px ${cookieGlow/6}px rgba(255,210,120,0.5)`, ...cookieAnim }}
              transition={cookieAnimTransition}
              className="relative z-10 w-full aspect-square rounded-full bg-gradient-to-br from-amber-400 to-amber-700 border-4 border-amber-900 overflow-hidden"
            >
              <AnimatePresence>
                {cookiePulse && (
                  <motion.div
                    key={cookiePulse.t}
                    className="absolute inset-0 rounded-full"
                    style={{ boxShadow: `0 0 0 3px ${cookiePulse.color} inset, 0 0 18px ${cookiePulse.color}` }}
                    animate={{ opacity: 0, scale: 1.35 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                  />
                )}
              </AnimatePresence>

              <div className="absolute inset-0">
                {[...Array(12)].map((_, i) => (
                  <div key={i} className="absolute w-6 h-6 md:w-8 md:h-8 rounded-full bg-amber-900/60" style={{
                    left: `${10 + (i*7)%80}%`, top: `${10 + (i*11)%80}%`, transform: `scale(${0.8 + (i%3)*0.2})`
                  }} />
                ))}
              </div>
              <AnimatePresence>
                {floatersRef.current.map((f) => (
                  <motion.div key={f.id} initial={{ opacity: 1, y: 0 }} animate={{ opacity: 0, y: -40 }} exit={{ opacity: 0 }} className="pointer-events-none absolute text-sm md:text-base font-semibold" style={{ left: f.x, top: f.y, color: f.color }}>{f.text}</motion.div>
                ))}
              </AnimatePresence>
            </motion.button>

            <div className="mt-3 flex items-center gap-2 text-sm text-zinc-300">
              <Zap className="w-4 h-4"/>
              <span>Klick‑Wert: <span className="font-semibold text-zinc-100">{fmt(clickValue)}</span></span>
            </div>

            <AnimatePresence>
              {buff && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} className={`mt-2 inline-flex items-center gap-2 px-2 py-1 rounded-lg text-xs ${buff.type === 'frenzy' ? 'bg-purple-600/30' : 'bg-emerald-600/30'} border border-white/10`}>
                  <span>{buff.type === 'frenzy' ? 'Frenzy x7' : 'Click‑Frenzy x50'}</span>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="mt-4 p-4 rounded-2xl bg-white/5 border border-white/10">
              <div className="flex items-center gap-2 mb-2"><BarChart2 className="w-4 h-4"/><h3 className="font-semibold">Statistiken</h3></div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>Lebenszeit‑Cookies: <span className="font-semibold">{fmt(totalCookies)}</span></div>
                <div>Klicks: <span className="font-semibold">{stats.clicks}</span></div>
                <div>Peak CPS: <span className="font-semibold">{fmt(stats.peakCps)}</span></div>
                <div>Achievements: <span className="font-semibold">{unlockedAchievements().length}/{ACHIEVEMENTS.length}</span></div>
              </div>
              <div className="h-32 mt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={cpsHistory} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <XAxis dataKey="t" hide tick={false} />
                    <YAxis hide />
                    <RTooltip formatter={(v) => fmt(v)} labelFormatter={() => "CPS"} />
                    <Line type="monotone" dataKey="cps" dot={false} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </motion.div>
        </section>

        <section className="md:col-span-1 space-y-3">
          <h2 className="flex items-center gap-2 font-semibold"><TrendingUp className="w-5 h-5"/> Produzenten</h2>
          {BASE_BUILDINGS.map((b) => {
            const owned = buildings[b.id].count;
            const cost = Math.floor(b.baseCost * Math.pow(COST_SCALE, owned));
            const special = milestoneBonus(owned);
            const prod = b.baseCps * (buildingMult[b.id] || 1) * special * globalMult * stardustMult * achievementMult;
            const t = tier(owned);
            return (
              <motion.button key={b.id} whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }} onClick={() => buyBuilding(b.id)} disabled={cookies < cost} className={`w-full text-left p-3 rounded-2xl border relative overflow-hidden ${cookies >= cost ? "bg-white/10 hover:bg-white/15 border-white/20" : "bg-white/5 border-white/10 opacity-70"}`}>
                <motion.div className="absolute -inset-0.5 opacity-20" style={{ background: `radial-gradient(60% 60% at 10% 50%, ${BUILDING_COLORS[b.id]}55, transparent)` }} animate={{ opacity: [0.1, 0.25, 0.1] }} transition={{ duration: 3 - Math.max(0, t)*0.4, repeat: Infinity }} />
                <div className="relative flex items-center gap-3">
                  <div className="text-2xl" aria-hidden>{b.emoji}</div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold">{b.name} <span className="text-xs text-zinc-400">x{owned}</span></div>
                      <div className="text-amber-300 font-semibold">{fmt(cost)}</div>
                    </div>
                    <div className="text-xs text-zinc-300">{b.desc}</div>
                    <div className="text-[11px] text-zinc-400 mt-1">+{fmt(prod)} CPS pro Einheit (mit Boni)</div>
                    {special > 1 && (
                      <div className="text-[10px] text-amber-400">Sonderbonus x{special.toFixed(1)}</div>
                    )}
                  </div>
                </div>
              </motion.button>
            );
          })}

          <div className="p-3 rounded-2xl bg-purple-500/10 border border-purple-400/20">
            <div className="flex items-center gap-2 mb-1"><Crown className="w-4 h-4 text-purple-300"/><span className="font-semibold">Ascension</span></div>
            <p className="text-sm text-zinc-300">Setzt Fortschritt zurück und verleiht <span className="text-purple-200 font-semibold">Stardust</span> (+1% dauerhaft pro Punkt). Empfohlen, wenn die Kurve flacher wird.</p>
            <div className="flex items-center gap-3 mt-2">
              <div className="text-sm text-zinc-300">Erhalt bei jetzt: <span className="text-purple-200 font-semibold">{fmt(prestigeFromCookies(totalCookies))}</span></div>
              <button onClick={doAscend} disabled={prestigeFromCookies(totalCookies) <= 0} className="ml-auto px-3 py-1 rounded-xl bg-purple-600/80 hover:bg-purple-600 disabled:opacity-50 flex items-center gap-1"><RotateCw className="w-4 h-4"/> Aufsteigen</button>
            </div>
          </div>
        </section>

        <section className="md:col-span-1 space-y-3">
          <h2 className="flex items-center gap-2 font-semibold"><Trophy className="w-5 h-5"/> Upgrades & Forschung</h2>
          <div className="p-3 rounded-2xl bg-white/5 border border-white/10">
            <div className="text-sm mb-2 text-zinc-300">Einmalige Upgrades. Jeder Kauf verändert spürbar die Produktion oder Klicks.</div>
            <div className="space-y-2 max-h-60 overflow-auto pr-1">
              {BASE_UPGRADES.map((u) => (
                <motion.button key={u.id} disabled={!canBuyUpgrade(u)} whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }} onClick={() => buyUpgrade(u)} className={`w-full text-left p-2 rounded-xl border ${canBuyUpgrade(u) ? "bg-emerald-500/10 border-emerald-400/20 hover:bg-emerald-500/20" : "bg-white/5 border-white/10 opacity-60"}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold">{u.name}</div>
                      <div className="text-xs text-zinc-300">{u.desc}</div>
                    </div>
                    <div className="text-amber-300 font-semibold">{fmt(u.cost)}</div>
                  </div>
                </motion.button>
              ))}
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-sky-500/10 border border-sky-400/20">
            <div className="flex items-center gap-2"><RefreshCw className="w-4 h-4 text-sky-200"/><div className="font-semibold">Forschung</div></div>
            <div className="text-sm text-zinc-300">Research: <span className="font-semibold text-zinc-100">{fmt(research)}</span></div>
            <div className="grid grid-cols-1 gap-2 mt-2">
              {RESEARCH_NODES.map((r) => {
                const reqOk = r.req.every((x) => ownedResearch.includes(x));
                const owned = ownedResearch.includes(r.id);
                return (
                  <motion.button key={r.id} disabled={!reqOk || owned || research < r.cost} whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }} onClick={() => buyResearch(r)} className={`w-full text-left p-2 rounded-xl border ${owned ? "bg-white/5 border-white/10" : (reqOk && research >= r.cost) ? "bg-sky-500/20 border-sky-400/30" : "bg-white/5 border-white/10 opacity-60"}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-semibold">{r.name}</div>
                        <div className="text-xs text-zinc-300">{r.desc}</div>
                        {!reqOk && <div className="text-[11px] text-zinc-400">Benötigt: {r.req.join(", ") || "—"}</div>}
                      </div>
                      <div className="text-amber-300 font-semibold">{fmt(r.cost)}</div>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-400/20">
            <div className="flex items-center gap-2"><Trophy className="w-4 h-4 text-amber-300"/><div className="font-semibold">Achievements</div></div>
            <div className="text-xs text-zinc-300">Kleine dauerhafte Boni (+1% pro Abzeichen). Spiele einfach – sie passieren nebenbei.</div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {ACHIEVEMENTS.map(a => {
                const unlocked = a.check({ stats: { clicks: stats.clicks, totalCookies, buffsTriggered: stats.buffsTriggered }, stardust, buildings });
                return (
                  <div key={a.id} className={`p-2 rounded-xl text-center text-[11px] border ${unlocked ? "bg-amber-400/20 border-amber-300/30" : "bg-white/5 border-white/10 opacity-60"}`}>{a.name}</div>
                );
              })}
            </div>
          </div>
        </section>
      </main>

      <AnimatePresence>
        {golden && (
          <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }} onClick={triggerGolden} className="fixed z-50 cursor-pointer select-none" style={{ left: `${golden.x}vw`, top: `${golden.y}vh` }}>
            <motion.div className="w-12 h-12 rounded-full bg-gradient-to-br from-yellow-200 to-yellow-500 border-2 border-yellow-700 shadow-lg flex items-center justify-center">
              <span className="text-lg">🍪</span>
            </motion.div>
            <div className="text-center text-xs text-yellow-200">Golden!</div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-black/70 border border-white/10 rounded-xl px-3 py-2 text-sm flex items-center gap-2">
            <Info className="w-4 h-4"/><div><span className="font-semibold">{toast.title}:</span> {toast.text}</div>
          </motion.div>
        )}
      </AnimatePresence>

      <footer className="max-w-7xl mx-auto p-4 text-xs text-zinc-400">
        <div className="flex items-center gap-2"><ChevronRight className="w-3 h-3"/> Tipp: Produzenten verändern nun sichtbar die Szene. Höhere Stufen = mehr Effekt. Ascension lohnt, wenn Fortschritt langsam wird.</div>
      </footer>
    </div>
  );
}
