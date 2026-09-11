import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Volumetric 3D Claymorphic automotive part icon component matching the user's
 * attached photos (Photos 4 & 5):
 * Richly rendered with soft gradient depth, specular highlights, and claymorphic
 * rounded aesthetic on a clean white card tile.
 */
@Component({
  selector: 'app-animated-part-icon',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="part-photo-box" [attr.data-part]="partKey()">
      <div class="icon-frame" [ngClass]="'icon-frame--' + partKey()">
        @switch (partKey()) {
          @case ('battery') {
            <!-- 3D Claymorphic Battery: Deep navy block, brass/dark terminals, embossed white lightning bolt -->
            <svg viewBox="0 0 64 64" class="clay-icon" aria-label="Battery">
              <defs>
                <linearGradient id="bat-body-grad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stop-color="#2a3f5f" />
                  <stop offset="35%" stop-color="#1e2c42" />
                  <stop offset="100%" stop-color="#141d2d" />
                </linearGradient>
                <linearGradient id="bat-lid-grad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stop-color="#3b5278" />
                  <stop offset="100%" stop-color="#24344d" />
                </linearGradient>
                <linearGradient id="term-pos" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stop-color="#e2b168" />
                  <stop offset="100%" stop-color="#b47828" />
                </linearGradient>
                <linearGradient id="term-neg" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stop-color="#94a3b8" />
                  <stop offset="100%" stop-color="#475569" />
                </linearGradient>
                <filter id="clay-shadow" x="-10%" y="-10%" width="120%" height="130%">
                  <feDropShadow dx="0" dy="4" stdDeviation="3" flood-color="#0f172a" flood-opacity="0.22" />
                </filter>
              </defs>
              <g filter="url(#clay-shadow)">
                <!-- Left (+) Terminal -->
                <rect x="18" y="11" width="8" height="6" rx="2" fill="url(#term-pos)" />
                <rect x="20" y="9" width="4" height="3" rx="1" fill="#fcd34d" />
                <!-- Right (-) Terminal -->
                <rect x="38" y="11" width="8" height="6" rx="2" fill="url(#term-neg)" />
                <rect x="40" y="9" width="4" height="3" rx="1" fill="#cbd5e1" />
                <!-- Battery Top Lid -->
                <rect x="11" y="16" width="42" height="7" rx="3" fill="url(#bat-lid-grad)" />
                <!-- Battery Main Body -->
                <rect x="13" y="22" width="38" height="32" rx="4" fill="url(#bat-body-grad)" />
                <!-- Subtle Edge Highlight -->
                <line x1="14" y1="23" x2="49" y2="23" stroke="#47658f" stroke-width="1" stroke-linecap="round" />
                <!-- Embossed White 3D Lightning Bolt -->
                <path d="M33 26 L26 37 H32 L29 48 L39 36 H33 Z" fill="#ffffff" filter="drop-shadow(0 2px 2px rgba(0,0,0,0.3))" />
              </g>
            </svg>
          }

          @case ('brakes') {
            <!-- 3D Slotted Disc Brake Rotor with Slate-Blue Caliper Clamp -->
            <svg viewBox="0 0 64 64" class="clay-icon" aria-label="Brakes">
              <defs>
                <radialGradient id="rotor-grad" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stop-color="#cbd5e1" />
                  <stop offset="70%" stop-color="#94a3b8" />
                  <stop offset="95%" stop-color="#64748b" />
                  <stop offset="100%" stop-color="#475569" />
                </radialGradient>
                <linearGradient id="caliper-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="#3b5278" />
                  <stop offset="50%" stop-color="#24344d" />
                  <stop offset="100%" stop-color="#172233" />
                </linearGradient>
                <radialGradient id="hub-grad" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stop-color="#f8fafc" />
                  <stop offset="60%" stop-color="#94a3b8" />
                  <stop offset="100%" stop-color="#334155" />
                </radialGradient>
              </defs>
              <g filter="url(#clay-shadow)">
                <!-- Rotor Disc Outer -->
                <circle cx="32" cy="34" r="23" fill="url(#rotor-grad)" stroke="#475569" stroke-width="1" />
                <!-- Rotor Disc Inner Track -->
                <circle cx="32" cy="34" r="16" fill="none" stroke="#64748b" stroke-width="0.8" stroke-dasharray="2 3" />
                <!-- Ventilation Holes / Slots -->
                <circle cx="32" cy="18" r="1.2" fill="#334155" />
                <circle cx="32" cy="50" r="1.2" fill="#334155" />
                <circle cx="16" cy="34" r="1.2" fill="#334155" />
                <circle cx="21" cy="23" r="1.2" fill="#334155" />
                <circle cx="21" cy="45" r="1.2" fill="#334155" />
                <circle cx="25" cy="19" r="1.2" fill="#334155" />
                <!-- Center Wheel Hub -->
                <circle cx="32" cy="34" r="9" fill="url(#hub-grad)" stroke="#1e293b" stroke-width="1" />
                <circle cx="32" cy="34" r="4.5" fill="#0f172a" />
                <!-- Lug Nut Holes -->
                <circle cx="32" cy="28.5" r="1" fill="#f8fafc" />
                <circle cx="36.5" cy="31.5" r="1" fill="#f8fafc" />
                <circle cx="35" cy="37.5" r="1" fill="#f8fafc" />
                <circle cx="29" cy="37.5" r="1" fill="#f8fafc" />
                <circle cx="27.5" cy="31.5" r="1" fill="#f8fafc" />
                <!-- 3D Caliper Hugging Upper Right Edge -->
                <path d="M35 12 C44 14 51 22 53 32 L46 33 C45 26 40 20 34 18 Z" fill="url(#caliper-grad)" stroke="#1e293b" stroke-width="1.2" />
                <rect x="42" y="15" width="10" height="15" rx="3" fill="url(#caliper-grad)" stroke="#1e293b" stroke-width="1" />
                <!-- Caliper Pin Details -->
                <circle cx="47" cy="18" r="1.5" fill="#94a3b8" />
                <circle cx="48" cy="27" r="1.5" fill="#94a3b8" />
              </g>
            </svg>
          }

          @case ('fluids') {
            <!-- 3D Oil Dispenser Canister with Golden Pouring Droplet -->
            <svg viewBox="0 0 64 64" class="clay-icon" aria-label="Fluids">
              <defs>
                <linearGradient id="oilcan-body" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="#3b5278" />
                  <stop offset="45%" stop-color="#24344d" />
                  <stop offset="100%" stop-color="#141d2d" />
                </linearGradient>
                <linearGradient id="oil-drop-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="#fbbf24" />
                  <stop offset="60%" stop-color="#f59e0b" />
                  <stop offset="100%" stop-color="#d97706" />
                </linearGradient>
              </defs>
              <g filter="url(#clay-shadow)">
                <!-- Handle Loop on Left -->
                <path d="M19 25 C14 25 11 30 11 36 C11 42 14 45 19 45" fill="none" stroke="#2a3f5f" stroke-width="3.5" stroke-linecap="round" />
                <!-- Oil Jug Body -->
                <rect x="18" y="24" width="24" height="23" rx="4" fill="url(#oilcan-body)" stroke="#172233" stroke-width="1" />
                <!-- Top Cap / Handle Grip -->
                <rect x="25" y="19" width="10" height="5" rx="2" fill="#3b5278" />
                <line x1="22" y1="19" x2="38" y2="19" stroke="#172233" stroke-width="2" stroke-linecap="round" />
                <!-- Spout Angled to Right -->
                <path d="M42 30 L52 26 L51 32 L42 36 Z" fill="url(#oilcan-body)" stroke="#172233" stroke-width="1" />
                <!-- Glossy Highlight on Canister -->
                <line x1="21" y1="26" x2="21" y2="44" stroke="#47658f" stroke-width="1.2" stroke-linecap="round" />
                <!-- Glistening Amber Oil Drop Pouring -->
                <path d="M52 35 C52 35 56 42 56 46 A4 4 0 0 1 48 46 C48 42 52 35 52 35 Z" fill="url(#oil-drop-grad)" filter="drop-shadow(0 2px 3px rgba(245, 158, 11, 0.4))" />
                <circle cx="51" cy="44" r="1" fill="#fef08a" />
              </g>
            </svg>
          }

          @case ('tires') {
            <!-- 3D Tire with Tread Depth and Multi-Spoke Silver Alloy Rim -->
            <svg viewBox="0 0 64 64" class="clay-icon" aria-label="Tires">
              <defs>
                <radialGradient id="tire-tread-grad" cx="50%" cy="50%" r="50%">
                  <stop offset="60%" stop-color="#1e293b" />
                  <stop offset="85%" stop-color="#0f172a" />
                  <stop offset="100%" stop-color="#020617" />
                </radialGradient>
                <radialGradient id="rim-outer-grad" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stop-color="#f8fafc" />
                  <stop offset="70%" stop-color="#cbd5e1" />
                  <stop offset="100%" stop-color="#64748b" />
                </radialGradient>
                <radialGradient id="rim-inner-grad" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stop-color="#475569" />
                  <stop offset="100%" stop-color="#1e293b" />
                </radialGradient>
              </defs>
              <g filter="url(#clay-shadow)">
                <!-- Outer Rubber Tire -->
                <circle cx="32" cy="32" r="23" fill="url(#tire-tread-grad)" stroke="#0f172a" stroke-width="1.5" />
                <!-- Tire Tread Grooves -->
                <circle cx="32" cy="32" r="20" fill="none" stroke="#334155" stroke-width="1" stroke-dasharray="3 3" />
                <circle cx="32" cy="32" r="18" fill="none" stroke="#1e293b" stroke-width="0.8" />
                <!-- Rim Bezel -->
                <circle cx="32" cy="32" r="14.5" fill="url(#rim-inner-grad)" stroke="#94a3b8" stroke-width="1.2" />
                <!-- 5-Spoke Silver Alloy Wheel Stars -->
                <g stroke="url(#rim-outer-grad)" stroke-width="2.8" stroke-linecap="round">
                  <line x1="32" y1="32" x2="32" y2="19" />
                  <line x1="32" y1="32" x2="44.3" y2="28" />
                  <line x1="32" y1="32" x2="39.6" y2="42.5" />
                  <line x1="32" y1="32" x2="24.4" y2="42.5" />
                  <line x1="32" y1="32" x2="19.7" y2="28" />
                </g>
                <!-- Center Wheel Hub Cap -->
                <circle cx="32" cy="32" r="4.5" fill="url(#rim-outer-grad)" stroke="#475569" stroke-width="0.8" />
                <circle cx="32" cy="32" r="2" fill="#0f172a" />
              </g>
            </svg>
          }

          @case ('engine') {
            <!-- 3D V6 / Inline Engine Block with Polished Metal & Pulley Details -->
            <svg viewBox="0 0 64 64" class="clay-icon" aria-label="Engine">
              <defs>
                <linearGradient id="eng-body" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="#334155" />
                  <stop offset="50%" stop-color="#1e293b" />
                  <stop offset="100%" stop-color="#0f172a" />
                </linearGradient>
                <linearGradient id="eng-head" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stop-color="#38bdf8" />
                  <stop offset="100%" stop-color="#0284c7" />
                </linearGradient>
              </defs>
              <g filter="url(#clay-shadow)">
                <!-- Cylinder Head Valve Cover -->
                <rect x="16" y="14" width="32" height="8" rx="2" fill="url(#eng-head)" stroke="#0369a1" stroke-width="1" />
                <line x1="20" y1="18" x2="44" y2="18" stroke="#e0f2fe" stroke-width="1" stroke-linecap="round" />
                <!-- Engine Main Block -->
                <path d="M14 22 H50 L47 48 H17 Z" fill="url(#eng-body)" stroke="#0f172a" stroke-width="1.2" />
                <!-- Ribbed Cooling Castings -->
                <line x1="20" y1="26" x2="44" y2="26" stroke="#475569" stroke-width="1.5" />
                <line x1="20" y1="31" x2="44" y2="31" stroke="#475569" stroke-width="1.5" />
                <!-- Crankshaft / Alternator Pulleys -->
                <circle cx="23" cy="40" r="5" fill="#64748b" stroke="#cbd5e1" stroke-width="1" />
                <circle cx="23" cy="40" r="2" fill="#0f172a" />
                <circle cx="39" cy="40" r="4" fill="#64748b" stroke="#cbd5e1" stroke-width="1" />
                <circle cx="39" cy="40" r="1.5" fill="#0f172a" />
                <!-- Serpentine Belt -->
                <path d="M23 35 H39" stroke="#0f172a" stroke-width="2" stroke-linecap="round" />
              </g>
            </svg>
          }

          @case ('transmission') {
            <!-- 3D Beveled Interlocking Gears in Metallic Slate -->
            <svg viewBox="0 0 64 64" class="clay-icon" aria-label="Transmission">
              <defs>
                <radialGradient id="gear-large-grad" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stop-color="#94a3b8" />
                  <stop offset="70%" stop-color="#475569" />
                  <stop offset="100%" stop-color="#1e293b" />
                </radialGradient>
                <radialGradient id="gear-small-grad" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stop-color="#38bdf8" />
                  <stop offset="80%" stop-color="#0284c7" />
                  <stop offset="100%" stop-color="#0369a1" />
                </radialGradient>
              </defs>
              <g filter="url(#clay-shadow)">
                <!-- Large Driving Gear -->
                <circle cx="26" cy="30" r="14" fill="url(#gear-large-grad)" stroke="#1e293b" stroke-width="1.2" />
                <!-- Gear Cogs Large -->
                <g stroke="#334155" stroke-width="3" stroke-linecap="round">
                  <line x1="26" y1="12" x2="26" y2="16" />
                  <line x1="26" y1="44" x2="26" y2="48" />
                  <line x1="8" y1="30" x2="12" y2="30" />
                  <line x1="40" y1="30" x2="44" y2="30" />
                  <line x1="13.3" y1="17.3" x2="16.1" y2="20.1" />
                  <line x1="35.9" y1="39.9" x2="38.7" y2="42.7" />
                  <line x1="13.3" y1="42.7" x2="16.1" y2="39.9" />
                  <line x1="35.9" y1="20.1" x2="38.7" y2="17.3" />
                </g>
                <circle cx="26" cy="30" r="5" fill="#0f172a" />
                <circle cx="26" cy="30" r="2" fill="#cbd5e1" />
                <!-- Small Driven Meshing Gear -->
                <circle cx="44" cy="42" r="9" fill="url(#gear-small-grad)" stroke="#0369a1" stroke-width="1" />
                <circle cx="44" cy="42" r="3" fill="#0f172a" />
                <circle cx="44" cy="42" r="1.2" fill="#e0f2fe" />
              </g>
            </svg>
          }

          @case ('suspension') {
            <!-- 3D Coil Spring and Chrome Damper Strut -->
            <svg viewBox="0 0 64 64" class="clay-icon" aria-label="Suspension">
              <defs>
                <linearGradient id="spring-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stop-color="#38bdf8" />
                  <stop offset="50%" stop-color="#0284c7" />
                  <stop offset="100%" stop-color="#075985" />
                </linearGradient>
                <linearGradient id="strut-chrome" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stop-color="#f8fafc" />
                  <stop offset="50%" stop-color="#cbd5e1" />
                  <stop offset="100%" stop-color="#64748b" />
                </linearGradient>
              </defs>
              <g filter="url(#clay-shadow)">
                <!-- Top Mount Bushing -->
                <rect x="24" y="9" width="16" height="5" rx="2" fill="#1e293b" />
                <circle cx="32" cy="11.5" r="2" fill="#94a3b8" />
                <!-- Inner Chrome Piston Shaft -->
                <rect x="30" y="14" width="4" height="38" fill="url(#strut-chrome)" />
                <!-- 3D Helical Coil Spring Windings -->
                <g stroke="url(#spring-grad)" stroke-width="4.5" stroke-linecap="round" fill="none">
                  <path d="M23 18 Q32 15 41 18 Q32 22 23 25" />
                  <path d="M23 25 Q32 22 41 25 Q32 29 23 32" />
                  <path d="M23 32 Q32 29 41 32 Q32 36 23 39" />
                  <path d="M23 39 Q32 36 41 39 Q32 43 23 46" />
                </g>
                <!-- Bottom Shock Body / Mounting Eye -->
                <rect x="25" y="47" width="14" height="5" rx="2" fill="#1e293b" />
                <circle cx="32" cy="54" r="3.5" fill="#1e293b" stroke="#94a3b8" stroke-width="1.5" />
                <circle cx="32" cy="54" r="1.5" fill="#f8fafc" />
              </g>
            </svg>
          }

          @case ('cooling') {
            <!-- 3D Radiator Core with Aluminum Cooling Fins & End Tanks -->
            <svg viewBox="0 0 64 64" class="clay-icon" aria-label="Cooling">
              <defs>
                <linearGradient id="tank-grad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stop-color="#3b5278" />
                  <stop offset="100%" stop-color="#1e293b" />
                </linearGradient>
                <linearGradient id="fin-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stop-color="#cbd5e1" />
                  <stop offset="100%" stop-color="#94a3b8" />
                </linearGradient>
              </defs>
              <g filter="url(#clay-shadow)">
                <!-- Top Radiator Tank & Cap -->
                <rect x="29" y="10" width="6" height="4" rx="1.5" fill="#e2b168" stroke="#b47828" stroke-width="1" />
                <rect x="13" y="14" width="38" height="6" rx="2" fill="url(#tank-grad)" />
                <!-- Radiator Core Grid -->
                <rect x="15" y="20" width="34" height="24" rx="1" fill="#0f172a" />
                <g stroke="url(#fin-grad)" stroke-width="1.8">
                  <line x1="20" y1="21" x2="20" y2="43" />
                  <line x1="25" y1="21" x2="25" y2="43" />
                  <line x1="30" y1="21" x2="30" y2="43" />
                  <line x1="34" y1="21" x2="34" y2="43" />
                  <line x1="39" y1="21" x2="39" y2="43" />
                  <line x1="44" y1="21" x2="44" y2="43" />
                </g>
                <!-- Bottom Header Tank -->
                <rect x="13" y="44" width="38" height="6" rx="2" fill="url(#tank-grad)" />
              </g>
            </svg>
          }

          @case ('ac') {
            <!-- 3D Ice Crystal Snowflake with Cyan/Frost Glow -->
            <svg viewBox="0 0 64 64" class="clay-icon" aria-label="Air Conditioning">
              <defs>
                <linearGradient id="ice-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="#67e8f9" />
                  <stop offset="50%" stop-color="#0284c7" />
                  <stop offset="100%" stop-color="#0369a1" />
                </linearGradient>
              </defs>
              <g filter="url(#clay-shadow)">
                <circle cx="32" cy="32" r="5" fill="#e0f2fe" stroke="#0284c7" stroke-width="1.5" />
                <g stroke="url(#ice-grad)" stroke-width="3" stroke-linecap="round">
                  <line x1="32" y1="12" x2="32" y2="52" />
                  <line x1="12" y1="32" x2="52" y2="32" />
                  <line x1="18" y1="18" x2="46" y2="46" />
                  <line x1="18" y1="46" x2="46" y2="18" />
                </g>
                <!-- Flake Chevron Tips -->
                <g stroke="#38bdf8" stroke-width="2" stroke-linecap="round" fill="none">
                  <path d="M28 17 L32 13 L36 17" />
                  <path d="M28 47 L32 51 L36 47" />
                  <path d="M17 28 L13 32 L17 36" />
                  <path d="M47 28 L51 32 L47 36" />
                </g>
                <circle cx="32" cy="32" r="2" fill="#ffffff" />
              </g>
            </svg>
          }

          @case ('exhaust') {
            <!-- 3D Stainless Steel Muffler with Dual Chrome Tips -->
            <svg viewBox="0 0 64 64" class="clay-icon" aria-label="Exhaust">
              <defs>
                <linearGradient id="ex-can" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stop-color="#e2e8f0"/><stop offset="55%" stop-color="#94a3b8"/><stop offset="100%" stop-color="#475569"/>
                </linearGradient>
                <filter id="ex-sh" x="-10%" y="-10%" width="120%" height="130%">
                  <feDropShadow dx="0" dy="4" stdDeviation="3" flood-color="#0f172a" flood-opacity="0.22"/>
                </filter>
              </defs>
              <g filter="url(#ex-sh)">
                <path d="M4 30h12l4-4h6" fill="none" stroke="#64748b" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
                <rect x="24" y="20" width="24" height="20" rx="9" fill="url(#ex-can)" stroke="#334155" stroke-width="2"/>
                <path d="M48 30h8" stroke="#64748b" stroke-width="7" stroke-linecap="round"/>
                <circle cx="58" cy="30" r="5" fill="#334155"/>
                <g fill="#cbd5e1" opacity="0.75">
                  <circle cx="54" cy="46" r="4"/>
                  <circle cx="60" cy="52" r="3"/>
                  <circle cx="48" cy="52" r="2.5"/>
                </g>
              </g>
            </svg>
          }

          @case ('infotainment') {
            <!-- 3D Automotive Head Unit / Radio Console with Glowing Blue Display and Knobs matching user photo -->
            <svg viewBox="0 0 64 64" class="clay-icon" aria-label="Infotainment & Audio">
              <defs>
                <linearGradient id="radio-body-grad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stop-color="#334155" />
                  <stop offset="60%" stop-color="#1e293b" />
                  <stop offset="100%" stop-color="#0f172a" />
                </linearGradient>
                <linearGradient id="radio-screen-grad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stop-color="#38bdf8" />
                  <stop offset="100%" stop-color="#0284c7" />
                </linearGradient>
              </defs>
              <g filter="url(#clay-shadow)">
                <!-- Console Bezel Chassis -->
                <rect x="12" y="14" width="40" height="36" rx="5" fill="url(#radio-body-grad)" stroke="#0f172a" stroke-width="1.5" />
                <!-- Upper Vibrant Blue LCD Display Screen -->
                <rect x="16" y="18" width="32" height="13" rx="2" fill="url(#radio-screen-grad)" stroke="#0369a1" stroke-width="1" />
                <line x1="20" y1="23" x2="34" y2="23" stroke="#e0f2fe" stroke-width="1.2" stroke-linecap="round" />
                <line x1="20" y1="26" x2="28" y2="26" stroke="#bae6fd" stroke-width="1" stroke-linecap="round" />
                <!-- CD / Slot -->
                <line x1="20" y1="34" x2="44" y2="34" stroke="#475569" stroke-width="2" stroke-linecap="round" />
                <!-- Left Rotary Dial -->
                <circle cx="23" cy="42" r="4.5" fill="#475569" stroke="#cbd5e1" stroke-width="1" />
                <circle cx="23" cy="42" r="2" fill="#0f172a" />
                <!-- Right Rotary Dial -->
                <circle cx="41" cy="42" r="4.5" fill="#475569" stroke="#cbd5e1" stroke-width="1" />
                <circle cx="41" cy="42" r="2" fill="#0f172a" />
                <!-- Center Buttons -->
                <rect x="30" y="40" width="4" height="4" rx="1" fill="#64748b" />
              </g>
            </svg>
          }

          @case ('steering') {
            <!-- 3D Beveled Steering Mechanism / Gear with Cyan Satellite Cog matching user photo 4 -->
            <svg viewBox="0 0 64 64" class="clay-icon" aria-label="Steering Gear">
              <defs>
                <radialGradient id="gear-main-grad" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stop-color="#475569" />
                  <stop offset="70%" stop-color="#1e293b" />
                  <stop offset="100%" stop-color="#0f172a" />
                </radialGradient>
                <radialGradient id="cog-blue-grad" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stop-color="#38bdf8" />
                  <stop offset="70%" stop-color="#0284c7" />
                  <stop offset="100%" stop-color="#0369a1" />
                </radialGradient>
              </defs>
              <g filter="url(#clay-shadow)">
                <!-- Main Drive Gear (Center-Left) -->
                <circle cx="28" cy="30" r="15" fill="url(#gear-main-grad)" stroke="#0f172a" stroke-width="1.5" />
                <!-- Gear Cogs 8 Teeth -->
                <g stroke="#334155" stroke-width="3.5" stroke-linecap="round">
                  <line x1="28" y1="11" x2="28" y2="15" />
                  <line x1="28" y1="45" x2="28" y2="49" />
                  <line x1="9" y1="30" x2="13" y2="30" />
                  <line x1="43" y1="30" x2="47" y2="30" />
                  <line x1="15" y1="17" x2="18" y2="20" />
                  <line x1="38" y1="40" x2="41" y2="43" />
                  <line x1="15" y1="43" x2="18" y2="40" />
                  <line x1="38" y1="20" x2="41" y2="17" />
                </g>
                <!-- Center Hub -->
                <circle cx="28" cy="30" r="6" fill="#0f172a" />
                <circle cx="28" cy="30" r="2.5" fill="#94a3b8" />
                <!-- Meshing Cyan/Blue Satellite Cog on Lower Right (matching photo) -->
                <circle cx="44" cy="42" r="9" fill="url(#cog-blue-grad)" stroke="#0369a1" stroke-width="1.2" />
                <circle cx="44" cy="42" r="3.5" fill="#0f172a" />
                <circle cx="44" cy="42" r="1.5" fill="#e0f2fe" />
              </g>
            </svg>
          }

          @case ('fuel') {
            <!-- 3D Fuel Pump Dispenser with Hose & Nozzle -->
            <svg viewBox="0 0 64 64" class="clay-icon" aria-label="Fuel">
              <defs>
                <linearGradient id="pump-grad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stop-color="#3b5278" />
                  <stop offset="100%" stop-color="#1e293b" />
                </linearGradient>
              </defs>
              <g filter="url(#clay-shadow)">
                <!-- Pump Station Body -->
                <rect x="14" y="14" width="24" height="36" rx="4" fill="url(#pump-grad)" stroke="#0f172a" stroke-width="1.2" />
                <!-- Fuel Level LCD Screen -->
                <rect x="18" y="20" width="16" height="10" rx="2" fill="#e0f2fe" stroke="#0284c7" stroke-width="1" />
                <line x1="21" y1="25" x2="31" y2="25" stroke="#0284c7" stroke-width="1.5" />
                <!-- Nozzle Hose Hanging -->
                <path d="M38 22 C44 22 46 28 46 38 C46 44 48 46 51 44 L51 32 L47 28" fill="none" stroke="#64748b" stroke-width="3" stroke-linecap="round" />
              </g>
            </svg>
          }

          @case ('ignition') {
            <!-- 3D Spark Plug with Ribbed Ceramic & Electrode Spark -->
            <svg viewBox="0 0 64 64" class="clay-icon" aria-label="Ignition">
              <g filter="url(#clay-shadow)">
                <!-- Terminal Stud -->
                <rect x="29" y="10" width="6" height="5" rx="1.5" fill="#cbd5e1" />
                <!-- White Ceramic Ribs -->
                <rect x="26" y="15" width="12" height="15" rx="2" fill="#f8fafc" stroke="#94a3b8" stroke-width="1" />
                <line x1="26" y1="19" x2="38" y2="19" stroke="#cbd5e1" stroke-width="1" />
                <line x1="26" y1="24" x2="38" y2="24" stroke="#cbd5e1" stroke-width="1" />
                <!-- Hexagonal Steel Nut -->
                <rect x="24" y="30" width="16" height="8" rx="1.5" fill="#64748b" stroke="#334155" stroke-width="1" />
                <!-- Threaded Metal Body -->
                <rect x="27" y="38" width="10" height="12" fill="#475569" stroke="#1e293b" stroke-width="1" />
                <line x1="27" y1="41" x2="37" y2="41" stroke="#94a3b8" stroke-width="1" />
                <line x1="27" y1="45" x2="37" y2="45" stroke="#94a3b8" stroke-width="1" />
                <!-- Ground Electrode & Spark -->
                <path d="M30 50 L30 55 L35 55" fill="none" stroke="#94a3b8" stroke-width="2" stroke-linecap="round" />
                <circle cx="32" cy="53" r="2" fill="#38bdf8" />
              </g>
            </svg>
          }

          @case ('electrical') {
            <svg viewBox="0 0 64 64" class="clay-icon" aria-label="Battery & Electrical">
              <defs>
                <linearGradient id="el-body" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stop-color="#2a3f5f"/><stop offset="100%" stop-color="#141d2d"/>
                </linearGradient>
                <filter id="el-sh" x="-10%" y="-10%" width="120%" height="130%">
                  <feDropShadow dx="0" dy="4" stdDeviation="3" flood-color="#0f172a" flood-opacity="0.22"/>
                </filter>
              </defs>
              <g filter="url(#el-sh)">
                <rect x="18" y="11" width="8" height="6" rx="2" fill="#e2b168"/>
                <rect x="38" y="11" width="8" height="6" rx="2" fill="#94a3b8"/>
                <rect x="11" y="16" width="42" height="7" rx="3" fill="#3b5278"/>
                <rect x="13" y="22" width="38" height="32" rx="4" fill="url(#el-body)"/>
                <path d="M33 26 L26 37 H32 L29 48 L39 36 H33 Z" fill="#fde68a"/>
              </g>
            </svg>
          }

          @case ('lighting') {
            <svg viewBox="0 0 64 64" class="clay-icon" aria-label="Headlights & Lighting">
              <defs>
                <linearGradient id="lg-lens" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="#f8fafc"/><stop offset="60%" stop-color="#bfdbfe"/><stop offset="100%" stop-color="#60a5fa"/>
                </linearGradient>
                <filter id="lg-sh" x="-10%" y="-10%" width="120%" height="130%">
                  <feDropShadow dx="0" dy="4" stdDeviation="3" flood-color="#0f172a" flood-opacity="0.22"/>
                </filter>
              </defs>
              <g filter="url(#lg-sh)">
                <path d="M10 20h16c9 0 16 5 16 12s-7 12-16 12H10z" fill="url(#lg-lens)" stroke="#475569" stroke-width="1.5"/>
                <rect x="8" y="18" width="6" height="28" rx="3" fill="#64748b"/>
                <circle cx="24" cy="32" r="7" fill="#fff8dc" stroke="#cbd5e1" stroke-width="1.5"/>
                <g stroke="#fbbf24" stroke-width="3" stroke-linecap="round">
                  <line x1="46" y1="24" x2="58" y2="20"/>
                  <line x1="46" y1="32" x2="60" y2="32"/>
                  <line x1="46" y1="40" x2="58" y2="44"/>
                </g>
              </g>
            </svg>
          }

          @case ('glass_wipers') {
            <svg viewBox="0 0 64 64" class="clay-icon" aria-label="Windshield & Wipers">
              <defs>
                <linearGradient id="gw-glass" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="#dbeafe"/><stop offset="100%" stop-color="#93c5fd"/>
                </linearGradient>
                <filter id="gw-sh" x="-10%" y="-10%" width="120%" height="130%">
                  <feDropShadow dx="0" dy="4" stdDeviation="3" flood-color="#0f172a" flood-opacity="0.22"/>
                </filter>
              </defs>
              <g filter="url(#gw-sh)">
                <path d="M12 42l7-22h26l7 22z" fill="url(#gw-glass)" stroke="#475569" stroke-width="1.5" stroke-linejoin="round"/>
                <path d="M16 44l16-20" stroke="#1e293b" stroke-width="3" stroke-linecap="round"/>
                <path d="M14 45h10" stroke="#0f172a" stroke-width="3" stroke-linecap="round"/>
                <path d="M34 44l14-18" stroke="#1e293b" stroke-width="3" stroke-linecap="round"/>
                <path d="M32 45h10" stroke="#0f172a" stroke-width="3" stroke-linecap="round"/>
                <circle cx="40" cy="27" r="2" fill="#e0f2fe"/>
              </g>
            </svg>
          }

          @case ('interior') {
            <svg viewBox="0 0 64 64" class="clay-icon" aria-label="Cabin Interior & Seats">
              <defs>
                <linearGradient id="in-seat" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="#7c5b45"/><stop offset="100%" stop-color="#4a3325"/>
                </linearGradient>
                <filter id="in-sh" x="-10%" y="-10%" width="120%" height="130%">
                  <feDropShadow dx="0" dy="4" stdDeviation="3" flood-color="#0f172a" flood-opacity="0.22"/>
                </filter>
              </defs>
              <g filter="url(#in-sh)">
                <path d="M22 10h14c4 0 6 3 6 7v20H22c-4 0-6-3-6-7V17c0-4 2-7 6-7z" fill="url(#in-seat)"/>
                <path d="M18 38h28c4 0 6 3 6 7v3H24c-4 0-6-2-6-6z" fill="#5b4131"/>
                <g stroke="#8b6a52" stroke-width="1.5">
                  <line x1="26" y1="14" x2="26" y2="34"/>
                  <line x1="32" y1="14" x2="32" y2="34"/>
                  <line x1="38" y1="14" x2="38" y2="34"/>
                </g>
                <rect x="46" y="46" width="5" height="10" rx="2" fill="#334155"/>
              </g>
            </svg>
          }

          @case ('body_exterior') {
            <svg viewBox="0 0 64 64" class="clay-icon" aria-label="Body Panels & Paint">
              <defs>
                <linearGradient id="bx-panel" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="#e2e8f0"/><stop offset="55%" stop-color="#8fa0b1"/><stop offset="100%" stop-color="#4b5b6b"/>
                </linearGradient>
                <filter id="bx-sh" x="-10%" y="-10%" width="120%" height="130%">
                  <feDropShadow dx="0" dy="4" stdDeviation="3" flood-color="#0f172a" flood-opacity="0.22"/>
                </filter>
              </defs>
              <g filter="url(#bx-sh)">
                <path d="M6 46V34c0-8 7-14 15-14h20c8 0 13 6 13 14v12z" fill="url(#bx-panel)" stroke="#1e293b" stroke-width="2" stroke-linejoin="round"/>
                <circle cx="22" cy="46" r="9" fill="#0f172a"/>
                <circle cx="22" cy="46" r="3.5" fill="#94a3b8"/>
                <path d="M40 24h14v8H40z" fill="#2563eb"/>
                <path d="M54 26h6v4h-6z" fill="#1d4ed8"/>
                <g fill="#38bdf8">
                  <circle cx="36" cy="26" r="2"/>
                  <circle cx="33" cy="31" r="1.6"/>
                  <circle cx="36" cy="35" r="1.6"/>
                </g>
              </g>
            </svg>
          }

          @case ('adas_sensors') {
            <svg viewBox="0 0 64 64" class="clay-icon" aria-label="ADAS & Parking Sensors">
              <defs>
                <linearGradient id="ad-body" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stop-color="#94a3b8"/><stop offset="100%" stop-color="#475569"/>
                </linearGradient>
                <filter id="ad-sh" x="-10%" y="-10%" width="120%" height="130%">
                  <feDropShadow dx="0" dy="4" stdDeviation="3" flood-color="#0f172a" flood-opacity="0.22"/>
                </filter>
              </defs>
              <g filter="url(#ad-sh)">
                <path d="M4 44V33c0-3 2-5 5-6l6-8h12v25z" fill="url(#ad-body)" stroke="#1e293b" stroke-width="2" stroke-linejoin="round"/>
                <path d="M11 27l5-5h9v5z" fill="#bfdbfe"/>
                <circle cx="12" cy="48" r="5" fill="#1e293b"/>
                <rect x="24" y="34" width="6" height="6" rx="2" fill="#38bdf8"/>
                <g fill="none" stroke="#38bdf8" stroke-width="3.5" stroke-linecap="round">
                  <path d="M36 28a14 14 0 0 1 0 18"/>
                  <path d="M45 22a24 24 0 0 1 0 30" opacity="0.65"/>
                  <path d="M54 16a34 34 0 0 1 0 42" opacity="0.35"/>
                </g>
              </g>
            </svg>
          }

          @case ('drivetrain') {
            <svg viewBox="0 0 64 64" class="clay-icon" aria-label="Drivetrain & Differential">
              <defs>
                <linearGradient id="dt-shaft" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stop-color="#f1f5f9"/><stop offset="45%" stop-color="#94a3b8"/><stop offset="100%" stop-color="#475569"/>
                </linearGradient>
                <filter id="dt-sh" x="-10%" y="-10%" width="120%" height="130%">
                  <feDropShadow dx="0" dy="4" stdDeviation="3" flood-color="#0f172a" flood-opacity="0.22"/>
                </filter>
              </defs>
              <g filter="url(#dt-sh)">
                <rect x="4" y="27" width="34" height="10" rx="5" fill="url(#dt-shaft)"/>
                <rect x="2" y="22" width="7" height="20" rx="3" fill="#334155"/>
                <rect x="34" y="22" width="7" height="20" rx="3" fill="#334155"/>
                <circle cx="48" cy="32" r="15" fill="#64748b" stroke="#1e293b" stroke-width="2.5"/>
                <circle cx="48" cy="32" r="6" fill="#cbd5e1" stroke="#334155" stroke-width="2"/>
                <rect x="44" y="8" width="8" height="11" rx="3" fill="#475569"/>
                <path d="M48 47v9" stroke="#334155" stroke-width="5" stroke-linecap="round"/>
              </g>
            </svg>
          }

          @case ('chassis_frame') {
            <svg viewBox="0 0 64 64" class="clay-icon" aria-label="Chassis & Underbody">
              <defs>
                <linearGradient id="ch-pan" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stop-color="#94a3b8"/><stop offset="100%" stop-color="#334155"/>
                </linearGradient>
                <filter id="ch-sh" x="-10%" y="-10%" width="120%" height="130%">
                  <feDropShadow dx="0" dy="4" stdDeviation="3" flood-color="#0f172a" flood-opacity="0.22"/>
                </filter>
              </defs>
              <g filter="url(#ch-sh)">
                <path d="M10 18h44a4 4 0 0 1 4 4v14a6 6 0 0 1-6 6H12a6 6 0 0 1-6-6V22a4 4 0 0 1 4-4z" fill="url(#ch-pan)" stroke="#1e293b" stroke-width="2"/>
                <path d="M16 26h32M16 34h32" stroke="#64748b" stroke-width="3" stroke-linecap="round"/>
                <circle cx="16" cy="48" r="8" fill="#1e293b"/>
                <circle cx="16" cy="48" r="3" fill="#94a3b8"/>
                <circle cx="48" cy="48" r="8" fill="#1e293b"/>
                <circle cx="48" cy="48" r="3" fill="#94a3b8"/>
                <path d="M24 48h16" stroke="#475569" stroke-width="4" stroke-linecap="round"/>
              </g>
            </svg>
          }

          @case ('hybrid_ev') {
            <svg viewBox="0 0 64 64" class="clay-icon" aria-label="Hybrid & EV System">
              <defs>
                <linearGradient id="ev-pack" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stop-color="#16a34a"/><stop offset="100%" stop-color="#14532d"/>
                </linearGradient>
                <filter id="ev-sh" x="-10%" y="-10%" width="120%" height="130%">
                  <feDropShadow dx="0" dy="4" stdDeviation="3" flood-color="#0f172a" flood-opacity="0.22"/>
                </filter>
              </defs>
              <g filter="url(#ev-sh)">
                <rect x="10" y="20" width="36" height="26" rx="5" fill="url(#ev-pack)"/>
                <rect x="46" y="27" width="6" height="12" rx="2" fill="#166534"/>
                <path d="M28 24 L21 35 H27 L24 44 L34 33 H28 Z" fill="#ecfdf5"/>
                <g stroke="#4ade80" stroke-width="3" stroke-linecap="round">
                  <line x1="54" y1="24" x2="58" y2="20"/>
                  <line x1="54" y1="42" x2="58" y2="46"/>
                </g>
              </g>
            </svg>
          }

          @case ('airbags_safety') {
            <svg viewBox="0 0 64 64" class="clay-icon" aria-label="Airbags & SRS">
              <defs>
                <radialGradient id="ab-bag" cx="40%" cy="35%" r="65%">
                  <stop offset="0%" stop-color="#ffffff"/><stop offset="70%" stop-color="#e2e8f0"/><stop offset="100%" stop-color="#94a3b8"/>
                </radialGradient>
                <filter id="ab-sh" x="-10%" y="-10%" width="120%" height="130%">
                  <feDropShadow dx="0" dy="4" stdDeviation="3" flood-color="#0f172a" flood-opacity="0.22"/>
                </filter>
              </defs>
              <g filter="url(#ab-sh)">
                <path d="M12 46V30c0-4 3-7 7-7h6v23z" fill="#64748b"/>
                <circle cx="38" cy="30" r="16" fill="url(#ab-bag)" stroke="#94a3b8" stroke-width="1.5"/>
                <path d="M28 44h22c2 0 3 2 3 4H26z" fill="#475569"/>
                <text x="38" y="35" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" font-weight="700" fill="#dc2626">SRS</text>
              </g>
            </svg>
          }

          @case ('doors_locks') {
            <svg viewBox="0 0 64 64" class="clay-icon" aria-label="Doors, Locks & Windows">
              <defs>
                <linearGradient id="dl-door" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="#cbd5e1"/><stop offset="100%" stop-color="#64748b"/>
                </linearGradient>
                <filter id="dl-sh" x="-10%" y="-10%" width="120%" height="130%">
                  <feDropShadow dx="0" dy="4" stdDeviation="3" flood-color="#0f172a" flood-opacity="0.22"/>
                </filter>
              </defs>
              <g filter="url(#dl-sh)">
                <path d="M12 16h26c4 0 6 3 6 7v30H12z" fill="url(#dl-door)" stroke="#475569" stroke-width="1.5"/>
                <path d="M17 21h20c2 0 3 1 3 3v8H17z" fill="#bfdbfe"/>
                <rect x="16" y="36" width="16" height="3" rx="1.5" fill="#475569"/>
                <rect x="46" y="30" width="12" height="12" rx="3" fill="#fbbf24"/>
                <path d="M52 30v-4a3 3 0 0 1 6 0v4" fill="none" stroke="#fbbf24" stroke-width="2.5"/>
                <circle cx="52" cy="36" r="2" fill="#78350f"/>
              </g>
            </svg>
          }

          @case ('turbo') {
            <svg viewBox="0 0 64 64" class="clay-icon" aria-label="Turbocharger & Intake">
              <defs>
                <radialGradient id="tb-snail" cx="42%" cy="38%" r="62%">
                  <stop offset="0%" stop-color="#e2e8f0"/><stop offset="60%" stop-color="#7c8a99"/><stop offset="100%" stop-color="#2f3a45"/>
                </radialGradient>
                <filter id="tb-sh" x="-10%" y="-10%" width="120%" height="130%">
                  <feDropShadow dx="0" dy="4" stdDeviation="3" flood-color="#0f172a" flood-opacity="0.22"/>
                </filter>
              </defs>
              <g filter="url(#tb-sh)">
                <path d="M40 8a24 24 0 1 1-24 24h12a12 12 0 1 0 12-12z" fill="url(#tb-snail)" stroke="#1e293b" stroke-width="2" stroke-linejoin="round"/>
                <rect x="34" y="4" width="16" height="12" rx="4" fill="#475569" stroke="#1e293b" stroke-width="2"/>
                <rect x="4" y="26" width="14" height="12" rx="4" fill="#475569" stroke="#1e293b" stroke-width="2"/>
                <circle cx="40" cy="32" r="9" fill="#cbd5e1" stroke="#334155" stroke-width="2"/>
                <g stroke="#475569" stroke-width="2.5" stroke-linecap="round">
                  <path d="M40 25v7"/><path d="M46 36l-6-4"/><path d="M34 36l6-4"/>
                </g>
              </g>
            </svg>
          }

          @case ('clutch') {
            <svg viewBox="0 0 64 64" class="clay-icon" aria-label="Clutch & Gearshift">
              <defs>
                <radialGradient id="cl-disc" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stop-color="#f1f5f9"/><stop offset="60%" stop-color="#94a3b8"/><stop offset="100%" stop-color="#475569"/>
                </radialGradient>
                <filter id="cl-sh" x="-10%" y="-10%" width="120%" height="130%">
                  <feDropShadow dx="0" dy="4" stdDeviation="3" flood-color="#0f172a" flood-opacity="0.22"/>
                </filter>
              </defs>
              <g filter="url(#cl-sh)">
                <circle cx="32" cy="32" r="22" fill="url(#cl-disc)" stroke="#334155" stroke-width="2"/>
                <circle cx="32" cy="32" r="8" fill="#64748b" stroke="#1e293b" stroke-width="2"/>
                <g stroke="#334155" stroke-width="2.5">
                  <line x1="32" y1="10" x2="32" y2="20"/>
                  <line x1="32" y1="44" x2="32" y2="54"/>
                  <line x1="10" y1="32" x2="20" y2="32"/>
                  <line x1="44" y1="32" x2="54" y2="32"/>
                  <line x1="17" y1="17" x2="24" y2="24"/>
                  <line x1="40" y1="40" x2="47" y2="47"/>
                  <line x1="47" y1="17" x2="40" y2="24"/>
                  <line x1="24" y1="40" x2="17" y2="47"/>
                </g>
                <circle cx="32" cy="32" r="3" fill="#1e293b"/>
              </g>
            </svg>
          }

          @case ('belts') {
            <svg viewBox="0 0 64 64" class="clay-icon" aria-label="Belts, Chains & Pulleys">
              <defs>
                <filter id="bl-sh" x="-10%" y="-10%" width="120%" height="130%">
                  <feDropShadow dx="0" dy="4" stdDeviation="3" flood-color="#0f172a" flood-opacity="0.22"/>
                </filter>
              </defs>
              <g filter="url(#bl-sh)">
                <path d="M22 12h20a16 16 0 0 1 0 32H22a16 16 0 0 1 0-32z" fill="none" stroke="#0f172a" stroke-width="9"/>
                <path d="M22 12h20a16 16 0 0 1 0 32H22a16 16 0 0 1 0-32z" fill="none" stroke="#475569" stroke-width="3" stroke-dasharray="4 4"/>
                <circle cx="22" cy="28" r="11" fill="#cbd5e1" stroke="#475569" stroke-width="2.5"/>
                <circle cx="22" cy="28" r="4" fill="#334155"/>
                <circle cx="42" cy="28" r="11" fill="#cbd5e1" stroke="#475569" stroke-width="2.5"/>
                <circle cx="42" cy="28" r="4" fill="#334155"/>
              </g>
            </svg>
          }

          @case ('filters') {
            <svg viewBox="0 0 64 64" class="clay-icon" aria-label="Filters">
              <defs>
                <linearGradient id="fl-frame" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stop-color="#e8eef3"/><stop offset="100%" stop-color="#9aa8b5"/>
                </linearGradient>
                <filter id="fl-sh" x="-10%" y="-10%" width="120%" height="130%">
                  <feDropShadow dx="0" dy="4" stdDeviation="3" flood-color="#0f172a" flood-opacity="0.22"/>
                </filter>
              </defs>
              <g filter="url(#fl-sh)">
                <rect x="6" y="16" width="52" height="32" rx="6" fill="url(#fl-frame)" stroke="#475569" stroke-width="2.5"/>
                <path d="M12 44l5-24 5 24 5-24 5 24 5-24 5 24 5-24 5 24" fill="none" stroke="#e2b168" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/>
                <rect x="6" y="16" width="52" height="6" rx="3" fill="#64748b"/>
                <rect x="6" y="42" width="52" height="6" rx="3" fill="#64748b"/>
              </g>
            </svg>
          }

          @default {
            <!-- 3D Professional Mechanics Chrome & Blue Torque Wrench -->
            <svg viewBox="0 0 64 64" class="clay-icon" aria-label="General Maintenance">
              <defs>
                <linearGradient id="tool-chrome" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="#f8fafc" />
                  <stop offset="50%" stop-color="#cbd5e1" />
                  <stop offset="100%" stop-color="#64748b" />
                </linearGradient>
                <linearGradient id="tool-grip" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="#2563eb" />
                  <stop offset="100%" stop-color="#1e3a8a" />
                </linearGradient>
              </defs>
              <g filter="url(#clay-shadow)">
                <!-- Ratchet Head -->
                <path d="M48 14 C44 10 37 12 33 16 L14 35 C12 37 12 40 14 42 L20 48 C22 50 25 50 27 48 L46 29 C50 25 52 18 48 14 Z" fill="url(#tool-chrome)" stroke="#475569" stroke-width="1" />
                <!-- Wrench Open Jaw Notch -->
                <circle cx="43" cy="19" r="5" fill="#ffffff" />
                <!-- Ergonomic Rubber Grip -->
                <rect x="14" y="38" width="8" height="15" rx="3" transform="rotate(-45 18 45)" fill="url(#tool-grip)" />
              </g>
            </svg>
          }
        }
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
      height: 100%;
    }

    .part-photo-box {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 4px;
    }

    /* Clean, soft-shadowed white clay pill card matching the attached design samples */
    .icon-frame {
      /* Fills whatever the host is given rather than pinning 62px, so a
         surface that wants the drawing bigger -- the booking-in sheet
         asks for 82 -- actually gets a bigger drawing instead of the same
         tile floating in more space. */
      width: 100%;
      height: 100%;
      max-width: 96px;
      max-height: 96px;
      border-radius: 20px;
      background: #ffffff;
      border: 1.5px solid #e2e8f0;
      box-shadow: 0 6px 18px rgba(15, 23, 42, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      position: relative;
    }

    :host-context(.studio-service-card:hover) .icon-frame,
    :host-context(.studio-service-card--active) .icon-frame,
    :host-context(.box-header-row:hover) .icon-frame {
      border-color: #93c5fd;
      background: #f8fafc;
      box-shadow: 0 10px 24px rgba(37, 99, 235, 0.16);
      transform: translateY(-2px) scale(1.05);
    }

    .clay-icon {
      width: 48px;
      height: 48px;
      display: block;
      transition: transform 0.2s ease;
    }

    :host-context(.studio-service-card:hover) .clay-icon,
    :host-context(.box-header-row:hover) .clay-icon {
      transform: scale(1.05);
    }
  `],
})
export class AnimatedPartIconComponent {
  readonly part = input<string>('general');
  protected readonly partKey = computed(() => {
    const raw = (this.part() ?? 'general').toLowerCase().trim();
    if (raw.includes('tire') || raw.includes('wheel')) return 'tires';
    if (raw.includes('bat')) return 'battery';
    if (raw.includes('brake')) return 'brakes';
    if (raw.includes('radio') || raw.includes('audio') || raw.includes('info') || raw.includes('screen') || raw.includes('multimedia')) return 'infotainment';
    if (raw.includes('fluid') || raw.includes('oil')) return 'fluids';
    if (raw.includes('eng')) return 'engine';
    if (raw.includes('trans')) return 'transmission';
    if (raw.includes('susp')) return 'suspension';
    if (raw.includes('cool') || raw.includes('radiat')) return 'cooling';
    if (raw.includes('ac') || raw.includes('air_cond') || raw.includes('climat')) return 'ac';
    if (raw.includes('exh') || raw.includes('muff')) return 'exhaust';
    if (raw.includes('steer') || raw.includes('gear')) return 'steering';
    if (raw.includes('fuel')) return 'fuel';
    if (raw.includes('ignit') || raw.includes('spark')) return 'ignition';
    return raw;
  });
}
