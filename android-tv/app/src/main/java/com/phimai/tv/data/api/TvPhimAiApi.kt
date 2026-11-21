package com.phimai.tv.data.api

import com.phimai.tv.data.model.TvChannelDetailResponse
import com.phimai.tv.data.model.TvChannelInfo
import com.phimai.tv.data.model.TvChannelsResponse
import com.phimai.tv.data.model.TvDiscoverEpisodesResponse
import com.phimai.tv.data.model.TvFilm
import com.phimai.tv.data.model.TvFilmDetailResponse
import com.phimai.tv.data.model.TvFilmsPageResponse
import com.phimai.tv.data.model.TvHealthResponse
import com.phimai.tv.data.model.TvManifestResponse
import com.phimai.tv.data.model.TvTopWeekEntry
import com.phimai.tv.data.model.TvTopWeekResponse
import com.phimai.tv.data.model.TvVideoStreamPayload
import com.phimai.tv.data.util.TvPhimAiUtils
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import okhttp3.ConnectionPool
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.net.URLEncoder
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit

object TvPhimAiApi {
    private const val USER_AGENT = "PhimAITV/1.0 (Android TV)"

    val okHttp: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .protocols(listOf(Protocol.HTTP_2, Protocol.HTTP_1_1))
            .connectionPool(ConnectionPool(12, 5, TimeUnit.MINUTES))
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .retryOnConnectionFailure(true)
            .addInterceptor { chain ->
                chain.proceed(
                    chain.request().newBuilder()
                        .header("User-Agent", USER_AGENT)
                        .build()
                )
            }
            .build()
    }

    val json = Json {
        ignoreUnknownKeys = true
        coerceInputValues = true
        isLenient = true
    }

    private val _baseUrl = MutableStateFlow(TvPhimAiUtils.DEFAULT_SERVER_URL)
    val serverFlow: StateFlow<String> = _baseUrl.asStateFlow()
    val baseUrl: String get() = _baseUrl.value

    fun setServerUrl(url: String) {
        val norm = TvPhimAiUtils.normalizeServerUrl(url)
        if (_baseUrl.value != norm) {
            _baseUrl.value = norm
            streamCache.clear()
        }
    }

    private data class CachedStream(val payload: TvVideoStreamPayload, val fetchedAtMs: Long)
    private val streamCache = ConcurrentHashMap<String, CachedStream>()
    private val inflight = ConcurrentHashMap<String, CompletableDeferred<TvVideoStreamPayload>>()
    private val bgScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private suspend inline fun <reified T> getJson(url: String): T = withContext(Dispatchers.IO) {
        val req = Request.Builder().url(url).get().build()
        okHttp.newCall(req).execute().use { resp ->
            val body = resp.body?.string().orEmpty()
            if (!resp.isSuccessful) {
                throw IllegalStateException("HTTP ${resp.code}: $body".take(200))
            }
            json.decodeFromString(body)
        }
    }

    private suspend inline fun <reified T> postJson(url: String, jsonBody: String): T = withContext(Dispatchers.IO) {
        val req = Request.Builder()
            .url(url)
            .post(jsonBody.toRequestBody("application/json; charset=utf-8".toMediaType()))
            .build()
        okHttp.newCall(req).execute().use { resp ->
            val body = resp.body?.string().orEmpty()
            if (!resp.isSuccessful) {
                throw IllegalStateException("HTTP ${resp.code}: $body".take(200))
            }
            json.decodeFromString(body)
        }
    }

    suspend fun getHealth(overrideUrl: String? = null): TvHealthResponse {
        val base = overrideUrl?.let { TvPhimAiUtils.normalizeServerUrl(it) } ?: baseUrl
        return getJson("$base/api/health")
    }

    suspend fun getManifest(): TvManifestResponse = getJson("$baseUrl/api/manifest")

    suspend fun getFilms(
        sort: String = "new",
        cat: String = "all",
        fullOnly: Boolean = false,
        query: String = "",
        page: Int = 1,
        limit: Int = 40
    ): TvFilmsPageResponse {
        val params = buildList {
            if (sort.isNotBlank()) add("sort=${URLEncoder.encode(sort, "UTF-8")}")
            if (cat.isNotBlank() && cat != "all") add("cat=${URLEncoder.encode(cat, "UTF-8")}")
            if (fullOnly) add("full=1")
            if (query.isNotBlank()) add("q=${URLEncoder.encode(query, "UTF-8")}")
            add("page=$page")
            add("limit=$limit")
        }.joinToString("&")
        return getJson("$baseUrl/api/films?$params")
    }

    suspend fun searchFilms(query: String, limit: Int = 48): TvFilmsPageResponse =
        getJson("$baseUrl/api/films/search?q=${URLEncoder.encode(query, "UTF-8")}&limit=$limit")

    suspend fun getFilmDetail(filmId: String): TvFilmDetailResponse =
        getJson("$baseUrl/api/films/${URLEncoder.encode(filmId, "UTF-8")}")

    suspend fun discoverEpisodes(filmId: String): List<TvFilm> {
        val res: TvDiscoverEpisodesResponse =
            postJson("$baseUrl/api/films/${URLEncoder.encode(filmId, "UTF-8")}/episodes?force=1", "{}")
        return res.episodes
    }

    suspend fun getTopWeek(): List<TvTopWeekEntry> {
        val res: TvTopWeekResponse = getJson("$baseUrl/api/topweek")
        return res.top.ifEmpty { res.items }
    }

    suspend fun getChannels(query: String = "", sort: String = "popular"): List<TvChannelInfo> {
        val qEnc = URLEncoder.encode(query, "UTF-8")
        val res: TvChannelsResponse = getJson("$baseUrl/api/channels?sort=$sort&q=$qEnc")
        return res.items
    }

    suspend fun getChannelDetail(name: String, sort: String = "newest"): TvChannelDetailResponse {
        val enc = URLEncoder.encode(name, "UTF-8").replace("+", "%20")
        return getJson("$baseUrl/api/channel/$enc?sort=$sort")
    }

    suspend fun getVideoStream(filmId: String, forceRefresh: Boolean = false): TvVideoStreamPayload {
        val now = System.currentTimeMillis()
        if (!forceRefresh) {
            streamCache[filmId]?.let { c ->
                if (now - c.fetchedAtMs < 8 * 60 * 1000L && !c.payload.unavailable) return c.payload
            }
        } else {
            streamCache.remove(filmId)
        }
        inflight[filmId]?.let { return it.await() }
        val deferred = CompletableDeferred<TvVideoStreamPayload>()
        inflight.putIfAbsent(filmId, deferred)?.let { return it.await() }
        return try {
            val payload: TvVideoStreamPayload = getJson("$baseUrl/api/video/${URLEncoder.encode(filmId, "UTF-8")}")
            if (!payload.unavailable) {
                streamCache[filmId] = CachedStream(payload, System.currentTimeMillis())
                if (streamCache.size > 80) streamCache.keys.firstOrNull()?.let { streamCache.remove(it) }
            }
            deferred.complete(payload)
            payload
        } catch (t: Throwable) {
            deferred.completeExceptionally(t)
            throw t
        } finally {
            inflight.remove(filmId, deferred)
        }
    }

    fun prefetchVideo(filmId: String) {
        if (filmId.isBlank()) return
        val cached = streamCache[filmId]
        if (cached != null && System.currentTimeMillis() - cached.fetchedAtMs < 8 * 60 * 1000L) return
        if (inflight.containsKey(filmId)) return
        bgScope.launch { runCatching { getVideoStream(filmId) } }
    }

    suspend fun recordView(filmId: String) {
        runCatching {
            postJson<Map<String, Boolean>>("$baseUrl/api/view", """{"id":"$filmId"}""")
        }
    }
}
