package com.phimai.tv.ui.theme

import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Typography
import androidx.tv.material3.darkColorScheme
import com.phimai.tv.R

object TvCinema {
    val Obsidian = Color(0xFF0D0E14)
    val Slate = Color(0xFF161822)
    val SlateRaised = Color(0xFF1E2130)
    val Gold = Color(0xFFFFD875)
    val GoldMuted = Color(0x29FFD875)
    val Crimson = Color(0xFFE50914)
    val CrimsonSoft = Color(0xFFFF6B72)
    val Emerald = Color(0xFF10B981)
    val Ivory = Color(0xFFF4F4F6)
    val TextSecondary = Color(0xFFC4C8D9)
    val TextMuted = Color(0xFF989FB8)
    val Border = Color(0x24F4F4F6)
}

val TvFigtree = FontFamily(
    Font(R.font.figtree_regular, FontWeight.Normal),
    Font(R.font.figtree_medium, FontWeight.Medium),
    Font(R.font.figtree_semibold, FontWeight.SemiBold),
    Font(R.font.figtree_bold, FontWeight.Bold)
)

@OptIn(ExperimentalTvMaterial3Api::class)
private val TvDarkScheme = darkColorScheme(
    primary = TvCinema.Gold,
    onPrimary = TvCinema.Obsidian,
    primaryContainer = TvCinema.SlateRaised,
    onPrimaryContainer = TvCinema.Gold,
    secondary = TvCinema.Crimson,
    onSecondary = Color.White,
    background = TvCinema.Obsidian,
    onBackground = TvCinema.Ivory,
    surface = TvCinema.Slate,
    onSurface = TvCinema.Ivory,
    surfaceVariant = TvCinema.SlateRaised,
    onSurfaceVariant = TvCinema.TextSecondary,
    error = TvCinema.Crimson,
    onError = Color.White
)

@OptIn(ExperimentalTvMaterial3Api::class)
private val TvTypography = Typography(
    displayLarge = TextStyle(fontFamily = TvFigtree, fontWeight = FontWeight.Bold, fontSize = 36.sp),
    headlineLarge = TextStyle(fontFamily = TvFigtree, fontWeight = FontWeight.Bold, fontSize = 26.sp),
    headlineMedium = TextStyle(fontFamily = TvFigtree, fontWeight = FontWeight.Bold, fontSize = 22.sp),
    headlineSmall = TextStyle(fontFamily = TvFigtree, fontWeight = FontWeight.Bold, fontSize = 18.sp),
    titleLarge = TextStyle(fontFamily = TvFigtree, fontWeight = FontWeight.Bold, fontSize = 19.sp),
    titleMedium = TextStyle(fontFamily = TvFigtree, fontWeight = FontWeight.SemiBold, fontSize = 15.sp),
    titleSmall = TextStyle(fontFamily = TvFigtree, fontWeight = FontWeight.SemiBold, fontSize = 13.sp),
    bodyLarge = TextStyle(fontFamily = TvFigtree, fontSize = 16.sp),
    bodyMedium = TextStyle(fontFamily = TvFigtree, fontSize = 14.sp),
    bodySmall = TextStyle(fontFamily = TvFigtree, fontSize = 12.sp),
    labelMedium = TextStyle(fontFamily = TvFigtree, fontWeight = FontWeight.Medium, fontSize = 12.sp),
    labelSmall = TextStyle(fontFamily = TvFigtree, fontWeight = FontWeight.Medium, fontSize = 11.sp)
)

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun PhimAiTvTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = TvDarkScheme,
        typography = TvTypography,
        content = content
    )
}
