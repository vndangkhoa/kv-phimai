package com.phimai.tv

import com.phimai.tv.data.model.TvFilm
import com.phimai.tv.data.util.TvPhimAiUtils
import org.junit.Assert.assertEquals
import org.junit.Test

class TvPhimAiUtilsTest {

    @Test
    fun formatViewsVN() {
        assertEquals("2,1 Tr lượt xem", TvPhimAiUtils.formatViewsVN("2100000"))
        assertEquals("15 N lượt xem", TvPhimAiUtils.formatViewsVN("15200"))
        assertEquals("Đang hot", TvPhimAiUtils.formatChannelViews("", ""))
        assertEquals("Timo • 15 N lượt xem", TvPhimAiUtils.formatChannelViews("Timo", "15000"))
    }

    @Test
    fun stackSeriesGroupsEpisodesAscending() {
        val ep2 = TvFilm(id = "e2", rank = 5002, title = "Vũ Nghịch Càn Khôn - Tập 02", channel = "Phim AI 3D", views = "8000")
        val ep1 = TvFilm(id = "e1", rank = 5001, title = "Vũ Nghịch Càn Khôn - Tập 01", channel = "Phim AI 3D", views = "19000")
        val res = TvPhimAiUtils.stackSeriesForGrid(listOf(ep2, ep1))
        assertEquals(1, res.size)
        assertEquals("e1", res[0].id)
        assertEquals(listOf("e1", "e2"), res[0].stackedEpisodes.map { it.id })
    }

    @Test
    fun rewriteGatewayUrlAndResolveServerUrl() {
        assertEquals(
            "https://phimai.khoavo.myds.me/api/invidious/companion/videoplayback?itag=18",
            TvPhimAiUtils.resolveServerUrl("https://phimai.khoavo.myds.me/", "/videoplayback?itag=18")
        )
        assertEquals(
            "https://phimai.khoavo.myds.me/api/invidious/companion/videoplayback?id=x",
            TvPhimAiUtils.rewriteGatewayUrl(
                "https://phimai.khoavo.myds.me/companion/videoplayback?id=x",
                "phimai.khoavo.myds.me"
            )
        )
    }
}
