package com.phimai.android.ui.theme

import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

/**
 * PhimAI Cinema Noir Astryx Design System Tokens.
 * Ported 1:1 from `frontend/src/theme/cinemaNoirTheme.ts`:
 * Obsidian #0D0E14 · Slate #161822 · Slate Raised #1E2130
 * Tungsten Gold #FFD875 · Cinema Crimson #E50914 · Ivory #F4F4F6
 */
@Immutable
data class CinemaNoirColors(
    val obsidian: Color = Color(0xFF0D0E14),
    val slate: Color = Color(0xFF161822),
    val slateRaised: Color = Color(0xFF1E2130),
    val gold: Color = Color(0xFFFFD875),
    val goldMuted: Color = Color(0x29FFD875),
    val amber: Color = Color(0xFFE6B949),
    val crimson: Color = Color(0xFFE50914),
    val crimsonSoft: Color = Color(0xFFFF6B72),
    val crimsonMuted: Color = Color(0x2EE50914),
    val emerald: Color = Color(0xFF10B981),
    val ivory: Color = Color(0xFFF4F4F6),
    val textSecondary: Color = Color(0xFFC4C8D9),
    val textMuted: Color = Color(0xFF989FB8),
    val textDisabled: Color = Color(0xFF6B7189),
    val border: Color = Color(0x1CF4F4F6),
    val borderEmphasized: Color = Color(0x3DF4F4F6),
    val overlay: Color = Color(0xC704050A),
    val info: Color = Color(0xFF3B82F6)
)

val CinemaPalette = CinemaNoirColors()

object CinemaRadius {
    val inner = 6.dp
    val element = 8.dp
    val container = 12.dp
    val page = 16.dp
}

val LocalCinemaNoir = staticCompositionLocalOf { CinemaPalette }
