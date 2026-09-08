import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { CAR_SUBSYSTEMS, InspectableSubsystem, getSubsystemById } from './car-subsystems';

@Component({
  selector: 'app-car-3d-viewer',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      #viewerContainer
      class="car-viewer-root"
      [class.car-viewer-root--fullscreen]="isFullscreen()"
      (mousedown)="onPointerDown($event)"
      (touchstart)="onTouchStart($event)"
      (wheel)="onWheel($event)"
    >
      <!-- Studio 3D Car Viewport -->
      <div class="car-viewport">
        <!-- Turntable Render Image with Zoom and Rotation Perspective -->
        <div
          class="car-stage-wrapper"
          [style.transform]="stageTransform()"
        >
          <img
            [src]="currentAngleImage()"
            alt="3D Studio Cutaway Car"
            class="car-render-img"
            draggable="false"
          />

          <!-- Glowing Blue Highlight Overlay on Active Part (e.g. A/C condenser) -->
          @if (activeSubsystem(); as sub) {
            <div
              class="active-part-mesh-glow"
              [style.left.%]="sub.hotspotPct.x - 6"
              [style.top.%]="sub.hotspotPct.y - 8"
            ></div>
          }

          <!-- SVG Connector Lines for Pointing Windows -->
          <svg class="callout-lines-svg" pointer-events="none">
            @for (sub of visibleSubsystems(); track sub.id) {
              <!-- Pulsing Hotspot Target Ring on the part -->
              <circle
                [attr.cx]="sub.hotspotPct.x + '%'"
                [attr.cy]="sub.hotspotPct.y + '%'"
                r="7"
                class="hotspot-center-dot"
                [class.hotspot-center-dot--active]="activeSubsystemId() === sub.id"
              />
              <circle
                [attr.cx]="sub.hotspotPct.x + '%'"
                [attr.cy]="sub.hotspotPct.y + '%'"
                r="15"
                class="hotspot-pulse-ring"
                [class.hotspot-pulse-ring--active]="activeSubsystemId() === sub.id"
              />
              <!-- Angled Connector Leader Line -->
              <polyline
                [attr.points]="getLeaderLinePoints(sub)"
                class="leader-line"
                [class.leader-line--active]="activeSubsystemId() === sub.id"
              />
            }
          </svg>

          <!-- Individual Floating Pointing Windows for Each Part -->
          @for (sub of visibleSubsystems(); track sub.id) {
            <div
              class="pointing-window"
              [class.pointing-window--active]="activeSubsystemId() === sub.id"
              [style.left.%]="sub.hotspotPct.x"
              [style.top.%]="sub.hotspotPct.y"
              [style.transform]="getCardTransform(sub)"
              (click)="onSelectPart(sub.id, $event)"
            >
              <div class="window-icon-box">
                <span class="window-icon">{{ sub.icon }}</span>
              </div>
              <div class="window-info">
                <div class="window-title">{{ sub.nameEn }}</div>
                <div class="window-subtitle">{{ sub.systemCategoryEn }}</div>
              </div>
              <div class="window-chevron">›</div>
            </div>
          }
        </div>
      </div>

      <!-- 360° Rotation Hint Banner (Top-Left matching Mockup - 100% English) -->
      <div class="rotation-hint-banner">
        <svg viewBox="0 0 24 24" class="hint-svg" fill="none" stroke="#475569" stroke-width="2">
          <path d="M4 12a8 8 0 0 1 14.93-4M20 12a8 8 0 0 1-14.93 4" stroke-linecap="round" />
          <polyline points="18 4 19 8 15 8" />
          <polyline points="6 20 5 16 9 16" />
        </svg>
        <span class="hint-text">Rotate vehicle 360°</span>
      </div>

      <!-- Bottom-Left Controls (↺ Reset, ⏸/▶ Pause, 1x Speed Pill, + / - Zoom - 100% English) -->
      <div class="bottom-left-controls">
        <button
          type="button"
          class="ctrl-circle-btn"
          (click)="resetView()"
          title="Reset View"
        >
          ↺
        </button>
        <button
          type="button"
          class="ctrl-circle-btn"
          [class.ctrl-circle-btn--active]="isAutoRotating()"
          (click)="toggleAutoRotate()"
          [title]="isAutoRotating() ? 'Pause Auto-Rotation' : 'Start Auto-Rotation'"
        >
          {{ isAutoRotating() ? '⏸' : '▶' }}
        </button>
        <span class="speed-pill">1x</span>
        <button type="button" class="ctrl-circle-btn" (click)="zoomIn()" title="Zoom In">+</button>
        <button type="button" class="ctrl-circle-btn" (click)="zoomOut()" title="Zoom Out">−</button>
        <button
          type="button"
          class="toggle-all-windows-btn"
          [class.toggle-all-windows-btn--active]="showAllWindows()"
          (click)="toggleAllWindows()"
          title="Toggle callout windows"
        >
          {{ showAllWindows() ? 'Active Window Only' : 'Show All Windows (7)' }}
        </button>
      </div>

      <!-- Bottom-Right Fullscreen Button -->
      <button
        type="button"
        class="fullscreen-btn"
        (click)="toggleFullscreen()"
        title="Toggle Fullscreen"
      >
        {{ isFullscreen() ? '✕' : '⛶' }}
      </button>

      <!-- Right Sidebar: Main Systems (100% English) -->
      <aside
        class="subsystem-sidebar"
        (mousedown)="$event.stopPropagation()"
        (touchstart)="$event.stopPropagation()"
      >
        <h3 class="sidebar-heading">Main Systems</h3>
        <ul class="subsystem-list">
          @for (item of subsystems; track item.id) {
            <li
              class="subsystem-item"
              [class.subsystem-item--active]="activeSubsystemId() === item.id"
              (click)="onSelectPart(item.id, $event)"
            >
              <div class="subsystem-item-content">
                <span class="subsystem-name">{{ item.nameEn }}</span>
                <span class="subsystem-icon-wrapper">
                  @switch (item.id) {
                    @case ('engine') {
                      <svg viewBox="0 0 24 24" class="sidebar-svg" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="5" y="7" width="14" height="11" rx="2" />
                        <path d="M9 7V4h6v3M2 10h3M2 15h3M19 10h3M19 15h3" />
                      </svg>
                    }
                    @case ('transmission') {
                      <svg viewBox="0 0 24 24" class="sidebar-svg" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="3" />
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83-2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                      </svg>
                    }
                    @case ('brakes') {
                      <svg viewBox="0 0 24 24" class="sidebar-svg" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="9" />
                        <circle cx="12" cy="12" r="4" />
                        <path d="M19 8c2 2 2 6 0 8" />
                      </svg>
                    }
                    @case ('cooling') {
                      <svg viewBox="0 0 24 24" class="sidebar-svg" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="4" y="5" width="16" height="14" rx="2" />
                        <line x1="8" y1="9" x2="8" y2="15" />
                        <line x1="12" y1="9" x2="12" y2="15" />
                        <line x1="16" y1="9" x2="16" y2="15" />
                      </svg>
                    }
                    @case ('ac') {
                      <!-- Snowflake Icon for A/C -->
                      <svg viewBox="0 0 24 24" class="sidebar-svg sidebar-svg--ac" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="12" y1="2" x2="12" y2="22" />
                        <line x1="2" y1="12" x2="22" y2="12" />
                        <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                        <line x1="4.93" y1="19.07" x2="19.07" y2="4.93" />
                      </svg>
                    }
                    @case ('electrical') {
                      <svg viewBox="0 0 24 24" class="sidebar-svg" fill="none" stroke="currentColor" stroke-width="2">
                        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                      </svg>
                    }
                    @case ('suspension') {
                      <svg viewBox="0 0 24 24" class="sidebar-svg" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 2v4M12 18v4M9 6h6M9 18h6M14 6c-2 1-4 2-4 3s4 2 4 3-4 2-4 3 4 2 4 3" />
                      </svg>
                    }
                    @case ('steering') {
                      <svg viewBox="0 0 24 24" class="sidebar-svg" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="9" />
                        <circle cx="12" cy="12" r="2.5" />
                        <path d="M3 12h6.5M14.5 12H21M12 14.5V21" />
                      </svg>
                    }
                    @case ('exhaust') {
                      <svg viewBox="0 0 24 24" class="sidebar-svg" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="7" y="9" width="10" height="6" rx="2" />
                        <path d="M3 12h4M17 10h4M17 14h4" />
                      </svg>
                    }
                    @case ('tires') {
                      <svg viewBox="0 0 24 24" class="sidebar-svg" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="9" />
                        <circle cx="12" cy="12" r="5" />
                        <circle cx="12" cy="12" r="1.5" />
                      </svg>
                    }
                    @case ('fuel') {
                      <svg viewBox="0 0 24 24" class="sidebar-svg" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="4" y="5" width="11" height="14" rx="2" />
                        <path d="M15 8h2a2 2 0 0 1 2 2v6a2 2 0 0 0 2 2h0a1 1 0 0 0 1-1V10l-2-2" />
                      </svg>
                    }
                    @case ('fluids') {
                      <svg viewBox="0 0 24 24" class="sidebar-svg" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 3a7 7 0 0 0-7 7c0 4.5 7 11 7 11s7-6.5 7-11a7 7 0 0 0-7-7z" />
                      </svg>
                    }
                    @case ('ignition') {
                      <svg viewBox="0 0 24 24" class="sidebar-svg" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                      </svg>
                    }
                    @case ('lighting') {
                      <svg viewBox="0 0 24 24" class="sidebar-svg" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-7 7c0 2.5 1.5 4.5 3 6h8c1.5-1.5 3-3.5 3-6a7 7 0 0 0-7-7z" />
                      </svg>
                    }
                    @case ('glass_wipers') {
                      <svg viewBox="0 0 24 24" class="sidebar-svg" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M4 18L7 6h10l3 12H4z" />
                        <line x1="12" y1="18" x2="8" y2="10" />
                      </svg>
                    }
                    @case ('interior') {
                      <svg viewBox="0 0 24 24" class="sidebar-svg" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M7 6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v8H7V6z" />
                        <path d="M7 14h10a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-4z" />
                      </svg>
                    }
                    @case ('body_exterior') {
                      <svg viewBox="0 0 24 24" class="sidebar-svg" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M4 14l3-6h8l4 3h3a1 1 0 0 1 1 1v2H2v-1a1 1 0 0 1 1-1z" />
                        <circle cx="7" cy="16" r="2" />
                        <circle cx="17" cy="16" r="2" />
                      </svg>
                    }
                    @case ('infotainment') {
                      <svg viewBox="0 0 24 24" class="sidebar-svg" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="5" width="18" height="13" rx="2" />
                        <line x1="8" y1="21" x2="16" y2="21" />
                        <line x1="12" y1="18" x2="12" y2="21" />
                      </svg>
                    }
                    @case ('adas_sensors') {
                      <svg viewBox="0 0 24 24" class="sidebar-svg" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="8" cy="16" r="2" />
                        <path d="M12 12a6 6 0 0 1 0 8M16 8a11 11 0 0 1 0 16" />
                      </svg>
                    }
                    @case ('drivetrain') {
                      <svg viewBox="0 0 24 24" class="sidebar-svg" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="4" />
                        <line x1="2" y1="12" x2="8" y2="12" />
                        <line x1="16" y1="12" x2="22" y2="12" />
                      </svg>
                    }
                    @case ('chassis_frame') {
                      <svg viewBox="0 0 24 24" class="sidebar-svg" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 3l8 3v6c0 5-4 9-8 10-4-1-8-5-8-10V6l8-3z" />
                      </svg>
                    }
                    @case ('hybrid_ev') {
                      <svg viewBox="0 0 24 24" class="sidebar-svg" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="5" y="7" width="14" height="11" rx="2" />
                        <path d="M9 5v2M15 5v2M11 12l2-3-1 2.5h2l-2 3" />
                      </svg>
                    }
                    @case ('airbags_safety') {
                      <svg viewBox="0 0 24 24" class="sidebar-svg" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="8" stroke-dasharray="2 2" />
                        <circle cx="12" cy="12" r="4" />
                      </svg>
                    }
                    @case ('doors_locks') {
                      <svg viewBox="0 0 24 24" class="sidebar-svg" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="6" y="10" width="12" height="10" rx="2" />
                        <path d="M9 10V6a3 3 0 0 1 6 0v4" />
                      </svg>
                    }
                    @default {
                      <span>{{ item.icon }}</span>
                    }
                  }
                </span>
              </div>
            </li>
          }
        </ul>
      </aside>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
      height: 100%;
      position: relative;
    }

    .car-viewer-root {
      position: relative;
      width: 100%;
      height: 480px;
      background: radial-gradient(ellipse at 50% 45%, #ffffff 0%, #f4f6f9 65%, #e2e8f0 100%);
      border-radius: 20px;
      overflow: hidden;
      user-select: none;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.04), inset 0 0 0 1px rgba(0, 0, 0, 0.05);
      cursor: grab;
    }

    .car-viewer-root:active {
      cursor: grabbing;
    }

    .car-viewer-root--fullscreen {
      position: fixed !important;
      inset: 0 !important;
      z-index: 99999 !important;
      width: 100vw !important;
      height: 100vh !important;
      border-radius: 0 !important;
    }

    /* Car Viewport & Stage */
    .car-viewport {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
    }

    .car-stage-wrapper {
      position: relative;
      width: 82%;
      max-width: 860px;
      aspect-ratio: 16 / 9;
      transform-origin: center center;
      transition: transform 0.15s ease-out;
      margin-inline-start: -60px; /* Slight offset to leave room for right sidebar */
    }

    .car-render-img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      display: block;
      filter: drop-shadow(0 18px 30px rgba(15, 23, 42, 0.12));
      pointer-events: none;
    }

    /* Active Part Mesh Glow (matches the glowing blue A/C part in mockup) */
    .active-part-mesh-glow {
      position: absolute;
      width: 90px;
      height: 70px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(2, 132, 199, 0.55) 0%, rgba(14, 165, 233, 0.25) 45%, transparent 70%);
      filter: blur(8px);
      pointer-events: none;
      animation: mesh-pulse 2.4s ease-in-out infinite alternate;
    }

    @keyframes mesh-pulse {
      0% { opacity: 0.6; transform: scale(0.95); }
      100% { opacity: 1; transform: scale(1.1); }
    }

    /* SVG Leader Lines */
    .callout-lines-svg {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      overflow: visible;
    }

    .hotspot-center-dot {
      fill: #0284c7;
      transition: fill 0.2s ease, r 0.2s ease;
    }

    .hotspot-center-dot--active {
      fill: #0284c7;
      r: 8;
    }

    .hotspot-pulse-ring {
      fill: none;
      stroke: #38bdf8;
      stroke-width: 2.5;
      stroke-dasharray: 4 2;
      animation: ring-pulse 2s infinite ease-out;
      opacity: 0.8;
    }

    .hotspot-pulse-ring--active {
      stroke: #0284c7;
      stroke-width: 3;
      stroke-dasharray: none;
    }

    @keyframes ring-pulse {
      0% { r: 8; opacity: 1; }
      100% { r: 24; opacity: 0; }
    }

    .leader-line {
      fill: none;
      stroke: #38bdf8;
      stroke-width: 2;
      stroke-dasharray: 3 3;
      transition: stroke 0.2s ease, stroke-width 0.2s ease;
    }

    .leader-line--active {
      stroke: #0284c7;
      stroke-width: 2.5;
      stroke-dasharray: none;
    }

    /* Floating Pointing Window (Exact mockup replica) */
    .pointing-window {
      position: absolute;
      background: #ffffff;
      border-radius: 14px;
      padding: 10px 14px;
      display: flex;
      align-items: center;
      gap: 12px;
      box-shadow: 0 10px 25px rgba(15, 23, 42, 0.08), 0 2px 6px rgba(15, 23, 42, 0.04);
      border: 1px solid #e2e8f0;
      cursor: pointer;
      white-space: nowrap;
      direction: rtl;
      transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s ease, border-color 0.2s ease;
      z-index: 10;
    }

    .pointing-window:hover,
    .pointing-window--active {
      box-shadow: 0 14px 32px rgba(2, 132, 199, 0.16), 0 4px 10px rgba(2, 132, 199, 0.08);
      border-color: #bae6fd;
      z-index: 20;
    }

    .window-icon-box {
      width: 38px;
      height: 38px;
      border-radius: 10px;
      background: #e0f2fe;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #0284c7;
      font-size: 18px;
      flex-shrink: 0;
    }

    .window-info {
      display: flex;
      flex-direction: column;
      text-align: right;
    }

    .window-title {
      font-size: 14px;
      font-weight: 700;
      color: #0f172a;
      line-height: 1.2;
    }

    .window-subtitle {
      font-size: 11px;
      color: #64748b;
      margin-top: 2px;
    }

    .window-chevron {
      font-size: 18px;
      color: #0284c7;
      font-weight: 600;
      margin-inline-start: 4px;
      transform: scaleX(-1); /* RTL flip */
    }

    /* 360 Rotation Hint Banner (Top-Left) */
    .rotation-hint-banner {
      position: absolute;
      top: 18px;
      left: 20px;
      display: flex;
      align-items: center;
      gap: 8px;
      background: rgba(255, 255, 255, 0.85);
      backdrop-filter: blur(8px);
      padding: 6px 14px;
      border-radius: 9999px;
      border: 1px solid rgba(226, 232, 240, 0.8);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
      z-index: 15;
      pointer-events: none;
    }

    .hint-svg {
      width: 16px;
      height: 16px;
    }

    .hint-text {
      font-size: 12px;
      font-weight: 600;
      color: #475569;
    }

    /* Bottom-Left Controls */
    .bottom-left-controls {
      position: absolute;
      bottom: 18px;
      left: 20px;
      display: flex;
      align-items: center;
      gap: 8px;
      z-index: 15;
    }

    .ctrl-circle-btn {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      color: #334155;
      font-size: 15px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
      transition: all 0.15s ease;
    }

    .ctrl-circle-btn:hover {
      background: #f8fafc;
      border-color: #cbd5e1;
      transform: translateY(-1px);
    }

    .ctrl-circle-btn--active {
      background: #e0f2fe;
      border-color: #7dd3fc;
      color: #0284c7;
    }

    .speed-pill {
      font-size: 12px;
      font-weight: 600;
      color: #475569;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      padding: 4px 10px;
      border-radius: 9999px;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.04);
    }

    .toggle-all-windows-btn {
      font-size: 11px;
      font-weight: 600;
      color: #0284c7;
      background: #ffffff;
      border: 1px solid #bae6fd;
      padding: 6px 12px;
      border-radius: 9999px;
      cursor: pointer;
      box-shadow: 0 2px 6px rgba(2, 132, 199, 0.08);
      transition: all 0.15s ease;
    }

    .toggle-all-windows-btn:hover {
      background: #f0f9ff;
    }

    .toggle-all-windows-btn--active {
      background: #0284c7;
      color: #ffffff;
      border-color: #0284c7;
    }

    /* Bottom-Right Fullscreen Button */
    .fullscreen-btn {
      position: absolute;
      bottom: 18px;
      right: 200px;
      width: 36px;
      height: 36px;
      border-radius: 10px;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      color: #334155;
      font-size: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
      z-index: 15;
      transition: all 0.15s ease;
    }

    .fullscreen-btn:hover {
      background: #f8fafc;
      transform: translateY(-1px);
    }

    /* Right Sidebar: الأجزاء الرئيسية */
    .subsystem-sidebar {
      position: absolute;
      top: 20px;
      right: 20px;
      bottom: 20px;
      width: 175px;
      background: #ffffff;
      border-radius: 16px;
      border: 1px solid #e2e8f0;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.04);
      padding: 16px 12px;
      display: flex;
      flex-direction: column;
      z-index: 15;
      direction: rtl;
    }

    .sidebar-heading {
      font-size: 14px;
      font-weight: 700;
      color: #0f172a;
      margin: 0 0 12px 0;
      text-align: right;
    }

    .subsystem-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
      flex: 1;
      overflow-y: auto;
    }

    .subsystem-item {
      padding: 7px 10px;
      border-radius: 10px;
      cursor: pointer;
      transition: background 0.15s ease, color 0.15s ease;
      display: flex;
      align-items: center;
    }

    .subsystem-item:hover {
      background: #f8fafc;
    }

    .subsystem-item--active {
      background: #eef6ff !important;
      color: #0284c7;
    }

    .subsystem-item-content {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
    }

    .subsystem-name {
      font-size: 13px;
      font-weight: 600;
      color: inherit;
    }

    .subsystem-icon-wrapper {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 20px;
      height: 20px;
      color: #64748b;
    }

    .subsystem-item--active .subsystem-icon-wrapper {
      color: #0284c7;
    }

    .sidebar-svg {
      width: 18px;
      height: 18px;
      display: block;
    }

    .sidebar-svg--ac {
      color: #0284c7;
    }

    @media (max-width: 900px) {
      .subsystem-sidebar {
        display: none;
      }
      .car-stage-wrapper {
        width: 95%;
        margin-inline-start: 0;
      }
      .fullscreen-btn {
        right: 20px;
      }
    }
  `],
})
export class Car3dViewerComponent {
  readonly viewerContainer = viewChild<ElementRef<HTMLElement>>('viewerContainer');

  readonly activePart = input<string>('ac');
  readonly highlightParts = input<readonly string[]>([]);
  readonly partSelect = output<string>();

  protected readonly subsystems = CAR_SUBSYSTEMS;
  protected readonly isFullscreen = signal<boolean>(false);
  protected readonly isAutoRotating = signal<boolean>(false);
  protected readonly showAllWindows = signal<boolean>(false);

  // 3D Turntable state: 0, 1, 2, 3 (4 multi-angle renders around the car)
  protected readonly angleIndex = signal<number>(0);
  protected readonly zoomLevel = signal<number>(1.0);
  protected readonly rotationDeg = signal<number>(0);

  private readonly angles: string[] = [
    '/assets/car-studio/car-angle-0.jpg',
    '/assets/car-studio/car-angle-1.jpg',
    '/assets/car-studio/car-angle-2.jpg',
    '/assets/car-studio/car-angle-3.jpg',
  ];

  protected readonly currentAngleImage = computed(() => {
    const idx = Math.abs(this.angleIndex()) % this.angles.length;
    return this.angles[idx];
  });

  protected readonly stageTransform = computed(() => {
    const zoom = this.zoomLevel();
    return `scale(${zoom})`;
  });

  protected readonly activeSubsystemId = computed(() => {
    const id = (this.activePart() || 'ac').toLowerCase().trim();
    if (id === 'battery') return 'electrical';
    return id;
  });

  protected readonly activeSubsystem = computed(() => {
    return getSubsystemById(this.activeSubsystemId()) || CAR_SUBSYSTEMS[4]; // Default A/C
  });

  protected readonly visibleSubsystems = computed(() => {
    if (this.showAllWindows()) {
      return CAR_SUBSYSTEMS;
    }
    const current = this.activeSubsystem();
    return current ? [current] : [];
  });

  // Pointer drag handling for 360 degree turntable rotation
  private isDragging = false;
  private startX = 0;
  private autoRotateTimer: any = null;

  protected onPointerDown(e: MouseEvent): void {
    if ((e.target as HTMLElement).closest('.subsystem-sidebar, .bottom-left-controls, .rotation-hint-banner, .fullscreen-btn, .pointing-window')) {
      return;
    }
    this.isDragging = true;
    this.startX = e.clientX;

    const onMove = (moveEv: MouseEvent) => {
      if (!this.isDragging) return;
      const deltaX = moveEv.clientX - this.startX;
      if (Math.abs(deltaX) > 35) {
        const step = deltaX > 0 ? -1 : 1;
        this.angleIndex.update((curr) => (curr + step + this.angles.length) % this.angles.length);
        this.rotationDeg.update((deg) => (deg + (step * 90)) % 360);
        this.startX = moveEv.clientX;
      }
    };

    const onUp = () => {
      this.isDragging = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  protected onTouchStart(e: TouchEvent): void {
    if (e.touches.length === 1) {
      this.isDragging = true;
      this.startX = e.touches[0].clientX;

      const onTouchMove = (moveEv: TouchEvent) => {
        if (!this.isDragging || moveEv.touches.length !== 1) return;
        const deltaX = moveEv.touches[0].clientX - this.startX;
        if (Math.abs(deltaX) > 35) {
          const step = deltaX > 0 ? -1 : 1;
          this.angleIndex.update((curr) => (curr + step + this.angles.length) % this.angles.length);
          this.startX = moveEv.touches[0].clientX;
        }
      };

      const onTouchEnd = () => {
        this.isDragging = false;
        window.removeEventListener('touchmove', onTouchMove);
        window.removeEventListener('touchend', onTouchEnd);
      };

      window.addEventListener('touchmove', onTouchMove);
      window.addEventListener('touchend', onTouchEnd);
    }
  }

  protected onWheel(e: WheelEvent): void {
    e.preventDefault();
    if (e.deltaY < 0) {
      this.zoomIn();
    } else {
      this.zoomOut();
    }
  }

  protected zoomIn(): void {
    this.zoomLevel.update((z) => Math.min(1.4, Number((z + 0.1).toFixed(1))));
  }

  protected zoomOut(): void {
    this.zoomLevel.update((z) => Math.max(0.85, Number((z - 0.1).toFixed(1))));
  }

  protected resetView(): void {
    this.angleIndex.set(0);
    this.zoomLevel.set(1.0);
    this.rotationDeg.set(0);
  }

  protected toggleAutoRotate(): void {
    const next = !this.isAutoRotating();
    this.isAutoRotating.set(next);
    if (next) {
      this.autoRotateTimer = setInterval(() => {
        this.angleIndex.update((curr) => (curr + 1) % this.angles.length);
      }, 2500);
    } else if (this.autoRotateTimer) {
      clearInterval(this.autoRotateTimer);
      this.autoRotateTimer = null;
    }
  }

  protected toggleAllWindows(): void {
    this.showAllWindows.update((v) => !v);
  }

  protected toggleFullscreen(): void {
    this.isFullscreen.update((f) => !f);
  }

  protected onSelectPart(partId: string, event?: Event): void {
    if (event) event.stopPropagation();
    this.partSelect.emit(partId);
  }

  protected getLeaderLinePoints(sub: InspectableSubsystem): string {
    const x0 = sub.hotspotPct.x;
    const y0 = sub.hotspotPct.y;
    // Elbow point and end point at the card
    const x1 = x0 + (sub.cardOffset.x > 0 ? 3 : -3);
    const y1 = y0 + (sub.cardOffset.y * 0.45);
    const x2 = x0 + (sub.cardOffset.x * 0.7);
    const y2 = y0 + sub.cardOffset.y;
    return `${x0}%,${y0}% ${x1}%,${y1}% ${x2}%,${y2}%`;
  }

  protected getCardTransform(sub: InspectableSubsystem): string {
    const offsetX = sub.cardOffset.x;
    const offsetY = sub.cardOffset.y;
    return `translate(${offsetX}px, ${offsetY}px)`;
  }
}
