package com.phimai.tv.data.util

import com.phimai.tv.data.model.TvFilm
import com.phimai.tv.data.model.TvQualityOption
import com.phimai.tv.data.model.TvStreamFormatItem
import com.phimai.tv.data.model.TvVideoStreamPayload
import java.net.URI
import java.net.URLEncoder
import java.text.Normalizer

object TvPhimAiUtils {

    const val DEFAULT_SERVER_URL = "https://phimai.khoavo.myds.me"

    val TV_CATEGORIES = listOf(
        "all" to "Tất cả",
        "trung" to "Tu tiên & Cổ trang",
        "hoathinh" to "Hoạt hình 3D",
        "fantasy" to "Fantasy & Thần thoại",
        "scifi" to "Viễn tưởng & Sci-Fi",
        "kinhdi" to "Kinh dị & Bí ẩn",
        "vietnam" to "Sử Việt & Phim Việt",
        "full" to "Trọn bộ FULL"
    )

    val CAT_LABELS = mapOf(
        "all" to "Tất cả",
        "new" to "Mới cập nhật",
        "hot" to "Đang thịnh hành",
        "fantasy" to "Fantasy & Thần thoại",
        "trung" to "Tu tiên & Cổ trang",
        "hoathinh" to "Hoạt hình 3D",
        "scifi" to "Viễn tưởng & Sci-Fi",
        "kinhdi" to "Kinh dị & Bí ẩn",
        "vietnam" to "Sử Việt & Phim Việt",
        "dai" to "Phim dài trọn bộ",
        "ngan" to "Phim ngắn chọn lọc"
    )

    fun normalizeServerUrl(raw: String?): String {
        val t = raw.orEmpty().trim().trimEnd('/')
        if (t.isBlank()) return DEFAULT_SERVER_URL
        return if (t.startsWith("http://") || t.startsWith("https://")) t else "https://$t"
    }

    fun extractHost(serverUrl: String): String? =
        runCatching { URI(normalizeServerUrl(serverUrl)).host }.getOrNull()

    fun resolveServerUrl(serverUrl: String, pathOrUrl: String?): String {
        val raw = pathOrUrl.orEmpty().trim()
        if (raw.isBlank()) return ""
        val base = normalizeServerUrl(serverUrl)
        if (raw.startsWith("http://") || raw.startsWith("https://")) {
            return rewriteGatewayUrl(raw, extractHost(base))
        }
        val path = when {
            raw.startsWith("/api/") -> raw
            raw == "/companion" || raw.startsWith("/companion/") -> "/api/invidious$raw"
            raw.startsWith("/videoplayback") -> "/api/invidious/companion$raw"
            raw.startsWith("/") -> "/api/invidious$raw"
            else -> "/$raw"
        }
        return base + path
    }

    fun rewriteGatewayUrl(url: String, gatewayHost: String?): String {
        if (url.isBlank()) return url
        val parsed = runCatching { URI(url) }.getOrNull() ?: return url
        val host = parsed.host?.lowercase().orEmpty()
        val path = parsed.rawPath.orEmpty()
        val query = parsed.rawQuery?.let { "?$it" }.orEmpty()

        if (!gatewayHost.isNullOrBlank() &&
            (host == "manifest.googlevideo.com" || host.endsWith(".googlevideo.com") || host == "googlevideo.com")
        ) {
            val sep = if (query.isEmpty()) "?" else "&"
            val hasHost = query.contains("host=")
            val suffix = if (hasHost) "" else "${sep}host=${URLEncoder.encode(parsed.host, "UTF-8")}"
            return "https://$gatewayHost/api/invidious/companion$path$query$suffix"
        }
        if (gatewayHost.isNullOrBlank() || !host.equals(gatewayHost, ignoreCase = true)) return url
        if (path.startsWith("/api/invidious")) return url
        val shouldProxy = path.startsWith("/companion/") ||
            path == "/companion" ||
            path.startsWith("/videoplayback") ||
            path.startsWith("/latest_version") ||
            path.startsWith("/api/manifest")
        if (!shouldProxy) return url
        val scheme = parsed.scheme ?: "https"
        val port = if (parsed.port > 0) ":${parsed.port}" else ""
        return "$scheme://${parsed.host}$port/api/invidious$path$query"
    }

    fun thumbUrl(serverUrl: String, filmId: String): String =
        "${normalizeServerUrl(serverUrl)}/api/kvtube/thumb/${URLEncoder.encode(filmId, "UTF-8")}"

    fun dashManifestUrl(serverUrl: String, filmId: String): String =
        "${normalizeServerUrl(serverUrl)}/api/invidious/api/manifest/dash/id/${URLEncoder.encode(filmId, "UTF-8")}?local=true"

    fun progressiveFallbackUrl(serverUrl: String, filmId: String): String =
        "${normalizeServerUrl(serverUrl)}/api/invidious/latest_version?id=${URLEncoder.encode(filmId, "UTF-8")}&itag=18&local=true"

    fun viewsNumber(views: String?): Long =
        views.orEmpty().replace(Regex("[,\\.\\s]"), "").toLongOrNull() ?: 0L

    fun formatViewsVN(views: String?): String {
        val n = viewsNumber(views)
        if (n <= 0L) return views?.takeIf { it.isNotBlank() } ?: "Đang hot"
        return when {
            n >= 1_000_000L -> "${"%.1f".format(n / 1_000_000.0).replace('.', ',').removeSuffix(",0")} Tr lượt xem"
            n >= 1_000L -> "${Math.round(n / 1_000.0)} N lượt xem"
            else -> "$n lượt xem"
        }
    }

    fun formatChannelViews(channel: String?, views: String?): String =
        listOfNotNull(
            channel?.trim()?.takeIf { it.isNotBlank() },
            formatViewsVN(views).takeIf { it.isNotBlank() }
        ).joinToString(" • ")

    fun formatClockMs(ms: Long): String {
        val total = (ms / 1000L).coerceAtLeast(0L)
        val h = total / 3600L
        val m = (total % 3600L) / 60L
        val s = total % 60L
        return if (h > 0L) "%02d:%02d:%02d".format(h, m, s) else "%02d:%02d".format(m, s)
    }

    // ---- Stacked Series Grouping ----
    private val SEASON_RANGE = listOf(Regex("\\bmua\\s*\\d+\\s*[-+]\\s*\\d+\\b"), Regex("\\bseason\\s*\\d+\\s*[-+]\\s*\\d+\\b"))
    private val PART_RES = listOf(
        Regex("\\bphan\\s*dau\\b") to "first",
        Regex("\\bphan\\s*cuoi\\b") to "last",
        Regex("\\bphan\\s*(\\d+)\\b") to "num",
        Regex("\\bp(\\d+)\\b") to "num",
        Regex("\\bpart\\s*(\\d+)\\b") to "num",
        Regex("\\bseason\\s*(\\d+)\\b") to "num",
        Regex("\\bmua\\s*(\\d+)\\b") to "num",
        Regex("\\btap\\s*(\\d+)\\b") to "num",
        Regex("\\bepisode\\s*(\\d+)\\b") to "num",
        Regex("\\bep\\s*(\\d+)\\b") to "num"
    )
    private val COMPLETE_RES = listOf(Regex("\\bfull\\b"), Regex("tron bo"), Regex("ban full"), Regex("\\bcomplete\\b"), Regex("\\bfinal\\b"))
    private val GENERIC_WORDS = setOf(
        "ai", "movie", "film", "short", "horror", "thriller", "fantasy", "scifi", "sci", "fi",
        "epic", "drama", "animation", "animated", "series", "episode", "season", "part", "bo", "tron", "full"
    )
    private val GENERIC_SERIES_PHRASES = setOf(
        "phim", "phim ai", "phim ngan", "phim moi", "phim hay", "review phim", "phim co trang", "hoat hinh", "hoat hinh 3d", "full bo", "tron bo"
    )
    private val PART_RANGE_RE = Regex("(?:tap|phan|part|ep|episode)\\s*\\d+\\s*[-–~]\\s*\\d+", RegexOption.IGNORE_CASE)
    private val RAW_EP_STRIP_RE = Regex(
        "[(\\[【]?\\s*(?:tập|tap|phần|phan|part|ep|episode|chương|chuong|mùa|mua|season|p)\\s*0*\\d+(?:\\s*[-–~]\\s*\\d+)?\\s*[)\\]】.\\-:]*",
        RegexOption.IGNORE_CASE
    )
    private val BLOCKED_EPISODES = listOf("kiwi only", "members only", "chi danh cho hoi vien", "hoi vien", "trailer", "teaser")

    private fun normSeries(s: String): String =
        Normalizer.normalize(s, Normalizer.Form.NFD)
            .replace(Regex("[\\u0300-\\u036f]"), "")
            .lowercase()
            .replace('đ', 'd')
            .replace(Regex("[“”\"'‘’`´]"), "")
            .replace(Regex("\\s+"), " ")
            .trim()

    fun isBlockedEpisodeTitle(title: String?): Boolean =
        BLOCKED_EPISODES.any { it in normSeries(title.orEmpty()) }

    fun getEpisodeNumber(title: String?): Int? {
        val n = normSeries(title.orEmpty())
        if (PART_RANGE_RE.containsMatchIn(n)) return null
        for (r in SEASON_RANGE) if (r.containsMatchIn(n)) return null
        for ((r, kind) in PART_RES) {
            val m = r.find(n) ?: continue
            return when (kind) {
                "first" -> 0
                "last" -> 999
                else -> m.groupValues.getOrNull(1)?.toIntOrNull()
            }
        }
        return null
    }

    private fun cleanSegment(seg: String): String {
        var s = seg.replace(Regex("^(?:【|\\[)[^】\\]]*(?:】|\\])\\s*"), "")
        for (r in SEASON_RANGE) s = s.replace(r, " ")
        for ((r, _) in PART_RES) s = r.replaceFirst(s, " ")
        for (r in COMPLETE_RES) s = s.replace(r, " ")
        s = s.replace(Regex("[^\\p{L}\\p{N}\\s]"), " ")
        s = s.replace(Regex("\\b(full hd|fhd|4k|8k|202[0-9]|20[0-9]{2})\\b"), " ")
        return s.replace(Regex("\\s+"), " ").trim()
    }

    data class EpInfo(val baseKey: String, val baseTitle: String, val epNum: Int?)

    fun getEpisodeInfo(title: String, channel: String = ""): EpInfo {
        val ep = getEpisodeNumber(title)
        val pipeSegs = title.split(Regex("[｜│|]"))
        val candidates = mutableListOf<String>()
        for (ps in pipeSegs) {
            val m = RAW_EP_STRIP_RE.find(ps)
            if (m != null && m.range.first > 2) {
                candidates.add(ps.substring(0, m.range.first).replace(Regex("[-–—:•\\s]+$"), "").trim())
            }
            candidates.add(ps.replace(RAW_EP_STRIP_RE, " ").replace(Regex("^[-–—:•\\s]+|[-–—:•\\s]+$"), "").trim())
        }
        val normCh = cleanSegment(normSeries(channel))
        for (raw in candidates) {
            if (raw.isBlank()) continue
            val cleaned = cleanSegment(normSeries(raw))
            val words = cleaned.split(' ').filter { it.isNotEmpty() }
            if (words.size >= 2 && cleaned != normCh && cleaned !in GENERIC_SERIES_PHRASES && !words.all { it in GENERIC_WORDS }) {
                return EpInfo(words.take(7).joinToString(" "), raw.trim().split(Regex("\\s+")).take(7).joinToString(" "), ep)
            }
        }
        return EpInfo("", "", ep)
    }

    private fun prefersEpisode(cand: TvFilm, cur: TvFilm, activeId: String? = null): Boolean {
        if (cand.id == activeId) return true
        if (cur.id == activeId) return false
        val cScore = if (Regex("\\b(?:tap|episode|ep)\\s*\\d").containsMatchIn(normSeries(cand.title))) 1 else 0
        val curScore = if (Regex("\\b(?:tap|episode|ep)\\s*\\d").containsMatchIn(normSeries(cur.title))) 1 else 0
        if (cScore != curScore) return cScore > curScore
        return viewsNumber(cand.views) > viewsNumber(cur.views)
    }

    fun dedupeAndContiguousEpisodes(films: List<TvFilm>, activeId: String? = null): List<TvFilm> {
        val seen = mutableSetOf<String>()
        val byEp = mutableMapOf<Int, TvFilm>()
        val unnumbered = mutableListOf<TvFilm>()
        for (f in films) {
            if (f.id.isBlank() || !seen.add(f.id) || isBlockedEpisodeTitle(f.title)) continue
            val ep = getEpisodeNumber(f.title)
            if (ep == null) unnumbered.add(f)
            else {
                val cur = byEp[ep]
                if (cur == null || prefersEpisode(f, cur, activeId)) byEp[ep] = f
            }
        }
        val sorted = (byEp.values + unnumbered).sortedWith(compareBy<TvFilm>({ getEpisodeNumber(it.title) ?: 9999 }, { it.rank }))
        val out = mutableListOf<TvFilm>()
        var prev: Int? = null
        for (ep in sorted) {
            val cur = getEpisodeNumber(ep.title)
            if (prev != null && cur != null && cur - prev > 2) break
            out.add(ep)
            if (cur != null) prev = cur
        }
        return out
    }

    fun stackSeriesForGrid(films: List<TvFilm>): List<TvFilm> {
        val groups = linkedMapOf<String, MutableList<TvFilm>>()
        val order = mutableListOf<Pair<String, TvFilm?>>()
        for (f in films) {
            if (f.title.isBlank() || isBlockedEpisodeTitle(f.title)) {
                order.add("" to f)
                continue
            }
            val info = getEpisodeInfo(f.title, f.channel)
            val key = if (info.epNum == null || info.baseKey.isBlank()) ""
            else if (info.baseKey.split(' ').size >= 3) info.baseKey
            else "${info.baseKey}||${normSeries(f.channel)}"
            if (key.isEmpty()) order.add("" to f)
            else {
                val list = groups[key]
                if (list != null) list.add(f) else {
                    groups[key] = mutableListOf(f)
                    order.add(key to null)
                }
            }
        }
        return order.mapNotNull { (key, single) ->
            if (key.isEmpty()) return@mapNotNull single
            val members = groups[key] ?: return@mapNotNull null
            if (members.size < 2) return@mapNotNull members.first()
            val byEp = mutableMapOf<Int, TvFilm>()
            for (m in members) {
                val ep = getEpisodeNumber(m.title) ?: 9999
                val prev = byEp[ep]
                if (prev == null || prefersEpisode(m, prev)) byEp[ep] = m
            }
            val sortedEps = byEp.entries.sortedBy { it.key }.map { it.value }
            val lead = sortedEps.first()
            lead.copy(
                rank = members.maxOfOrNull { it.rank } ?: lead.rank,
                views = members.maxByOrNull { viewsNumber(it.views) }?.views ?: lead.views,
                stackedEpisodes = sortedEps
            )
        }
    }

    private val ITAG_HEIGHTS = mapOf(
        313 to 2160, 315 to 2160, 401 to 2160, 266 to 2160,
        271 to 1440, 308 to 1440, 400 to 1440, 264 to 1440,
        137 to 1080, 248 to 1080, 299 to 1080, 303 to 1080, 399 to 1080,
        22 to 720, 136 to 720, 247 to 720, 298 to 720, 302 to 720, 398 to 720,
        135 to 480, 244 to 480, 397 to 480,
        18 to 360, 134 to 360, 243 to 360, 396 to 360
    )

    fun parseVideoHeight(f: TvStreamFormatItem): Int {
        if (f.height >= 144) return f.height
        val label = f.qualityLabel.ifBlank { f.resolution.ifBlank { f.quality } }
        Regex("(\\d+)p", RegexOption.IGNORE_CASE).find(label)?.let { return it.groupValues[1].toIntOrNull() ?: 0 }
        if ('x' in f.resolution) f.resolution.split('x').getOrNull(1)?.toIntOrNull()?.let { if (it >= 144) return it }
        return ITAG_HEIGHTS[f.itag.toIntOrNull() ?: -1] ?: 0
    }

    fun buildQualityList(payload: TvVideoStreamPayload?, serverUrl: String): List<TvQualityOption> {
        if (payload == null) return emptyList()
        val options = mutableListOf<TvQualityOption>()
        for (f in payload.adaptiveFormats) {
            val t = f.type.lowercase()
            if ("audio/" in t || f.audioOnly || f.audioQuality.isNotBlank() || f.url.isBlank()) continue
            val h = parseVideoHeight(f)
            if (h < 144) continue
            val opt = TvQualityOption(f.itag.ifBlank { "a_$h" }, "${h}p", h, f.bitrate, resolveServerUrl(serverUrl, f.url), false, f.type)
            val idx = options.indexOfFirst { it.height == h }
            if (idx < 0) options.add(opt)
            else if ("avc1" in t && "avc1" !in options[idx].mimeType.lowercase()) options[idx] = opt
        }
        for (f in (payload.formatStreams + payload.streams)) {
            if (f.url.isBlank()) continue
            val h = parseVideoHeight(f).takeIf { it >= 144 } ?: 360
            val opt = TvQualityOption(f.itag.ifBlank { "p_$h" }, "${h}p", h, f.bitrate, resolveServerUrl(serverUrl, f.url), true, f.type)
            val idx = options.indexOfFirst { it.height == h }
            if (idx < 0) options.add(opt) else if (!options[idx].hasAudio) options[idx] = opt
        }
        return options.sortedWith(compareByDescending<TvQualityOption> { it.height }.thenByDescending { it.bitrate })
    }
}
