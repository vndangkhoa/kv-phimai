package com.phimai.tv.player

import android.content.Context
import android.net.Uri
import android.os.SystemClock
import androidx.annotation.OptIn
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.VideoSize
import androidx.media3.common.util.UnstableApi
import androidx.media3.database.StandaloneDatabaseProvider
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.ResolvingDataSource
import androidx.media3.datasource.cache.CacheDataSource
import androidx.media3.datasource.cache.LeastRecentlyUsedCacheEvictor
import androidx.media3.datasource.cache.SimpleCache
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.analytics.AnalyticsListener
import androidx.media3.exoplayer.dash.DashMediaSource
import androidx.media3.exoplayer.hls.HlsMediaSource
import androidx.media3.exoplayer.mediacodec.MediaCodecUtil
import androidx.media3.exoplayer.source.MergingMediaSource
import androidx.media3.exoplayer.source.ProgressiveMediaSource
import androidx.media3.exoplayer.trackselection.AdaptiveTrackSelection
import androidx.media3.exoplayer.trackselection.DefaultTrackSelector
import androidx.media3.exoplayer.upstream.DefaultBandwidthMeter
import com.phimai.tv.data.api.TvPhimAiApi
import com.phimai.tv.data.util.TvPhimAiUtils
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.io.File

@OptIn(UnstableApi::class)
class TvPlaybackManager private constructor(context: Context) {

    companion object {
        @Volatile
        private var instance: TvPlaybackManager? = null
        @Volatile
        private var mediaCache: SimpleCache? = null

        @Synchronized
        fun getMediaCache(context: Context): SimpleCache {
            if (mediaCache == null) {
                val dir = File(context.applicationContext.cacheDir, "phimai_tv_media_cache")
                val evictor = LeastRecentlyUsedCacheEvictor(200L * 1024 * 1024)
                mediaCache = SimpleCache(dir, evictor, StandaloneDatabaseProvider(context.applicationContext))
            }
            return mediaCache!!
        }

        fun getInstance(context: Context): TvPlaybackManager =
            instance ?: synchronized(this) {
                instance ?: TvPlaybackManager(context.applicationContext).also { instance = it }
            }
    }

    private val okHttpFactory = OkHttpDataSource.Factory(TvPhimAiApi.okHttp)
    private val cacheFactory = CacheDataSource.Factory()
        .setCache(getMediaCache(context))
        .setUpstreamDataSourceFactory(okHttpFactory)
        .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR)

    private val gatewayAwareFactory = ResolvingDataSource.Factory(cacheFactory) { spec ->
        val original = spec.uri.toString()
        val host = TvPhimAiUtils.extractHost(TvPhimAiApi.baseUrl)
        val rewritten = TvPhimAiUtils.rewriteGatewayUrl(original, host)
        if (rewritten == original) spec else spec.withUri(Uri.parse(rewritten))
    }

    private val dataSourceFactory = DefaultDataSource.Factory(context.applicationContext, gatewayAwareFactory)

    private val prefs = context.applicationContext.getSharedPreferences("phimai_tv_playback", Context.MODE_PRIVATE)
    private var lastBwSaveAt = 0L

    private val bandwidthMeter = DefaultBandwidthMeter.Builder(context.applicationContext)
        .apply {
            val saved = prefs.getLong("bw_bps", 0L)
            setInitialBitrateEstimate(if (saved >= 500_000L) saved.coerceAtMost(120_000_000L) else 4_500_000L)
        }
        .build()

    private val hardwareAv1 = runCatching {
        MediaCodecUtil.getDecoderInfos(MimeTypes.VIDEO_AV1, false, false).any { it.hardwareAccelerated }
    }.getOrDefault(false)

    private val _bandwidthMbps = MutableStateFlow(0f)
    val bandwidthMbps: StateFlow<Float> = _bandwidthMbps.asStateFlow()

    private val _activeHeight = MutableStateFlow(0)
    val activeHeight: StateFlow<Int> = _activeHeight.asStateFlow()

    @Volatile
    var isFastDashActive: Boolean = false
        private set

    @Volatile
    var maxHeightCap: Int = 0
        private set

    val trackSelector = DefaultTrackSelector(
        context,
        AdaptiveTrackSelection.Factory(3_000, 12_000, 12_000, 0.85f)
    ).apply {
        setParameters(
            buildUponParameters()
                .setForceHighestSupportedBitrate(false)
                .setAllowVideoMixedMimeTypeAdaptiveness(false)
                .setExceedVideoConstraintsIfNecessary(true)
                .setPreferredVideoMimeTypes(
                    *(if (hardwareAv1) arrayOf(MimeTypes.VIDEO_AV1, MimeTypes.VIDEO_H264) else arrayOf(MimeTypes.VIDEO_H264))
                )
        )
    }

    fun setMaxHeight(cap: Int) {
        maxHeightCap = cap
        trackSelector.setParameters(
            trackSelector.buildUponParameters()
                .clearVideoSizeConstraints()
                .setExceedVideoConstraintsIfNecessary(true)
                .apply { if (cap > 0) setMaxVideoSize(Int.MAX_VALUE, cap) }
        )
    }

    val player: ExoPlayer = ExoPlayer.Builder(context.applicationContext)
        .setBandwidthMeter(bandwidthMeter)
        .setTrackSelector(trackSelector)
        .setLoadControl(
            DefaultLoadControl.Builder()
                .setBufferDurationsMs(10_000, 40_000, 350, 1_200)
                .setBackBuffer(20_000, true)
                .setPrioritizeTimeOverSizeThresholds(true)
                .build()
        )
        .setSeekForwardIncrementMs(10_000)
        .setSeekBackIncrementMs(10_000)
        .setAudioAttributes(
            AudioAttributes.Builder()
                .setUsage(C.USAGE_MEDIA)
                .setContentType(C.AUDIO_CONTENT_TYPE_MOVIE)
                .build(),
            true
        )
        .build()
        .apply {
            addListener(object : androidx.media3.common.Player.Listener {
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
                    if (now - lastBwSaveAt >= 4_000L) {
                        lastBwSaveAt = now
                        prefs.edit().putLong("bw_bps", bitrateEstimate).apply()
                    }
                }
            })
        }

    fun playDashFast(manifestUrl: String, startPositionMs: Long = 0L): Boolean {
        if (manifestUrl.isBlank()) return false
        return try {
            exoStopQuiet()
            val item = MediaItem.Builder()
                .setUri(Uri.parse(manifestUrl))
                .setMimeType(MimeTypes.APPLICATION_MPD)
                .build()
            val source = DashMediaSource.Factory(dataSourceFactory).createMediaSource(item)
            _activeHeight.value = 0
            isFastDashActive = true
            if (startPositionMs > 3_000L) player.setMediaSource(source, startPositionMs) else player.setMediaSource(source)
            player.prepare()
            player.playWhenReady = true
            true
        } catch (_: Exception) {
            isFastDashActive = false
            false
        }
    }

    fun playHls(hlsUrl: String, startPositionMs: Long = 0L): Boolean {
        if (hlsUrl.isBlank()) return false
        return try {
            exoStopQuiet()
            val source = HlsMediaSource.Factory(dataSourceFactory).createMediaSource(MediaItem.fromUri(Uri.parse(hlsUrl)))
            isFastDashActive = false
            if (startPositionMs > 3_000L) player.setMediaSource(source, startPositionMs) else player.setMediaSource(source)
            player.prepare()
            player.playWhenReady = true
            true
        } catch (_: Exception) {
            false
        }
    }

    fun playDirect(videoUrl: String, audioUrl: String?, startPositionMs: Long = 0L): Boolean {
        if (videoUrl.isBlank()) return false
        return try {
            val pos = if (startPositionMs > 3_000L) startPositionMs else player.currentPosition.coerceAtLeast(0L)
            exoStopQuiet()
            val vs = ProgressiveMediaSource.Factory(dataSourceFactory).createMediaSource(MediaItem.fromUri(Uri.parse(videoUrl)))
            val source = if (!audioUrl.isNullOrBlank()) {
                val aus = ProgressiveMediaSource.Factory(dataSourceFactory).createMediaSource(MediaItem.fromUri(Uri.parse(audioUrl)))
                MergingMediaSource(vs, aus)
            } else vs
            isFastDashActive = false
            if (pos > 3_000L) player.setMediaSource(source, pos) else player.setMediaSource(source)
            player.prepare()
            player.playWhenReady = true
            true
        } catch (_: Exception) {
            false
        }
    }

    fun markFastDashEnded() {
        isFastDashActive = false
    }

    private fun exoStopQuiet() {
        runCatching {
            player.stop()
            player.clearMediaItems()
        }
    }

    fun reset() {
        isFastDashActive = false
        exoStopQuiet()
    }
}
