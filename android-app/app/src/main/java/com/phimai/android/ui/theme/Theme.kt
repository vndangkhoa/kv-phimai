package com.phimai.android.ui.theme

import android.app.Activity
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

private val CinemaDarkColorScheme = darkColorScheme(
    primary = CinemaPalette.gold,
    onPrimary = CinemaPalette.obsidian,
    primaryContainer = CinemaPalette.goldMuted.compositeOver(CinemaPalette.slate),
    onPrimaryContainer = CinemaPalette.gold,
    secondary = CinemaPalette.amber,
    onSecondary = CinemaPalette.obsidian,
    secondaryContainer = CinemaPalette.slateRaised,
    onSecondaryContainer = CinemaPalette.ivory,
    tertiary = CinemaPalette.crimson,
    onTertiary = CinemaPalette.ivory,
    background = CinemaPalette.obsidian,
    onBackground = CinemaPalette.ivory,
    surface = CinemaPalette.slate,
    onSurface = CinemaPalette.ivory,
    surfaceVariant = CinemaPalette.slateRaised,
    onSurfaceVariant = CinemaPalette.textSecondary,
    surfaceContainerLowest = CinemaPalette.obsidian,
    surfaceContainerLow = CinemaPalette.slate,
    surfaceContainer = CinemaPalette.slate,
    surfaceContainerHigh = CinemaPalette.slateRaised,
    surfaceContainerHighest = CinemaPalette.slateRaised,
    outline = CinemaPalette.borderEmphasized.compositeOver(CinemaPalette.obsidian),
    outlineVariant = CinemaPalette.border.compositeOver(CinemaPalette.obsidian),
    error = CinemaPalette.crimson,
    onError = CinemaPalette.ivory,
    errorContainer = CinemaPalette.crimsonMuted.compositeOver(CinemaPalette.obsidian),
    onErrorContainer = CinemaPalette.crimsonSoft,
    scrim = CinemaPalette.overlay
)

val CinemaShapes = Shapes(
    extraSmall = RoundedCornerShape(CinemaRadius.inner),
    small = RoundedCornerShape(CinemaRadius.element),
    medium = RoundedCornerShape(CinemaRadius.container),
    large = RoundedCornerShape(CinemaRadius.page),
    extraLarge = RoundedCornerShape(CinemaRadius.page)
)

@Composable
fun PhimAiTheme(content: @Composable () -> Unit) {
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as? Activity)?.window ?: return@SideEffect
            @Suppress("DEPRECATION")
            window.statusBarColor = CinemaPalette.obsidian.toArgb()
            @Suppress("DEPRECATION")
            window.navigationBarColor = CinemaPalette.obsidian.toArgb()
            val controller = WindowCompat.getInsetsController(window, view)
            controller.isAppearanceLightStatusBars = false
            controller.isAppearanceLightNavigationBars = false
        }
    }

    CompositionLocalProvider(LocalCinemaNoir provides CinemaPalette) {
        MaterialTheme(
            colorScheme = CinemaDarkColorScheme,
            typography = PhimAiTypography,
            shapes = CinemaShapes,
            content = content
        )
    }
}

val cinema: CinemaNoirColors
    @Composable get() = LocalCinemaNoir.current
