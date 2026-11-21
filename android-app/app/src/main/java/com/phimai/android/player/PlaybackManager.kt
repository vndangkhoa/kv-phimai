package com.phimai.android.player

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.SystemClock
import android.util.Log
import androidx.annotation.OptIn
import androidx.core.content.ContextCompat
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.MimeTypes
import androidx.media3.common.PlaybackException
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.Player
import androidx.media3.common.VideoSize
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.ResolvingDataSource
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.analytics.AnalyticsListener
import androidx.media3.exoplayer.dash.DashMediaSource
import androidx.media3.exoplayer.dash.DefaultDashChunkSource
import androidx.media3.exoplayer.hls.HlsMediaSource
import androidx.media3.exoplayer.mediacodec.MediaCodecUtil
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.exoplayer.source.MergingMediaSource
import androidx.media3.exoplayer.source.ProgressiveMediaSource
import androidx.media3.exoplayer.trackselection.AdaptiveTrackSelection
import androidx.media3.exoplayer.trackselection.DefaultTrackSelector
import androidx.media3.exoplayer.upstream.DefaultBandwidthMeter
import com.phimai.android.data.model.QualityTier
import com.phimai.android.data.net.PhimAiHttp
import com.phimai.android.data.util.PhimAiUtils
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

data class NowPlaying(
    val filmId: String = "",
    val title: String = "",
    val channelTitle: String = "",
    val thumbnail: String = ""
)

@OptIn(UnstableApi::class)
@Singleton
class PlaybackManager @Inject constructor(
    @ApplicationContext private val context: Context
) {
    companion object {
        private const val TAG = "PhimAiPlayback"
        private const val PREFS = "phimai_playback"
        private const val PREF_BANDWIDTH_BPS = "bw_bps"
        private const val BANDWIDTH_PERSIST_INTERVAL_MS = 4_000L
        private const val QUALITY_SWITCH_DEBOUNCE_MS = 350L
    }

    private val prefs by lazy { context.getSharedPreferences(PREFS, Context.MODE_PRIVATE) }
    private var lastBandwidthPersistAt = 0L

    private val bandwidthMeter: DefaultBandwidthMeter by lazy {
        val saved = prefs.getLong(PREF_BANDWIDTH_BPS, 0L)
        DefaultBandwidthMeter.Builder(context)
            .setInitialBitrateEstimate(
                if (saved >= 500_000L) saved.coerceAtMost(80_000_000L) else 4_000_000L
            )
            .build()
    }

    private val hardwareAv1: Boolean by lazy {
        runCatching {
            MediaCodecUtil.getDecoderInfos(MimeTypes.VIDEO_AV1, false, false)
                .any { it.hardwareAccelerated }
        }.getOrDefault(false)
    }

    private val trackSelector: DefaultTrackSelector by lazy {
        DefaultTrackSelector(
            context,
            AdaptiveTrackSelection.Factory(
                3_000,
                12_000,
                12_000,
                0.85f
            )
        ).also { applyTier(it, QualityTier.AUTO) }
    }

    private val _activeHeight = MutableStateFlow(0)
    val activeHeight: StateFlow<Int> = _activeHeight.asStateFlow()

    private val _bandwidthMbps = MutableStateFlow(0f)
    val bandwidthMbps: StateFlow<Float> = _bandwidthMbps.asStateFlow()

    private val _nowPlaying = MutableStateFlow<NowPlaying?>(null)
    val nowPlaying: StateFlow<NowPlaying?> = _nowPlaying.asStateFlow()

    private val _playbackSpeed = MutableStateFlow(1f)
    val playbackSpeed: StateFlow<Float> = _playbackSpeed.asStateFlow()

    @Volatile
    var isDashActive: Boolean = false
        private set

    private var currentTier: QualityTier = QualityTier.AUTO
    private var loadedKey: String? = null
    private var lastSwitchAt: Long = 0L
    private var mediaServiceRequested = false

    private val httpFactory = OkHttpDataSource.Factory(PhimAiHttp.client)

    val player: ExoPlayer by lazy {
        ExoPlayer.Builder(context)
            .setMediaSourceFactory(DefaultMediaSourceFactory(httpFactory))
            .setBandwidthMeter(bandwidthMeter)
            .setTrackSelector(trackSelector)
            .setLoadControl(
                DefaultLoadControl.Builder()
                    .setBufferDurationsMs(10_000, 50_000, 1_000, 2_500)
                    .setPrioritizeTimeOverSizeThresholds(true)
                    .build()
            )
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(C.USAGE_MEDIA)
                    .setContentType(C.AUDIO_CONTENT_TYPE_MOVIE)
                    .build(),
                true
            )
            .build()
            .apply {
                playWhenReady = true
                addListener(object : Player.Listener {
                    override fun onPlayerError(error: PlaybackException) {
                        Log.e(TAG, "Player error ${error.errorCodeName}: ${error.message}", error)
                    }

                    override fun onIsPlayingChanged(isPlaying: Boolean) {
                        if (isPlaying) ensureMediaServiceStarted()
                    }

                    override fun onVideoSizeChanged(videoSize: VideoSize) {
                        if (videoSize.height > 0) _activeHeight.value = videoSize.height
                    }
                })
                addAnalyticsListener(object : AnalyticsListener {
                    override fun onBandwidthEstimate(
                        eventTime: AnalyticsListener.EventTime,
                        totalLoadTimeMs: Int,
                        totalBytesLoaded: Long,
                        bitrateEstimate: Long
                    ) {
                        if (bitrateEstimate <= 0) return
                        _bandwidthMbps.value = bitrateEstimate / 1_000_000f
                        val now = SystemClock.elapsedRealtime()
                        if (now - lastBandwidthPersistAt >= BANDWIDTH_PERSIST_INTERVAL_MS) {
                            lastBandwidthPersistAt = now
                            prefs.edit().putLong(PREF_BANDWIDTH_BPS, bitrateEstimate).apply()
                        }
                    }
                })
            }
    }

    fun setQualityTier(tier: QualityTier) {
        currentTier = tier
        applyTier(trackSelector, tier)
    }

    private fun applyTier(selector: DefaultTrackSelector, tier: QualityTier) {
        val mimes = if (hardwareAv1) arrayOf(MimeTypes.VIDEO_AV1, MimeTypes.VIDEO_H264)
        else arrayOf(MimeTypes.VIDEO_H264)

        val b = selector.buildUponParameters()
            .setAllowVideoMixedMimeTypeAdaptiveness(false)
            .setExceedVideoConstraintsIfNecessary(true)
            .clearVideoSizeConstraints()
            .setForceHighestSupportedBitrate(false)

        when (tier) {
            QualityTier.AUTO -> b.setPreferredVideoMimeTypes(*mimes)
            QualityTier.UHD_4K -> b.setPreferredVideoMimeTypes(*mimes).setMaxVideoSize(Int.MAX_VALUE, 2160)
            QualityTier.QHD_2K -> b.setPreferredVideoMimeTypes(*mimes).setMaxVideoSize(Int.MAX_VALUE, 1440)
            QualityTier.FHD_1080 -> b.setPreferredVideoMimeTypes(MimeTypes.VIDEO_H264).setMaxVideoSize(Int.MAX_VALUE, 1080)
            QualityTier.HD_720 -> b.setPreferredVideoMimeTypes(MimeTypes.VIDEO_H264).setMaxVideoSize(Int.MAX_VALUE, 720)
            QualityTier.SD_480 -> b.setPreferredVideoMimeTypes(MimeTypes.VIDEO_H264).setMaxVideoSize(Int.MAX_VALUE, 480)
            QualityTier.LOW_360 -> b.setPreferredVideoMimeTypes(MimeTypes.VIDEO_H264).setMaxVideoSize(Int.MAX_VALUE, 360)
        }
        selector.setParameters(b)
    }

    fun setPlaybackSpeed(speed: Float) {
        val clamped = speed.coerceIn(0.5f, 2.5f)
        _playbackSpeed.value = clamped
        player.playbackParameters = PlaybackParameters(clamped)
    }

    fun setMetadata(filmId: String, title: String, channelTitle: String, thumbnail: String) {
        val current = _nowPlaying.value
        if (current == null || current.filmId != filmId) {
            _nowPlaying.value = NowPlaying(filmId, title, channelTitle, thumbnail)
            loadedKey = null
            ensureMediaServiceStarted()
        } else {
            _nowPlaying.value = current.copy(title = title, channelTitle = channelTitle, thumbnail = thumbnail)
        }
        reflectMetadataIntoPlayer(filmId, title, channelTitle, thumbnail)
    }

    private fun reflectMetadataIntoPlayer(filmId: String, title: String, channelTitle: String, thumbnail: String) {
        if (loadedKey?.startsWith("$filmId|") != true || player.mediaItemCount == 0) return
        runCatching {
            val item = player.getMediaItemAt(0)
            val old = item.mediaMetadata
            val updated = old.buildUpon()
                .setTitle(title.ifBlank { old.title })
                .setArtist(channelTitle.ifBlank { old.artist })
                .setArtworkUri(thumbnail.takeIf { it.isNotBlank() }?.let { Uri.parse(it) } ?: old.artworkUri)
                .build()
            player.replaceMediaItem(0, item.buildUpon().setMediaMetadata(updated).build())
        }
    }

    fun playDash(filmId: String, manifestUrl: String, gatewayHost: String?, startPositionMs: Long = 0L) {
        if (manifestUrl.isBlank()) return
        try {
            val key = "$filmId|$manifestUrl"
            if (key == loadedKey && player.mediaItemCount > 0) {
                player.playWhenReady = true
                return
            }
            val resolvingFactory = ResolvingDataSource.Factory(httpFactory) { dataSpec ->
                val original = dataSpec.uri.toString()
                val rewritten = PhimAiUtils.rewriteGatewayUrl(original, gatewayHost)
                if (rewritten == original) dataSpec else dataSpec.withUri(Uri.parse(rewritten))
            }
            val meta = _nowPlaying.value
            val item = MediaItem.Builder()
                .setUri(Uri.parse(manifestUrl))
                .setMimeType(MimeTypes.APPLICATION_MPD)
                .setMediaMetadata(
                    MediaMetadata.Builder()
                        .setTitle(meta?.title.orEmpty())
                        .setArtist(meta?.channelTitle.orEmpty())
                        .setArtworkUri(meta?.thumbnail?.takeIf { it.isNotBlank() }?.let { Uri.parse(it) })
                        .build()
                )
                .build()
            val source = DashMediaSource.Factory(
                DefaultDashChunkSource.Factory(resolvingFactory),
                resolvingFactory
            ).createMediaSource(item)

            loadedKey = key
            isDashActive = true
            _activeHeight.value = 0
            lastSwitchAt = SystemClock.elapsedRealtime()
            if (startPositionMs > 3_000L) {
                player.setMediaSource(source, startPositionMs)
            } else {
                player.setMediaSource(source)
            }
            player.prepare()
            player.playWhenReady = true
        } catch (t: Throwable) {
            Log.e(TAG, "playDash($filmId) failed: ${t.message}", t)
            isDashActive = false
        }
    }

    fun playHls(filmId: String, hlsUrl: String, startPositionMs: Long = 0L) {
        if (hlsUrl.isBlank()) return
        try {
            val key = "$filmId|$hlsUrl"
            if (key == loadedKey && player.mediaItemCount > 0) {
                player.playWhenReady = true
                return
            }
            val meta = _nowPlaying.value
            val item = MediaItem.Builder()
                .setUri(Uri.parse(hlsUrl))
                .setMimeType(MimeTypes.APPLICATION_M3U8)
                .setMediaMetadata(
                    MediaMetadata.Builder()
                        .setTitle(meta?.title.orEmpty())
                        .setArtist(meta?.channelTitle.orEmpty())
                        .setArtworkUri(meta?.thumbnail?.takeIf { it.isNotBlank() }?.let { Uri.parse(it) })
                        .build()
                )
                .build()
            val source = HlsMediaSource.Factory(httpFactory).createMediaSource(item)
            loadedKey = key
            isDashActive = true
            lastSwitchAt = SystemClock.elapsedRealtime()
            if (startPositionMs > 3_000L) player.setMediaSource(source, startPositionMs) else player.setMediaSource(source)
            player.prepare()
            player.playWhenReady = true
        } catch (t: Throwable) {
            Log.e(TAG, "playHls($filmId) failed: ${t.message}", t)
        }
    }

    fun playDirect(filmId: String, videoUrl: String, audioUrl: String?, startPositionMs: Long = 0L) {
        if (videoUrl.isBlank()) return
        try {
            val key = "$filmId|$videoUrl"
            if (key == loadedKey && player.mediaItemCount > 0) {
                player.playWhenReady = true
                return
            }
            val now = SystemClock.elapsedRealtime()
            val isSameVideo = loadedKey?.startsWith("$filmId|") == true
            if (isSameVideo && now - lastSwitchAt < QUALITY_SWITCH_DEBOUNCE_MS) return

            val currentPos = if (isSameVideo && player.currentPosition > 0L) player.currentPosition else startPositionMs
            val dur = runCatching { player.duration }.getOrDefault(0L)
            val resumePos = if (currentPos > 0L && dur > 0L) {
                currentPos.coerceAtMost((dur - 5_000L).coerceAtLeast(0L))
            } else currentPos

            val meta = _nowPlaying.value
            val mediaMetadata = MediaMetadata.Builder()
                .setTitle(meta?.title.orEmpty())
                .setArtist(meta?.channelTitle.orEmpty())
                .setArtworkUri(meta?.thumbnail?.takeIf { it.isNotBlank() }?.let { Uri.parse(it) })
                .build()
            val videoItem = MediaItem.Builder()
                .setUri(Uri.parse(videoUrl))
                .setMediaMetadata(mediaMetadata)
                .build()
            val videoSource = ProgressiveMediaSource.Factory(httpFactory).createMediaSource(videoItem)
            val source = if (!audioUrl.isNullOrBlank()) {
                val audioSource = ProgressiveMediaSource.Factory(httpFactory)
                    .createMediaSource(MediaItem.fromUri(Uri.parse(audioUrl)))
                MergingMediaSource(videoSource, audioSource)
            } else {
                videoSource
            }

            loadedKey = key
            isDashActive = false
            lastSwitchAt = now
            if (resumePos > 0L) player.setMediaSource(source, resumePos) else player.setMediaSource(source)
            player.prepare()
            player.playWhenReady = true
        } catch (t: Throwable) {
            Log.e(TAG, "playDirect($filmId) failed: ${t.message}", t)
        }
    }

    fun isLoadedFor(url: String): Boolean =
        loadedKey?.endsWith("|$url") == true && player.mediaItemCount > 0

    fun togglePlayPause() {
        if (player.isPlaying) player.pause() else player.play()
    }

    fun pause() = player.pause()

    fun stopAndClear() {
        runCatching {
            player.stop()
            player.clearMediaItems()
        }
        loadedKey = null
        isDashActive = false
        _activeHeight.value = 0
        lastSwitchAt = 0L
        mediaServiceRequested = false
        _nowPlaying.value = null
    }

    private fun ensureMediaServiceStarted() {
        if (mediaServiceRequested) return
        mediaServiceRequested = true
        try {
            ContextCompat.startForegroundService(context, Intent(context, PlaybackService::class.java))
        } catch (_: Throwable) {
            mediaServiceRequested = false
        }
    }
}
