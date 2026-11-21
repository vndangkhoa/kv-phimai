package com.phimai.android

import com.phimai.android.data.model.Film
import com.phimai.android.data.model.StreamFormatItem
import com.phimai.android.data.model.VideoStreamPayload
import com.phimai.android.data.util.PhimAiUtils
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PhimAiUtilsTest {

    @Test
    fun viNormNormalizesVietnameseDiacriticsAndĐ() {
        assertEquals("pham nhan tu tien dai chien", PhimAiUtils.viNorm("Phàm Nhân Tu Tiên: Đại Chiến"))
    }

    @Test
    fun formatViewsVNFormatsMillionsAndThousands() {
        assertEquals("1,5 Tr lượt xem", PhimAiUtils.formatViewsVN("1500000"))
        assertEquals("24 N lượt xem", PhimAiUtils.formatViewsVN("24100"))
        assertEquals("850 lượt xem", PhimAiUtils.formatViewsVN("850"))
    }

    @Test
    fun stackSeriesCollapsesEpisodesAscendingAndPreservesSingles() {
        val ep3 = Film(id = "ep3", rank = 9003, title = "Triều Tuyết Lục - Tập 03", channel = "Phim Cổ Trang", views = "5000")
        val ep1 = Film(id = "ep1", rank = 9001, title = "Triều Tuyết Lục - Tập 01", channel = "Phim Cổ Trang", views = "12000")
        val single = Film(id = "s1", rank = 9100, title = "Chiến Thần Trở Về FULL", channel = "Phim Hay", views = "30000")
        val stacked = PhimAiUtils.stackSeriesForGrid(listOf(single, ep3, ep1))

        assertEquals(2, stacked.size)
        assertEquals("s1", stacked[0].id)
        assertEquals("ep1", stacked[1].id)
        assertEquals(2, stacked[1].stackedEpisodes.size)
        assertEquals(listOf("ep1", "ep3"), stacked[1].stackedEpisodes.map { it.id })
        assertEquals(9003, stacked[1].rank)
        assertEquals("12000", stacked[1].views)
    }

    @Test
    fun rewriteGatewayUrlProxiesCompanionAndVideoplaybackThroughInvidious() {
        assertEquals(
            "https://phimai.khoavo.myds.me/api/invidious/companion/videoplayback?id=1",
            PhimAiUtils.rewriteGatewayUrl(
                "https://phimai.khoavo.myds.me/companion/videoplayback?id=1",
                "phimai.khoavo.myds.me"
            )
        )
        assertEquals(
            "https://phimai.khoavo.myds.me/api/invidious/companion/videoplayback?itag=18&host=rr1---sn.googlevideo.com",
            PhimAiUtils.rewriteGatewayUrl(
                "https://rr1---sn.googlevideo.com/videoplayback?itag=18",
                "phimai.khoavo.myds.me"
            )
        )
    }

    @Test
    fun buildQualityListPrefersMuxedStreamsWhenSameHeightExists() {
        val payload = VideoStreamPayload(
            id = "test",
            adaptiveFormats = listOf(
                StreamFormatItem(url = "/companion/videoplayback?itag=137", itag = "137", qualityLabel = "1080p", type = "video/mp4; codecs=\"avc1.640028\""),
                StreamFormatItem(url = "/companion/videoplayback?itag=134", itag = "134", qualityLabel = "360p", type = "video/mp4")
            ),
            formatStreams = listOf(
                StreamFormatItem(url = "/companion/videoplayback?itag=18", itag = "18", qualityLabel = "360p", type = "video/mp4", hasAudio = true)
            )
        )
        val list = PhimAiUtils.buildQualityList(payload, "https://phimai.khoavo.myds.me")
        assertEquals(2, list.size)
        assertEquals(1080, list[0].height)
        assertEquals(360, list[1].height)
        assertTrue(list[1].hasAudio)
        assertTrue(list[0].url.startsWith("https://phimai.khoavo.myds.me/api/invidious/companion/"))
    }
}
