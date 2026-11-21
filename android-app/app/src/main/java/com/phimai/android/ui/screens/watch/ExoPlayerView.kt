package com.phimai.android.ui.screens.watch

import android.net.Uri
import android.util.Log
import androidx.annotation.OptIn
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.VolumeOff
import androidx.compose.material.icons.automirrored.filled.VolumeUp
import androidx.compose.material.icons.filled.AspectRatio
import androidx.compose.material.icons.filled.Crop169
import androidx.compose.material.icons.filled.FastForward
import androidx.compose.material.icons.filled.FastRewind
import androidx.compose.material.icons.filled.Fullscreen
import androidx.compose.material.icons.filled.FullscreenExit
import androidx.compose.material.icons.filled.HighQuality
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PictureInPictureAlt
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Replay
import androidx.compose.material.icons.filled.Speed
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.MergingMediaSource
import androidx.media3.exoplayer.source.ProgressiveMediaSource
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import com.phimai.android.data.model.QualityTier
import com.phimai.android.data.net.PhimAiHttp
import com.phimai.android.data.util.PhimAiUtils
import com.phimai.android.ui.theme.cinema
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private const val TAG = "PhimAiExoPlayerView"
private const val STALL_TIMEOUT_MS = 16_000L

@OptIn(UnstableApi::class)
@Composable
fun ExoPlayerView(
    videoUrl: String,
    audioUrl: String? = null,
    sharedPlayer: ExoPlayer? = null,
    title: String = "",
    activeHeight: Int = 0,
    selectedTier: QualityTier = QualityTier.AUTO,
    isFullscreen: Boolean = false,
    onTierSelected: ((QualityTier) -> Unit)? = null,
    onFullscreenToggle: () -> Unit = {},
    onEnterPip: (() -> Unit)? = null,
    onTheaterToggle: (() -> Unit)? = null,
    isTheater: Boolean = false,
    cornerRadius: Dp = 0.dp,
    fillAvailableSpace: Boolean = false,
    hideOverlayControls: Boolean = false,
    onBackClick: (() -> Unit)? = null,
    onEndedNext: (() -> Unit)? = null,
    onError: (() -> Boolean)? = null,
    modifier: Modifier = Modifier
) {
    val palette = cinema
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    val exoPlayer = remember(sharedPlayer) {
        sharedPlayer ?: ExoPlayer.Builder(context)
            .setLoadControl(
                DefaultLoadControl.Builder()
                    .setBufferDurationsMs(15_000, 60_000, 1_500, 3_500)
                    .build()
            )
            .build()
            .apply {
                playWhenReady = true
                volume = 1f
            }
    }
    val ownsPlayer = sharedPlayer == null

    if (ownsPlayer) {
        val factory = remember { OkHttpDataSource.Factory(PhimAiHttp.client) }
        LaunchedEffect(videoUrl, audioUrl) {
            if (videoUrl.isNotBlank()) {
                val vs = ProgressiveMediaSource.Factory(factory).createMediaSource(MediaItem.fromUri(Uri.parse(videoUrl)))
                val ms = if (!audioUrl.isNullOrBlank()) {
                    MergingMediaSource(
                        vs,
                        ProgressiveMediaSource.Factory(factory).createMediaSource(MediaItem.fromUri(Uri.parse(audioUrl)))
                    )
                } else vs
                exoPlayer.setMediaSource(ms)
                exoPlayer.prepare()
                exoPlayer.playWhenReady = true
            }
        }
    }

    var isPlaying by remember { mutableStateOf(exoPlayer.isPlaying) }
    var isBuffering by remember { mutableStateOf(exoPlayer.playbackState == Player.STATE_BUFFERING) }
    var isEnded by remember { mutableStateOf(exoPlayer.playbackState == Player.STATE_ENDED) }
    var currentPosition by remember { mutableLongStateOf(exoPlayer.currentPosition.coerceAtLeast(0L)) }
    var duration by remember { mutableLongStateOf(exoPlayer.duration.coerceAtLeast(1L)) }
    var showControls by remember { mutableStateOf(true) }
    var isMuted by remember { mutableStateOf(exoPlayer.volume == 0f) }
    var hasError by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf("") }
    var resizeMode by remember { mutableIntStateOf(AspectRatioFrameLayout.RESIZE_MODE_FIT) }
    var showQualityMenu by remember { mutableStateOf(false) }
    var showSpeedMenu by remember { mutableStateOf(false) }
    var speed by remember { mutableFloatStateOf(exoPlayer.playbackParameters.speed) }
    var isScrubbing by remember { mutableStateOf(false) }
    var scrubFraction by remember { mutableFloatStateOf(0f) }

    var doubleTapSide by remember { mutableStateOf<String?>(null) }
    val doubleTapAlpha = remember { Animatable(0f) }

    fun triggerDoubleTapSeek(isForward: Boolean) {
        val delta = if (isForward) 10_000L else -10_000L
        val target = (exoPlayer.currentPosition + delta).coerceIn(0L, duration.coerceAtLeast(1L))
        exoPlayer.seekTo(target)
        currentPosition = target
        doubleTapSide = if (isForward) "right" else "left"
        scope.launch {
            doubleTapAlpha.snapTo(1f)
            doubleTapAlpha.animateTo(0f, tween(550, easing = FastOutSlowInEasing))
            doubleTapSide = null
        }
    }

    LaunchedEffect(isPlaying) {
        if (isPlaying) {
            while (true) {
                delay(250)
                if (!isScrubbing) {
                    runCatching {
                        currentPosition = exoPlayer.currentPosition.coerceAtLeast(0L)
                        duration = exoPlayer.duration.coerceAtLeast(1L)
                    }
                }
            }
        }
    }

    LaunchedEffect(showControls, isPlaying, showQualityMenu, showSpeedMenu) {
        if (showControls && isPlaying && !showQualityMenu && !showSpeedMenu) {
            delay(3500)
            showControls = false
        }
    }

    DisposableEffect(exoPlayer) {
        val listener = object : Player.Listener {
            override fun onIsPlayingChanged(playing: Boolean) {
                isPlaying = playing
                if (playing && hasError) {
                    hasError = false
                    errorMessage = ""
                }
            }

            override fun onRenderedFirstFrame() {
                if (hasError) {
                    hasError = false
                    errorMessage = ""
                }
            }

            override fun onPlaybackStateChanged(state: Int) {
                isBuffering = state == Player.STATE_BUFFERING
                isEnded = state == Player.STATE_ENDED
                if (state == Player.STATE_READY && hasError) {
                    hasError = false
                    errorMessage = ""
                }
                if (state == Player.STATE_ENDED) {
                    onEndedNext?.invoke()
                }
            }

            override fun onPlayerError(error: PlaybackException) {
                Log.w(TAG, "Playback error ${error.errorCodeName}: ${error.message}")
                val handled = onError?.invoke() == true
                if (!handled) {
                    hasError = true
                    errorMessage = error.errorCodeName
                } else {
                    hasError = false
                    isBuffering = true
                }
            }
        }
        exoPlayer.addListener(listener)
        onDispose {
            exoPlayer.removeListener(listener)
            if (ownsPlayer) exoPlayer.release()
        }
    }

    var stallEpoch by remember { mutableIntStateOf(0) }
    LaunchedEffect(isBuffering, stallEpoch) {
        if (!isBuffering) return@LaunchedEffect
        delay(STALL_TIMEOUT_MS)
        if (exoPlayer.playbackState == Player.STATE_BUFFERING && !hasError) {
            stallEpoch++
            val handled = onError?.invoke() == true
            if (!handled) {
                hasError = true
                errorMessage = "Luồng phát đang phản hồi chậm"
            }
        }
    }

    Box(
        modifier = modifier
            .then(
                if (isFullscreen || fillAvailableSpace) Modifier.fillMaxSize()
                else Modifier
                    .fillMaxWidth()
                    .aspectRatio(16f / 9f)
            )
            .clip(RoundedCornerShape(if (isFullscreen || isTheater) 0.dp else cornerRadius))
            .background(Color.Black)
            .pointerInput(hideOverlayControls) {
                detectTapGestures(
                    onTap = { if (!hideOverlayControls) showControls = !showControls },
                    onDoubleTap = { offset -> triggerDoubleTapSeek(offset.x > size.width / 2f) }
                )
            }
    ) {
        AndroidView(
            factory = { ctx ->
                PlayerView(ctx).apply {
                    player = exoPlayer
                    useController = false
                    setKeepContentOnPlayerReset(true)
                    setShutterBackgroundColor(android.graphics.Color.TRANSPARENT)
                    this.resizeMode = resizeMode
                    setShowNextButton(false)
                    setShowPreviousButton(false)
                }
            },
            update = { view ->
                if (view.player !== exoPlayer) view.player = exoPlayer
                view.resizeMode = resizeMode
            },
            onRelease = { view -> view.player = null },
            modifier = Modifier.fillMaxSize()
        )

        if (doubleTapSide == "left" || doubleTapSide == "right") {
            val isRight = doubleTapSide == "right"
            Box(
                modifier = Modifier
                    .fillMaxHeight()
                    .fillMaxWidth(0.48f)
                    .align(if (isRight) Alignment.CenterEnd else Alignment.CenterStart)
                    .background(Color.White.copy(alpha = 0.14f * doubleTapAlpha.value)),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.alpha(doubleTapAlpha.value)) {
                    Icon(
                        imageVector = if (isRight) Icons.Filled.FastForward else Icons.Filled.FastRewind,
                        contentDescription = null,
                        tint = palette.gold,
                        modifier = Modifier.size(38.dp)
                    )
                    Text(if (isRight) "+10 giây" else "-10 giây", color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                }
            }
        }

        if (isBuffering && !hasError) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = palette.gold, strokeWidth = 3.dp, modifier = Modifier.size(44.dp))
            }
        }

        if (hasError) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color.Black.copy(alpha = 0.84f)),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(16.dp)) {
                    Text("Không thể phát luồng hiện tại", color = Color.White, fontWeight = FontWeight.Bold)
                    if (errorMessage.isNotBlank()) {
                        Text(errorMessage, color = palette.textMuted, fontSize = 12.sp)
                    }
                    Spacer(Modifier.height(12.dp))
                    IconButton(
                        onClick = {
                            hasError = false
                            errorMessage = ""
                            exoPlayer.prepare()
                            exoPlayer.play()
                        },
                        modifier = Modifier
                            .background(palette.gold, CircleShape)
                            .size(44.dp)
                    ) {
                        Icon(Icons.Filled.Replay, contentDescription = "Thử lại", tint = palette.obsidian)
                    }
                }
            }
        }

        AnimatedVisibility(
            visible = showControls && !hasError && !hideOverlayControls,
            enter = fadeIn(tween(180)),
            exit = fadeOut(tween(180))
        ) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(
                        Brush.verticalGradient(
                            listOf(
                                Color.Black.copy(alpha = 0.65f),
                                Color.Black.copy(alpha = 0.18f),
                                Color.Black.copy(alpha = 0.72f)
                            )
                        )
                    )
            ) {
                // Top Bar
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .align(Alignment.TopStart)
                        .padding(horizontal = 6.dp, vertical = 4.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.weight(1f)
                    ) {
                        onBackClick?.let { backClick ->
                            IconButton(onClick = backClick) {
                                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Quay lại", tint = Color.White)
                            }
                        }
                        if (isFullscreen && title.isNotBlank()) {
                            Text(
                                text = title,
                                color = Color.White,
                                fontSize = 14.sp,
                                fontWeight = FontWeight.SemiBold,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                modifier = Modifier.weight(1f)
                            )
                        }
                    }

                    Row(verticalAlignment = Alignment.CenterVertically) {
                        if (activeHeight > 0 || selectedTier != QualityTier.AUTO) {
                            val badge = if (selectedTier == QualityTier.AUTO && activeHeight > 0) {
                                "Auto • ${activeHeight}p"
                            } else if (activeHeight > 0) {
                                "${activeHeight}p"
                            } else selectedTier.label
                            Surface(
                                shape = RoundedCornerShape(5.dp),
                                color = palette.goldMuted,
                                border = BorderStroke(1.dp, palette.gold.copy(alpha = 0.45f)),
                                modifier = Modifier.padding(end = 4.dp)
                            ) {
                                Text(
                                    text = badge,
                                    color = palette.gold,
                                    fontSize = 10.5.sp,
                                    fontWeight = FontWeight.Bold,
                                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                )
                            }
                        }

                        IconButton(onClick = {
                            isMuted = !isMuted
                            exoPlayer.volume = if (isMuted) 0f else 1f
                        }) {
                            Icon(
                                imageVector = if (isMuted) Icons.AutoMirrored.Filled.VolumeOff else Icons.AutoMirrored.Filled.VolumeUp,
                                contentDescription = if (isMuted) "Bật tiếng" else "Tắt tiếng",
                                tint = Color.White,
                                modifier = Modifier.size(21.dp)
                            )
                        }

                        IconButton(onClick = {
                            resizeMode = when (resizeMode) {
                                AspectRatioFrameLayout.RESIZE_MODE_FIT -> AspectRatioFrameLayout.RESIZE_MODE_ZOOM
                                AspectRatioFrameLayout.RESIZE_MODE_ZOOM -> AspectRatioFrameLayout.RESIZE_MODE_FILL
                                else -> AspectRatioFrameLayout.RESIZE_MODE_FIT
                            }
                        }) {
                            Icon(Icons.Filled.AspectRatio, contentDescription = "Tỷ lệ khung hình", tint = Color.White, modifier = Modifier.size(21.dp))
                        }

                        if (onTierSelected != null) {
                            Box {
                                IconButton(onClick = { showQualityMenu = true }) {
                                    Icon(Icons.Filled.HighQuality, contentDescription = "Chất lượng", tint = palette.gold, modifier = Modifier.size(22.dp))
                                }
                                DropdownMenu(expanded = showQualityMenu, onDismissRequest = { showQualityMenu = false }) {
                                    QualityTier.entries.forEach { tier ->
                                        DropdownMenuItem(
                                            text = {
                                                Text(
                                                    text = tier.label,
                                                    fontWeight = if (tier == selectedTier) FontWeight.Bold else FontWeight.Normal,
                                                    color = if (tier == selectedTier) palette.gold else Color.Unspecified
                                                )
                                            },
                                            onClick = {
                                                onTierSelected(tier)
                                                showQualityMenu = false
                                            }
                                        )
                                    }
                                }
                            }
                        }

                        Box {
                            IconButton(onClick = { showSpeedMenu = true }) {
                                Icon(Icons.Filled.Speed, contentDescription = "Tốc độ", tint = Color.White, modifier = Modifier.size(21.dp))
                            }
                            DropdownMenu(expanded = showSpeedMenu, onDismissRequest = { showSpeedMenu = false }) {
                                listOf(0.75f, 1.0f, 1.25f, 1.5f, 2.0f).forEach { sp ->
                                    DropdownMenuItem(
                                        text = {
                                            Text(
                                                text = if (sp == 1.0f) "1.0x (Chuẩn)" else "${sp}x",
                                                fontWeight = if (sp == speed) FontWeight.Bold else FontWeight.Normal
                                            )
                                        },
                                        onClick = {
                                            speed = sp
                                            exoPlayer.playbackParameters = PlaybackParameters(sp)
                                            showSpeedMenu = false
                                        }
                                    )
                                }
                            }
                        }

                        onEnterPip?.let {
                            IconButton(onClick = it) {
                                Icon(Icons.Filled.PictureInPictureAlt, contentDescription = "Hình trong hình", tint = Color.White, modifier = Modifier.size(20.dp))
                            }
                        }
                    }
                }

                // Center Play/Seek Controls
                Row(
                    modifier = Modifier.align(Alignment.Center),
                    horizontalArrangement = Arrangement.spacedBy(32.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    IconButton(onClick = { triggerDoubleTapSeek(false) }, modifier = Modifier.size(44.dp)) {
                        Icon(Icons.Filled.FastRewind, contentDescription = "-10s", tint = Color.White, modifier = Modifier.size(32.dp))
                    }
                    Surface(
                        shape = CircleShape,
                        color = palette.obsidian.copy(alpha = 0.7f),
                        border = BorderStroke(1.dp, palette.gold.copy(alpha = 0.4f)),
                        modifier = Modifier.size(60.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .fillMaxSize()
                                .clickable {
                                    if (isEnded) {
                                        exoPlayer.seekTo(0)
                                        exoPlayer.play()
                                        isEnded = false
                                    } else {
                                        if (isPlaying) exoPlayer.pause() else exoPlayer.play()
                                    }
                                },
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = when {
                                    isEnded -> Icons.Filled.Replay
                                    isPlaying -> Icons.Filled.Pause
                                    else -> Icons.Filled.PlayArrow
                                },
                                contentDescription = if (isPlaying) "Tạm dừng" else "Phát",
                                tint = palette.gold,
                                modifier = Modifier.size(34.dp)
                            )
                        }
                    }
                    IconButton(onClick = { triggerDoubleTapSeek(true) }, modifier = Modifier.size(44.dp)) {
                        Icon(Icons.Filled.FastForward, contentDescription = "+10s", tint = Color.White, modifier = Modifier.size(32.dp))
                    }
                }

                // Bottom Timeline
                val liveFraction = (currentPosition.toFloat() / duration.coerceAtLeast(1L).toFloat()).coerceIn(0f, 1f)
                val sliderVal = if (isScrubbing) scrubFraction else liveFraction
                val shownPos = if (isScrubbing) (scrubFraction * duration).toLong() else currentPosition

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .align(Alignment.BottomCenter)
                        .padding(horizontal = 12.dp, vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = PhimAiUtils.formatDurationMs(shownPos),
                        color = Color.White,
                        fontSize = 11.5.sp,
                        fontWeight = FontWeight.Medium,
                        modifier = Modifier.padding(end = 8.dp)
                    )
                    Slider(
                        value = sliderVal,
                        onValueChange = { f ->
                            isScrubbing = true
                            scrubFraction = f.coerceIn(0f, 1f)
                            showControls = true
                        },
                        onValueChangeFinished = {
                            val target = (scrubFraction * duration).toLong().coerceIn(0L, duration)
                            exoPlayer.seekTo(target)
                            currentPosition = target
                            isScrubbing = false
                        },
                        modifier = Modifier.weight(1f),
                        colors = SliderDefaults.colors(
                            thumbColor = palette.crimson,
                            activeTrackColor = palette.crimson,
                            inactiveTrackColor = Color.White.copy(alpha = 0.28f)
                        )
                    )
                    Text(
                        text = PhimAiUtils.formatDurationMs(duration),
                        color = Color.White.copy(alpha = 0.8f),
                        fontSize = 11.5.sp,
                        fontWeight = FontWeight.Medium,
                        modifier = Modifier.padding(horizontal = 8.dp)
                    )
                    onTheaterToggle?.let { toggleTheater ->
                        IconButton(onClick = toggleTheater, modifier = Modifier.size(32.dp)) {
                            Icon(
                                Icons.Filled.Crop169,
                                contentDescription = "Chế độ rạp",
                                tint = if (isTheater) palette.gold else Color.White,
                                modifier = Modifier.size(21.dp)
                            )
                        }
                    }
                    IconButton(onClick = onFullscreenToggle, modifier = Modifier.size(32.dp)) {
                        Icon(
                            imageVector = if (isFullscreen) Icons.Filled.FullscreenExit else Icons.Filled.Fullscreen,
                            contentDescription = "Toàn màn hình",
                            tint = Color.White,
                            modifier = Modifier.size(22.dp)
                        )
                    }
                }
            }
        }
    }
}
