import { useEffect, useRef, useMemo } from 'react'
import * as THREE from 'three'
import type { AvatarConfig, AvatarSoundVisualParams } from '../../types/avatar'
import { DEFAULT_SOUND_VISUAL_PARAMS } from '../../types/avatar'
import { getAvatarColors, hexToVec3 } from './avatarColors'

// Simplex-like noise function for organic movement
const NOISE_FUNCTIONS = `
  // Hash functions for pseudo-random noise
  vec3 hash3(vec3 p) {
    p = vec3(dot(p, vec3(127.1, 311.7, 74.7)),
             dot(p, vec3(269.5, 183.3, 246.1)),
             dot(p, vec3(113.5, 271.9, 124.6)));
    return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
  }
  
  // Smooth 3D noise
  float noise3(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    vec3 u = f * f * (3.0 - 2.0 * f); // smoothstep
    
    return mix(
      mix(mix(dot(hash3(i + vec3(0,0,0)), f - vec3(0,0,0)),
              dot(hash3(i + vec3(1,0,0)), f - vec3(1,0,0)), u.x),
          mix(dot(hash3(i + vec3(0,1,0)), f - vec3(0,1,0)),
              dot(hash3(i + vec3(1,1,0)), f - vec3(1,1,0)), u.x), u.y),
      mix(mix(dot(hash3(i + vec3(0,0,1)), f - vec3(0,0,1)),
              dot(hash3(i + vec3(1,0,1)), f - vec3(1,0,1)), u.x),
          mix(dot(hash3(i + vec3(0,1,1)), f - vec3(0,1,1)),
              dot(hash3(i + vec3(1,1,1)), f - vec3(1,1,1)), u.x), u.y),
      u.z
    );
  }
  
  // Fractal Brownian motion for richer noise
  float fbm(vec3 p, int octaves) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 4; i++) {
      if (i >= octaves) break;
      value += amplitude * noise3(p);
      p *= 2.0;
      amplitude *= 0.5;
    }
    return value;
  }
`

const VERTEX_SHADER = `
  attribute float size;
  attribute float phase;
  attribute float seed;
  attribute float layer; // 0=core(bass), 0.5=mid, 1=outer(highs)
  attribute vec3 color;
  
  varying float vPhase;
  varying float vSeed;
  varying float vLayer;
  varying vec3 vColor;
  varying float vEnergy;
  varying float vHeartbeat;
  varying float vEmphasis;
  
  uniform float uTime;
  uniform float uAmplitude;
  uniform float uBass;
  uniform float uMids;
  uniform float uHighs;
  uniform float uFieldScale;
  uniform float uSpeaking;
  uniform float uListening;
  uniform float uEmphasis;     // Sudden energy spikes (emphasis/excitement)
  uniform float uPauseDepth;   // Natural pauses during speech
  uniform float uEnergy;
  uniform float uCore;
  uniform float uWarmth;
  uniform float uSparkle;
  uniform vec3 uPrimary;
  uniform vec3 uSecondary;
  uniform vec3 uAccent;
  
  ${NOISE_FUNCTIONS}
  
  void main() {
    // Sound → visual: scale each parameter by its slider
    float amp = uAmplitude * uEnergy;
    float b = uBass * uCore;
    float m = uMids * uWarmth;
    float h = uHighs * uSparkle;
    
    // === RANDOM CHAOS on each parameter (relational, not static) ===
    vec3 chaosSeed = position + vec3(seed * 13.0, phase * 7.0, uTime * 0.5);
    amp *= 1.0 + noise3(chaosSeed) * 0.14;
    b *= 1.0 + noise3(chaosSeed + vec3(31.0, 17.0, 0.0)) * 0.12;
    m *= 1.0 + noise3(chaosSeed + vec3(0.0, 23.0, 11.0)) * 0.12;
    h *= 1.0 + noise3(chaosSeed + vec3(19.0, 0.0, 7.0)) * 0.14;
    
    vPhase = phase;
    vSeed = seed;
    vLayer = layer;
    
    vec3 pos = position;
    float radius = length(position);
    vec3 radialDir = normalize(position + vec3(0.001));
    
    // === CIRCULAR / ORBITAL VELOCITY - things rotate ===
    // Angular speed varies by layer and has chaotic phase
    float orbitSpeed = 0.12 + layer * 0.08 + noise3(vec3(seed, uTime * 0.05, 0.0)) * 0.04;
    float orbitAngle = uTime * orbitSpeed + phase * 6.28 + fbm(position * 0.8 + uTime * 0.1, 2) * 1.5;
    float c = cos(orbitAngle);
    float s = sin(orbitAngle);
    // Rotate in xy (orbit around z)
    vec3 posXY = vec3(pos.x * c - pos.y * s, pos.x * s + pos.y * c, pos.z);
    // Secondary tilt rotation (xz) for 3D feel
    float tiltAngle = uTime * 0.07 + phase * 2.0 + noise3(vec3(seed * 2.0, 0.0, uTime * 0.08)) * 0.8;
    float ct = cos(tiltAngle);
    float st = sin(tiltAngle);
    pos = vec3(posXY.x * ct - posXY.z * st, posXY.y, posXY.x * st + posXY.z * ct);
    radialDir = normalize(pos + vec3(0.001));
    
    // Each particle has a unique "personality" affecting its behavior
    float personality = fract(seed * 127.1 + phase * 311.7);
    float laziness = personality * 0.3; // some particles are slower to react
    float nervousness = fract(seed * 269.5) * 0.4; // some jitter more
    
    // === HEARTBEAT - constant life pulse in the core ===
    // Double-beat like a real heart: lub-dub... lub-dub...
    float heartPhase = mod(uTime * 0.8, 1.0);
    float lub = smoothstep(0.0, 0.1, heartPhase) * smoothstep(0.2, 0.1, heartPhase);
    float dub = smoothstep(0.25, 0.35, heartPhase) * smoothstep(0.45, 0.35, heartPhase);
    float heartbeat = (lub + dub * 0.7) * (1.0 - layer) * 0.025;
    vHeartbeat = lub + dub * 0.7;
    
    // === FREQUENCY-LAYERED RESPONSE ===
    float bassResponse = smoothstep(0.0, 0.4, 1.0 - layer);
    float midsResponse = 1.0 - abs(layer - 0.5) * 2.0;
    float highsResponse = smoothstep(0.0, 0.4, layer);
    
    float layerAudio = b * bassResponse * 1.2 + 
                       m * midsResponse * 0.8 + 
                       h * highsResponse * 0.6;
    
    // === "LOOKING AROUND" - curiosity/awareness ===
    // The whole mass shifts subtly like it's aware of surroundings
    float lookTime = uTime * 0.08;
    vec3 lookDir = vec3(
      fbm(vec3(lookTime, 0.0, 0.0), 2),
      fbm(vec3(0.0, lookTime * 0.7, 0.0), 2),
      fbm(vec3(0.0, 0.0, lookTime * 0.5), 2)
    ) * 0.06;
    // Particles follow the "gaze" with slight delay based on distance from center
    float followDelay = layer * 0.3 + laziness;
    vec3 lookOffset = lookDir * (1.0 - followDelay);
    
    // === ORGANIC BREATHING ===
    // Irregular, asymmetric breathing
    float breatheBase = sin(uTime * 0.35) * 0.5 + 0.5;
    float breatheVariance = noise3(vec3(uTime * 0.2, 0.0, 0.0)) * 0.3;
    float breathe = breatheBase + breatheVariance;
    breathe = breathe * breathe * 0.035; // ease curve
    // Asymmetric - slightly different on each axis
    vec3 breatheDir = radialDir * breathe;
    breatheDir.y *= 1.0 + noise3(vec3(uTime * 0.15, seed, 0.0)) * 0.2;
    
    // === MICRO-TREMORS - constant tiny life vibrations ===
    vec3 noiseCoord = position * 3.0 + vec3(seed * 10.0);
    float tremorSpeed = 4.0 + nervousness * 8.0;
    vec3 tremor = vec3(
      noise3(noiseCoord + uTime * tremorSpeed),
      noise3(noiseCoord + uTime * tremorSpeed + 50.0),
      noise3(noiseCoord + uTime * tremorSpeed + 100.0)
    ) * 0.008 * (1.0 + nervousness);
    
    // === ORGANIC DRIFT ===
    float slowTime = uTime * 0.12;
    float drift1 = fbm(noiseCoord * 0.5 + vec3(slowTime, 0.0, 0.0), 3);
    float drift2 = fbm(noiseCoord * 0.5 + vec3(0.0, slowTime * 0.7, slowTime * 0.3), 3);
    float drift3 = fbm(noiseCoord * 0.5 + vec3(slowTime * 0.5, slowTime * 0.8, 0.0), 2);
    vec3 organicDrift = vec3(drift1, drift2, drift3) * 0.06;
    
    // Reduce idle motion when audio active
    float activity = amp + layerAudio * 0.5 + uSpeaking * 0.5;
    float idleFactor = max(0.1, 1.0 - activity * 0.8);
    organicDrift *= idleFactor;
    tremor *= 0.5 + idleFactor * 0.5;
    
    // === AUDIO RESPONSE with anticipation ===
    // Slight "intake" before expanding (anticipation)
    float anticipation = smoothstep(0.0, 0.15, amp) * 0.02;
    
    // Layer-specific audio expansion
    float audioExpand = layerAudio * 0.25 * (1.0 - laziness * 0.5);
    float bassPulse = b * bassResponse * 0.12;
    float midWarmth = m * midsResponse * 0.08;
    
    // Highs sparkle - fast, nervous jitter on outer particles
    float highSparkle = h * highsResponse * 0.06;
    vec3 sparkleOffset = vec3(
      noise3(noiseCoord * 6.0 + uTime * 12.0),
      noise3(noiseCoord * 6.0 + uTime * 12.0 + 100.0),
      noise3(noiseCoord * 6.0 + uTime * 12.0 + 200.0)
    ) * highSparkle;
    
    // === SPEAKING - expressive, outward energy ===
    float speakEnergy = uSpeaking * (0.1 + amp * 0.12);
    float speakSwirl = uSpeaking * amp * 0.08;
    float swirlAngle = uTime * 1.8 + phase * 6.28 + layer * 2.5;
    vec3 swirlOffset = vec3(
      sin(swirlAngle) * speakSwirl,
      cos(swirlAngle) * speakSwirl * 0.5,
      sin(swirlAngle * 0.6) * speakSwirl * 0.25
    );
    
    // === EMPHASIS - sudden energy bursts (important words, excitement) ===
    // Emphasis causes a quick radial burst, especially in outer particles
    float emphasisBurst = uEmphasis * (0.5 + layer * 0.5) * 0.15;
    vec3 emphasisDir = radialDir * emphasisBurst;
    // Also adds a quick "sparkle" jitter on emphasis
    float emphasisJitter = uEmphasis * 0.04 * layer;
    vec3 emphasisSparkle = vec3(
      noise3(noiseCoord * 10.0 + uTime * 20.0),
      noise3(noiseCoord * 10.0 + uTime * 20.0 + 100.0),
      noise3(noiseCoord * 10.0 + uTime * 20.0 + 200.0)
    ) * emphasisJitter;
    vEmphasis = uEmphasis;
    
    // === PAUSE - natural settling during speech pauses ===
    // During pauses, the avatar settles slightly inward and calms
    float pauseSettle = uPauseDepth * 0.06;
    vec3 pauseInward = -radialDir * pauseSettle * (0.3 + layer * 0.7);
    // Reduce tremor/sparkle during pauses (calming)
    float pauseCalm = 1.0 - uPauseDepth * 0.6;
    tremor *= pauseCalm;
    sparkleOffset *= pauseCalm;
    
    // === LISTENING - attentive, focused ===
    float listenFocus = uListening * 0.1;
    float listenAlert = uListening * amp * 0.06;
    // Slight lean toward "sound source" when listening
    vec3 listenLean = vec3(0.0, 0.02, 0.03) * uListening * (1.0 - layer * 0.5);
    
    // === COMBINE ALL MOVEMENT ===
    float scale = uFieldScale + heartbeat - anticipation;
    pos *= scale;
    pos += breatheDir;
    pos += lookOffset;
    pos += organicDrift;
    pos += tremor;
    pos += radialDir * (audioExpand + bassPulse + midWarmth - listenFocus + listenAlert);
    pos += sparkleOffset;
    pos += swirlOffset * (1.0 - layer * 0.4);
    pos += listenLean;
    pos += emphasisDir;      // Emphasis burst
    pos += emphasisSparkle;  // Emphasis jitter
    pos += pauseInward;      // Pause settling
    pos *= 1.0 + speakEnergy;
    
    // === ASYMMETRY - break perfect sphere ===
    // Slight vertical stretch, horizontal squash
    pos.y *= 1.0 + noise3(vec3(uTime * 0.1, 0.0, 0.0)) * 0.03;
    pos.x *= 1.0 - noise3(vec3(0.0, uTime * 0.08, 0.0)) * 0.02;
    
    // === COLOR ===
    vec3 layerColor = mix(mix(uPrimary, uSecondary, layer), uAccent, layer * layer * 0.4);
    float colorEnergy = amp * 0.3 + layerAudio * 0.25 + uSpeaking * 0.15;
    vColor = mix(color, layerColor, 0.25 + colorEnergy * 0.35);
    vEnergy = activity;
    
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    
    // === SIZE - small particles, heart, audio + RELATIONAL RANDOM CHAOS ===
    float layerSize = 1.0 - layer * 0.15;
    float heartSize = vHeartbeat * (1.0 - layer) * 0.06;
    float audioSize = amp * 0.12 + layerAudio * 0.1 + uSpeaking * 0.08;
    audioSize = min(audioSize, 0.28);
    // Relational size chaos: spatially coherent (nearby particles similar) + time
    float sizeChaos = fbm(pos * 2.0 + vec3(uTime * 0.2, seed * 0.5, 0.0), 2);
    sizeChaos = 1.0 + sizeChaos * 0.22;
    // Per-particle micro chaos (independent flicker)
    float microChaos = 1.0 + noise3(vec3(uTime * 8.0 + seed * 100.0, phase * 50.0, 0.0)) * 0.12;
    gl_PointSize = size * layerSize * (1.0 + audioSize + heartSize) * sizeChaos * microChaos * (72.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`

const FRAGMENT_SHADER = `
  varying float vPhase;
  varying float vSeed;
  varying float vLayer;
  varying vec3 vColor;
  varying float vEnergy;
  varying float vHeartbeat;
  varying float vEmphasis;
  
  uniform float uTime;
  uniform float uAmplitude;
  uniform float uBass;
  uniform float uMids;
  uniform float uHighs;
  uniform float uEnergy;
  uniform float uCore;
  uniform float uWarmth;
  uniform float uSparkle;
  uniform float uListening;
  uniform float uSpeaking;
  uniform float uEmphasis;
  uniform float uPauseDepth;
  
  ${NOISE_FUNCTIONS}
  
  void main() {
    float b = uBass * uCore;
    float h = uHighs * uSparkle;
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c) * 2.0;
    
    // Soft particle with organic edge
    float edgeNoise = noise3(vec3(c * 8.0, uTime * 0.5 + vSeed * 10.0)) * 0.1;
    float a = 1.0 - smoothstep(0.0, 0.75 + edgeNoise, d);
    
    // Soft glow halo
    float glow = exp(-d * d * 2.5) * 0.25;
    a += glow;
    
    // === ORGANIC PULSE - slightly irregular ===
    float pulseSpeed = 0.4 + vLayer * 0.2;
    float pulseNoise = noise3(vec3(uTime * 0.3, vSeed * 5.0, 0.0)) * 0.15;
    float pulse = 0.75 + 0.25 * sin(uTime * pulseSpeed + vPhase * 6.28 + pulseNoise);
    
    // === HEARTBEAT GLOW in core ===
    float heartGlow = vHeartbeat * (1.0 - vLayer) * 0.35;
    
    // === FREQUENCY RESPONSE ===
    float bassPulse = b * (1.0 - vLayer) * 0.3;
    // Highs flicker with irregular rhythm
    float flickerNoise = noise3(vec3(uTime * 20.0, vSeed * 50.0, 0.0));
    float highFlicker = h * vLayer * 0.25 * (0.5 + flickerNoise * 0.5);
    
    float brightness = pulse + heartGlow + bassPulse + highFlicker + vEnergy * 0.3;
    a *= brightness;
    
    // === LISTENING - anticipatory glow ===
    if (uListening > 0.1) {
      float listenGlow = uListening * 0.25 * (1.0 - vLayer * 0.5);
      a *= 1.0 + listenGlow;
    }
    
    // === COLOR DYNAMICS ===
    vec3 col = vColor;
    
    // Heartbeat adds warmth to core
    vec3 heartWarm = vec3(1.0, 0.95, 0.9);
    col = mix(col, col * heartWarm, vHeartbeat * (1.0 - vLayer) * 0.2);
    
    // Speaking adds energy/warmth
    if (uSpeaking > 0.1) {
      vec3 speakWarm = vec3(1.0, 0.92, 0.8);
      col = mix(col, col * speakWarm, uSpeaking * (1.0 - vLayer) * 0.25);
    }
    
    // === EMPHASIS - bright flash on important words ===
    if (vEmphasis > 0.1) {
      // Emphasis creates a brief bright flash, especially in outer particles
      float emphasisGlow = vEmphasis * (0.3 + vLayer * 0.4);
      // White-gold flash for emphasis
      vec3 emphasisColor = vec3(1.0, 0.98, 0.9);
      col = mix(col, emphasisColor, emphasisGlow * 0.5);
      a *= 1.0 + emphasisGlow * 0.3;
    }
    
    // === PAUSE - softer, contemplative during pauses ===
    if (uPauseDepth > 0.1) {
      // Pauses make the avatar softer, more introspective
      float pauseSoften = uPauseDepth * 0.25;
      // Slightly desaturate and cool during pauses
      float gray = (col.r + col.g + col.b) / 3.0;
      col = mix(col, vec3(gray * 0.95, gray, gray * 1.05), pauseSoften);
      a *= 1.0 - pauseSoften * 0.2;
    }
    
    // High energy creates bright core
    if (vEnergy > 0.4) {
      float coreIntensity = (vEnergy - 0.4) * 0.4 * (1.0 - d);
      col = mix(col, vec3(1.0), coreIntensity);
    }
    
    // Subtle color variation based on audio
    float colorShift = noise3(vec3(uTime * 0.5, vSeed * 3.0, vLayer)) * 0.08;
    col *= 1.0 + colorShift * vEnergy;
    
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  }
`

export interface AvatarCanvasProps {
  config: AvatarConfig
  /** 0–1 from audio analyzer */
  amplitude: number
  bass: number
  mids: number
  highs: number
  /** AI is speaking (TTS) */
  speaking: boolean
  /** User is speaking (mic) */
  listening: boolean
  /** Override avatar audio sensitivity (0.5–2, multiplies config.audioSensitivity) */
  audioSensitivityOverride?: number
  /** Sound → visual: energy, core, warmth, sparkle, settle */
  soundVisualParams?: AvatarSoundVisualParams
  /** Transparent background */
  transparent?: boolean
  className?: string
  width?: number
  height?: number
}

export function AvatarCanvas({
  config,
  amplitude,
  bass,
  mids,
  highs,
  speaking,
  listening,
  audioSensitivityOverride,
  soundVisualParams: soundVisualParamsProp,
  transparent = false,
  className = '',
  width = 256,
  height = 256,
}: AvatarCanvasProps) {
  const soundVisualParams = soundVisualParamsProp ?? DEFAULT_SOUND_VISUAL_PARAMS
  const soundVisualParamsRef = useRef(soundVisualParams)
  soundVisualParamsRef.current = soundVisualParams

  const containerRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const pointsRef = useRef<THREE.Points | null>(null)
  const materialRef = useRef<THREE.ShaderMaterial | null>(null)
  const frameRef = useRef<number>(0)
  const timeRef = useRef(0)
  
  // Smoothed audio values for graceful transitions
  const smoothedRef = useRef({
    amplitude: 0,
    bass: 0,
    mids: 0,
    highs: 0,
    speaking: 0,
    listening: 0,
    emphasis: 0,      // Rate of change detection - sudden increases = emphasis
    pauseDepth: 0,    // How deep into a pause (audio dip) we are
  })
  // Target values (set by props)
  const targetRef = useRef({
    amplitude: 0,
    bass: 0,
    mids: 0,
    highs: 0,
    speaking: 0,
    listening: 0,
  })
  // History for rate-of-change detection
  const historyRef = useRef({
    prevAmplitude: 0,
    prevBass: 0,
    emphasisDecay: 0,
    pauseFrames: 0,    // How many frames amplitude has been low
  })
  const settleSpeedRef = useRef(1.0)

  const colors = useMemo(() => getAvatarColors(config.colorScheme), [config.colorScheme])
  const primaryVec = useMemo(() => hexToVec3(colors.primary), [colors.primary])
  const secondaryVec = useMemo(() => hexToVec3(colors.secondary), [colors.secondary])
  const accentVec = useMemo(() => hexToVec3(colors.accent), [colors.accent])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const scene = new THREE.Scene()
    scene.background = transparent ? null : new THREE.Color(0x050505)
    sceneRef.current = scene

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100)
    camera.position.z = 2.8
    cameraRef.current = camera

    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true })
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
    renderer.setClearColor(0x050505, transparent ? 0 : 1)
    container.appendChild(renderer.domElement)
    rendererRef.current = renderer

    const n = config.particleCount
    const positions = new Float32Array(n * 3)
    const sizes = new Float32Array(n)
    const phases = new Float32Array(n)
    const seeds = new Float32Array(n)
    const layers = new Float32Array(n) // 0=core(bass), 0.5=mid, 1=outer(highs)
    const colorAttrib = new Float32Array(n * 3)

    const spread = config.fieldScale * 0.9
    for (let i = 0; i < n; i++) {
      const i3 = i * 3
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      // Normalized radius 0-1, with bias toward outer
      const normalizedR = Math.pow(Math.random(), 0.5)
      const r = spread * (0.2 + 0.8 * normalizedR)
      
      positions[i3] = r * Math.sin(phi) * Math.cos(theta)
      positions[i3 + 1] = r * Math.sin(phi) * Math.sin(theta)
      positions[i3 + 2] = r * Math.cos(phi) * 0.5
      
      phases[i] = Math.random()
      seeds[i] = Math.random()
      
      // Layer based on normalized radius: core=bass, mid=mids, outer=highs
      layers[i] = normalizedR
      
      // Size varies by layer - core particles slightly bigger; keep small so heart reads
      const layerSizeFactor = 1.0 - normalizedR * 0.2
      sizes[i] = (0.5 + Math.random() * 0.6) * layerSizeFactor
      
      // Color gradient: primary(core) -> secondary(mid) -> accent(outer)
      const colorMix = normalizedR
      if (colorMix < 0.5) {
        const t = colorMix * 2.0
        colorAttrib[i3] = primaryVec[0] * (1 - t) + secondaryVec[0] * t
        colorAttrib[i3 + 1] = primaryVec[1] * (1 - t) + secondaryVec[1] * t
        colorAttrib[i3 + 2] = primaryVec[2] * (1 - t) + secondaryVec[2] * t
      } else {
        const t = (colorMix - 0.5) * 2.0
        colorAttrib[i3] = secondaryVec[0] * (1 - t) + accentVec[0] * t
        colorAttrib[i3 + 1] = secondaryVec[1] * (1 - t) + accentVec[1] * t
        colorAttrib[i3 + 2] = secondaryVec[2] * (1 - t) + accentVec[2] * t
      }
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1))
    geometry.setAttribute('phase', new THREE.BufferAttribute(phases, 1))
    geometry.setAttribute('seed', new THREE.BufferAttribute(seeds, 1))
    geometry.setAttribute('layer', new THREE.BufferAttribute(layers, 1))
    geometry.setAttribute('color', new THREE.BufferAttribute(colorAttrib, 3))

    const material = new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uAmplitude: { value: 0 },
        uBass: { value: 0 },
        uMids: { value: 0 },
        uHighs: { value: 0 },
        uFieldScale: { value: config.fieldScale },
        uSpeaking: { value: 0 },
        uListening: { value: 0 },
        uEmphasis: { value: 0 },     // Sudden energy increases (emphasis/excitement)
        uPauseDepth: { value: 0 },   // How deep in a pause (natural settling)
        uPrimary: { value: new THREE.Vector3(...primaryVec) },
        uSecondary: { value: new THREE.Vector3(...secondaryVec) },
        uAccent: { value: new THREE.Vector3(...accentVec) },
        uEnergy: { value: 1 },
        uCore: { value: 1 },
        uWarmth: { value: 1 },
        uSparkle: { value: 1 },
      },
    })
    materialRef.current = material

    const points = new THREE.Points(geometry, material)
    scene.add(points)
    pointsRef.current = points

    let animating = true
    const loop = () => {
      if (!animating || !rendererRef.current || !sceneRef.current || !cameraRef.current || !materialRef.current) return
      timeRef.current += 0.016
      
      // Smooth lerp toward target values
      const s = smoothedRef.current
      const t = targetRef.current
      const h = historyRef.current
      const attackSpeed = 0.18
      const releaseSpeed = 0.035 * settleSpeedRef.current
      
      const lerp = (current: number, target: number) => {
        const speed = target > current ? attackSpeed : releaseSpeed
        return current + (target - current) * speed
      }
      
      // === EMPHASIS DETECTION: Rate of change in amplitude ===
      // When amplitude suddenly increases, that's emphasis (important word, excitement)
      const ampDelta = t.amplitude - h.prevAmplitude
      const bassDelta = t.bass - h.prevBass
      
      if (ampDelta > 0.08 || bassDelta > 0.1) {
        // Sudden increase = emphasis moment
        h.emphasisDecay = Math.min(1.0, h.emphasisDecay + ampDelta * 3 + bassDelta * 2)
      } else {
        // Decay emphasis over time
        h.emphasisDecay = Math.max(0, h.emphasisDecay - 0.03)
      }
      
      // === PAUSE DETECTION: Consecutive low-amplitude frames while speaking ===
      const isSpeakingLow = t.speaking > 0.5 && t.amplitude < 0.1
      if (isSpeakingLow) {
        h.pauseFrames = Math.min(60, h.pauseFrames + 1) // Cap at ~1 second
      } else {
        h.pauseFrames = Math.max(0, h.pauseFrames - 3) // Quick recovery from pause
      }
      const pauseDepthTarget = h.pauseFrames > 5 ? Math.min(1, (h.pauseFrames - 5) / 30) : 0
      
      // Store current values for next frame's delta calculation
      h.prevAmplitude = t.amplitude
      h.prevBass = t.bass
      
      s.amplitude = lerp(s.amplitude, t.amplitude)
      s.bass = lerp(s.bass, t.bass)
      s.mids = lerp(s.mids, t.mids)
      s.highs = lerp(s.highs, t.highs)
      s.speaking = lerp(s.speaking, t.speaking)
      s.listening = lerp(s.listening, t.listening)
      s.emphasis = lerp(s.emphasis, h.emphasisDecay)
      s.pauseDepth = lerp(s.pauseDepth, pauseDepthTarget)
      
      // Apply smoothed values to uniforms
      const mat = materialRef.current
      const params = soundVisualParamsRef.current
      mat.uniforms.uTime.value = timeRef.current
      mat.uniforms.uAmplitude.value = s.amplitude
      mat.uniforms.uBass.value = s.bass
      mat.uniforms.uMids.value = s.mids
      mat.uniforms.uHighs.value = s.highs
      mat.uniforms.uSpeaking.value = s.speaking
      mat.uniforms.uListening.value = s.listening
      mat.uniforms.uEmphasis.value = s.emphasis
      mat.uniforms.uPauseDepth.value = s.pauseDepth
      // Apply sound→visual params every frame so sliders always take effect
      mat.uniforms.uEnergy.value = params.energy
      mat.uniforms.uCore.value = params.core
      mat.uniforms.uWarmth.value = params.warmth
      mat.uniforms.uSparkle.value = params.sparkle
      settleSpeedRef.current = params.settle
      
      rendererRef.current.render(sceneRef.current, cameraRef.current)
      frameRef.current = requestAnimationFrame(loop)
    }
    frameRef.current = requestAnimationFrame(loop)

    return () => {
      animating = false
      cancelAnimationFrame(frameRef.current)
      geometry.dispose()
      material.dispose()
      renderer.dispose()
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement)
      sceneRef.current = null
      cameraRef.current = null
      rendererRef.current = null
      pointsRef.current = null
      materialRef.current = null
    }
  }, [config.id, config.particleCount, config.fieldScale, config.audioSensitivity, config.colorScheme, primaryVec, secondaryVec, accentVec, width, height, transparent])

  // Update target values (smoothed audio) and field scale
  useEffect(() => {
    const sens = config.audioSensitivity * (audioSensitivityOverride ?? 1)
    targetRef.current.amplitude = amplitude * sens
    targetRef.current.bass = bass * sens
    targetRef.current.mids = mids * sens
    targetRef.current.highs = highs * sens
    targetRef.current.speaking = speaking ? 1.0 : 0
    targetRef.current.listening = listening ? 1.0 : 0

    const mat = materialRef.current
    if (mat) mat.uniforms.uFieldScale.value = config.fieldScale
  }, [amplitude, bass, mids, highs, speaking, listening, config.audioSensitivity, config.fieldScale, audioSensitivityOverride])

  return <div ref={containerRef} className={className} style={{ width, height }} />
}
