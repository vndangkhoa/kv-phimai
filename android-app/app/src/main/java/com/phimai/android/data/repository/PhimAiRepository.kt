package com.phimai.android.data.repository

import com.phimai.android.data.api.PhimAiApi
import com.phimai.android.data.local.SavedFilmDao
import com.phimai.android.data.local.SavedFilmEntity
import com.phimai.android.data.local.SettingsDataStore
import com.phimai.android.data.local.SubscribedChannelDao
import com.phimai.android.data.local.SubscribedChannelEntity
import com.phimai.android.data.local.WatchHistoryDao
import com.phimai.android.data.local.WatchHistoryEntity
import com.phimai.android.data.model.ChannelDetailResponse
import com.phimai.android.data.model.ChannelInfo
import com.phimai.android.data.model.CommentItem
import com.phimai.android.data.model.Film
import com.phimai.android.data.model.FilmDetailResponse
import com.phimai.android.data.model.FilmsPageResponse
import com.phimai.android.data.model.HealthResponse
import com.phimai.android.data.model.ManifestResponse
import com.phimai.android.data.model.RatingStat
import com.phimai.android.data.model.StatsResponse
import com.phimai.android.data.model.TopWeekEntry
import com.phimai.android.data.model.VideoStreamPayload
import com.phimai.android.data.util.PhimAiUtils
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class PhimAiRepository @Inject constructor(
    private val api: PhimAiApi,
    private val settings: SettingsDataStore,
    private val historyDao: WatchHistoryDao,
    private val savedDao: SavedFilmDao,
    private val subDao: SubscribedChannelDao
) {
    suspend fun getServerUrl(): String = settings.getServerUrl()

    fun observeServerUrl(): Flow<String> = settings.serverUrl

    suspend fun getHealth(overrideUrl: String? = null): HealthResponse = api.getHealth(overrideUrl)

    suspend fun getManifest(): ManifestResponse = api.getManifest()

    suspend fun getStats(): StatsResponse = api.getStats()

    suspend fun getFilms(
        sort: String = "random",
        cat: String = "all",
        genre: String = "all",
        fullOnly: Boolean = false,
        query: String = "",
        channel: String = "",
        page: Int = 1,
        limit: Int = 60
    ): FilmsPageResponse = api.getFilms(sort, cat, genre, fullOnly, query, channel, page, limit)

    suspend fun searchFilms(query: String, page: Int = 1, limit: Int = 60): FilmsPageResponse =
        api.searchFilms(query, page, limit)

    suspend fun getFilmDetail(filmId: String): FilmDetailResponse = api.getFilmDetail(filmId)

    suspend fun discoverEpisodes(filmId: String): List<Film> =
        api.discoverEpisodes(filmId, force = true).episodes

    suspend fun getTopWeek(): List<TopWeekEntry> {
        val resp = api.getTopWeek()
        return resp.top.ifEmpty { resp.items }
    }

    suspend fun getChannels(query: String = "", sort: String = "popular"): List<ChannelInfo> =
        api.getChannels(query, sort).items

    suspend fun getChannelDetail(nameOrId: String, sort: String = "newest", query: String = ""): ChannelDetailResponse =
        api.getChannelDetail(nameOrId, sort, query)

    suspend fun getVideoStream(filmId: String, forceRefresh: Boolean = false): VideoStreamPayload =
        api.getVideoStream(filmId, forceRefresh)

    fun prefetchVideoStream(filmId: String) = api.prefetchVideoStream(filmId)

    suspend fun getComments(filmId: String): List<CommentItem> = api.getComments(filmId).items

    suspend fun postComment(filmId: String, name: String, text: String, stampSec: Int): CommentItem? =
        api.postComment(filmId, name, text, stampSec).item

    suspend fun rateFilm(filmId: String, stars: Int): RatingStat = api.rateFilm(filmId, stars).rating

    suspend fun recordView(filmId: String) = api.recordView(filmId)

    // ---- Local Library (History, Watch Later, Subscribed Channels) ----

    fun observeHistory(limit: Int = 80): Flow<List<WatchHistoryEntity>> = historyDao.observeAll(limit)

    fun observeProgressMap(): Flow<Map<String, Float>> = historyDao.observeAll(200).map { list ->
        list.mapNotNull { entry ->
            if (entry.durationMs > 0L && entry.positionMs > 5_000L) {
                val pct = (entry.positionMs.toFloat() / entry.durationMs.toFloat()).coerceIn(0f, 1f)
                if (pct in 0.03f..0.97f) entry.filmId to pct else null
            } else null
        }.toMap()
    }

    suspend fun getSavedPositionMs(filmId: String): Long {
        val entry = historyDao.getById(filmId) ?: return 0L
        if (entry.durationMs > 0L && entry.positionMs > entry.durationMs - 15_000L) return 0L
        return entry.positionMs
    }

    suspend fun recordWatchStart(film: Film) {
        val existing = historyDao.getById(film.id)
        val server = settings.getServerUrl()
        val thumb = PhimAiUtils.resolveServerUrl(
            server,
            film.thumbnailUrl.ifBlank { PhimAiUtils.thumbUrl(server, film.id) }
        )
        historyDao.upsert(
            WatchHistoryEntity(
                filmId = film.id,
                title = film.title,
                channel = film.channel,
                thumbnailUrl = thumb,
                dur = film.dur,
                cat = film.cat,
                tool = film.tool,
                views = film.views,
                rank = film.rank,
                positionMs = existing?.positionMs ?: 0L,
                durationMs = existing?.durationMs ?: 0L,
                watchedAt = System.currentTimeMillis()
            )
        )
    }

    suspend fun updateWatchProgress(filmId: String, posMs: Long, durMs: Long) {
        if (filmId.isBlank() || posMs < 0L) return
        historyDao.updateProgress(filmId, posMs, durMs.coerceAtLeast(0L), System.currentTimeMillis())
    }

    suspend fun clearHistory() = historyDao.clearAll()

    fun observeSavedFilms(): Flow<List<SavedFilmEntity>> = savedDao.observeAll()

    fun observeSavedIds(): Flow<Set<String>> = savedDao.observeIds().map { it.toSet() }

    suspend fun toggleSaveFilm(film: Film): Boolean {
        val exists = savedDao.exists(film.id)
        if (exists) {
            savedDao.deleteById(film.id)
            return false
        }
        val server = settings.getServerUrl()
        val thumb = PhimAiUtils.resolveServerUrl(
            server,
            film.thumbnailUrl.ifBlank { PhimAiUtils.thumbUrl(server, film.id) }
        )
        savedDao.upsert(
            SavedFilmEntity(
                filmId = film.id,
                title = film.title,
                channel = film.channel,
                thumbnailUrl = thumb,
                dur = film.dur,
                cat = film.cat,
                tool = film.tool,
                views = film.views,
                rank = film.rank,
                savedAt = System.currentTimeMillis()
            )
        )
        return true
    }

    fun observeSubscriptions(): Flow<List<SubscribedChannelEntity>> = subDao.observeAll()

    fun observeSubscribedNames(): Flow<Set<String>> = subDao.observeNames().map { names ->
        names.map { it.lowercase() }.toSet()
    }

    suspend fun isChannelSubscribed(name: String): Boolean =
        if (name.isBlank()) false else subDao.isSubscribed(name)

    suspend fun toggleSubscription(name: String, thumbnailUrl: String = "", filmCount: Int = 0): Boolean {
        if (name.isBlank()) return false
        val current = subDao.isSubscribed(name)
        if (current) {
            subDao.deleteByName(name)
            return false
        }
        subDao.upsert(
            SubscribedChannelEntity(
                name = name,
                thumbnailUrl = thumbnailUrl,
                filmCount = filmCount,
                subscribedAt = System.currentTimeMillis()
            )
        )
        return true
    }
}
