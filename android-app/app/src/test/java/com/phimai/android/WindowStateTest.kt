package com.phimai.android

import com.phimai.android.ui.adaptive.FoldPosture
import com.phimai.android.ui.adaptive.WidthClass
import com.phimai.android.ui.adaptive.computeWindowState
import com.phimai.android.ui.components.channelGridColumnCount
import com.phimai.android.ui.components.videoGridColumnCount
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class WindowStateTest {

    @Test
    fun compactPhoneLayoutAndGrid() {
        val state = computeWindowState(widthDp = 412, heightDp = 915)
        assertEquals(WidthClass.Compact, state.widthClass)
        assertTrue(state.isCompact)
        assertFalse(state.isWide)
        assertFalse(state.useNavigationRail)
        assertEquals(1, videoGridColumnCount(state))
        assertEquals(1, channelGridColumnCount(state))
    }

    @Test
    fun mediumFoldablePortraitLayout() {
        val state = computeWindowState(widthDp = 680, heightDp = 840)
        assertEquals(WidthClass.Medium, state.widthClass)
        assertTrue(state.isWide)
        assertTrue(state.isFoldablePortraitWatch)
        assertFalse(state.useNavigationRail)
        assertEquals(2, videoGridColumnCount(state))
        assertEquals(2, channelGridColumnCount(state))
    }

    @Test
    fun expandedTabletLandscapeLayoutAndRail() {
        val state = computeWindowState(widthDp = 1280, heightDp = 800)
        assertEquals(WidthClass.Expanded, state.widthClass)
        assertTrue(state.useNavigationRail)
        assertTrue(state.isLandscapeTwoPaneWatch)
        assertTrue(videoGridColumnCount(state) in 3..5)
        assertTrue(channelGridColumnCount(state) in 2..4)
    }

    @Test
    fun foldableTabletopPosturePreservesHorizontalHinge() {
        val state = computeWindowState(
            widthDp = 840,
            heightDp = 720,
            isHalfOpened = true,
            isHorizontalHinge = true,
            hingeTopDp = 350f,
            hingeHeightDp = 12f
        )
        assertEquals(FoldPosture.Tabletop, state.foldPosture)
        assertTrue(state.isTabletop)
        assertEquals(350f, state.hingeTopDp, 0.01f)
        assertEquals(12f, state.hingeHeightDp, 0.01f)
        assertEquals(0f, state.hingeStartDp, 0.01f)
    }

    @Test
    fun foldableBookPosturePreservesVerticalHingeAndTwoPaneWatch() {
        val state = computeWindowState(
            widthDp = 820,
            heightDp = 900,
            isHalfOpened = true,
            isHorizontalHinge = false,
            hingeStartDp = 402f,
            hingeWidthDp = 16f
        )
        assertEquals(FoldPosture.Book, state.foldPosture)
        assertTrue(state.isBook)
        assertTrue(state.isLandscapeTwoPaneWatch)
        assertFalse(state.isFoldablePortraitWatch)
        assertEquals(402f, state.hingeStartDp, 0.01f)
        assertEquals(16f, state.hingeWidthDp, 0.01f)
    }
}
