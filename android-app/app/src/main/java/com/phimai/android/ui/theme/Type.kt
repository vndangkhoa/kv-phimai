package com.phimai.android.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.phimai.android.R

val FigtreeFamily = FontFamily(
    Font(R.font.figtree_regular, FontWeight.Normal),
    Font(R.font.figtree_medium, FontWeight.Medium),
    Font(R.font.figtree_semibold, FontWeight.SemiBold),
    Font(R.font.figtree_bold, FontWeight.Bold)
)

private fun style(size: Double, weight: FontWeight, line: Double = size * 1.4) = TextStyle(
    fontFamily = FigtreeFamily,
    fontWeight = weight,
    fontSize = size.sp,
    lineHeight = line.sp,
    letterSpacing = 0.sp
)

val PhimAiTypography = Typography(
    displayLarge = style(40.0, FontWeight.Bold, 48.0),
    displayMedium = style(34.0, FontWeight.Bold, 42.0),
    displaySmall = style(28.0, FontWeight.Bold, 35.0),
    headlineLarge = style(26.0, FontWeight.Bold, 33.0),
    headlineMedium = style(22.0, FontWeight.Bold, 29.0),
    headlineSmall = style(18.0, FontWeight.Bold, 24.0),
    titleLarge = style(20.0, FontWeight.Bold, 26.0),
    titleMedium = style(15.0, FontWeight.SemiBold, 21.0),
    titleSmall = style(13.0, FontWeight.SemiBold, 18.0),
    bodyLarge = style(16.0, FontWeight.Normal, 23.0),
    bodyMedium = style(14.5, FontWeight.Normal, 20.5),
    bodySmall = style(12.5, FontWeight.Normal, 17.5),
    labelLarge = style(14.0, FontWeight.SemiBold, 19.0),
    labelMedium = style(12.0, FontWeight.Medium, 16.0),
    labelSmall = style(11.0, FontWeight.Medium, 15.0)
)
