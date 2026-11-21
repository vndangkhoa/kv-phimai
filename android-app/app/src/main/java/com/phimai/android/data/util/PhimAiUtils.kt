package com.phimai.android.data.util

import com.phimai.android.data.model.Film
import com.phimai.android.data.model.QualityOption
import com.phimai.android.data.model.StreamFormatItem
import com.phimai.android.data.model.VideoStreamPayload
import java.net.URI
import java.net.URLEncoder
import java.text.Normalizer

object PhimAiUtils {

    const val DEFAULT_SERVER_URL = "https://phimai.khoavo.myds.me"

    val CAT_ORDER = listOf(
        "all", "trung", "hoathinh", "fantasy", "scifi", "kinhdi", "ngan", "vietnam"
    )

    val CAT_LABEL = mapOf(
        "all" to "Tất cả",
        "new" to "Mới cập nhật",
        "hot" to "Đang hot",
        "topview" to "Xem nhiều",
        "fantasy" to "Fantasy & Thần thoại",
        "trung" to "Tu tiên & Cổ trang",
        "hoathinh" to "Hoạt hình 3D",
        "scifi" to "Viễn tưởng & Sci-Fi",
        "kinhdi" to "Kinh dị & Bí ẩn",
        "vietnam" to "Sử Việt & Phim Việt",
        "dai" to "Phim dài trọn bộ",
        "ngan" to "Phim ngắn chọn lọc"
    )

    data class SortOption(val id: String, val label: String)

    val SORT_OPTIONS = listOf(
        SortOption("random", "Ngẫu nhiên"),
        SortOption("new", "Mới nhất"),
        SortOption("hot", "Thịnh hành"),
        SortOption("views", "Xem nhiều"),
        SortOption("rating", "Đánh giá cao")
    )

    data class GenreGroup(val id: String, val label: String)

    val GENRE_GROUPS = listOf(
        GenreGroup("all", "Tất cả"),
        GenreGroup("tu tiên", "Tu tiên & Huyền huyễn"),
        GenreGroup("xuyên không", "Xuyên không"),
        GenreGroup("ngôn tình", "Ngôn tình & Tình cảm"),
        GenreGroup("hệ thống", "Hệ thống"),
        GenreGroup("trọng sinh", "Trọng sinh"),
        GenreGroup("mạt thế", "Mạt thế & Zombie"),
        GenreGroup("kỳ ảo", "Kỳ ảo & Thần thoại"),
        GenreGroup("cổ trang", "Cổ trang & Báo thù"),
        GenreGroup("tổng tài", "Tổng tài & Đô thị"),
        GenreGroup("kinh dị", "Kinh dị"),
        GenreGroup("hài hước", "Hài hước")
    )

    fun normalizeServerUrl(raw: String?): String {
        val trimmed = raw.orEmpty().trim().trimEnd('/')
        if (trimmed.isBlank()) return DEFAULT_SERVER_URL
        return if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
            trimmed
        } else {
            "https://$trimmed"
        }
    }

    /** Resolves relative API paths (`/api/...`, `/companion/...`, `/videoplayback...`) onto [serverUrl]. */
    fun resolveServerUrl(serverUrl: String, pathOrUrl: String?): String {
        val raw = pathOrUrl.orEmpty().trim()
        if (raw.isBlank()) return ""
        val base = normalizeServerUrl(serverUrl)
        if (raw.startsWith("http://") || raw.startsWith("https://")) {
            val host = extractHost(base)
            return rewriteGatewayUrl(raw, host)
        }
        val normalizedPath = when {
            raw.startsWith("/api/") -> raw
            raw == "/companion" || raw.startsWith("/companion/") -> "/api/invidious$raw"
            raw.startsWith("/videoplayback") -> "/api/invidious/companion$raw"
            raw.startsWith("/") -> "/api/invidious$raw"
            else -> "/$raw"
        }
        return base + normalizedPath
    }

    /**
     * Rewrites `/companion/...`, `/videoplayback...`, `/latest_version...`, `/api/...` on the
     * PhimAI gateway host to go through `/api/invidious/...` — matching `streamService.ts`.
     */
    fun rewriteGatewayUrl(url: String, gatewayHost: String?): String {
        if (url.isBlank()) return url
        val parsed = runCatching { URI(url) }.getOrNull() ?: return url
        val host = parsed.host?.lowercase().orEmpty()
        val path = parsed.rawPath.orEmpty()
        val query = parsed.rawQuery?.let { "?$it" }.orEmpty()

        // Redirect direct googlevideo URLs back through PhimAI companion proxy when a gateway host is active
        if (!gatewayHost.isNullOrBlank() &&
            (host == "manifest.googlevideo.com" || host.endsWith(".googlevideo.com") || host == "googlevideo.com")
        ) {
            val sep = if (query.isEmpty()) "?" else "&"
            val hasHostParam = query.contains("host=")
            val hostSuffix = if (hasHostParam) "" else "${sep}host=${URLEncoder.encode(parsed.host, "UTF-8")}"
            return "https://$gatewayHost/api/invidious/companion$path$query$hostSuffix"
        }

        if (gatewayHost.isNullOrBlank() || !host.equals(gatewayHost, ignoreCase = true)) {
            return url
        }
        if (path.startsWith("/api/invidious")) return url
        val shouldProxy = path.startsWith("/companion/") ||
            path == "/companion" ||
            path.startsWith("/videoplayback") ||
            path.startsWith("/latest_version") ||
            path.startsWith("/api/manifest")
        if (!shouldProxy) return url

        val scheme = parsed.scheme ?: "https"
        val portPart = if (parsed.port > 0) ":${parsed.port}" else ""
        return "$scheme://${parsed.host}$portPart/api/invidious$path$query"
    }

    fun extractHost(serverUrl: String): String? =
        runCatching { URI(normalizeServerUrl(serverUrl)).host }.getOrNull()

    fun thumbUrl(serverUrl: String, filmId: String): String =
        "${normalizeServerUrl(serverUrl)}/api/kvtube/thumb/${URLEncoder.encode(filmId, "UTF-8")}"

    fun dashManifestUrl(serverUrl: String, filmId: String): String =
        "${normalizeServerUrl(serverUrl)}/api/invidious/api/manifest/dash/id/${URLEncoder.encode(filmId, "UTF-8")}?local=true"

    fun progressiveFallbackUrl(serverUrl: String, filmId: String): String =
        "${normalizeServerUrl(serverUrl)}/api/invidious/latest_version?id=${URLEncoder.encode(filmId, "UTF-8")}&itag=18&local=true"

    fun catLabel(cat: String): String = CAT_LABEL[cat] ?: cat.ifBlank { "Phim AI" }

    fun viewsNumber(views: String?): Long {
        val cleaned = views.orEmpty().replace(Regex("[,\\.\\s]"), "")
        return cleaned.toLongOrNull() ?: 0L
    }

    fun formatViewsVN(views: String?): String {
        val n = viewsNumber(views)
        if (n <= 0L) return views?.takeIf { it.isNotBlank() } ?: "Đang hot"
        return when {
            n >= 1_000_000L -> {
                val formatted = "%.1f".format(n / 1_000_000.0)
                    .replace('.', ',')
                    .removeSuffix(",0")
                "$formatted Tr lượt xem"
            }
            n >= 1_000L -> "${Math.round(n / 1_000.0)} N lượt xem"
            else -> "$n lượt xem"
        }
    }

    fun formatClock(totalSeconds: Long): String {
        val total = totalSeconds.coerceAtLeast(0L)
        val h = total / 3600L
        val m = (total % 3600L) / 60L
        val s = total % 60L
        return if (h > 0L) "%02d:%02d:%02d".format(h, m, s) else "%02d:%02d".format(m, s)
    }

    fun formatDurationMs(ms: Long): String = formatClock((ms / 1000L).coerceAtLeast(0L))

    fun viNorm(s: String?): String {
        val raw = s.orEmpty().lowercase()
        val decomposed = Normalizer.normalize(raw, Normalizer.Form.NFD)
        return decomposed
            .replace(Regex("[\\u0300-\\u036f]"), "")
            .replace('đ', 'd')
            .replace(Regex("[^a-z0-9 ]"), " ")
            .replace(Regex("\\s+"), " ")
            .trim()
    }

    // ---- Stacked Series & Episode Grouping (ported 1:1 from phimaiUtils.ts) ----

    private val SEASON_RANGE = listOf(
        Regex("\\bmua\\s*(\\d+)\\s*[-+]\\s*(\\d+)\\b"),
        Regex("\\bseason\\s*(\\d+)\\s*[-+]\\s*(\\d+)\\b")
    )

    private val PART_RES = listOf(
        Regex("\\bphan\\s*dau\\b") to "first",
        Regex("\\bphan\\s*cuoi\\b") to "last",
        Regex("\\bphan\\s*(\\d+)\\s*[-+]\\s*(\\d+)\\b") to "range",
        Regex("\\bphan\\s*(\\d+)\\b") to "num",
        Regex("\\bp\\s*(\\d+)\\s*[-+]\\s*(\\d+)\\b") to "range",
        Regex("\\bp(\\d+)\\b") to "num",
        Regex("\\bpart\\s*(\\d+)\\s*[-+]\\s*(\\d+)\\b") to "range",
        Regex("\\bpart\\s*(\\d+)\\b") to "num",
        Regex("\\bseason\\s*(\\d+)\\b") to "num",
        Regex("\\bmua\\s*(\\d+)\\b") to "num",
        Regex("\\btap\\s*(\\d+)\\s*[-+]\\s*(\\d+)\\b") to "range",
        Regex("\\btap\\s*(\\d+)\\b") to "num",
        Regex("\\bepisode\\s*(\\d+)\\s*[-+]\\s*(\\d+)\\b") to "range",
        Regex("\\bepisode\\s*(\\d+)\\b") to "num",
        Regex("\\bep\\s*(\\d+)\\s*[-+]\\s*(\\d+)\\b") to "range",
        Regex("\\bep\\s*(\\d+)\\b") to "num"
    )

    private val COMPLETE_RES = listOf(
        Regex("\\bfull\\b"),
        Regex("tron bo"),
        Regex("ban full"),
        Regex("\\bcomplete\\b"),
        Regex("\\bfinal\\b")
    )

    private val GENERIC_WORDS = setOf(
        "ai", "movie", "film", "short", "horror", "thriller", "fantasy", "scifi", "sci", "fi",
        "supernatural", "epic", "adventure", "drama", "animation", "animated", "generated",
        "hollywood", "style", "official", "trailer", "teaser", "festival", "global", "series",
        "episode", "season", "part", "end", "bo", "tron", "ban", "full", "complete", "dai",
        "the", "a", "an", "of"
    )

    private val GENERIC_SERIES_PHRASES = setOf(
        "phim", "phim ai", "phim ngan", "phim moi", "phim hay", "review phim",
        "phim thuyet minh", "phim vietsub", "phim ngon tinh", "phim co trang",
        "hoat hinh", "hoat hinh 3d", "short drama", "full bo", "tron bo", "noi bat",
        "tap moi", "phan moi"
    )

    private val PART_RANGE_RE = Regex("(?:tap|phan|part|ep|episode)\\s*\\d+\\s*[-–~]\\s*\\d+", RegexOption.IGNORE_CASE)
    private val RAW_EP_STRIP_RE = Regex(
        "[(\\[【]?\\s*(?:tập|tap|phần|phan|part|ep|episode|chương|chuong|mùa|mua|season|p)\\s*0*\\d+(?:\\s*[-–~]\\s*\\d+)?\\s*[)\\]】.\\-:]*",
        RegexOption.IGNORE_CASE
    )
    private val BLOCKED_EPISODE_PHRASES = listOf(
        "kiwi only", "members only", "chi danh cho hoi vien", "hoi vien", "trailer", "teaser"
    )

    private fun normSeries(s: String): String =
        Normalizer.normalize(s, Normalizer.Form.NFD)
            .replace(Regex("[\\u0300-\\u036f]"), "")
            .lowercase()
            .replace('đ', 'd')
            .replace(Regex("[“”\"'‘’`´]"), "")
            .replace(Regex("\\s+"), " ")
            .trim()

    private fun findPart(t: String): Int? {
        for (r in SEASON_RANGE) {
            if (r.containsMatchIn(t)) return null
        }
        for ((r, kind) in PART_RES) {
            val m = r.find(t) ?: continue
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
        s = s.replace(Regex("[(\\[【]\\s*new\\s*[)\\]】]"), " ")
        for (r in SEASON_RANGE) s = s.replace(r, " ")
        for ((r, _) in PART_RES) s = r.replaceFirst(s, " ")
        for (r in COMPLETE_RES) s = s.replace(r, " ")
        s = s.replace(Regex("\\b\\d+\\s*h\\b"), " ")
        s = s.replace(Regex("[^\\p{L}\\p{N}\\s]"), " ")
        s = s.replace(Regex("\\b(full hd|fhd|4k|8k|202[0-9]|20[0-9]{2})\\b"), " ")
        return s.replace(Regex("\\s+"), " ").trim()
    }

    data class EpisodeInfo(val baseKey: String, val baseTitle: String, val epNum: Int?)

    fun getEpisodeNumber(title: String?): Int? {
        val n = normSeries(title.orEmpty())
        if (PART_RANGE_RE.containsMatchIn(n)) return null
        return findPart(n)
    }

    fun getEpisodeInfo(title: String, channel: String = ""): EpisodeInfo {
        val n = normSeries(title)
        val epNum = if (PART_RANGE_RE.containsMatchIn(n)) null else findPart(n)
        val pipeSegs = title.split(Regex("[｜│|]"))
        val candidates = mutableListOf<String>()

        for (ps in pipeSegs) {
            val m = RAW_EP_STRIP_RE.find(ps)
            if (m != null && m.range.first > 2) {
                val prefix = ps.substring(0, m.range.first).replace(Regex("[-–—:•\\s]+$"), "").trim()
                if (prefix.isNotEmpty()) candidates.add(prefix)
            }
            val stripped = ps.replace(RAW_EP_STRIP_RE, " ")
                .replace(Regex("^[-–—:•\\s]+|[-–—:•\\s]+$"), "")
                .trim()
            if (stripped.isNotEmpty()) candidates.add(stripped)
            for (sub in ps.split(Regex("[-—:]"))) {
                val subClean = sub.replace(RAW_EP_STRIP_RE, " ").trim()
                if (subClean.isNotEmpty()) candidates.add(subClean)
            }
        }

        val normCh = cleanSegment(normSeries(channel))
        for (rawCand in candidates) {
            val cleaned = cleanSegment(normSeries(rawCand))
            val words = cleaned.split(' ').filter { it.isNotEmpty() }
            if (words.size >= 2 &&
                cleaned != normCh &&
                cleaned !in GENERIC_SERIES_PHRASES &&
                !words.all { it in GENERIC_WORDS }
            ) {
                val baseKey = words.take(7).joinToString(" ")
                val baseTitle = rawCand.trim().split(Regex("\\s+")).take(7).joinToString(" ")
                return EpisodeInfo(baseKey, baseTitle, epNum)
            }
        }
        return EpisodeInfo("", "", epNum)
    }

    fun isBlockedEpisodeTitle(title: String?): Boolean {
        val n = normSeries(title.orEmpty())
        return BLOCKED_EPISODE_PHRASES.any { it in n }
    }

    private fun episodeKindScore(title: String): Int =
        if (Regex("\\b(?:tap|episode|ep)\\s*\\d").containsMatchIn(normSeries(title))) 1 else 0

    private fun prefersEpisode(cand: Film, cur: Film, activeId: String? = null): Boolean {
        if (cand.id == activeId) return true
        if (cur.id == activeId) return false
        val diff = episodeKindScore(cand.title) - episodeKindScore(cur.title)
        if (diff != 0) return diff > 0
        return viewsNumber(cand.views) > viewsNumber(cur.views)
    }

    fun dedupeAndContiguousEpisodes(films: List<Film>, activeId: String? = null): List<Film> {
        val seenIds = mutableSetOf<String>()
        val byEpNum = mutableMapOf<Int, Film>()
        val unnumbered = mutableListOf<Film>()

        for (f in films) {
            if (f.id.isBlank() || !seenIds.add(f.id) || isBlockedEpisodeTitle(f.title)) continue
            val ep = getEpisodeNumber(f.title)
            if (ep == null) {
                unnumbered.add(f)
                continue
            }
            val cur = byEpNum[ep]
            if (cur == null || prefersEpisode(f, cur, activeId)) {
                byEpNum[ep] = f
            }
        }

        val sorted = (byEpNum.values + unnumbered).sortedWith(
            compareBy<Film>({ getEpisodeNumber(it.title) ?: 9999 }, { it.rank })
        )
        val contiguous = mutableListOf<Film>()
        var prevEp: Int? = null
        for (ep in sorted) {
            val curEp = getEpisodeNumber(ep.title)
            if (prevEp != null && curEp != null && curEp - prevEp > 2) break
            contiguous.add(ep)
            if (curEp != null) prevEp = curEp
        }
        return contiguous
    }

    private fun gridStackKey(film: Film): String {
        if (film.title.isBlank() || isBlockedEpisodeTitle(film.title)) return ""
        val info = getEpisodeInfo(film.title, film.channel)
        if (info.epNum == null || info.baseKey.isBlank()) return ""
        if (info.baseKey.split(' ').size >= 3) return info.baseKey
        return "${info.baseKey}||${normSeries(film.channel)}"
    }

    fun stackSeriesForGrid(films: List<Film>): List<Film> {
        val groups = linkedMapOf<String, MutableList<Film>>()
        val order = mutableListOf<Pair<String, Film?>>()

        for (f in films) {
            val key = gridStackKey(f)
            if (key.isEmpty()) {
                order.add("" to f)
            } else {
                val list = groups[key]
                if (list != null) {
                    list.add(f)
                } else {
                    groups[key] = mutableListOf(f)
                    order.add(key to null)
                }
            }
        }

        return order.mapNotNull { (key, single) ->
            if (key.isEmpty()) return@mapNotNull single
            val members = groups[key] ?: return@mapNotNull null
            if (members.size < 2) return@mapNotNull members.first()

            val byEp = mutableMapOf<Int, Film>()
            for (m in members) {
                val ep = getEpisodeNumber(m.title) ?: 9999
                val prev = byEp[ep]
                if (prev == null || prefersEpisode(m, prev)) byEp[ep] = m
            }
            val sortedEps = byEp.entries
                .sortedBy { it.key }
                .map { it.value }
            val lead = sortedEps.first()
            val maxRank = members.maxOfOrNull { it.rank } ?: lead.rank
            val bestViews = members.maxByOrNull { viewsNumber(it.views) }?.views ?: lead.views
            lead.copy(
                rank = maxRank,
                views = bestViews,
                stackedEpisodes = sortedEps
            )
        }
    }

    // ---- Stream Quality Parsing ----

    private val ITAG_HEIGHTS = mapOf(
        313 to 2160, 315 to 2160, 401 to 2160, 266 to 2160, 138 to 2160,
        271 to 1440, 308 to 1440, 400 to 1440, 264 to 1440,
        137 to 1080, 248 to 1080, 299 to 1080, 303 to 1080, 399 to 1080,
        22 to 720, 136 to 720, 247 to 720, 298 to 720, 302 to 720, 398 to 720,
        135 to 480, 244 to 480, 397 to 480,
        18 to 360, 134 to 360, 243 to 360, 396 to 360,
        133 to 240, 242 to 240, 395 to 240,
        160 to 144, 278 to 144, 394 to 144
    )

    fun parseVideoHeight(item: StreamFormatItem): Int {
        if (item.height >= 144) return item.height
        val label = item.qualityLabel.ifBlank { item.resolution.ifBlank { item.quality } }
        Regex("(\\d+)p", RegexOption.IGNORE_CASE).find(label)?.let {
            return it.groupValues[1].toIntOrNull() ?: 0
        }
        if ('x' in item.resolution) {
            val h = item.resolution.split('x').getOrNull(1)?.toIntOrNull()
            if (h != null && h >= 144) return h
        }
        return ITAG_HEIGHTS[item.itag.toIntOrNull() ?: -1] ?: 0
    }

    fun formatQualityLabel(height: Int, fps: Int = 0): String {
        val fpsStr = if (fps > 30) "$fps" else ""
        return when {
            height >= 2160 -> "${height}p$fpsStr (4K)"
            height >= 1440 -> "${height}p$fpsStr (2K)"
            height >= 1080 -> "${height}p$fpsStr (Full HD)"
            height >= 720 -> "${height}p$fpsStr (HD)"
            else -> "${height}p"
        }
    }

    fun buildQualityList(payload: VideoStreamPayload?, serverUrl: String): List<QualityOption> {
        if (payload == null) return emptyList()
        val options = mutableListOf<QualityOption>()

        for (f in payload.adaptiveFormats) {
            val t = f.type.lowercase()
            if ("audio/" in t || f.audioOnly || f.audioQuality.isNotBlank()) continue
            val h = parseVideoHeight(f)
            if (h < 144 || f.url.isBlank()) continue
            val resolvedUrl = resolveServerUrl(serverUrl, f.url)
            val opt = QualityOption(
                id = f.itag.ifBlank { "adapt_$h" },
                label = formatQualityLabel(h, f.fps),
                height = h,
                itag = f.itag,
                fps = f.fps,
                bitrate = f.bitrate,
                url = resolvedUrl,
                hasAudio = false,
                mimeType = f.type
            )
            val idx = options.indexOfFirst { it.height == h }
            if (idx >= 0) {
                val prevMime = options[idx].mimeType.lowercase()
                val curH264 = "avc1" in t
                val prevH264 = "avc1" in prevMime
                if (!prevH264 && (curH264 || ("vp9" in t && "vp9" !in prevMime))) {
                    options[idx] = opt
                }
            } else {
                options.add(opt)
            }
        }

        val muxed = payload.formatStreams + payload.streams
        for (f in muxed) {
            if (f.url.isBlank()) continue
            val h = parseVideoHeight(f).takeIf { it >= 144 } ?: 360
            val opt = QualityOption(
                id = f.itag.ifBlank { "prog_$h" },
                label = formatQualityLabel(h, f.fps),
                height = h,
                itag = f.itag,
                fps = f.fps,
                bitrate = f.bitrate,
                url = resolveServerUrl(serverUrl, f.url),
                hasAudio = true,
                mimeType = f.type
            )
            val idx = options.indexOfFirst { it.height == h }
            if (idx < 0) {
                options.add(opt)
            } else if (!options[idx].hasAudio) {
                options[idx] = opt
            }
        }

        return options.sortedWith(
            compareByDescending<QualityOption> { it.height }.thenByDescending { it.bitrate }
        )
    }
}
