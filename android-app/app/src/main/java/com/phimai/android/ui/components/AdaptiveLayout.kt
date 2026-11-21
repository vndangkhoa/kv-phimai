package com.phimai.android.ui.components

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.phimai.android.ui.adaptive.LocalWidthClass
import com.phimai.android.ui.adaptive.LocalWindowState
import com.phimai.android.ui.adaptive.WidthClass
import com.phimai.android.ui.adaptive.WindowState

const val NavRailWidthDp = 88
const val WideGridPaddingDp = 16
const val WideGridSpacingDp = 14
const val MaxGridContentWidthDp = 2400
const val MaxReadableWidthDp = 760

private fun availableGridWidthDp(windowWidthDp: Int, hasRail: Boolean): Int =
    (windowWidthDp - (if (hasRail) NavRailWidthDp else 0) - 2 * WideGridPaddingDp).coerceAtLeast(320)

/**
 * Film grid columns:
 * - Compact (< 600dp): 1 column
 * - Medium (600..839dp foldable / compact tablet): 2 columns
 * - Expanded (>= 840dp tablet / unfolded landscape): 3..5 columns
 */
fun videoGridColumnCount(windowState: WindowState): Int = when (windowState.widthClass) {
    WidthClass.Compact -> 1
    WidthClass.Medium -> 2
    WidthClass.Expanded -> {
        val avail = availableGridWidthDp(windowState.widthDp, windowState.useNavigationRail)
        (avail / 305f).toInt().coerceIn(3, 5)
    }
}

fun channelGridColumnCount(windowState: WindowState): Int = when (windowState.widthClass) {
    WidthClass.Compact -> 1
    WidthClass.Medium -> 2
    WidthClass.Expanded -> {
        val avail = availableGridWidthDp(windowState.widthDp, windowState.useNavigationRail)
        (avail / 335f).toInt().coerceIn(2, 4)
    }
}

@Composable
fun rememberVideoGridCells(): GridCells {
    val ws = LocalWindowState.current
    return remember(ws.widthClass, ws.widthDp, ws.useNavigationRail) {
        GridCells.Fixed(videoGridColumnCount(ws))
    }
}

@Composable
fun rememberChannelGridCells(): GridCells {
    val ws = LocalWindowState.current
    return remember(ws.widthClass, ws.widthDp, ws.useNavigationRail) {
        GridCells.Fixed(channelGridColumnCount(ws))
    }
}

@Composable
fun gridHorizontalSpacing(): Dp =
    if (LocalWidthClass.current.isWide) WideGridSpacingDp.dp else 10.dp

@Composable
fun gridVerticalSpacing(): Dp =
    if (LocalWidthClass.current.isWide) 18.dp else 16.dp

@Composable
fun CenteredContent(
    modifier: Modifier = Modifier,
    maxWidth: Dp = MaxGridContentWidthDp.dp,
    content: @Composable BoxScope.() -> Unit
) {
    Box(
        modifier = modifier.fillMaxSize(),
        contentAlignment = Alignment.TopCenter
    ) {
        Box(
            modifier = Modifier
                .widthIn(max = maxWidth)
                .fillMaxSize(),
            content = content
        )
    }
}
