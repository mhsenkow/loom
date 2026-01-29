# WPF Design Tokens - Loom Terminal Theme

This document provides all design tokens needed to recreate the Loom terminal aesthetic in WPF. The design system supports 5 distinct retro CRT terminal themes.

## Core Design Principles

- **Zero border radius** - All elements use sharp, rectangular corners (0px)
- **Block shadows** - Retro 3D effect using offset box shadows
- **CRT effects** - Scanlines, vignette, and subtle flicker animations
- **Monospace typography** - Theme-specific monospace fonts
- **High contrast** - Dark backgrounds with bright phosphor colors

---

## Color Tokens

### Theme Structure
Each theme defines the following color variables. In WPF, these should be implemented as `ResourceDictionary` entries or theme-specific `StaticResource` bindings.

### 1. Phosphor Theme (Default)
*DEC VT100, early PC. American/European green.*

```xml
<!-- Background Colors -->
<Color x:Key="ThemeVoid">#050505</Color>
<Color x:Key="ThemeSlate">#0a0f14</Color>

<!-- Primary Accent (Phosphor Green) -->
<Color x:Key="ThemePhosphor">#33ff00</Color>
<Color x:Key="ThemePhosphorDim">#1a8000</Color>
<Color x:Key="ThemePhosphorGlow">#33ff0050</Color> <!-- 50% opacity -->

<!-- Terminal UI Colors -->
<Color x:Key="ThemeTerminalGray">#3a3a3a</Color>
<Color x:Key="ThemeTerminalMuted">#666666</Color>
<Color x:Key="ThemeTerminalBorder">#2a2a2a</Color>

<!-- CRT Effect Values -->
<double x:Key="ThemeScanline">0.15</double>
<double x:Key="ThemeVignette">0.4</double>
<double x:Key="ThemeCurve">0.98</double>
```

### 2. Ruby Theme
*Soviet / Eastern bloc. ES EVM, SM 1420, warm amber.*

```xml
<Color x:Key="ThemeVoid">#0c0505</Color>
<Color x:Key="ThemeSlate">#140a0a</Color>
<Color x:Key="ThemePhosphor">#e85c20</Color>
<Color x:Key="ThemePhosphorDim">#8b3d18</Color>
<Color x:Key="ThemePhosphorGlow">#e85c2050</Color>
<Color x:Key="ThemeTerminalGray">#4a3028</Color>
<Color x:Key="ThemeTerminalMuted">#886650</Color>
<Color x:Key="ThemeTerminalBorder">#2a1814</Color>
<double x:Key="ThemeScanline">0.18</double>
<double x:Key="ThemeVignette">0.5</double>
<double x:Key="ThemeCurve">0.97</double>
```

### 3. Sapphire Theme
*IBM 3270, Fujitsu, NEC. IBM Plex Mono, rock-steady.*

```xml
<Color x:Key="ThemeVoid">#05050c</Color>
<Color x:Key="ThemeSlate">#0a0c18</Color>
<Color x:Key="ThemePhosphor">#3d8cff</Color>
<Color x:Key="ThemePhosphorDim">#1e4080</Color>
<Color x:Key="ThemePhosphorGlow">#3d8cff50</Color>
<Color x:Key="ThemeTerminalGray">#2a304a</Color>
<Color x:Key="ThemeTerminalMuted">#506088</Color>
<Color x:Key="ThemeTerminalBorder">#141a2a</Color>
<double x:Key="ThemeScanline">0.14</double>
<double x:Key="ThemeVignette">0.4</double>
<double x:Key="ThemeCurve">0.98</double>
```

### 4. Diamond Theme
*Medical, SGI. Fira Code, circular LEDs, light breath.*

```xml
<Color x:Key="ThemeVoid">#08080a</Color>
<Color x:Key="ThemeSlate">#0c0e12</Color>
<Color x:Key="ThemePhosphor">#b8ccf0</Color>
<Color x:Key="ThemePhosphorDim">#6a7a9a</Color>
<Color x:Key="ThemePhosphorGlow">#b8ccf050</Color>
<Color x:Key="ThemeTerminalGray">#3a3e48</Color>
<Color x:Key="ThemeTerminalMuted">#7a8290</Color>
<Color x:Key="ThemeTerminalBorder">#1a1e24</Color>
<double x:Key="ThemeScanline">0.10</double>
<double x:Key="ThemeVignette">0.3</double>
<double x:Key="ThemeCurve">0.99</double>
```

### 5. Ebony Theme
*Apple II, NeXT. Cutive Mono (typewriter), soft pulse.*

```xml
<Color x:Key="ThemeVoid">#0a0a08</Color>
<Color x:Key="ThemeSlate">#121210</Color>
<Color x:Key="ThemePhosphor">#d8d4c8</Color>
<Color x:Key="ThemePhosphorDim">#8a8678</Color>
<Color x:Key="ThemePhosphorGlow">#d8d4c850</Color>
<Color x:Key="ThemeTerminalGray">#3a3a34</Color>
<Color x:Key="ThemeTerminalMuted">#767268</Color>
<Color x:Key="ThemeTerminalBorder">#242420</Color>
<double x:Key="ThemeScanline">0.12</double>
<double x:Key="ThemeVignette">0.35</double>
<double x:Key="ThemeCurve">0.99</double>
```

### Status Colors (Theme-Independent)
```xml
<Color x:Key="LedRunning">#ffb000</Color>
<Color x:Key="LedRunningBorder">#cc8800</Color>
<Color x:Key="LedError">#ff3333</Color>
<Color x:Key="LedErrorBorder">#cc0000</Color>
```

---

## Typography Tokens

### Font Families (Per Theme)

```xml
<!-- Phosphor -->
<FontFamily x:Key="ThemeFont">JetBrains Mono, Consolas</FontFamily>
<string x:Key="ThemeFontPrimary">JetBrains Mono</string>

<!-- Ruby -->
<FontFamily x:Key="ThemeFont">Share Tech Mono, Consolas</FontFamily>
<string x:Key="ThemeFontPrimary">Share Tech Mono</string>

<!-- Sapphire -->
<FontFamily x:Key="ThemeFont">IBM Plex Mono, Consolas</FontFamily>
<string x:Key="ThemeFontPrimary">IBM Plex Mono</string>

<!-- Diamond -->
<FontFamily x:Key="ThemeFont">Fira Code, Consolas</FontFamily>
<string x:Key="ThemeFontPrimary">Fira Code</string>

<!-- Ebony -->
<FontFamily x:Key="ThemeFont">Cutive Mono, Consolas</FontFamily>
<string x:Key="ThemeFontPrimary">Cutive Mono</string>
```

### Font Sizes
```xml
<sys:Double x:Key="FontSizeXS">10px</sys:Double>
<sys:Double x:Key="FontSizeSM">12px</sys:Double>
<sys:Double x:Key="FontSizeBase">14px</sys:Double>
<sys:Double x:Key="FontSizeLG">16px</sys:Double>
```

### Font Weights
```xml
<FontWeight x:Key="FontWeightNormal">Normal</FontWeight>
<FontWeight x:Key="FontWeightBold">Bold</FontWeight>
```

### Letter Spacing
```xml
<!-- For uppercase labels/headers -->
<Thickness x:Key="LetterSpacingWide">0,0,0,0.1em</Thickness> <!-- tracking-wider equivalent -->
```

### Prompt Characters (Per Theme)
```xml
<!-- Phosphor -->
<string x:Key="ThemePrompt">></string>

<!-- Ruby -->
<string x:Key="ThemePrompt">►</string>

<!-- Sapphire -->
<string x:Key="ThemePrompt">▷</string>

<!-- Diamond -->
<string x:Key="ThemePrompt">▸</string>

<!-- Ebony -->
<string x:Key="ThemePrompt">›</string>
```

---

## Spacing & Sizing Tokens

### Border Radius
```xml
<!-- CRITICAL: All elements use 0px border radius -->
<CornerRadius x:Key="BorderRadiusNone">0</CornerRadius>
```

### Component Sizes

```xml
<!-- Scrollbar -->
<sys:Double x:Key="ScrollbarWidth">8</sys:Double>
<sys:Double x:Key="ScrollbarHeight">8</sys:Double>

<!-- LED Indicator -->
<sys:Double x:Key="LedSize">8</sys:Double>
<sys:Double x:Key="LedBorderWidth">1</sys:Double>

<!-- Port/Handle (Circuit Board) -->
<sys:Double x:Key="PortSize">12</sys:Double>
<sys:Double x:Key="PortSizeSmall">3</sys:Double> <!-- 3x3 in CSS = 12px -->

<!-- Terminal Cursor -->
<sys:Double x:Key="CursorWidth">10</sys:Double>
<sys:Double x:Key="CursorHeight">1.2em</sys:Double>
```

### Padding & Margins
```xml
<!-- Button Padding -->
<Thickness x:Key="ButtonPadding">16,8,16,8</Thickness> <!-- px-4 py-2 -->

<!-- Module Chip Header -->
<Thickness x:Key="ChipHeaderPadding">12,4,12,4</Thickness> <!-- px-3 py-1 -->

<!-- Modal Padding -->
<Thickness x:Key="ModalPadding">24,24,24,24</Thickness> <!-- p-6 -->
<Thickness x:Key="ModalHeaderPadding">16,8,16,8</Thickness> <!-- px-4 py-2 -->
```

### Border Widths
```xml
<sys:Double x:Key="BorderWidthThin">1</sys:Double>
<sys:Double x:Key="BorderWidthMedium">2</sys:Double>
```

---

## Shadow & Effect Tokens

### Box Shadows

```xml
<!-- Glow Effects -->
<DropShadowEffect x:Key="ShadowGlow">
  <DropShadowEffect.Color>{StaticResource ThemePhosphor}</DropShadowEffect.Color>
  <DropShadowEffect.BlurRadius>10</DropShadowEffect.BlurRadius>
  <DropShadowEffect.ShadowDepth>0</DropShadowEffect.ShadowDepth>
  <DropShadowEffect.Opacity>1.0</DropShadowEffect.Opacity>
</DropShadowEffect>

<DropShadowEffect x:Key="ShadowGlowSmall">
  <DropShadowEffect.Color>{StaticResource ThemePhosphor}</DropShadowEffect.Color>
  <DropShadowEffect.BlurRadius>5</DropShadowEffect.BlurRadius>
  <DropShadowEffect.ShadowDepth>0</DropShadowEffect.ShadowDepth>
</DropShadowEffect>

<!-- Block Shadow (Retro 3D Effect) -->
<!-- WPF doesn't support offset shadows directly, use Border or custom effect -->
<!-- CSS: 4px 4px 0 var(--theme-phosphor) -->
<Thickness x:Key="BlockShadowOffset">4,4,0,0</Thickness>

<DropShadowEffect x:Key="ShadowBlock">
  <DropShadowEffect.Color>{StaticResource ThemePhosphor}</DropShadowEffect.Color>
  <DropShadowEffect.BlurRadius>0</DropShadowEffect.BlurRadius>
  <DropShadowEffect.ShadowDepth>0</DropShadowEffect.ShadowDepth>
  <DropShadowEffect.Direction>135</DropShadowEffect.Direction>
  <DropShadowEffect.Opacity>1.0</DropShadowEffect.Opacity>
</DropShadowEffect>

<DropShadowEffect x:Key="ShadowBlockSmall">
  <!-- 2px 2px 0 -->
  <DropShadowEffect.Color>{StaticResource ThemePhosphor}</DropShadowEffect.Color>
  <DropShadowEffect.BlurRadius>0</DropShadowEffect.BlurRadius>
  <DropShadowEffect.ShadowDepth>0</DropShadowEffect.ShadowDepth>
  <DropShadowEffect.Direction>135</DropShadowEffect.Direction>
</DropShadowEffect>

<!-- LED Glow -->
<DropShadowEffect x:Key="ShadowLedGlow">
  <DropShadowEffect.Color>{StaticResource ThemePhosphor}</DropShadowEffect.Color>
  <DropShadowEffect.BlurRadius>6</DropShadowEffect.BlurRadius>
  <DropShadowEffect.ShadowDepth>0</DropShadowEffect.ShadowDepth>
</DropShadowEffect>
```

### Opacity Values
```xml
<sys:Double x:Key="OpacityBackdrop">0.9</sys:Double> <!-- bg-void/90 -->
<sys:Double x:Key="OpacityHover">0.5</sys:Double> <!-- border-phosphor/50 -->
```

---

## Animation Tokens

### Animation Durations
```xml
<Duration x:Key="AnimationDurationFast">0:0:0.1</Duration> <!-- 0.1s -->
<Duration x:Key="AnimationDurationFlicker">0:0:0.15</Duration> <!-- 0.15s -->
<Duration x:Key="AnimationDurationBlink">0:0:1.0</Duration> <!-- 1s -->
<Duration x:Key="AnimationDurationPulse">0:0:2.0</Duration> <!-- 2s -->
<Duration x:Key="AnimationDurationScanlinePulse">0:0:3.0</Duration> <!-- 3s -->
<Duration x:Key="AnimationDurationScanlineRoll">0:0:8.0</Duration> <!-- 8s -->
<Duration x:Key="AnimationDurationScanlineBreathe">0:0:4.0</Duration> <!-- 4s -->
```

### Animation Easing
```xml
<!-- Use standard WPF easing functions -->
<CubicEase x:Key="EaseInOut" EasingMode="EaseInOut"/>
<LinearEase x:Key="EaseLinear" EasingMode="EaseInOut"/>
```

### Keyframe Values

#### Blink Animation (Cursor)
```xml
<!-- Opacity: 1 → 0 → 1 (step-end, infinite) -->
<DoubleAnimationUsingKeyFrames x:Key="BlinkAnimation" RepeatBehavior="Forever">
  <DiscreteDoubleKeyFrame KeyTime="0:0:0" Value="1"/>
  <DiscreteDoubleKeyFrame KeyTime="0:0:0.5" Value="0"/>
  <DiscreteDoubleKeyFrame KeyTime="0:0:1.0" Value="1"/>
</DoubleAnimationUsingKeyFrames>
```

#### Flicker Animation
```xml
<!-- Opacity: 1 → 0.8 → 1 -->
<DoubleAnimationUsingKeyFrames x:Key="FlickerAnimation" Duration="0:0:0.15">
  <EasingDoubleKeyFrame KeyTime="0:0:0" Value="1"/>
  <EasingDoubleKeyFrame KeyTime="0:0:0.075" Value="0.8"/>
  <EasingDoubleKeyFrame KeyTime="0:0:0.15" Value="1"/>
</DoubleAnimationUsingKeyFrames>
```

#### Pulse Glow Animation
```xml
<!-- Box shadow intensity: 5px → 15px → 5px -->
<DoubleAnimationUsingKeyFrames x:Key="PulseGlowAnimation" RepeatBehavior="Forever" Duration="0:0:2.0">
  <EasingDoubleKeyFrame KeyTime="0:0:0" Value="5"/>
  <EasingDoubleKeyFrame KeyTime="0:0:1.0" Value="15"/>
  <EasingDoubleKeyFrame KeyTime="0:0:2.0" Value="5"/>
</DoubleAnimationUsingKeyFrames>
```

#### Scanline Pulse (Phosphor, Ebony)
```xml
<!-- Opacity: 1 → 0.88 → 1 -->
<DoubleAnimationUsingKeyFrames x:Key="ScanlinePulseAnimation" RepeatBehavior="Forever" Duration="0:0:3.0">
  <EasingDoubleKeyFrame KeyTime="0:0:0" Value="1"/>
  <EasingDoubleKeyFrame KeyTime="0:0:1.5" Value="0.88"/>
  <EasingDoubleKeyFrame KeyTime="0:0:3.0" Value="1"/>
</DoubleAnimationUsingKeyFrames>
```

#### Scanline Breathe (Diamond)
```xml
<!-- Opacity: 1 → 0.92 → 1 -->
<DoubleAnimationUsingKeyFrames x:Key="ScanlineBreatheAnimation" RepeatBehavior="Forever" Duration="0:0:4.0">
  <EasingDoubleKeyFrame KeyTime="0:0:0" Value="1"/>
  <EasingDoubleKeyFrame KeyTime="0:0:2.0" Value="0.92"/>
  <EasingDoubleKeyFrame KeyTime="0:0:4.0" Value="1"/>
</DoubleAnimationUsingKeyFrames>
```

#### CRT Flicker
```xml
<!-- Opacity: 0.97 → 1 → 0.98 → 1 → 0.99 -->
<DoubleAnimationUsingKeyFrames x:Key="CrtFlickerAnimation" Duration="0:0:0.1">
  <EasingDoubleKeyFrame KeyTime="0:0:0" Value="0.97"/>
  <EasingDoubleKeyFrame KeyTime="0:0:0.025" Value="1"/>
  <EasingDoubleKeyFrame KeyTime="0:0:0.05" Value="0.98"/>
  <EasingDoubleKeyFrame KeyTime="0:0:0.075" Value="1"/>
  <EasingDoubleKeyFrame KeyTime="0:0:0.1" Value="0.99"/>
</DoubleAnimationUsingKeyFrames>
```

---

## Component-Specific Tokens

### Button (Terminal Style)
```xml
<!-- Base Style -->
<Style x:Key="TerminalButtonStyle" TargetType="Button">
  <Setter Property="FontFamily" Value="{StaticResource ThemeFont}"/>
  <Setter Property="FontSize" Value="{StaticResource FontSizeSM}"/>
  <Setter Property="Padding" Value="{StaticResource ButtonPadding}"/>
  <Setter Property="BorderThickness" Value="1"/>
  <Setter Property="BorderBrush" Value="{StaticResource ThemePhosphor}"/>
  <Setter Property="Background" Value="{StaticResource ThemeVoid}"/>
  <Setter Property="Foreground" Value="{StaticResource ThemePhosphor}"/>
  <Setter Property="CornerRadius" Value="{StaticResource BorderRadiusNone}"/>
  <!-- Block shadow effect via Border or custom control -->
</Style>

<!-- Hover State -->
<Style.Triggers>
  <Trigger Property="IsMouseOver" Value="True">
    <Setter Property="Background" Value="{StaticResource ThemePhosphor}"/>
    <Setter Property="Foreground" Value="{StaticResource ThemeVoid}"/>
  </Trigger>
</Style.Triggers>

<!-- Active State (pressed) -->
<Trigger Property="IsPressed" Value="True">
  <!-- Remove shadow, translate 2px down-right -->
  <Setter Property="RenderTransform">
    <Setter.Value>
      <TranslateTransform X="2" Y="2"/>
    </Setter.Value>
  </Setter>
</Trigger>
```

### Module Chip
```xml
<Style x:Key="ModuleChipStyle" TargetType="Border">
  <Setter Property="Background" Value="{StaticResource ThemeSlate}"/>
  <Setter Property="BorderBrush" Value="{StaticResource ThemePhosphor}"/>
  <Setter Property="BorderThickness" Value="1"/>
  <Setter Property="CornerRadius" Value="{StaticResource BorderRadiusNone}"/>
  <!-- Shadow: 2px 2px 0 var(--theme-phosphor-dim) -->
</Style>

<Style x:Key="ModuleChipHeaderStyle" TargetType="Border">
  <Setter Property="Background" Value="{StaticResource ThemePhosphor}"/>
  <Setter Property="Padding" Value="{StaticResource ChipHeaderPadding}"/>
  <Setter Property="CornerRadius" Value="{StaticResource BorderRadiusNone}"/>
</Style>
```

### LED Indicator States
```xml
<!-- Idle -->
<Style x:Key="LedIdleStyle" TargetType="Ellipse">
  <Setter Property="Width" Value="{StaticResource LedSize}"/>
  <Setter Property="Height" Value="{StaticResource LedSize}"/>
  <Setter Property="Fill" Value="{StaticResource ThemeTerminalGray}"/>
  <Setter Property="Stroke" Value="{StaticResource ThemeTerminalMuted}"/>
  <Setter Property="StrokeThickness" Value="{StaticResource LedBorderWidth}"/>
</Style>

<!-- Running -->
<Style x:Key="LedRunningStyle" TargetType="Ellipse">
  <Setter Property="Fill" Value="{StaticResource LedRunning}"/>
  <Setter Property="Stroke" Value="{StaticResource LedRunningBorder}"/>
  <Setter Property="Effect" Value="{StaticResource ShadowLedGlow}"/>
  <!-- Apply pulse-glow animation -->
</Style>

<!-- Success -->
<Style x:Key="LedSuccessStyle" TargetType="Ellipse">
  <Setter Property="Fill" Value="{StaticResource ThemePhosphor}"/>
  <Setter Property="Stroke" Value="{StaticResource ThemePhosphorDim}"/>
  <Setter Property="Effect" Value="{StaticResource ShadowLedGlow}"/>
</Style>

<!-- Error -->
<Style x:Key="LedErrorStyle" TargetType="Ellipse">
  <Setter Property="Fill" Value="{StaticResource LedError}"/>
  <Setter Property="Stroke" Value="{StaticResource LedErrorBorder}"/>
  <Setter Property="Effect" Value="{StaticResource ShadowLedGlow}"/>
</Style>
```

### Port/Handle (Circuit Board)
```xml
<Style x:Key="PortStyle" TargetType="Ellipse">
  <Setter Property="Width" Value="{StaticResource PortSizeSmall}"/>
  <Setter Property="Height" Value="{StaticResource PortSizeSmall}"/>
  <Setter Property="Fill" Value="{StaticResource ThemeVoid}"/>
  <Setter Property="Stroke" Value="{StaticResource ThemePhosphor}"/>
  <Setter Property="StrokeThickness" Value="1"/>
</Style>

<!-- Hover State -->
<Style.Triggers>
  <Trigger Property="IsMouseOver" Value="True">
    <Setter Property="Fill" Value="{StaticResource ThemePhosphor}"/>
  </Trigger>
</Style.Triggers>

<!-- Connected State -->
<Style x:Key="PortConnectedStyle" TargetType="Ellipse">
  <Setter Property="Fill" Value="{StaticResource ThemePhosphorDim}"/>
</Style>
```

### Terminal Cursor
```xml
<Style x:Key="TerminalCursorStyle" TargetType="Rectangle">
  <Setter Property="Width" Value="{StaticResource CursorWidth}"/>
  <Setter Property="Height" Value="{StaticResource CursorHeight}"/>
  <Setter Property="Fill" Value="{StaticResource ThemePhosphor}"/>
  <!-- Apply blink animation -->
</Style>
```

### Scrollbar
```xml
<Style x:Key="TerminalScrollbarStyle" TargetType="ScrollBar">
  <Setter Property="Width" Value="{StaticResource ScrollbarWidth}"/>
  <Setter Property="Background" Value="{StaticResource ThemeSlate}"/>
</Style>

<Style x:Key="TerminalScrollbarThumbStyle" TargetType="Thumb">
  <Setter Property="Background" Value="{StaticResource ThemePhosphor}"/>
  <Setter Property="BorderBrush" Value="{StaticResource ThemePhosphorDim}"/>
  <Setter Property="BorderThickness" Value="1"/>
</Style>

<!-- Hover: brightness(1.15) = multiply RGB by 1.15 -->
```

### Selection (Text)
```xml
<SolidColorBrush x:Key="SelectionBackground" Color="{StaticResource ThemePhosphor}"/>
<SolidColorBrush x:Key="SelectionForeground" Color="{StaticResource ThemeVoid}"/>
```

---

## CRT Effect Explanation

### Quick Summary (TL;DR)

The CRT effect is **two semi-transparent overlay layers** that make the UI look like it's displayed on a vintage computer monitor:

1. **Scanlines Layer**: Horizontal repeating dark lines (every 2px) that pulse/roll based on theme
2. **Vignette Layer**: Radial darkening at screen edges (like curved glass)

Both layers sit above all UI content, are non-interactive, and use theme-specific opacity values. The effect is toggleable and adds authentic retro terminal aesthetics.

---

### What is the CRT Effect?

The CRT (Cathode Ray Tube) effect recreates the visual characteristics of vintage computer monitors and terminals from the 1970s-1990s. It consists of **three layered visual elements** that combine to create an authentic retro aesthetic:

1. **Scanlines** - Horizontal lines that simulate the electron beam scanning pattern
2. **Vignette** - Darkened edges that mimic the curved glass tube surface
3. **Flicker** - Subtle brightness variations that emulate phosphor decay

### How It Works

The effect is implemented as **two overlay layers** positioned above all UI content:

```
┌─────────────────────────────────┐
│   Vignette Layer (z-index: 9999)│  ← Darker edges, lighter center
├─────────────────────────────────┤
│   Scanline Layer (z-index: 9998)│  ← Horizontal repeating pattern
├─────────────────────────────────┤
│   UI Content (all other layers) │  ← Your actual application
└─────────────────────────────────┘
```

Both overlays are:
- **Full-screen** (fixed position, 100% width/height)
- **Non-interactive** (`pointer-events: none` / `IsHitTestVisible="False"`)
- **Semi-transparent** (they darken/pattern the content beneath, not replace it)

### 1. Scanlines

**Purpose**: Mimics the horizontal scanning pattern of CRT electron beams.

**Visual Effect**: Creates subtle horizontal lines across the screen, like looking at an old TV or monitor.

**Technical Implementation**:
- A repeating vertical gradient pattern
- Pattern repeats every **2 pixels** vertically
- Each cycle: 1px dark line (opacity: 0.10-0.18) → 1px transparent
- The dark line opacity varies by theme (stored in `--theme-scanline`)

**Pattern Breakdown** (2px repeating unit):
```
Pixel 0: ████ Dark (opacity: scanline value, e.g., 0.15)
Pixel 1: ░░░░ Transparent
Pixel 2: ████ Dark (repeats...)
Pixel 3: ░░░░ Transparent
...and so on
```

This creates visible horizontal lines without completely obscuring content.

**Why it works**: Old CRTs drew images line-by-line as an electron beam swept across the phosphor coating. The scanlines recreate this visible line structure.

**Theme Variations**:
- **Phosphor/Ebony**: Gentle pulse animation (opacity fades in/out over 3-3.5s)
- **Ruby**: Rolling animation (pattern scrolls continuously, 8s cycle) - more pronounced Soviet-era feel
- **Sapphire**: Static (no animation) - clean, professional IBM terminal look
- **Diamond**: Subtle "breathe" animation (4s cycle) - medical equipment precision

### 2. Vignette

**Purpose**: Simulates the curved glass surface of a CRT tube, which naturally darkens toward the edges.

**Visual Effect**: Screen appears brighter in the center, gradually darker toward all edges (like looking through a tunnel or old camera lens).

**Technical Implementation**:
- Radial gradient (elliptical, 80% width/height)
- Center (20% radius): Fully transparent
- Mid-range (60% radius): 15% black opacity
- Edges (100%): Theme-specific black opacity (0.30-0.50)

**Why it works**: Real CRT tubes had curved glass that created natural edge darkening. The vignette adds depth and makes the screen feel like a physical object.

**Theme Variations**: Each theme uses a different edge darkness (`--theme-vignette`):
- **Diamond**: 0.3 (lightest - medical precision)
- **Ebony**: 0.35
- **Phosphor/Sapphire**: 0.4
- **Ruby**: 0.5 (darkest - Soviet cabinet aesthetic)

### 3. Flicker

**Purpose**: Adds subtle brightness variation that mimics phosphor decay and refresh rate inconsistencies.

**Visual Effect**: Very subtle, almost imperceptible brightness fluctuations (like a real CRT's slight instability).

**Technical Implementation**:
- Applied to the entire container on mount/theme change
- Quick animation (0.1s): opacity 0.97 → 1.0 → 0.98 → 1.0 → 0.99
- One-time trigger (not continuous loop)

**Why it works**: Real CRTs had slight brightness variations due to refresh timing and phosphor persistence. This adds authenticity without being distracting.

### WPF Implementation Guide

#### Step 1: Root Container Structure

Wrap your main application content in a `Grid` that will contain both your UI and the CRT overlays:

```xml
<Grid x:Name="RootContainer">
    <!-- Your actual application UI goes here -->
    <YourMainContent />
    
    <!-- CRT Overlay Layers (must be last children for proper z-ordering) -->
    <Grid x:Name="CrtScanlineOverlay" 
          Panel.ZIndex="9998"
          IsHitTestVisible="False"
          Background="{StaticResource ScanlinePatternBrush}">
        <!-- Scanline pattern applied via Background brush -->
    </Grid>
    
    <Grid x:Name="CrtVignetteOverlay"
          Panel.ZIndex="9999"
          IsHitTestVisible="False"
          Background="{StaticResource VignettePatternBrush}">
        <!-- Vignette pattern applied via Background brush -->
    </Grid>
</Grid>
```

**Key Points:**
- Both overlays are `Grid` elements (or `Canvas` if you prefer)
- `IsHitTestVisible="False"` ensures mouse clicks pass through to UI beneath
- `Panel.ZIndex` controls layering (higher = on top)
- Overlays must be **last children** of the root container to appear above everything

#### Step 2: Create the Scanline Brush

The scanline pattern is a repeating vertical gradient. In WPF, you'll use a `DrawingBrush` with a `GeometryDrawing`:

```xml
<DrawingBrush x:Key="ScanlinePatternBrush" 
               TileMode="Tile" 
               Viewport="0,0,1,2" 
               ViewportUnits="Absolute">
    <DrawingBrush.Drawing>
        <GeometryDrawing>
            <GeometryDrawing.Geometry>
                <RectangleGeometry Rect="0,0,1,1"/>
            </GeometryDrawing.Geometry>
            <GeometryDrawing.Brush>
                <SolidColorBrush Color="Black" Opacity="{StaticResource ThemeScanline}"/>
            </GeometryDrawing.Brush>
        </GeometryDrawing>
    </DrawingBrush.Drawing>
</DrawingBrush>
```

**How it works:**
- `TileMode="Tile"` makes the pattern repeat
- `Viewport="0,0,1,2"` defines a 1px wide × 2px tall repeating unit
- The rectangle fills the first 1px (dark line), second 1px is transparent (handled by the brush's positioning)

**Alternative approach** (more explicit):
```xml
<DrawingBrush x:Key="ScanlinePatternBrush" 
               TileMode="Tile" 
               Viewport="0,0,1,2" 
               ViewportUnits="Absolute">
    <DrawingBrush.Drawing>
        <DrawingGroup>
            <!-- Dark line (pixel 0) -->
            <GeometryDrawing>
                <GeometryDrawing.Geometry>
                    <RectangleGeometry Rect="0,0,1,1"/>
                </GeometryDrawing.Geometry>
                <GeometryDrawing.Brush>
                    <SolidColorBrush Color="Black" Opacity="{StaticResource ThemeScanline}"/>
                </GeometryDrawing.Brush>
            </GeometryDrawing>
            <!-- Transparent line (pixel 1) - no drawing needed, naturally transparent -->
        </DrawingGroup>
    </DrawingBrush.Drawing>
</DrawingBrush>
```

#### Step 3: Create the Vignette Brush

The vignette uses a radial gradient centered on the screen:

```xml
<RadialGradientBrush x:Key="VignettePatternBrush"
                     Center="0.5,0.5"
                     RadiusX="0.8"
                     RadiusY="0.8"
                     GradientOrigin="0.5,0.5">
    <GradientStop Offset="0.2" Color="Transparent"/>
    <GradientStop Offset="0.6" Color="Black" Opacity="0.15"/>
    <GradientStop Offset="1.0" Color="Black" Opacity="{StaticResource ThemeVignette}"/>
</RadialGradientBrush>
```

**How it works:**
- `Center="0.5,0.5"` centers the gradient (50% from left, 50% from top)
- `RadiusX/Y="0.8"` makes it 80% of the container size (elliptical)
- Gradient stops create the fade: transparent center → subtle darkening → strong dark edges

#### Step 4: Add Animations

**For Pulse Animation (Phosphor, Ebony):**
```xml
<Storyboard x:Key="ScanlinePulseAnimation" RepeatBehavior="Forever">
    <DoubleAnimation Storyboard.TargetName="CrtScanlineOverlay"
                     Storyboard.TargetProperty="Opacity"
                     From="1.0"
                     To="0.88"
                     Duration="0:0:1.5"
                     AutoReverse="True"/>
</Storyboard>
```

**For Breathe Animation (Diamond):**
```xml
<Storyboard x:Key="ScanlineBreatheAnimation" RepeatBehavior="Forever">
    <DoubleAnimation Storyboard.TargetName="CrtScanlineOverlay"
                     Storyboard.TargetProperty="Opacity"
                     From="1.0"
                     To="0.92"
                     Duration="0:0:2.0"
                     AutoReverse="True"/>
</Storyboard>
```

**For Rolling Animation (Ruby):**
```xml
<Storyboard x:Key="ScanlineRollAnimation" RepeatBehavior="Forever">
    <DoubleAnimation Storyboard.TargetName="ScanlineTransform"
                     Storyboard.TargetProperty="Y"
                     From="0"
                     To="2"
                     Duration="0:0:8.0"/>
</Storyboard>

<!-- Apply transform to the scanline brush -->
<DrawingBrush x:Key="ScanlinePatternBrushRuby" ...>
    <DrawingBrush.Transform>
        <TranslateTransform x:Name="ScanlineTransform" Y="0"/>
    </DrawingBrush.Transform>
    <!-- ... brush definition ... -->
</DrawingBrush>
```

**For Static (Sapphire):**
- No animation needed - just set `Opacity="1.0"` and leave it

#### Step 5: Toggle CRT Effect

Create a property to enable/disable the effect:

```csharp
private bool _crtEnabled = true;

public bool CrtEnabled
{
    get => _crtEnabled;
    set
    {
        _crtEnabled = value;
        CrtScanlineOverlay.Visibility = value ? Visibility.Visible : Visibility.Collapsed;
        CrtVignetteOverlay.Visibility = value ? Visibility.Visible : Visibility.Collapsed;
        
        if (value)
        {
            // Start appropriate animation based on current theme
            StartScanlineAnimation();
        }
        else
        {
            // Stop all animations
            StopScanlineAnimation();
        }
    }
}
```

#### Step 6: Theme Switching

When switching themes, update the brush resources:

```csharp
private void ApplyTheme(string themeName)
{
    // Load theme-specific ResourceDictionary
    var themeDict = new ResourceDictionary 
    { 
        Source = new Uri($"Themes/{themeName}Theme.xaml", UriKind.Relative) 
    };
    
    // Merge into application resources
    Application.Current.Resources.MergedDictionaries[0] = themeDict;
    
    // Update scanline animation based on theme
    StopScanlineAnimation();
    StartScanlineAnimation(themeName);
}

private void StartScanlineAnimation(string themeName = null)
{
    themeName ??= CurrentTheme;
    
    var animation = themeName switch
    {
        "phosphor" or "ebony" => (Storyboard)FindResource("ScanlinePulseAnimation"),
        "ruby" => (Storyboard)FindResource("ScanlineRollAnimation"),
        "diamond" => (Storyboard)FindResource("ScanlineBreatheAnimation"),
        "sapphire" => null, // No animation
        _ => (Storyboard)FindResource("ScanlinePulseAnimation")
    };
    
    animation?.Begin();
}
```

#### Step 7: Flicker Effect (Optional)

Apply a one-time flicker animation when the app loads or theme changes:

```xml
<Storyboard x:Key="CrtFlickerAnimation" Completed="OnFlickerCompleted">
    <DoubleAnimation Storyboard.TargetName="RootContainer"
                     Storyboard.TargetProperty="Opacity"
                     Duration="0:0:0.1">
        <DoubleAnimation.KeyFrames>
            <EasingDoubleKeyFrame KeyTime="0:0:0" Value="0.97"/>
            <EasingDoubleKeyFrame KeyTime="0:0:0.025" Value="1.0"/>
            <EasingDoubleKeyFrame KeyTime="0:0:0.05" Value="0.98"/>
            <EasingDoubleKeyFrame KeyTime="0:0:0.075" Value="1.0"/>
            <EasingDoubleKeyFrame KeyTime="0:0:0.1" Value="0.99"/>
        </DoubleAnimation.KeyFrames>
    </DoubleAnimation>
</Storyboard>
```

```csharp
private void OnFlickerCompleted(object sender, EventArgs e)
{
    RootContainer.Opacity = 1.0; // Reset to full opacity
}
```

#### Complete Example Structure

```xml
<Window x:Class="YourApp.MainWindow"
        xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml">
    
    <Window.Resources>
        <!-- Theme resources (loaded from separate dictionaries) -->
        <ResourceDictionary>
            <ResourceDictionary.MergedDictionaries>
                <ResourceDictionary Source="Themes/PhosphorTheme.xaml"/>
            </ResourceDictionary.MergedDictionaries>
        </ResourceDictionary>
        
        <!-- CRT Effect Brushes -->
        <DrawingBrush x:Key="ScanlinePatternBrush" ... />
        <RadialGradientBrush x:Key="VignettePatternBrush" ... />
        
        <!-- Animations -->
        <Storyboard x:Key="ScanlinePulseAnimation" ... />
    </Window.Resources>
    
    <Grid x:Name="RootContainer">
        <!-- Your Application UI -->
        <Grid>
            <!-- Title bar, content, etc. -->
        </Grid>
        
        <!-- CRT Overlays -->
        <Grid x:Name="CrtScanlineOverlay" 
              Panel.ZIndex="9998"
              IsHitTestVisible="False"
              Background="{StaticResource ScanlinePatternBrush}"/>
        
        <Grid x:Name="CrtVignetteOverlay"
              Panel.ZIndex="9999"
              IsHitTestVisible="False"
              Background="{StaticResource VignettePatternBrush}"/>
    </Grid>
</Window>
```

#### Performance Considerations

1. **Use `DrawingBrush` instead of `VisualBrush`** - DrawingBrush is more performant for static patterns
2. **Cache brushes** - Create brushes once per theme, reuse them
3. **Disable when not visible** - Set `Visibility="Collapsed"` when CRT is disabled (better than `Opacity="0"`)
4. **Consider hardware acceleration** - Ensure `RenderOptions.BitmapScalingMode` and caching are optimized
5. **Test on lower-end hardware** - CRT overlays add rendering overhead; ensure acceptable performance

#### Troubleshooting

**Scanlines not visible:**
- Check brush `Viewport` units are `Absolute` (not `RelativeToBoundingBox`)
- Verify `TileMode="Tile"` is set
- Ensure opacity values are high enough (0.10 minimum)

**Vignette too dark/light:**
- Adjust `GradientStop` opacity values in the brush
- Check theme-specific `ThemeVignette` resource value

**Animations not working:**
- Ensure `Storyboard` is started in code-behind or via trigger
- Check `Storyboard.TargetName` matches the overlay element name
- Verify `RepeatBehavior="Forever"` for continuous animations

**Mouse clicks not working:**
- Verify `IsHitTestVisible="False"` on both overlays
- Check `Panel.ZIndex` - overlays should be above content but still allow hit testing to pass through

### Visual Reference

When enabled, the CRT effect should make the UI feel like it's displayed on:
- **Phosphor**: DEC VT100 terminal, early 1980s PC monitor
- **Ruby**: Soviet-era computer terminal (ES EVM, SM 1420)
- **Sapphire**: IBM 3270 mainframe terminal, 1970s
- **Diamond**: Medical equipment display, SGI workstation
- **Ebony**: Apple II, NeXT computer monitor

The effect is **subtle but essential** - it transforms a modern flat UI into an authentic retro terminal experience.

---

## CRT Effect Tokens

### Scanline Pattern
```xml
<!-- Repeating linear gradient: 0deg, rgba(0,0,0,scanline) 0-1px, transparent 1-2px -->
<!-- Pattern repeats every 2px vertically -->
<LinearGradientBrush x:Key="ScanlinePattern" StartPoint="0,0" EndPoint="0,1">
  <GradientStop Offset="0" Color="Black" Opacity="{StaticResource ThemeScanline}"/>
  <GradientStop Offset="0.5" Color="Black" Opacity="{StaticResource ThemeScanline}"/>
  <GradientStop Offset="0.5" Color="Transparent" Opacity="0"/>
  <GradientStop Offset="1" Color="Transparent" Opacity="0"/>
</LinearGradientBrush>

<!-- For Ruby theme: 2px pattern -->
<LinearGradientBrush x:Key="ScanlinePatternRuby" StartPoint="0,0" EndPoint="0,1">
  <GradientStop Offset="0" Color="Black" Opacity="{StaticResource ThemeScanline}"/>
  <GradientStop Offset="1" Color="Transparent" Opacity="0"/>
</LinearGradientBrush>
```

### Vignette Effect
```xml
<!-- Radial gradient: ellipse 80% 80% at 50% 50% -->
<!-- transparent 20% → rgba(0,0,0,0.15) 60% → rgba(0,0,0,vignette) 100% -->
<RadialGradientBrush x:Key="VignettePattern" Center="0.5,0.5" RadiusX="0.8" RadiusY="0.8">
  <GradientStop Offset="0.2" Color="Transparent" Opacity="0"/>
  <GradientStop Offset="0.6" Color="Black" Opacity="0.15"/>
  <GradientStop Offset="1.0" Color="Black" Opacity="{StaticResource ThemeVignette}"/>
</RadialGradientBrush>
```

### Theme-Specific CRT Behaviors

#### Phosphor Theme
- Scanline animation: `scanline-pulse` (3s, opacity 1 → 0.88 → 1)

#### Ruby Theme
- Scanline animation: `scanline-roll` (8s linear infinite, 2px pattern)
- **Special**: Chamfered corners (10px clip-path)
  ```xml
  <!-- Use PathGeometry or Clip property with chamfered rectangle -->
  <PathGeometry x:Key="RubyChamferPath">
    <!-- polygon(0 10px, 10px 0, calc(100% - 10px) 0, 100% 10px, 
                 100% calc(100% - 10px), calc(100% - 10px) 100%, 
                 10px 100%, 0 calc(100% - 10px)) -->
  </PathGeometry>
  ```

#### Sapphire Theme
- Scanline animation: None (static)

#### Diamond Theme
- Scanline animation: `scanline-breathe` (4s, opacity 1 → 0.92 → 1)
- **Special**: Circular LEDs (border-radius: 50%)
  ```xml
  <!-- Use Ellipse instead of Rectangle for LED indicators -->
  ```

#### Ebony Theme
- Scanline animation: `scanline-pulse` (3.5s, opacity 1 → 0.88 → 1)

---

## Layout & Grid Tokens

### Common Spacing
```xml
<sys:Double x:Key="SpacingXS">4</sys:Double> <!-- gap-1 -->
<sys:Double x:Key="SpacingSM">8</sys:Double> <!-- gap-2 -->
<sys:Double x:Key="SpacingMD">12</sys:Double> <!-- gap-3 -->
<sys:Double x:Key="SpacingLG">16</sys:Double> <!-- gap-4 -->
<sys:Double x:Key="SpacingXL">24</sys:Double> <!-- gap-6 -->
```

### Z-Index Equivalents (Panel.ZIndex)
```xml
<sys:Int32 x:Key="ZIndexBase">0</sys:Int32>
<sys:Int32 x:Key="ZIndexModal">50</sys:Int32>
<sys:Int32 x:Key="ZIndexCrtOverlay">9998</sys:Int32>
<sys:Int32 x:Key="ZIndexCrtVignette">9999</sys:Int32>
```

---

## Implementation Notes for WPF

### 1. Theme Switching
- Use `ResourceDictionary` with `Source` property to swap entire theme dictionaries
- Or use `DynamicResource` bindings that update when theme changes
- Store current theme in `Application.Properties` or settings

### 2. Block Shadows
WPF's `DropShadowEffect` doesn't support offset-only shadows (0 blur). Alternatives:
- Use a `Border` with `Background` set to phosphor color, offset via `Margin` or `RenderTransform`
- Create a custom `Effect` class
- Use multiple overlapping `Border` elements

### 3. CRT Overlay
- Create a top-level `Canvas` or `Grid` with `IsHitTestVisible="False"`
- Apply scanline pattern as `Background` with appropriate `Brush` transform
- Apply vignette as separate overlay layer
- Use `Opacity` animations for scanline effects

### 4. Font Loading
- Ensure monospace fonts are installed or bundled with application
- Provide fallback chain: `ThemeFontPrimary, Consolas, monospace`
- Consider using `FontFamily` with multiple font names

### 5. Color Opacity
- Use `Color` with alpha channel (e.g., `#33ff0050` = 50% opacity)
- Or use `SolidColorBrush` with `Opacity` property
- For glow effects, use `DropShadowEffect` with appropriate blur and opacity

### 6. Button Pressed State
- Use `RenderTransform` with `TranslateTransform` to offset 2px down-right
- Remove shadow effect when pressed
- Consider using `Button` template with custom `ControlTemplate`

### 7. Ruby Theme Chamfered Corners
- Use `Clip` property with `PathGeometry` defining chamfered rectangle
- Or use `Border` with custom `CornerRadius` (though WPF doesn't support per-corner radius natively)
- Consider using `Path` shape as clipping mask

---

## Quick Reference: Theme Values Table

| Token | Phosphor | Ruby | Sapphire | Diamond | Ebony |
|-------|----------|------|----------|---------|-------|
| Void | #050505 | #0c0505 | #05050c | #08080a | #0a0a08 |
| Slate | #0a0f14 | #140a0a | #0a0c18 | #0c0e12 | #121210 |
| Phosphor | #33ff00 | #e85c20 | #3d8cff | #b8ccf0 | #d8d4c8 |
| Phosphor Dim | #1a8000 | #8b3d18 | #1e4080 | #6a7a9a | #8a8678 |
| Terminal Gray | #3a3a3a | #4a3028 | #2a304a | #3a3e48 | #3a3a34 |
| Terminal Muted | #666666 | #886650 | #506088 | #7a8290 | #767268 |
| Terminal Border | #2a2a2a | #2a1814 | #141a2a | #1a1e24 | #242420 |
| Scanline | 0.15 | 0.18 | 0.14 | 0.10 | 0.12 |
| Vignette | 0.4 | 0.5 | 0.4 | 0.3 | 0.35 |
| Curve | 0.98 | 0.97 | 0.98 | 0.99 | 0.99 |
| Font | JetBrains Mono | Share Tech Mono | IBM Plex Mono | Fira Code | Cutive Mono |
| Prompt | > | ► | ▷ | ▸ | › |

---

## WPF CRT Effect: Quick Explanation

### The Simple Version

**"The CRT effect is two full-screen overlay Grids that sit above your UI content."**

1. **Scanline Grid** (ZIndex 9998): Has a repeating vertical gradient brush that creates horizontal dark lines every 2 pixels
2. **Vignette Grid** (ZIndex 9999): Has a radial gradient brush that darkens the screen edges

Both overlays:
- Use `IsHitTestVisible="False"` so clicks pass through
- Are semi-transparent (they darken/pattern what's beneath, not replace it)
- Can be toggled on/off via `Visibility`
- Have theme-specific brushes and animations

### The Technical Version

**Structure:**
```
Root Grid
├── Your Application UI (buttons, panels, content)
├── Scanline Overlay Grid (Background = DrawingBrush with repeating pattern)
└── Vignette Overlay Grid (Background = RadialGradientBrush)
```

**Scanline Brush:**
- `DrawingBrush` with `TileMode="Tile"`
- `Viewport="0,0,1,2"` (1px wide, 2px tall repeating unit)
- First pixel: Black with theme opacity (0.10-0.18)
- Second pixel: Transparent
- Repeats vertically across entire screen

**Vignette Brush:**
- `RadialGradientBrush` centered at (0.5, 0.5)
- Radius 80% (elliptical)
- Center (20%): Transparent
- Mid (60%): 15% black opacity
- Edges (100%): Theme-specific black opacity (0.30-0.50)

**Animations:**
- Pulse: Overlay `Opacity` animates 1.0 → 0.88 → 1.0 (3-3.5s cycle)
- Breathe: Overlay `Opacity` animates 1.0 → 0.92 → 1.0 (4s cycle)
- Roll: Brush `Transform.Y` animates 0 → 2px (8s cycle, Ruby only)
- Static: No animation (Sapphire)

### Common Questions

**Q: Why two separate Grids?**
A: They need different ZIndex values and different brushes. Keeping them separate makes it easier to toggle, animate, and style independently.

**Q: Will this hurt performance?**
A: Minimal impact if done correctly. Use `DrawingBrush` (not `VisualBrush`), cache brushes per theme, and collapse (don't just hide) when disabled.

**Q: Can I put this in a UserControl?**
A: Yes! Create a `CrtOverlayControl` that contains both overlays, then include it in your main window. Makes it reusable.

**Q: How do I test if it's working?**
A: Temporarily set scanline brush to bright red - you should see horizontal red lines. Set vignette to bright blue - you should see blue edges.

**Q: The scanlines look too faint/strong.**
A: Adjust the `ThemeScanline` resource value (0.10 = subtle, 0.18 = pronounced). Each theme has its own value.

---

## Summary

This design system is built around:
1. **5 distinct color themes** with complete token sets
2. **Zero border radius** for retro aesthetic
3. **Block shadows** for 3D depth effect
4. **CRT effects** (scanlines, vignette, animations)
5. **Theme-specific fonts and prompts**
6. **High contrast** dark backgrounds with bright accents
7. **Monospace typography** throughout

All tokens are designed to be directly mappable to WPF `ResourceDictionary` entries, styles, and effects.
