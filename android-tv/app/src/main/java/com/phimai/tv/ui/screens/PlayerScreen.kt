package com.phimai.tv.ui.screens

import android.view.KeyEvent
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.activity.compose.BackHandler
import androidx.annotation.OptIn
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.FastForward
import androidx.compose.material.icons.filled.FastRewind
import androidx.compose.material.icons.filled.HighQuality
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.SkipNext
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.VideoSize
import androidx.media3.common.util.UnstableApi
import androidx.media3.ui.PlayerView
import androidx.tv.foundation.lazy.list.TvLazyRow
import androidx.tv.foundation.lazy.list.items
import androidx.tv.foundation.lazy.list.itemsIndexed
import androidx.tv.material3.Border
import androidx.tv.material3.Button
import androidx.tv.material3.ButtonDefaults
import androidx.tv.material3.ClickableSurfaceDefaults
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.Icon
import androidx.tv.material3.OutlinedButton
import androidx.tv.material3.Surface
import androidx.tv.material3.Text
import coil.compose.AsyncImage
import com.phimai.tv.data.api.TvPhimAiApi
import com.phimai.tv.data.util.TvPhimAiUtils
import com.phimai.tv.player.TvPlaybackManager
import com.phimai.tv.ui.components.PhimAiTvFilmCard
import com.phimai.tv.ui.theme.TvCinema
import com.phimai.tv.viewmodel.PlayerViewModel
import kotlinx.coroutines.delay

@OptIn(UnstableApi::class)
@kotlin.OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun PlayerScreen(
    filmId: String,
    onSwitchFilm: (String) -> Unit,
    onBack: () -> Unit,
    vm: PlayerViewModel = viewModel()
) {
    val ctx = LocalContext.current
    val state by vm.state.collectAsState()
    val autoPlayNext by vm.autoPlayNext.collectAsState()
    val serverUrl by TvPhimAiApi.serverFlow.collectAsState()

    val playbackManager = remember { TvPlaybackManager.getInstance(ctx) }
    val exo = playbackManager.player

    var currentFilmId by remember(filmId) { mutableStateOf(filmId) }
    var isPlaying by remember { mutableStateOf(false) }
    var currentPosition by remember { mutableLongStateOf(0L) }
    var duration by remember { mutableLongStateOf(0L) }
    var showControls by remember { mutableStateOf(false) }
    var showUpNextDrawer by remember { mutableStateOf(false) }
    var countdownSeconds by remember { mutableIntStateOf(0) }
    var lastInteraction by remember { mutableLongStateOf(System.currentTimeMillis()) }
    var playerError by remember { mutableStateOf<String?>(null) }
    var qualityBadge by remember { mutableStateOf<String?>(null) }
    var qualityCap by remember { mutableIntStateOf(playbackManager.maxHeightCap) }
    var fallbackStage by remember(currentFilmId) { mutableIntStateOf(0) }

    val rootFocus = remember { FocusRequester() }
    val playFocus = remember { FocusRequester() }
    val drawerFocus = remember { FocusRequester() }

    LaunchedEffect(currentFilmId) {
        countdownSeconds = 0
        playerError = null
        qualityBadge = null
        val savedCap = vm.getDefaultQualityCap()
        qualityCap = savedCap
        playbackManager.setMaxHeight(savedCap)

        val resumeMs = vm.getResumePositionMs(currentFilmId)
        vm.load(currentFilmId)
        val dash = vm.dashManifestUrl(currentFilmId)
        if (!playbackManager.playDashFast(dash, resumeMs)) {
            val fallback = TvPhimAiUtils.progressiveFallbackUrl(TvPhimAiApi.baseUrl, currentFilmId)
            playbackManager.playDirect(fallback, null, resumeMs)
        }
    }

    LaunchedEffect(state.payload) {
        val payload = state.payload ?: return@LaunchedEffect
        if (payload.unavailable) {
            playbackManager.reset()
            return@LaunchedEffect
        }
        if (!playbackManager.isFastDashActive && exo.mediaItemCount == 0) {
            val hls = TvPhimAiUtils.resolveServerUrl(TvPhimAiApi.baseUrl, payload.hlsUrl)
            if (hls.isNotBlank() && playbackManager.playHls(hls)) return@LaunchedEffect
            val opts = state.qualityOptions
            val targetH = if (qualityCap > 0) qualityCap else 1080
            val chosen = opts.firstOrNull { it.height <= targetH } ?: opts.lastOrNull()
            val audio = TvPhimAiUtils.resolveServerUrl(TvPhimAiApi.baseUrl, payload.bestAudioUrl).ifBlank { null }
            val videoUrl = chosen?.url ?: TvPhimAiUtils.resolveServerUrl(TvPhimAiApi.baseUrl, payload.directStreamUrl)
                .ifBlank { TvPhimAiUtils.progressiveFallbackUrl(TvPhimAiApi.baseUrl, currentFilmId) }
            playbackManager.playDirect(videoUrl, if (chosen?.hasAudio == true) null else audio)
        }
    }

    fun triggerFallback() {
        if (fallbackStage >= 2) {
            playerError = "Không thể phát video từ máy chủ"
            return
        }
        fallbackStage++
        playbackManager.markFastDashEnded()
        val payload = state.payload
        val hls = TvPhimAiUtils.resolveServerUrl(TvPhimAiApi.baseUrl, payload?.hlsUrl)
        if (fallbackStage == 1 && hls.isNotBlank() && playbackManager.playHls(hls)) return
        val audio = TvPhimAiUtils.resolveServerUrl(TvPhimAiApi.baseUrl, payload?.bestAudioUrl).ifBlank { null }
        val opts = state.qualityOptions
        val direct = TvPhimAiUtils.resolveServerUrl(TvPhimAiApi.baseUrl, payload?.directStreamUrl)
            .ifBlank { TvPhimAiUtils.progressiveFallbackUrl(TvPhimAiApi.baseUrl, currentFilmId) }
        val ok = if (fallbackStage == 1) {
            val targetH = if (qualityCap > 0) qualityCap else 1080
            val chosen = opts.firstOrNull { it.height <= targetH } ?: opts.lastOrNull()
            val url = chosen?.url ?: direct
            playbackManager.playDirect(url, if (chosen?.hasAudio == true) null else audio)
        } else {
            val muxed = opts.firstOrNull { it.hasAudio }?.url ?: direct
            playbackManager.playDirect(muxed, null)
        }
        if (!ok && fallbackStage >= 2) {
            playerError = "Không tải được luồng phát"
        }
    }

    BackHandler(enabled = true) {
        when {
            countdownSeconds > 0 -> countdownSeconds = 0
            showUpNextDrawer -> {
                showUpNextDrawer = false
                showControls = true
            }
            showControls -> showControls = false
            else -> onBack()
        }
    }

    LaunchedEffect(Unit) {
        while (true) {
            delay(400)
            isPlaying = exo.isPlaying
            currentPosition = exo.currentPosition.coerceAtLeast(0L)
            duration = exo.duration.coerceAtLeast(0L)
        }
    }

    // Periodically save TV watch progress
    LaunchedEffect(currentFilmId) {
        while (true) {
            delay(5_000)
            val pos = exo.currentPosition.coerceAtLeast(0L)
            val dur = exo.duration.coerceAtLeast(0L)
            if (pos > 0L) vm.updateProgress(currentFilmId, pos, dur)
        }
    }

    LaunchedEffect(showControls, isPlaying, lastInteraction) {
        if (showControls && isPlaying && !showUpNextDrawer) {
            delay(4500)
            if (System.currentTimeMillis() - lastInteraction >= 4400) {
                showControls = false
            }
        }
    }

    LaunchedEffect(countdownSeconds) {
        if (countdownSeconds > 0) {
            delay(1000)
            if (countdownSeconds == 1) {
                countdownSeconds = 0
                vm.nextUpFilmId(currentFilmId)?.let { nextId ->
                    onSwitchFilm(nextId)
                }
            } else {
                countdownSeconds--
            }
        }
    }

    DisposableEffect(exo) {
        val listener = object : Player.Listener {
            override fun onVideoSizeChanged(videoSize: VideoSize) {
                if (videoSize.height > 0) {
                    qualityBadge = if (qualityCap == 0) "Auto • ${videoSize.height}p" else "${videoSize.height}p"
                }
            }

            override fun onPlaybackStateChanged(playbackState: Int) {
                if (playbackState == Player.STATE_ENDED && autoPlayNext && vm.nextUpFilmId(currentFilmId) != null) {
                    countdownSeconds = 5
                }
            }

            override fun onPlayerError(error: PlaybackException) {
                triggerFallback()
            }
        }
        exo.addListener(listener)
        onDispose {
            val pos = exo.currentPosition.coerceAtLeast(0L)
            val dur = exo.duration.coerceAtLeast(0L)
            if (pos > 0L) vm.updateProgress(currentFilmId, pos, dur)
            exo.removeListener(listener)
            playbackManager.reset()
        }
    }

    Box(
        Modifier
            .fillMaxSize()
            .background(Color.Black)
            .focusRequester(rootFocus)
            .focusable(enabled = !showControls && !showUpNextDrawer)
            .onKeyEvent { ke ->
                if (ke.type == KeyEventType.KeyDown) {
                    lastInteraction = System.currentTimeMillis()
                    val code = ke.nativeKeyEvent.keyCode
                    if (!showControls && !showUpNextDrawer) {
                        when (code) {
                            KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER, KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE -> {
                                if (exo.isPlaying) exo.pause() else exo.play()
                                showControls = true
                                return@onKeyEvent true
                            }
                            KeyEvent.KEYCODE_DPAD_LEFT -> {
                                exo.seekBack()
                                showControls = true
                                return@onKeyEvent true
                            }
                            KeyEvent.KEYCODE_DPAD_RIGHT -> {
                                exo.seekForward()
                                showControls = true
                                return@onKeyEvent true
                            }
                            KeyEvent.KEYCODE_DPAD_DOWN -> {
                                showUpNextDrawer = true
                                return@onKeyEvent true
                            }
                            KeyEvent.KEYCODE_DPAD_UP -> {
                                showControls = true
                                return@onKeyEvent true
                            }
                        }
                    }
                }
                false
            }
    ) {
        if (state.unavailableReason != null) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(state.unavailableReason ?: "", color = TvCinema.CrimsonSoft)
                    Button(onClick = onBack) { Text("Quay lại") }
                }
            }
            return@Box
        }

        if (playerError != null) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(playerError ?: "Lỗi phát", color = TvCinema.CrimsonSoft)
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Button(onClick = {
                            fallbackStage = 0
                            playerError = null
                            vm.load(currentFilmId)
                            playbackManager.playDashFast(vm.dashManifestUrl(currentFilmId))
                        }) { Text("Thử lại") }
                        OutlinedButton(onClick = onBack) { Text("Quay lại") }
                    }
                }
            }
            return@Box
        }

        AndroidView(
            factory = { c ->
                PlayerView(c).apply {
                    player = exo
                    useController = false
                    setKeepContentOnPlayerReset(true)
                    setShutterBackgroundColor(android.graphics.Color.TRANSPARENT)
                    isFocusable = false
                    isFocusableInTouchMode = false
                    layoutParams = FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
                }
            },
            modifier = Modifier.fillMaxSize()
        )

        // Initial thumbnail loading scrim
        AnimatedVisibility(visible = !isPlaying && exo.playbackState == Player.STATE_BUFFERING, enter = fadeIn(), exit = fadeOut()) {
            Box(Modifier.fillMaxSize().background(Color.Black), contentAlignment = Alignment.Center) {
                val thumb = state.film?.thumbnailUrl?.let { TvPhimAiUtils.resolveServerUrl(serverUrl, it) }
                    ?: TvPhimAiUtils.thumbUrl(serverUrl, currentFilmId)
                AsyncImage(model = thumb, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
                Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.55f)))
                CircularProgressIndicator(color = TvCinema.Gold, strokeWidth = 3.5.dp, modifier = Modifier.size(52.dp))
            }
        }

        // Cinema Noir Player Controls HUD
        AnimatedVisibility(visible = showControls && !showUpNextDrawer, enter = fadeIn(), exit = fadeOut()) {
            LaunchedEffect(Unit) { runCatching { playFocus.requestFocus() } }
            Box(
                Modifier
                    .fillMaxSize()
                    .background(
                        Brush.verticalGradient(
                            listOf(Color.Black.copy(0.75f), Color.Black.copy(0.20f), Color.Black.copy(0.85f))
                        )
                    )
                    .padding(32.dp)
            ) {
                // Top Info
                Row(
                    Modifier
                        .fillMaxWidth()
                        .align(Alignment.TopStart),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.weight(1f)) {
                        Surface(
                            onClick = onBack,
                            shape = ClickableSurfaceDefaults.shape(CircleShape),
                            colors = ClickableSurfaceDefaults.colors(containerColor = TvCinema.SlateRaised, focusedContainerColor = TvCinema.Gold)
                        ) {
                            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Quay lại", modifier = Modifier.padding(10.dp), tint = TvCinema.Ivory)
                        }
                        Column(Modifier.weight(1f)) {
                            Text(
                                text = state.film?.title ?: "PhimAI 4K",
                                color = TvCinema.Ivory,
                                fontSize = 19.sp,
                                fontWeight = FontWeight.Bold,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                            Text(
                                text = state.film?.channel.orEmpty(),
                                color = TvCinema.TextSecondary,
                                fontSize = 13.sp
                            )
                        }
                    }

                    qualityBadge?.let { badge ->
                        Box(
                            Modifier
                                .clip(RoundedCornerShape(6.dp))
                                .background(TvCinema.GoldMuted)
                                .border(1.dp, TvCinema.Gold.copy(alpha = 0.5f), RoundedCornerShape(6.dp))
                                .padding(horizontal = 10.dp, vertical = 4.dp)
                        ) {
                            Text(badge, color = TvCinema.Gold, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }

                // Bottom Bar
                Column(
                    Modifier
                        .fillMaxWidth()
                        .align(Alignment.BottomCenter),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    val progress = if (duration > 0L) (currentPosition.toFloat() / duration.toFloat()).coerceIn(0f, 1f) else 0f
                    LinearProgressIndicator(
                        progress = { progress },
                        color = TvCinema.Crimson,
                        trackColor = Color.White.copy(alpha = 0.25f),
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(6.dp)
                            .clip(RoundedCornerShape(3.dp))
                    )
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            text = "${TvPhimAiUtils.formatClockMs(currentPosition)} / ${TvPhimAiUtils.formatClockMs(duration)}",
                            color = TvCinema.Ivory,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Medium
                        )
                        Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                            OutlinedButton(onClick = { lastInteraction = System.currentTimeMillis(); exo.seekBack() }) {
                                Icon(Icons.Filled.FastRewind, contentDescription = "-10s", modifier = Modifier.size(18.dp))
                                Spacer(Modifier.width(4.dp))
                                Text("-10s")
                            }
                            Button(
                                onClick = {
                                    lastInteraction = System.currentTimeMillis()
                                    if (exo.isPlaying) exo.pause() else exo.play()
                                },
                                colors = ButtonDefaults.colors(containerColor = TvCinema.Gold, contentColor = TvCinema.Obsidian),
                                modifier = Modifier.focusRequester(playFocus)
                            ) {
                                Icon(if (isPlaying) Icons.Filled.Pause else Icons.Filled.PlayArrow, contentDescription = null)
                                Spacer(Modifier.width(4.dp))
                                Text(if (isPlaying) "Tạm dừng" else "Phát", fontWeight = FontWeight.Bold)
                            }
                            OutlinedButton(onClick = { lastInteraction = System.currentTimeMillis(); exo.seekForward() }) {
                                Icon(Icons.Filled.FastForward, contentDescription = "+10s", modifier = Modifier.size(18.dp))
                                Spacer(Modifier.width(4.dp))
                                Text("+10s")
                            }
                            OutlinedButton(onClick = {
                                val next = when (qualityCap) { 0 -> 1080; 1080 -> 720; 720 -> 480; else -> 0 }
                                qualityCap = next
                                playbackManager.setMaxHeight(next)
                                qualityBadge = if (next == 0) "Auto" else "${next}p max"
                            }) {
                                Icon(Icons.Filled.HighQuality, contentDescription = null, modifier = Modifier.size(18.dp))
                                Spacer(Modifier.width(4.dp))
                                Text(if (qualityCap == 0) "Auto" else "${qualityCap}p")
                            }
                            OutlinedButton(onClick = {
                                showUpNextDrawer = true
                                showControls = false
                            }) {
                                Icon(Icons.Filled.SkipNext, contentDescription = null, modifier = Modifier.size(18.dp))
                                Spacer(Modifier.width(4.dp))
                                Text("Tập & Đề xuất")
                            }
                        }
                    }
                }
            }
        }

        // Episodes & Up Next Drawer (D-pad DOWN)
        AnimatedVisibility(
            visible = showUpNextDrawer,
            enter = slideInVertically(initialOffsetY = { it }) + fadeIn(),
            exit = slideOutVertically(targetOffsetY = { it }) + fadeOut(),
            modifier = Modifier.align(Alignment.BottomCenter).fillMaxWidth()
        ) {
            LaunchedEffect(Unit) { runCatching { drawerFocus.requestFocus() } }
            Column(
                Modifier
                    .fillMaxWidth()
                    .background(Brush.verticalGradient(listOf(Color.Transparent, Color.Black.copy(0.92f), Color.Black)))
                    .padding(top = 20.dp, bottom = 24.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                if (state.episodes.size > 1) {
                    Text(
                        text = "Danh sách tập (${state.episodes.size})",
                        color = TvCinema.Gold,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(horizontal = 32.dp)
                    )
                    TvLazyRow(
                        contentPadding = PaddingValues(horizontal = 32.dp),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                        modifier = Modifier.focusRequester(drawerFocus)
                    ) {
                        itemsIndexed(state.episodes) { idx, ep ->
                            val epNum = TvPhimAiUtils.getEpisodeNumber(ep.title) ?: (idx + 1)
                            val active = ep.id == currentFilmId
                            Surface(
                                onClick = {
                                    showUpNextDrawer = false
                                    onSwitchFilm(ep.id)
                                },
                                shape = ClickableSurfaceDefaults.shape(RoundedCornerShape(8.dp)),
                                colors = ClickableSurfaceDefaults.colors(
                                    containerColor = if (active) TvCinema.Gold else TvCinema.SlateRaised,
                                    focusedContainerColor = TvCinema.Gold,
                                    contentColor = if (active) TvCinema.Obsidian else TvCinema.Ivory,
                                    focusedContentColor = TvCinema.Obsidian
                                ),
                                border = ClickableSurfaceDefaults.border(focusedBorder = Border(BorderStroke(2.dp, Color.White)))
                            ) {
                                Text("Tập $epNum", fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp))
                            }
                        }
                    }
                }
                if (state.related.isNotEmpty()) {
                    Text(
                        text = "Phim đề xuất tiếp theo",
                        color = TvCinema.Ivory,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(horizontal = 32.dp)
                    )
                    TvLazyRow(
                        contentPadding = PaddingValues(horizontal = 32.dp),
                        horizontalArrangement = Arrangement.spacedBy(14.dp),
                        modifier = if (state.episodes.size <= 1) Modifier.focusRequester(drawerFocus) else Modifier
                    ) {
                        items(state.related, key = { it.id }) { rf ->
                            PhimAiTvFilmCard(
                                film = rf,
                                serverUrl = serverUrl,
                                onClick = {
                                    showUpNextDrawer = false
                                    onSwitchFilm(rf.id)
                                }
                            )
                        }
                    }
                }
            }
        }

        // Autoplay Next Countdown Modal
        AnimatedVisibility(visible = countdownSeconds > 0, modifier = Modifier.align(Alignment.Center)) {
            Box(
                Modifier
                    .clip(RoundedCornerShape(16.dp))
                    .background(TvCinema.Slate.copy(alpha = 0.96f))
                    .border(1.5.dp, TvCinema.Gold, RoundedCornerShape(16.dp))
                    .padding(28.dp)
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text("Chuyển tập / phim tiếp theo sau ${countdownSeconds}s", color = TvCinema.Gold, fontSize = 18.sp, fontWeight = FontWeight.Bold)
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Button(onClick = {
                            countdownSeconds = 0
                            vm.nextUpFilmId(currentFilmId)?.let { onSwitchFilm(it) }
                        }) { Text("Phát ngay", fontWeight = FontWeight.Bold) }
                        OutlinedButton(onClick = { countdownSeconds = 0 }) { Text("Hủy") }
                    }
                }
            }
        }
    }
}
