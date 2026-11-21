package com.phimai.android.ui.components

import androidx.annotation.OptIn
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import coil3.compose.AsyncImage
import com.phimai.android.player.NowPlaying
import com.phimai.android.ui.theme.cinema
import kotlinx.coroutines.delay

@Composable
fun MiniPlayer(
    nowPlaying: NowPlaying,
    player: Player,
    onOpen: () -> Unit,
    onClose: () -> Unit,
    modifier: Modifier = Modifier
) {
    val palette = cinema
    var isPlaying by remember(player) { mutableStateOf(player.isPlaying) }
    var progress by remember(player) {
        val dur = player.duration.coerceAtLeast(1L)
        mutableFloatStateOf((player.currentPosition.toFloat() / dur).coerceIn(0f, 1f))
    }

    DisposableEffect(player) {
        val listener = object : Player.Listener {
            override fun onIsPlayingChanged(playing: Boolean) {
                isPlaying = playing
            }
        }
        player.addListener(listener)
        onDispose { player.removeListener(listener) }
    }

    LaunchedEffect(player, isPlaying) {
        val dur = player.duration.coerceAtLeast(1L)
        progress = (player.currentPosition.toFloat() / dur).coerceIn(0f, 1f)
        while (isPlaying) {
            delay(500)
            val d = player.duration.coerceAtLeast(1L)
            progress = (player.currentPosition.toFloat() / d).coerceIn(0f, 1f)
        }
    }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(palette.slateRaised)
    ) {
        HorizontalDivider(color = palette.border)
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(58.dp)
                .clickable { onOpen() }
                .padding(horizontal = 10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            AsyncImage(
                model = nowPlaying.thumbnail,
                contentDescription = nowPlaying.title,
                contentScale = ContentScale.Crop,
                modifier = Modifier
                    .width(84.dp)
                    .aspectRatio(16f / 9f)
                    .clip(RoundedCornerShape(6.dp))
                    .background(Color.Black)
            )
            Spacer(modifier = Modifier.width(10.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = nowPlaying.title.ifBlank { "Đang phát..." },
                    color = palette.ivory,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                if (nowPlaying.channelTitle.isNotBlank()) {
                    Text(
                        text = nowPlaying.channelTitle,
                        color = palette.textSecondary,
                        fontSize = 11.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }
            IconButton(onClick = { if (isPlaying) player.pause() else player.play() }) {
                Icon(
                    imageVector = if (isPlaying) Icons.Filled.Pause else Icons.Filled.PlayArrow,
                    contentDescription = if (isPlaying) "Tạm dừng" else "Phát",
                    tint = palette.gold,
                    modifier = Modifier.size(26.dp)
                )
            }
            IconButton(onClick = onClose) {
                Icon(
                    imageVector = Icons.Filled.Close,
                    contentDescription = "Đóng",
                    tint = palette.textMuted,
                    modifier = Modifier.size(22.dp)
                )
            }
        }
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(2.dp)
                .background(Color.White.copy(alpha = 0.14f))
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth(progress.coerceIn(0f, 1f))
                    .fillMaxHeight()
                    .background(palette.crimson)
            )
        }
    }
}

@OptIn(UnstableApi::class)
@Composable
fun FloatingMiniPlayer(
    nowPlaying: NowPlaying,
    player: Player,
    onOpen: () -> Unit,
    onClose: () -> Unit,
    modifier: Modifier = Modifier
) {
    val palette = cinema
    var isPlaying by remember(player) { mutableStateOf(player.isPlaying) }
    var progress by remember(player) {
        val dur = player.duration.coerceAtLeast(1L)
        mutableFloatStateOf((player.currentPosition.toFloat() / dur).coerceIn(0f, 1f))
    }

    DisposableEffect(player) {
        val listener = object : Player.Listener {
            override fun onIsPlayingChanged(playing: Boolean) {
                isPlaying = playing
            }
        }
        player.addListener(listener)
        onDispose { player.removeListener(listener) }
    }

    LaunchedEffect(player, isPlaying) {
        val dur = player.duration.coerceAtLeast(1L)
        progress = (player.currentPosition.toFloat() / dur).coerceIn(0f, 1f)
        while (isPlaying) {
            delay(500)
            val d = player.duration.coerceAtLeast(1L)
            progress = (player.currentPosition.toFloat() / d).coerceIn(0f, 1f)
        }
    }

    Surface(
        modifier = modifier
            .width(304.dp)
            .aspectRatio(16f / 9f),
        shape = RoundedCornerShape(12.dp),
        shadowElevation = 12.dp,
        color = Color.Black,
        border = BorderStroke(1.dp, palette.gold.copy(alpha = 0.35f))
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .clickable { onOpen() }
        ) {
            AsyncImage(
                model = nowPlaying.thumbnail,
                contentDescription = nowPlaying.title,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize()
            )
            AndroidView(
                factory = { ctx ->
                    PlayerView(ctx).apply {
                        this.player = player
                        useController = false
                        resizeMode = AspectRatioFrameLayout.RESIZE_MODE_ZOOM
                        setKeepContentOnPlayerReset(true)
                        setShutterBackgroundColor(android.graphics.Color.TRANSPARENT)
                        setShowNextButton(false)
                        setShowPreviousButton(false)
                    }
                },
                update = { view -> if (view.player !== player) view.player = player },
                onRelease = { view -> view.player = null },
                modifier = Modifier.fillMaxSize()
            )
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(54.dp)
                    .align(Alignment.TopCenter)
                    .background(
                        Brush.verticalGradient(
                            colors = listOf(Color.Black.copy(alpha = 0.65f), Color.Transparent)
                        )
                    )
            )
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .align(Alignment.TopCenter)
                    .padding(horizontal = 4.dp, vertical = 4.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(onClick = { if (isPlaying) player.pause() else player.play() }) {
                    Icon(
                        imageVector = if (isPlaying) Icons.Filled.Pause else Icons.Filled.PlayArrow,
                        contentDescription = if (isPlaying) "Tạm dừng" else "Phát",
                        tint = palette.gold,
                        modifier = Modifier.size(26.dp)
                    )
                }
                IconButton(onClick = onClose) {
                    Icon(
                        imageVector = Icons.Filled.Close,
                        contentDescription = "Đóng",
                        tint = Color.White,
                        modifier = Modifier.size(22.dp)
                    )
                }
            }
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(3.dp)
                    .align(Alignment.BottomStart)
                    .background(Color.White.copy(alpha = 0.25f))
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth(progress.coerceIn(0f, 1f))
                        .fillMaxHeight()
                        .background(palette.crimson)
                )
            }
        }
    }
}
