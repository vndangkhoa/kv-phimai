package com.phimai.android.data.api

import com.phimai.android.data.local.SettingsDataStore
import com.phimai.android.data.model.ChannelDetailResponse
import com.phimai.android.data.model.ChannelsResponse
import com.phimai.android.data.model.CommentsResponse
import com.phimai.android.data.model.DiscoverEpisodesResponse
import com.phimai.android.data.model.FilmDetailResponse
import com.phimai.android.data.model.FilmsPageResponse
import com.phimai.android.data.model.HealthResponse
import com.phimai.android.data.model.ManifestResponse
import com.phimai.android.data.model.PostCommentResponse
import com.phimai.android.data.model.RateResponse
import com.phimai.android.data.model.StatsResponse
import com.phimai.android.data.model.TopWeekResponse
import com.phimai.android.data.model.VideoStreamPayload
import com.phimai.android.data.util.PhimAiUtils
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.get
import io.ktor.client.request.parameter
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.contentType
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import java.net.URLEncoder
import java.util.concurrent.ConcurrentHashMap
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class PhimAiApi @Inject constructor(
    private val httpClient: HttpClient,
    private val settings: SettingsDataStore
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private data class CachedStream(val payload: VideoStreamPayload, val fetchedAtMs: Long)
    private val streamCache = ConcurrentHashMap<String, CachedStream>()
    private val inflightStreams = ConcurrentHashMap<String, CompletableDeferred<VideoStreamPayload>>()
    private val cacheTtlMs = 8 * 60 * 1000L

    private suspend fun base(): String = settings.getServerUrl()

    suspend fun getHealth(overrideUrl: String? = null): HealthResponse {
        val urlBase = overrideUrl?.let { PhimAiUtils.normalizeServerUrl(it) } ?: base()
        return httpClient.get("$urlBase/api/health").body()
    }

    suspend fun getManifest(): ManifestResponse =
        httpClient.get("${base()}/api/manifest").body()

    suspend fun getStats(): StatsResponse =
        httpClient.get("${base()}/api/stats").body()

    suspend fun getFilms(
        sort: String = "random",
        cat: String = "all",
        genre: String = "all",
        fullOnly: Boolean = false,
        query: String = "",
        channel: String = "",
        page: Int = 1,
        limit: Int = 60
    ): FilmsPageResponse = httpClient.get("${base()}/api/films") {
        if (sort.isNotBlank()) parameter("sort", sort)
        if (cat.isNotBlank() && cat != "all") parameter("cat", cat)
        if (genre.isNotBlank() && genre != "all") parameter("genre", genre)
        if (fullOnly) parameter("full", "1")
        if (query.isNotBlank()) parameter("q", query)
        if (channel.isNotBlank()) parameter("channel", channel)
        parameter("page", page)
        parameter("limit", limit)
    }.body()

    suspend fun searchFilms(query: String, page: Int = 1, limit: Int = 60): FilmsPageResponse =
        httpClient.get("${base()}/api/films/search") {
            parameter("q", query)
            parameter("page", page)
            parameter("limit", limit)
        }.body()

    suspend fun getFilmDetail(filmId: String): FilmDetailResponse {
        val enc = URLEncoder.encode(filmId, "UTF-8")
        return httpClient.get("${base()}/api/films/$enc").body()
    }

    suspend fun discoverEpisodes(filmId: String, force: Boolean = true): DiscoverEpisodesResponse {
        val enc = URLEncoder.encode(filmId, "UTF-8")
        return httpClient.post("${base()}/api/films/$enc/episodes") {
            if (force) parameter("force", "1")
        }.body()
    }

    suspend fun getTopWeek(): TopWeekResponse =
        httpClient.get("${base()}/api/topweek").body()

    suspend fun getChannels(query: String = "", sort: String = "popular"): ChannelsResponse =
        httpClient.get("${base()}/api/channels") {
            if (query.isNotBlank()) parameter("q", query)
            if (sort.isNotBlank()) parameter("sort", sort)
        }.body()

    suspend fun getChannelDetail(
        nameOrId: String,
        sort: String = "newest",
        query: String = ""
    ): ChannelDetailResponse {
        val enc = URLEncoder.encode(nameOrId, "UTF-8").replace("+", "%20")
        return httpClient.get("${base()}/api/channel/$enc") {
            if (sort.isNotBlank()) parameter("sort", sort)
            if (query.isNotBlank()) parameter("q", query)
        }.body()
    }

    suspend fun getVideoStream(filmId: String, forceRefresh: Boolean = false): VideoStreamPayload {
        val now = System.currentTimeMillis()
        if (!forceRefresh) {
            streamCache[filmId]?.let { cached ->
                if (now - cached.fetchedAtMs < cacheTtlMs && !cached.payload.unavailable) {
                    return cached.payload
                }
            }
        } else {
            streamCache.remove(filmId)
        }

        val existing = inflightStreams[filmId]
        if (existing != null) return existing.await()

        val deferred = CompletableDeferred<VideoStreamPayload>()
        val prev = inflightStreams.putIfAbsent(filmId, deferred)
        if (prev != null) return prev.await()

        try {
            val enc = URLEncoder.encode(filmId, "UTF-8")
            val payload: VideoStreamPayload = httpClient.get("${base()}/api/video/$enc").body()
            if (!payload.unavailable) {
                streamCache[filmId] = CachedStream(payload, System.currentTimeMillis())
                if (streamCache.size > 100) {
                    streamCache.keys.firstOrNull()?.let { streamCache.remove(it) }
                }
            }
            deferred.complete(payload)
            return payload
        } catch (t: Throwable) {
            deferred.completeExceptionally(t)
            throw t
        } finally {
            inflightStreams.remove(filmId, deferred)
        }
    }

    fun prefetchVideoStream(filmId: String) {
        if (filmId.isBlank()) return
        val cached = streamCache[filmId]
        if (cached != null && System.currentTimeMillis() - cached.fetchedAtMs < cacheTtlMs) return
        if (inflightStreams.containsKey(filmId)) return
        scope.launch {
            runCatching { getVideoStream(filmId) }
        }
    }

    suspend fun getComments(filmId: String): CommentsResponse =
        httpClient.get("${base()}/api/comments") {
            parameter("id", filmId)
        }.body()

    @Serializable
    private data class PostCommentReq(val id: String, val name: String, val text: String, val s: Int)

    suspend fun postComment(filmId: String, name: String, text: String, stampSec: Int): PostCommentResponse =
        httpClient.post("${base()}/api/comments") {
            contentType(ContentType.Application.Json)
            setBody(PostCommentReq(filmId, name, text, stampSec))
        }.body()

    @Serializable
    private data class PostRateReq(val id: String, val stars: Int)

    suspend fun rateFilm(filmId: String, stars: Int): RateResponse =
        httpClient.post("${base()}/api/rate") {
            contentType(ContentType.Application.Json)
            setBody(PostRateReq(filmId, stars))
        }.body()

    @Serializable
    private data class PostViewReq(val id: String)

    suspend fun recordView(filmId: String) {
        runCatching {
            httpClient.post("${base()}/api/view") {
                contentType(ContentType.Application.Json)
                setBody(PostViewReq(filmId))
            }
        }
    }
}
