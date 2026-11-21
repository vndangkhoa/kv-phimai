package com.phimai.android.ui.screens.watch

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.phimai.android.data.local.SettingsDataStore
import com.phimai.android.data.model.CommentItem
import com.phimai.android.data.model.Film
import com.phimai.android.data.model.QualityOption
import com.phimai.android.data.model.QualityTier
import com.phimai.android.data.model.RatingStat
import com.phimai.android.data.model.VideoStreamPayload
import com.phimai.android.data.repository.PhimAiRepository
import com.phimai.android.data.util.PhimAiUtils
import com.phimai.android.player.PlaybackManager
import com.phimai.android.ui.FullscreenController
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

data class WatchUiState(
    val isLoading: Boolean = true,
    val film: Film? = null,
    val episodes: List<Film> = emptyList(),
    val relatedFilms: List<Film> = emptyList(),
    val rating: RatingStat = RatingStat(),
    val myRatingStars: Int = 0,
    val comments: List<CommentItem> = emptyList(),
    val isPostingComment: Boolean = false,
    val isSubscribed: Boolean = false,
    val isDiscoveringEpisodes: Boolean = false,
    val selectedTier: QualityTier = QualityTier.AUTO,
    val qualityOptions: List<QualityOption> = emptyList(),
    val selectedUrl: String? = null,
    val audioUrl: String? = null,
    val serverBaseUrl: String = PhimAiUtils.DEFAULT_SERVER_URL,
    val backendUnavailableReason: String? = null,
    val error: String? = null
)

@HiltViewModel
class WatchViewModel @Inject constructor(
    private val repo: PhimAiRepository,
    private val settings: SettingsDataStore,
    val playbackManagerRef: PlaybackManager,
    private val fullscreenController: FullscreenController
) : ViewModel() {

    private val _uiState = MutableStateFlow(WatchUiState())
    val uiState: StateFlow<WatchUiState> = _uiState.asStateFlow()

    val savedIds = repo.observeSavedIds().stateIn(
        viewModelScope,
        SharingStarted.WhileSubscribed(5_000),
        emptySet()
    )

    val autoPlayNext = settings.autoPlayNextEpisode.stateIn(
        viewModelScope,
        SharingStarted.WhileSubscribed(5_000),
        true
    )

    private var activeFilmId: String = ""
    private var lastStreamPayload: VideoStreamPayload? = null
    private var fallbackStage = 0

    fun setPlayerFullscreen(fullscreen: Boolean) {
        fullscreenController.setFullscreen(fullscreen)
    }

    fun load(filmId: String) {
        if (filmId.isBlank()) return
        if (filmId == activeFilmId && _uiState.value.film != null && _uiState.value.selectedUrl != null) {
            return
        }
        activeFilmId = filmId
        fallbackStage = 0
        _uiState.value = WatchUiState(isLoading = true)

        viewModelScope.launch {
            val serverUrl = settings.getServerUrl()
            val defaultTier = settings.defaultQuality.first()
            val resumeMs = repo.getSavedPositionMs(filmId)

            playbackManagerRef.setQualityTier(defaultTier)

            // Fast start: start DASH immediately without blocking on metadata JSON
            val dashUrlFast = PhimAiUtils.dashManifestUrl(serverUrl, filmId)
            val gatewayHost = PhimAiUtils.extractHost(serverUrl)
            playbackManagerRef.setMetadata(
                filmId = filmId,
                title = "PhimAI",
                channelTitle = "",
                thumbnail = PhimAiUtils.thumbUrl(serverUrl, filmId)
            )
            playbackManagerRef.playDash(filmId, dashUrlFast, gatewayHost, resumeMs)

            coroutineScope {
                val detailDef = async { runCatching { repo.getFilmDetail(filmId) }.getOrNull() }
                val streamDef = async { runCatching { repo.getVideoStream(filmId) }.getOrNull() }
                val commentsDef = async { runCatching { repo.getComments(filmId) }.getOrDefault(emptyList()) }

                val detail = detailDef.await()
                val stream = streamDef.await()
                val comments = commentsDef.await()
                lastStreamPayload = stream

                val film = detail?.toFilm() ?: stream?.film ?: Film(
                    id = filmId,
                    title = stream?.title?.ifBlank { "Phim AI #$filmId" } ?: "Phim AI #$filmId",
                    channel = stream?.author.orEmpty(),
                    views = stream?.viewCount?.toString() ?: "0",
                    dur = "",
                    blurbLong = stream?.description.orEmpty(),
                    thumbnailUrl = PhimAiUtils.thumbUrl(serverUrl, filmId)
                )

                val episodes = PhimAiUtils.dedupeAndContiguousEpisodes(
                    detail?.episodes?.ifEmpty { detail.series }?.ifEmpty { stream?.series.orEmpty() }
                        ?: stream?.series.orEmpty(),
                    filmId
                )
                val related = detail?.related?.ifEmpty { stream?.related.orEmpty() }
                    ?: stream?.related.orEmpty()
                val subscribed = repo.isChannelSubscribed(film.channel)

                val thumbUrl = PhimAiUtils.resolveServerUrl(
                    serverUrl,
                    film.thumbnailUrl.ifBlank { PhimAiUtils.thumbUrl(serverUrl, filmId) }
                )
                playbackManagerRef.setMetadata(
                    filmId = filmId,
                    title = film.title,
                    channelTitle = film.channel,
                    thumbnail = thumbUrl
                )

                val qualityOptions = PhimAiUtils.buildQualityList(stream, serverUrl)
                val audioUrl = PhimAiUtils.resolveServerUrl(serverUrl, stream?.bestAudioUrl)
                    .ifBlank { null }
                val directUrl = PhimAiUtils.resolveServerUrl(serverUrl, stream?.directStreamUrl)
                    .ifBlank { PhimAiUtils.progressiveFallbackUrl(serverUrl, filmId) }
                val dashResolved = PhimAiUtils.resolveServerUrl(serverUrl, stream?.dashUrl)
                    .ifBlank { dashUrlFast }
                val hlsResolved = PhimAiUtils.resolveServerUrl(serverUrl, stream?.hlsUrl)

                val unavailableReason = if (stream?.unavailable == true) {
                    stream.unavailableReason.ifBlank { "Nguồn phát video hiện chưa sẵn sàng." }
                } else null

                // Record local history + telemetry
                repo.recordWatchStart(film)
                repo.recordView(filmId)

                // Prefetch next episode if available
                val curEpIdx = episodes.indexOfFirst { it.id == filmId }
                if (curEpIdx >= 0 && curEpIdx + 1 < episodes.size) {
                    repo.prefetchVideoStream(episodes[curEpIdx + 1].id)
                } else if (related.isNotEmpty()) {
                    repo.prefetchVideoStream(related.first().id)
                }

                // If stream metadata specifies HLS or non-DASH direct, or if DASH was already stopped due to error
                if (unavailableReason != null) {
                    playbackManagerRef.stopAndClear()
                } else if (!playbackManagerRef.isDashActive && hlsResolved.isNotBlank()) {
                    playbackManagerRef.playHls(filmId, hlsResolved, resumeMs)
                } else if (!playbackManagerRef.isDashActive) {
                    val chosen = pickStreamForTier(defaultTier, qualityOptions, audioUrl, directUrl)
                    playbackManagerRef.playDirect(filmId, chosen.first, chosen.second, resumeMs)
                }

                _uiState.value = WatchUiState(
                    isLoading = false,
                    film = film,
                    episodes = episodes,
                    relatedFilms = related,
                    rating = detail?.rating ?: RatingStat(),
                    comments = comments,
                    isSubscribed = subscribed,
                    selectedTier = defaultTier,
                    qualityOptions = qualityOptions,
                    selectedUrl = dashResolved,
                    audioUrl = audioUrl,
                    serverBaseUrl = serverUrl,
                    backendUnavailableReason = unavailableReason
                )
            }
        }
    }

    private fun pickStreamForTier(
        tier: QualityTier,
        options: List<QualityOption>,
        bestAudio: String?,
        directFallback: String
    ): Pair<String, String?> {
        if (options.isEmpty()) return directFallback to null
        val targetHeight = if (tier == QualityTier.AUTO) 1080 else tier.maxHeight
        val picked = options.firstOrNull { it.height <= targetHeight } ?: options.last()
        return if (picked.hasAudio || bestAudio == null) {
            picked.url to null
        } else {
            picked.url to bestAudio
        }
    }

    fun selectQualityTier(tier: QualityTier) {
        _uiState.value = _uiState.value.copy(selectedTier = tier)
        playbackManagerRef.setQualityTier(tier)
        if (!playbackManagerRef.isDashActive && activeFilmId.isNotBlank()) {
            val st = _uiState.value
            val fallback = PhimAiUtils.progressiveFallbackUrl(st.serverBaseUrl, activeFilmId)
            val picked = pickStreamForTier(tier, st.qualityOptions, st.audioUrl, fallback)
            playbackManagerRef.playDirect(activeFilmId, picked.first, picked.second)
            _uiState.value = st.copy(selectedUrl = picked.first)
        }
    }

    fun handlePlaybackError(): Boolean {
        val id = activeFilmId.ifBlank { return false }
        if (fallbackStage >= 2) return false
        fallbackStage++
        val stage = fallbackStage

        viewModelScope.launch {
            val serverUrl = settings.getServerUrl()
            val payload = lastStreamPayload ?: runCatching { repo.getVideoStream(id, forceRefresh = true) }.getOrNull()
            lastStreamPayload = payload
            val hls = PhimAiUtils.resolveServerUrl(serverUrl, payload?.hlsUrl)
            if (stage == 1 && hls.isNotBlank()) {
                playbackManagerRef.playHls(id, hls)
                _uiState.value = _uiState.value.copy(selectedUrl = hls, error = null)
                return@launch
            }
            val options = PhimAiUtils.buildQualityList(payload, serverUrl)
            val audio = PhimAiUtils.resolveServerUrl(serverUrl, payload?.bestAudioUrl).ifBlank { null }
            val direct = PhimAiUtils.resolveServerUrl(serverUrl, payload?.directStreamUrl)
                .ifBlank { PhimAiUtils.progressiveFallbackUrl(serverUrl, id) }
            if (stage == 1) {
                val picked = pickStreamForTier(_uiState.value.selectedTier, options, audio, direct)
                playbackManagerRef.playDirect(id, picked.first, picked.second)
                _uiState.value = _uiState.value.copy(
                    selectedUrl = picked.first,
                    audioUrl = picked.second,
                    error = null
                )
            } else {
                val muxed = options.firstOrNull { it.hasAudio }?.url ?: direct
                playbackManagerRef.playDirect(id, muxed, null)
                _uiState.value = _uiState.value.copy(
                    selectedUrl = muxed,
                    audioUrl = null,
                    error = null
                )
            }
        }
        return true
    }

    fun retry() {
        val id = activeFilmId.ifBlank { return }
        activeFilmId = ""
        load(id)
    }

    fun saveProgress(posMs: Long, durMs: Long) {
        val id = activeFilmId.ifBlank { return }
        viewModelScope.launch {
            repo.updateWatchProgress(id, posMs, durMs)
        }
    }

    fun toggleSave() {
        val film = _uiState.value.film ?: return
        viewModelScope.launch { repo.toggleSaveFilm(film) }
    }

    fun toggleSaveFilm(film: Film) {
        viewModelScope.launch { repo.toggleSaveFilm(film) }
    }

    fun toggleSubscription() {
        val film = _uiState.value.film ?: return
        if (film.channel.isBlank()) return
        viewModelScope.launch {
            val sub = repo.toggleSubscription(film.channel)
            _uiState.value = _uiState.value.copy(isSubscribed = sub)
        }
    }

    fun rate(stars: Int) {
        val id = activeFilmId.ifBlank { return }
        _uiState.value = _uiState.value.copy(myRatingStars = stars)
        viewModelScope.launch {
            runCatching { repo.rateFilm(id, stars) }
                .onSuccess { stat -> _uiState.value = _uiState.value.copy(rating = stat) }
        }
    }

    fun postComment(name: String, text: String, stampSec: Int) {
        val id = activeFilmId.ifBlank { return }
        if (text.isBlank()) return
        _uiState.value = _uiState.value.copy(isPostingComment = true)
        viewModelScope.launch {
            if (name.isNotBlank()) settings.setAuthorName(name)
            runCatching { repo.postComment(id, name.ifBlank { "Khán giả PhimAI" }, text, stampSec) }
                .onSuccess { item ->
                    val updated = if (item != null) listOf(item) + _uiState.value.comments else _uiState.value.comments
                    _uiState.value = _uiState.value.copy(comments = updated, isPostingComment = false)
                }
                .onFailure {
                    _uiState.value = _uiState.value.copy(isPostingComment = false)
                }
        }
    }

    fun discoverMoreEpisodes() {
        val id = activeFilmId.ifBlank { return }
        if (_uiState.value.isDiscoveringEpisodes) return
        _uiState.value = _uiState.value.copy(isDiscoveringEpisodes = true)
        viewModelScope.launch {
            runCatching { repo.discoverEpisodes(id) }
                .onSuccess { eps ->
                    val merged = PhimAiUtils.dedupeAndContiguousEpisodes(eps, id)
                    _uiState.value = _uiState.value.copy(
                        episodes = if (merged.isNotEmpty()) merged else _uiState.value.episodes,
                        isDiscoveringEpisodes = false
                    )
                }
                .onFailure {
                    _uiState.value = _uiState.value.copy(isDiscoveringEpisodes = false)
                }
        }
    }

    fun nextAutoPlayFilmId(): String? {
        val st = _uiState.value
        val curId = activeFilmId
        val eps = st.episodes
        val epIdx = eps.indexOfFirst { it.id == curId }
        if (epIdx >= 0 && epIdx + 1 < eps.size) {
            return eps[epIdx + 1].id
        }
        return st.relatedFilms.firstOrNull()?.id
    }
}
